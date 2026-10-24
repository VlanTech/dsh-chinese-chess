import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { requestAiTurn, resetAgentWatch, watchAgents } from "../lib/agent-turn.js";
import { playerInteract } from "../lib/interact.js";
import { createSession } from "../lib/session.js";
import { bindAgent, loadSession, saveSession } from "../lib/store.js";
import { boardKey, emptyBoard, put } from "../lib/xiangqi.js";

function fresh() {
  return createSession();
}

test("player selects an own piece, then a legal square moves and hands the turn over", () => {
  const session = fresh();
  const before = boardKey(session.board);
  const selected = playerInteract(session, { file: 1, rank: 0 });
  assert.equal(selected.action, "select");
  assert.equal(selected.positionUnchanged, true);
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
  const moved = playerInteract(session, { file: 2, rank: 2 });
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "move");
  assert.equal(moved.positionUnchanged, false);
  assert.equal(session.turn, "black");
  assert.equal(session.board[2][2].type, "N");
  assert.equal(session.board[2][2].side, "red");
  assert.equal(session.board[0][1], null);
  assert.equal(moved.request.kind, "agent-request");
  assert.equal(moved.request.appliesMove, false);
  assert.equal(moved.notice, null);
});

test("an illegal destination leaves the position unchanged", () => {
  const session = fresh();
  const before = boardKey(session.board);
  playerInteract(session, { file: 1, rank: 0 });
  const rejected = playerInteract(session, { file: 1, rank: 1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.positionUnchanged, true);
  assert.equal(rejected.reason, "illegal");
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
});

test("clicking an opponent piece does not move", () => {
  const session = fresh();
  const before = boardKey(session.board);
  const rejected = playerInteract(session, { file: 1, rank: 9 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "opponent-piece");
  assert.equal(rejected.positionUnchanged, true);
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
});

test("a destination that would leave the general in check is refused", () => {
  let board = put(emptyBoard(), "red", "K", 4, 1);
  board = put(board, "black", "K", 4, 8);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  const before = boardKey(session.board);
  const selected = playerInteract(session, { file: 4, rank: 1 });
  assert.equal(selected.action, "select");
  const rejected = playerInteract(session, { file: 4, rank: 2 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "leaves-check");
  assert.equal(rejected.positionUnchanged, true);
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
});

test("将死 reports black's win and refuses another move", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "R", 4, 2);
  board = put(board, "black", "R", 3, 1);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 4, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  assert.equal(session.winner, "black");
  assert.equal(session.winReason, "checkmate");
  const before = boardKey(session.board);
  const first = playerInteract(session, { file: 4, rank: 0 });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "game-over");
  assert.equal(first.winner, "black");
  assert.equal(first.winReason, "checkmate");
  assert.match(first.statusText, /黑方胜（将死）/);
  const second = playerInteract(session, { file: 5, rank: 0 });
  assert.equal(second.ok, false);
  assert.equal(second.winner, "black");
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
});

test("困毙 reports black's win and refuses another move", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "R", 0, 1);
  board = put(board, "black", "N", 2, 2);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 0, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  assert.equal(session.winner, "black");
  assert.equal(session.winReason, "stalemate");
  const before = boardKey(session.board);
  const first = playerInteract(session, { file: 4, rank: 0 });
  assert.equal(first.reason, "game-over");
  assert.equal(first.winner, "black");
  assert.match(first.statusText, /黑方胜（困毙）/);
  const second = playerInteract(session, { file: 4, rank: 1 });
  assert.equal(second.ok, false);
  assert.equal(boardKey(session.board), before);
});

test("the AI turn message uses a producer-owned source", () => {
  const delivered = [];
  const agent = { followup(message) { delivered.push(message); } };
  const session = fresh();
  playerInteract(session, { file: 1, rank: 0 }, agent);
  const moved = playerInteract(session, { file: 2, rank: 2 }, agent);
  assert.equal(moved.action, "move");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].role, "user");
  assert.equal(delivered[0].source.kind, "plugin:dsh-dafeiyu-xiangqi");
  assert.match(delivered[0].content[0].text, /dafeiyu-xiangqi/);
  assert.match(delivered[0].content[0].text, /玩家已经走完/);
  assert.equal(Object.hasOwn(delivered[0].source, "plugin"), false);
  assert.equal(moved.request.appliesMove, false);
});

test("clicking during the AI turn wakes the idle agent without a chat message", () => {
  const delivered = [];
  const agent = { followup(message) { delivered.push(message); } };
  const session = fresh();
  playerInteract(session, { file: 1, rank: 0 }, agent);
  playerInteract(session, { file: 2, rank: 2 }, agent);
  assert.equal(delivered.length, 1);
  const nudged = playerInteract(session, { file: 0, rank: 0 }, agent);
  assert.equal(nudged.ok, false);
  assert.equal(nudged.reason, "not-player-turn");
  assert.equal(nudged.positionUnchanged, true);
  assert.equal(session.turn, "black");
  assert.equal(delivered.length, 2);
  assert.equal(delivered[1].source.kind, "plugin:dsh-dafeiyu-xiangqi");
  assert.match(delivered[1].content[0].text, /轮到你/);
});

