import assert from "node:assert/strict";
import test from "node:test";
import { asksToPlayChess, asksToRestart, messageText, noticeInvite, watchInvite } from "../lib/invite.js";

test("a workspace invitation opens chess and a refusal does not", () => {
  for (const text of ["来下棋", "我们下棋", "下一盘象棋", "玩一局中国象棋", "  下 棋  "]) {
    assert.equal(asksToPlayChess(text), true, text);
  }
  assert.equal(asksToPlayChess("不要下棋"), false);
  assert.equal(asksToPlayChess("不想下象棋"), false);
  assert.equal(asksToPlayChess("象棋的历史"), false);
  assert.equal(asksToPlayChess(""), false);
});

test("only a new human invitation triggers chessplay", () => {
  const opened = [];
  const seen = new Set();
  const open = (agent) => opened.push(agent.id);
  const human = {
    id: "m1",
    source: { kind: "user" },
    content: [{ type: "text", text: "来下棋" }],
  };
  const plugin = {
    id: "m2",
    source: { kind: "plugin:dsh-dafeiyu-xiangqi" },
    content: [{ type: "text", text: "来下棋" }],
  };
  assert.equal(messageText(plugin), "");
  assert.equal(noticeInvite({ messages: [plugin], agent: { id: "a" } }, open, seen), false);
  assert.equal(noticeInvite({ messages: [human], agent: { id: "a" } }, open, seen), true);
  assert.equal(noticeInvite({ messages: [human], agent: { id: "a" } }, open, seen), false);
  assert.deepEqual(opened, ["a"]);
});

test("restart phrases reset and a plugin follow-up does not", () => {
  const opened = [];
  const open = (agent, options) => opened.push({ id: agent.id, restart: options.restart });
  const human = (id, text) => ({
    id,
    source: { kind: "user" },
    content: [{ type: "text", text }],
  });
  for (const text of ["重来重来", "重新开始", "再来一局", "再来一盘", "重开", "新的一局"]) {
    const seen = new Set();
    opened.length = 0;
    assert.equal(noticeInvite({ messages: [human(`id-${text}`, text)], agent: { id: "a" } }, open, seen), true, text);
    assert.equal(opened[0].restart, true, text);
  }
  opened.length = 0;
  noticeInvite({ messages: [human("play", "来下棋")], agent: { id: "a" } }, open, new Set());
  assert.equal(opened[0].restart, false);
  assert.equal(asksToRestart("不要重来"), false);
  assert.equal(asksToRestart("别重开"), false);
  assert.equal(asksToPlayChess("重来重来"), false);
  const plugin = {
    id: "plugin-restart",
    source: { kind: "plugin:dsh-dafeiyu-xiangqi" },
    content: [{ type: "text", text: "再来一局" }],
  };
  assert.equal(noticeInvite({ messages: [plugin], agent: { id: "a" } }, open, new Set()), false);
});

test("pre-step opens chessplay once and still returns the step decision", async () => {
  let handler;
  const ctx = {
    on(name, fn) {
      assert.equal(name, "agent/pre-step");
      handler = fn;
      return () => {};
    },
  };
  const opened = [];
  watchInvite(ctx, (agent) => opened.push(agent.id));
  const human = {
    id: "m1",
    source: { kind: "user" },
    content: [{ type: "text", text: "来下棋" }],
  };
  const decision = { ok: true };
  const first = await handler({ messages: [human], agent: { id: "a" } }, async () => decision);
  const second = await handler({ messages: [human], agent: { id: "a" } }, async () => decision);
  assert.equal(first, decision);
  assert.equal(second, decision);
  assert.deepEqual(opened, ["a"]);
});
