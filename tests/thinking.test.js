import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../lib/session.js";
import { boardKey, emptyBoard, put } from "../lib/xiangqi.js";
import { ingestAiTurn, surfaceState } from "../lib/thinking.js";

test("a non-empty reasoning string is shown and does not move the board", () => {
  const session = createSession();
  const before = boardKey(session.board);
  const turn = session.turn;
  const surface = ingestAiTurn(session, { reasoning: "先看中兵，再决定是否进马。" });
  assert.equal(surface.reasoning, "先看中兵，再决定是否进马。");
  assert.equal(surface.title, "大肥鱼象棋");
  assert.equal(surface.region, "right-sidebar");
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, turn);
  assert.equal(surface.boardKey, before);
  assert.equal(surfaceState(session).reasoning, "先看中兵，再决定是否进马。");
});

test("a selected piece frames only the squares it can capture", () => {
  let board = put(emptyBoard(), "red", "R", 0, 0);
  board = put(board, "black", "P", 0, 3);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 5, 9);
  const session = createSession({ board, playerSide: "red", turn: "red" });
  session.selected = { file: 0, rank: 0 };
  const surface = surfaceState(session);
  assert.deepEqual(surface.captures, [{ file: 0, rank: 3 }]);
  assert.equal(surface.targets.some((square) => square.file === 0 && square.rank === 1), true);
  assert.equal(surface.targets.some((square) => square.file === 0 && square.rank === 3), true);
});

test("a turn without reasoning text does not invent any", () => {
  const session = createSession();
  ingestAiTurn(session, { reasoning: "上一着的想法。" });
  const before = boardKey(session.board);
  const missing = ingestAiTurn(session, {});
  assert.equal(missing.reasoning, null);
  assert.equal(boardKey(session.board), before);
  const empty = ingestAiTurn(session, { reasoning: "   " });
  assert.equal(empty.reasoning, null);
  assert.equal(surfaceState(session).reasoning, null);
  const absent = ingestAiTurn(session, { reasoning: null });
  assert.equal(absent.reasoning, null);
  assert.equal(boardKey(session.board), before);
  assert.equal(session.turn, "red");
});