test("a click uses the live agent when the cached one is gone", () => {
  const delivered = [];
  const dead = {
    id: "desk",
    phase: { kind: "running", abort: { signal: { reason: { kind: "disposed" } } } },
    followup() { throw new Error("dead agent was followed"); },
  };
  const live = {
    id: "desk",
    phase: { kind: "idle" },
    followup(message) { delivered.push(message); },
  };
  watchAgents({
    reflect: {
      get(name, strict) {
        assert.equal(name, "agents");
        assert.equal(strict, false);
        return {
          get(id) { return id === "desk" ? live : undefined; },
          roots() { return [live]; },
        };
      },
    },
    on() { return () => {}; },
  });
  try {
    bindAgent(dead);
    const session = fresh();
    playerInteract(session, { file: 1, rank: 0 }, dead);
    const moved = playerInteract(session, { file: 2, rank: 2 }, dead);
    assert.equal(moved.action, "move");
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].source.kind, "plugin:dsh-dafeiyu-xiangqi");
    assert.match(delivered[0].content[0].text, /欲走/);
  } finally {
    resetAgentWatch();
  }
});

test("a move while the agent is busy waits until it is idle", () => {
  const delivered = [];
  const agent = {
    phase: { kind: "running", abort: { signal: { reason: null } } },
    followup(message) { delivered.push(message); },
  };
  let onStatus = null;
  watchAgents({
    on(name, fn) {
      if (name === "agent/status") onStatus = fn;
      return () => {};
    },
  });
  const previous = process.env.DAFEIYU_SESSION_FILE;
  const file = path.join(mkdtempSync(path.join(tmpdir(), "dafeiyu-wake-")), "session.json");
  process.env.DAFEIYU_SESSION_FILE = file;
  try {
    const session = fresh();
    playerInteract(session, { file: 1, rank: 0 }, agent);
    const moved = playerInteract(session, { file: 2, rank: 2 }, agent);
    assert.equal(moved.action, "move");
    assert.equal(moved.request.delivered, false);
    assert.equal(delivered.length, 0);
    saveSession(session, file);
    agent.phase = { kind: "idle" };
    onStatus({ status: "idle" });
    assert.equal(delivered.length, 1);
    assert.match(delivered[0].content[0].text, /玩家已经走完/);
    assert.equal(loadSession(file).turn, "black");
    assert.equal(loadSession(file).board[2][2].type, "N");
    assert.equal(requestAiTurn(loadSession(file), agent).delivered, true);
  } finally {
    if (previous === undefined) delete process.env.DAFEIYU_SESSION_FILE;
    else process.env.DAFEIYU_SESSION_FILE = previous;
    resetAgentWatch();
  }
});

test("a legal capture takes the intersection and passes the turn", () => {
  let board = put(emptyBoard(), "red", "R", 0, 0);
  board = put(board, "black", "P", 0, 3);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 8, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  playerInteract(session, { file: 0, rank: 0 });
  const captured = playerInteract(session, { file: 0, rank: 3 });
  assert.equal(captured.action, "capture");
  assert.equal(session.board[3][0].side, "red");
  assert.equal(session.board[3][0].type, "R");
  assert.equal(session.turn, "black");
});

test("a horse between facing generals is refused as 不能送将 and stays put", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "K", 4, 9);
  board = put(board, "red", "N", 4, 1);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  playerInteract(session, { file: 4, rank: 1 });
  const rejected = playerInteract(session, { file: 3, rank: 3 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "leaves-check");
  assert.equal(rejected.notice, "不能送将");
  assert.equal(rejected.noticeMark, null);
  assert.equal(rejected.positionUnchanged, true);
  assert.equal(session.board[1][4].type, "N");
  assert.equal(session.board[3][3], null);
});

test("a blocked horse leg is marked, and an empty leg still moves", () => {
  const session = fresh();
  playerInteract(session, { file: 1, rank: 0 });
  const blocked = playerInteract(session, { file: 3, rank: 1 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "illegal");
  assert.equal(blocked.notice, "马腿被挡");
  assert.deepEqual(blocked.noticeMark, { file: 2, rank: 0 });
  assert.equal(session.board[0][1].type, "N");
  const file = path.join(mkdtempSync(path.join(tmpdir(), "dafeiyu-horse-")), "session.json");
  saveSession(session, file);
  const loaded = loadSession(file);
  assert.equal(loaded.notice, "马腿被挡");
  assert.deepEqual(loaded.noticeMark, { file: 2, rank: 0 });
  const cleared = playerInteract(session, { file: 1, rank: 0 });
  assert.equal(cleared.action, "deselect");
  assert.equal(session.notice, null);
  playerInteract(session, { file: 1, rank: 0 });
  const moved = playerInteract(session, { file: 2, rank: 2 });
  assert.equal(moved.ok, true);
  assert.equal(moved.notice, null);
  assert.equal(session.board[2][2].type, "N");
});

test("aiming a blocked horse at an enemy piece still explains the leg", () => {
  let board = put(emptyBoard(), "red", "N", 4, 4);
  board = put(board, "red", "P", 4, 5);
  board = put(board, "black", "P", 5, 6);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 0, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  playerInteract(session, { file: 4, rank: 4 });
  const rejected = playerInteract(session, { file: 5, rank: 6 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "opponent-piece");
  assert.equal(rejected.notice, "马腿被挡");
  assert.deepEqual(rejected.noticeMark, { file: 4, rank: 5 });
  assert.equal(session.board[4][4].type, "N");
  assert.equal(session.board[6][5].side, "black");
});
