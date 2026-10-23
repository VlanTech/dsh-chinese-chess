import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { playerInteract } from "../lib/interact.js";
import { dispatchMcp, modelToolName } from "../lib/mcp.js";
import { createSession } from "../lib/session.js";
import { loadSession, saveSession } from "../lib/store.js";
import { boardKey, emptyBoard, put } from "../lib/xiangqi.js";
import { dshModule } from "./dsh-modules.js";

const SDK_ROOT = dshModule("@modelcontextprotocol/sdk/dist/esm");
const STDIO = path.resolve("lib/mcp-stdio.js");

function textOf(result) {
  const block = result.content?.find((item) => item.type === "text");
  assert.ok(block, "MCP result has no text block");
  return JSON.parse(block.text);
}

test("AI moves only through MCP on the shared session", { timeout: 20000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dafeiyu-mcp-"));
  const file = path.join(dir, "session.json");
  const session = createSession();
  const delivered = [];
  const agent = {
    followup(message) { delivered.push(message); },
  };
  saveSession(session, file);

  const { Client } = await import(pathToFileURL(`${SDK_ROOT}/client/index.js`).href);
  const { StdioClientTransport } = await import(pathToFileURL(`${SDK_ROOT}/client/stdio.js`).href);
  const client = new Client({ name: "dafeiyu-test", version: "0.1.0" });
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [STDIO],
    env: { ...process.env, DAFEIYU_SESSION_FILE: file },
    stderr: "pipe",
    cwd: path.resolve("."),
  });
  try {
    await client.connect(transport);
    transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
    const listed = await client.listTools();
    const raw = listed.tools.map((tool) => tool.name).sort();
    assert.deepEqual(raw, ["read_position", "restart_game", "submit_move"]);
    const published = raw.map((name) => modelToolName(name)).sort();
    assert.deepEqual(published, ["mcp__dafeiyu__read_position", "mcp__dafeiyu__restart_game", "mcp__dafeiyu__submit_move"]);
    for (const name of published) assert.match(name, /^mcp__/);

    const openingKey = boardKey(loadSession(file).board);
    const wrongTurn = textOf(await client.callTool({
      name: "submit_move",
      arguments: { fromFile: 1, fromRank: 9, toFile: 2, toRank: 7 },
    }));
    assert.equal(wrongTurn.ok, false);
    assert.equal(wrongTurn.error, "not-ai-turn");
    assert.equal(boardKey(loadSession(file).board), openingKey);

    const selected = playerInteract(session, { file: 1, rank: 0 }, agent);
    assert.equal(selected.action, "select");
    const moved = playerInteract(session, { file: 2, rank: 2 }, agent);
    assert.equal(moved.action, "move");
    assert.equal(moved.request.kind, "agent-request");
    assert.equal(moved.request.appliesMove, false);
    assert.equal(delivered.length, 1);
    assert.match(delivered[0].content[0].text, /mcp__dafeiyu__submit_move/);
    const afterPlayer = boardKey(session.board);
    assert.notEqual(afterPlayer, openingKey);
    saveSession(session, file);
    assert.equal(boardKey(loadSession(file).board), afterPlayer);

    const seen = textOf(await client.callTool({ name: "read_position", arguments: {} }));
    assert.equal(seen.ok, true);
    assert.equal(seen.surface.turn, "black");
    assert.equal(seen.surface.boardKey, afterPlayer);

    const illegal = textOf(await client.callTool({
      name: "submit_move",
      arguments: { fromFile: 1, fromRank: 9, toFile: 1, toRank: 8 },
    }));
    assert.equal(illegal.ok, false);
    assert.equal(boardKey(loadSession(file).board), afterPlayer);

    const wrongSide = textOf(await client.callTool({
      name: "submit_move",
      arguments: { fromFile: 0, fromRank: 0, toFile: 0, toRank: 1 },
    }));
    assert.equal(wrongSide.ok, false);
    assert.equal(wrongSide.error, "not-ai-piece");
    assert.equal(boardKey(loadSession(file).board), afterPlayer);

    const legal = textOf(await client.callTool({
      name: "submit_move",
      arguments: { fromFile: 1, fromRank: 9, toFile: 2, toRank: 7 },
    }));
    assert.equal(legal.ok, true, JSON.stringify(legal));
    const afterAi = loadSession(file);
    assert.equal(afterAi.turn, "red");
    assert.equal(afterAi.board[7][2].side, "black");
    assert.equal(afterAi.board[7][2].type, "N");
    assert.notEqual(boardKey(afterAi.board), afterPlayer);
    assert.equal(delivered.length, 1);
  } catch (error) {
    if (stderr.length) process.stderr.write(stderr.join(""));
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
});

test("restart_game returns to the chooser and does not move a piece", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dafeiyu-restart-"));
  const file = path.join(dir, "session.json");
  let board = emptyBoard();
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "R", 4, 2);
  board = put(board, "black", "R", 3, 1);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 4, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  assert.equal(session.winner, "black");
  session.awaitingChoice = false;
  session.selected = { file: 4, rank: 0 };
  session.sidebarNonce = 3;
  const key = boardKey(session.board);
  saveSession(session, file);

  const restarted = textOf(dispatchMcp({
    method: "tools/call",
    id: 1,
    params: { name: "restart_game", arguments: {} },
  }, file));
  assert.equal(restarted.ok, true);
  assert.equal(restarted.restarted, true);
  assert.equal(restarted.surface.awaitingChoice, true);
  const saved = loadSession(file);
  assert.equal(saved.awaitingChoice, true);
  assert.equal(saved.selected, null);
  assert.equal(saved.sidebarNonce, 4);
  assert.ok(saved.openedAt > 0);
  assert.equal(boardKey(saved.board), key);
  assert.equal(saved.winner, "black");

  const rejected = textOf(dispatchMcp({
    method: "tools/call",
    id: 2,
    params: { name: "submit_move", arguments: { fromFile: 1, fromRank: 9, toFile: 2, toRank: 7 } },
  }, file));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "awaiting-choice");
  assert.equal(boardKey(loadSession(file).board), key);
});
