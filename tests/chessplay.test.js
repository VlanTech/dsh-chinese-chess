import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyOpen, placementLog } from "../lib/command.js";
import { apply } from "../lib/index.js";
import { createSession } from "../lib/session.js";
import { loadSession, saveSession } from "../lib/store.js";
import { boardKey, emptyBoard, put } from "../lib/xiangqi.js";
import { dshModule } from "./dsh-modules.js";

const dir = mkdtempSync(path.join(tmpdir(), "dafeiyu-chessplay-"));
process.env.DAFEIYU_SESSION_FILE = path.join(dir, "session.json");

const COMMANDS = dshModule("@deepseek-ai/dsh-commands/lib/index.js");
const CORDIS = dshModule("@deepseek-ai/cordis/lib/index.js");

test("a finished game opens the chooser and an in-progress game stays", () => {
  const finished = createSession();
  finished.winner = "red";
  finished.winReason = "checkmate";
  finished.selected = { file: 0, rank: 0 };
  finished.sidebarNonce = 2;
  const key = boardKey(finished.board);
  const decision = applyOpen(finished, {});
  assert.equal(decision.toChooser, true);
  assert.equal(decision.wake, false);
  assert.equal(finished.awaitingChoice, true);
  assert.equal(finished.selected, null);
  assert.equal(finished.sidebarNonce, 3);
  assert.equal(boardKey(finished.board), key);

  const playing = createSession();
  const playingKey = boardKey(playing.board);
  const stay = applyOpen(playing, {});
  assert.equal(stay.wake, true);
  assert.equal(stay.toChooser, false);
  assert.equal(playing.awaitingChoice, false);
  const again = applyOpen(playing, { restart: true });
  assert.equal(again.wake, false);
  assert.equal(again.toChooser, true);
  assert.equal(playing.awaitingChoice, true);
  assert.equal(boardKey(playing.board), playingKey);
});

test("chessplay registers once and opens the right sidebar twice", async () => {
  const before = placementLog.length;
  let runtimeNote = "command-runtime: not attempted";
  let ctx;
  const preSteps = [];
  try {
    const cordis = await import(CORDIS);
    const commands = await import(COMMANDS);
    const Context = cordis.Context;
    const CommandRuntime = commands.CommandRuntime;
    ctx = new Context();
    ctx.commands = new CommandRuntime(ctx);
    runtimeNote = "command-runtime: constructed";
  } catch (error) {
    runtimeNote = `command-runtime: FAILED ${error instanceof Error ? error.message : String(error)}`;
    ctx = {
      commands: { register(definition) { ctx._def = definition; return () => {}; } },
      inject() {},
      on(name, fn) {
        if (name === "agent/pre-step") preSteps.push(fn);
        return () => {};
      },
    };
  }
  if (typeof ctx.on === "function") {
    const originalOn = ctx.on.bind(ctx);
    ctx.on = (name, fn) => {
      if (name === "agent/pre-step") preSteps.push(fn);
      return originalOn(name, fn);
    };
  }
  console.log(runtimeNote);
  apply(ctx);

  const agent = {
    id: "dafeiyu-test",
    session: { append() { return 1; } },
  };
  const signal = new AbortController().signal;
  let first;
  let second;
  if (typeof ctx.commands.execute === "function") {
    first = await ctx.commands.execute(agent, "/chessplay", [], signal);
    second = await ctx.commands.execute(agent, "/chessplay", [], signal);
    assert.equal(first.result.kind, "success");
    assert.equal(second.result.kind, "success");
    console.log("command-runtime: execute /chessplay twice ok");
  } else {
    const definition = ctx._def || ctx.commands.find?.(agent, "chessplay");
    assert.equal(definition.name, "chessplay");
    first = await definition.handler({ agent, rawInput: "", attachments: [], signal, commandId: "1" });
    second = await definition.handler({ agent, rawInput: "", attachments: [], signal, commandId: "2" });
    assert.equal(first.kind, "success");
    assert.equal(second.kind, "success");
    console.log("command-runtime: handler invoked twice without execute");
  }

  const placed = placementLog.slice(before);
  assert.equal(placed.length, 2);
  for (const placement of placed) {
    assert.equal(placement.ok, true);
    assert.equal(placement.title, "大肥鱼象棋");
    assert.equal(placement.region, "right-sidebar");
    assert.equal(placement.mainConversation, false);
  }

  const file = process.env.DAFEIYU_SESSION_FILE;
  let board = emptyBoard();
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "R", 4, 2);
  board = put(board, "black", "R", 3, 1);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 4, 9);
  const finished = createSession({ board, playerSide: "red", turn: "red" });
  assert.equal(finished.winner, "black");
  finished.awaitingChoice = false;
  finished.selected = { file: 4, rank: 0 };
  const finishedKey = boardKey(finished.board);
  saveSession(finished, file);
  if (typeof ctx.commands.execute === "function") {
    const third = await ctx.commands.execute(agent, "/chessplay", [], signal);
    assert.equal(third.result.kind, "success");
    assert.match(third.result.text, /选择执红或执黑/);
  } else {
    const definition = ctx._def || ctx.commands.find?.(agent, "chessplay");
    const third = await definition.handler({ agent, rawInput: "", attachments: [], signal, commandId: "3" });
    assert.equal(third.kind, "success");
    assert.match(third.text, /选择执红或执黑/);
  }
  const afterCommand = loadSession(file);
  assert.equal(afterCommand.awaitingChoice, true);
  assert.equal(afterCommand.selected, null);
  assert.equal(afterCommand.winner, "black");
  assert.equal(afterCommand.lastAgentRequest, null);
  assert.equal(boardKey(afterCommand.board), finishedKey);
  assert.ok(afterCommand.openedAt > 0);

  const playing = createSession();
  playing.awaitingChoice = false;
  playing.winner = null;
  playing.lastAgentRequest = null;
  const playingKey = boardKey(playing.board);
  saveSession(playing, file);
  assert.ok(preSteps.length >= 1);
  const step = await preSteps[0]({
    messages: [{
      id: "restart-live",
      source: { kind: "user" },
      content: [{ type: "text", text: "重来重来" }],
    }],
    agent,
  }, async () => "step");
  assert.equal(step, "step");
  const afterRestart = loadSession(file);
  assert.equal(afterRestart.awaitingChoice, true);
  assert.equal(afterRestart.lastAgentRequest, null);
  assert.equal(boardKey(afterRestart.board), playingKey);
});
