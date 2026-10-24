import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { dispatchMcp } from "../lib/mcp.js";
import { resetReasoningWatch } from "../lib/reasoning.js";
import { apply } from "../lib/index.js";
import { dshModule } from "./dsh-modules.js";

const dir = mkdtempSync(path.join(tmpdir(), "dafeiyu-host-"));
const file = path.join(dir, "session.json");
process.env.DAFEIYU_SESSION_FILE = file;

const CORDIS = dshModule("@deepseek-ai/cordis/lib/index.js");
const COMMANDS = dshModule("@deepseek-ai/dsh-commands/lib/index.js");
const SCOPE = dshModule("@deepseek-ai/dsh-scope/lib/index.js");
const AGENT = dshModule("@deepseek-ai/dsh-agent/lib/index.js");

function pieceAt(state, fileIndex, rank) {
  return (state.pieces || []).find((piece) => piece.file === fileIndex && piece.rank === rank) || null;
}

test("one reasoning delta is stored once, and a later click keeps the MCP move", async () => {
  resetReasoningWatch();
  const cordis = await import(CORDIS);
  const commands = await import(COMMANDS);
  const scope = await import(SCOPE);
  const agentEvents = await import(AGENT);
  const { Context, Service } = cordis;
  const ctx = new Context();
  ctx.commands = new commands.CommandRuntime(ctx);
  const routes = new Map();
  ctx.plugin({
    apply(child) {
      const connection = new Service(child, "connection");
      connection.fetch = {
        register(spec) {
          routes.set(spec.path, spec.fetch);
          return () => routes.delete(spec.path);
        },
      };
    },
  });
  apply(ctx);
  for (let i = 0; i < 50 && !routes.has("/api/dafeiyu-xiangqi/click"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(routes.has("/api/dafeiyu-xiangqi/click"), "host did not mount the click route");

  const agent = {
    id: "dafeiyu-host",
    session: { append() { return 1; } },
  };
  agent.ctx = scope.createScope(ctx, agent).ctx;
  const signal = new AbortController().signal;
  const opened = await ctx.commands.execute(agent, "/chessplay", [], signal);
  assert.equal(opened.result.kind, "success");
  const hooks = ctx.events._hooks["agent/assistant-stream"] || [];
  assert.equal(hooks.length, 1);
  console.log(`assistant-stream listeners: ${hooks.length}`);

  const click = routes.get("/api/dafeiyu-xiangqi/click");
  const state = routes.get("/api/dafeiyu-xiangqi/state");
  const post = async (body) => {
    const response = await click(new Request("http://dsh.local/api/dafeiyu-xiangqi/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    return response.json();
  };
  const read = async () => {
    const response = await state(new Request("http://dsh.local/api/dafeiyu-xiangqi/state"));
    return response.json();
  };

  const selected = await post({ file: 1, rank: 0 });
  assert.equal(selected.action, "select");
  const moved = await post({ file: 2, rank: 2 });
  assert.equal(moved.ok, true);
  assert.equal(moved.turn, "black");

  const emit = (frame) => agentEvents.emitAgentEvent(ctx, agent, "agent/assistant-stream", { frame });
  emit({ type: "start", attemptId: 1 });
  emit({ type: "chunk", attemptId: 1, chunk: { type: "reasoning-delta", text: "甲" } });
  const traced = await read();
  assert.equal(traced.reasoning, "甲");
  assert.equal(traced.turn, "black");
  console.log(`reasoning-once: ${traced.reasoning}`);

  const submitted = dispatchMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "submit_move",
      arguments: { fromFile: 7, fromRank: 0, toFile: 6, toRank: 2 },
    },
  }, file);
  const submittedValue = JSON.parse(submitted.content[0].text);
  assert.equal(submittedValue.ok, true);
  const afterMove = await read();
  assert.equal(afterMove.turn, "red");
  assert.equal(pieceAt(afterMove, 2, 7)?.side, "black");
  assert.equal(pieceAt(afterMove, 2, 7)?.type, "N");
  const keptKey = afterMove.boardKey;

  emit({ type: "chunk", attemptId: 1, chunk: { type: "reasoning-delta", text: "乙" } });
  const afterTrace = await read();
  assert.equal(afterTrace.reasoning, "甲乙");
  assert.equal(afterTrace.turn, "red");
  assert.equal(afterTrace.boardKey, keptKey);
  assert.equal(pieceAt(afterTrace, 2, 7)?.type, "N");

  const reselected = await post({ file: 0, rank: 0 });
  assert.equal(reselected.action, "select");
  const afterClick = await read();
  assert.equal(afterClick.turn, "red");
  assert.equal(afterClick.boardKey, keptKey);
  assert.equal(pieceAt(afterClick, 2, 7)?.side, "black");
  assert.equal(pieceAt(afterClick, 2, 7)?.type, "N");
  assert.equal(afterClick.selected.file, 0);
  assert.equal(afterClick.selected.rank, 0);
  console.log(`board-kept-after-mcp: ${afterClick.boardKey}`);
});
