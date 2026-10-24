import assert from "node:assert/strict";
import test from "node:test";
import {
  boardKey,
  commitMove,
  emptyBoard,
  findKing,
  gameStatus,
  generalsFace,
  horseDelta,
  inventory,
  isLegalMove,
  openingBoard,
  put,
} from "../lib/xiangqi.js";

function key(board) {
  return boardKey(board);
}

function accept(board, side, from, to) {
  const before = key(board);
  const result = commitMove(board, side, from, to);
  assert.equal(result.ok, true, `expected legal ${from.file},${from.rank}->${to.file},${to.rank}`);
  assert.notEqual(key(result.board), before);
  assert.equal(key(board), before, "legal commit must not mutate the input");
  assert.equal(result.board[to.rank][to.file].type, board[from.rank][from.file].type);
  assert.equal(result.board[from.rank][from.file], null);
  return result;
}

function reject(board, side, from, to, reason) {
  const before = key(board);
  const result = commitMove(board, side, from, to);
  assert.equal(result.ok, false);
  if (reason) assert.equal(result.reason, reason);
  assert.equal(result.board, board);
  assert.equal(key(board), before);
  return result;
}

test("standard opening has 32 pieces, red to move, and the back-rank constraints", () => {
  const board = openingBoard();
  const found = inventory(board);
  assert.equal(found.n, 32);
  assert.equal(found.counts["red:K:帅"], 1);
  assert.equal(found.counts["black:K:将"], 1);
  assert.equal(found.counts["red:R:车"], 2);
  assert.equal(found.counts["black:R:车"], 2);
  assert.equal(found.counts["red:N:马"], 2);
  assert.equal(found.counts["black:N:马"], 2);
  assert.equal(found.counts["red:C:炮"], 2);
  assert.equal(found.counts["black:C:炮"], 2);
  assert.equal(found.counts["red:B:相"], 2);
  assert.equal(found.counts["black:B:象"], 2);
  assert.equal(found.counts["red:A:士"], 2);
  assert.equal(found.counts["black:A:士"], 2);
  assert.equal(found.counts["red:P:兵"], 5);
  assert.equal(found.counts["black:P:卒"], 5);
  const redKing = findKing(board, "red");
  const blackKing = findKing(board, "black");
  assert.deepEqual(redKing, { file: 4, rank: 0 });
  assert.deepEqual(blackKing, { file: 4, rank: 9 });
  assert.equal(redKing.file, blackKing.file);
  assert.ok(redKing.rank <= 2 && redKing.file >= 3 && redKing.file <= 5);
  assert.ok(blackKing.rank >= 7 && blackKing.file >= 3 && blackKing.file <= 5);
  for (const piece of found.pieces) {
    if (piece.type === "P" || piece.type === "C") {
      assert.notEqual(piece.rank, 0);
      assert.notEqual(piece.rank, 9);
    }
  }
  assert.equal(generalsFace(board), false);
});

test("帅 and 将: one orthogonal palace step is legal; two steps, leaving the palace, and 飞将 are not", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "K", 4, 9);
  board = put(board, "red", "P", 4, 4);
  accept(board, "red", { file: 4, rank: 0 }, { file: 4, rank: 1 });
  reject(board, "red", { file: 4, rank: 0 }, { file: 4, rank: 2 }, "illegal");
  reject(board, "red", { file: 4, rank: 0 }, { file: 2, rank: 0 }, "illegal");

  let facing = put(emptyBoard(), "red", "K", 4, 1);
  facing = put(facing, "black", "K", 4, 8);
  assert.equal(generalsFace(facing), true);
  reject(facing, "red", { file: 4, rank: 1 }, { file: 4, rank: 2 }, "leaves-check");
  const steppedAside = accept(facing, "red", { file: 4, rank: 1 }, { file: 3, rank: 1 });
  assert.equal(generalsFace(steppedAside.board), false);
});

test("士 stays on one palace diagonal", () => {
  let board = put(emptyBoard(), "red", "A", 4, 1);
  board = put(board, "black", "K", 0, 9);
  board = put(board, "red", "K", 4, 0);
  accept(board, "red", { file: 4, rank: 1 }, { file: 5, rank: 2 });
  reject(board, "red", { file: 4, rank: 1 }, { file: 4, rank: 2 }, "illegal");
  let edge = put(emptyBoard(), "red", "A", 5, 2);
  edge = put(edge, "red", "K", 4, 0);
  edge = put(edge, "black", "K", 0, 9);
  reject(edge, "red", { file: 5, rank: 2 }, { file: 6, rank: 3 }, "illegal");
});

test("相 and 象: 田 on their own side, blocked by 塞象眼, and stopped at the river", () => {
  let board = put(emptyBoard(), "red", "B", 2, 0);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 0, 9);
  accept(board, "red", { file: 2, rank: 0 }, { file: 4, rank: 2 });
  let blocked = put(board, "red", "P", 3, 1);
  reject(blocked, "red", { file: 2, rank: 0 }, { file: 4, rank: 2 }, "illegal");
  let river = put(emptyBoard(), "red", "B", 2, 4);
  river = put(river, "red", "K", 4, 0);
  river = put(river, "black", "K", 0, 9);
  reject(river, "red", { file: 2, rank: 4 }, { file: 4, rank: 6 }, "illegal");
  let black = put(emptyBoard(), "black", "B", 2, 9);
  black = put(black, "black", "K", 4, 9);
  black = put(black, "red", "K", 0, 0);
  accept(black, "black", { file: 2, rank: 9 }, { file: 0, rank: 7 });
});

test("马 moves one orthogonal plus one diagonal, and 蹩马腿 blocks it", () => {
  const board = openingBoard();
  accept(board, "red", { file: 1, rank: 0 }, { file: 2, rank: 2 });
  reject(board, "red", { file: 1, rank: 0 }, { file: 1, rank: 2 }, "illegal");
  let blocked = put(emptyBoard(), "red", "N", 1, 0);
  blocked = put(blocked, "red", "P", 1, 1);
  blocked = put(blocked, "red", "K", 4, 0);
  blocked = put(blocked, "black", "K", 0, 9);
  reject(blocked, "red", { file: 1, rank: 0 }, { file: 2, rank: 2 }, "illegal");
  reject(blocked, "red", { file: 1, rank: 0 }, { file: 0, rank: 2 }, "illegal");
});

test("a center horse reaches every empty-leg 日 square, and one leg blocks only that pair", () => {
  let board = put(emptyBoard(), "red", "N", 4, 4);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 0, 9);
  const hops = [[5, 6], [3, 6], [5, 2], [3, 2], [6, 5], [2, 5], [6, 3], [2, 3]];
  for (const [file, rank] of hops) accept(board, "red", { file: 4, rank: 4 }, { file, rank });

  let diagonal = put(board, "black", "P", 5, 5);
  accept(diagonal, "red", { file: 4, rank: 4 }, { file: 5, rank: 6 });
  accept(diagonal, "red", { file: 4, rank: 4 }, { file: 6, rank: 5 });

  let leg = put(board, "red", "P", 4, 5);
  assert.deepEqual(horseDelta({ file: 4, rank: 4 }, { file: 5, rank: 6 }), { file: 4, rank: 5 });
  reject(leg, "red", { file: 4, rank: 4 }, { file: 5, rank: 6 }, "illegal");
  reject(leg, "red", { file: 4, rank: 4 }, { file: 3, rank: 6 }, "illegal");
  accept(leg, "red", { file: 4, rank: 4 }, { file: 6, rank: 5 });
  accept(leg, "red", { file: 4, rank: 4 }, { file: 5, rank: 2 });

  const opening = openingBoard();
  accept(opening, "red", { file: 1, rank: 0 }, { file: 0, rank: 2 });
  reject(opening, "red", { file: 1, rank: 0 }, { file: 3, rank: 1 }, "illegal");
  accept(opening, "black", { file: 1, rank: 9 }, { file: 2, rank: 7 });
  reject(opening, "black", { file: 1, rank: 9 }, { file: 3, rank: 8 }, "illegal");
});

test("a horse that alone screens the generals cannot step aside", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "K", 4, 9);
  board = put(board, "red", "N", 4, 1);
  assert.equal(board[2][4], null);
  assert.deepEqual(horseDelta({ file: 4, rank: 1 }, { file: 3, rank: 3 }), { file: 4, rank: 2 });
  reject(board, "red", { file: 4, rank: 1 }, { file: 3, rank: 3 }, "leaves-check");
  reject(board, "red", { file: 4, rank: 1 }, { file: 5, rank: 3 }, "leaves-check");
});

test("车 slides orthogonally and cannot jump", () => {
  let board = put(emptyBoard(), "red", "R", 0, 0);
  board = put(board, "red", "P", 0, 3);
  board = put(board, "black", "P", 0, 5);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 8, 9);
  accept(board, "red", { file: 0, rank: 0 }, { file: 0, rank: 2 });
  reject(board, "red", { file: 0, rank: 0 }, { file: 0, rank: 4 }, "illegal");
  reject(board, "red", { file: 0, rank: 0 }, { file: 0, rank: 3 }, "illegal");
  reject(board, "red", { file: 0, rank: 0 }, { file: 0, rank: 5 }, "illegal");
});

test("炮 moves like 车 without a screen and captures only by jumping exactly one screen", () => {
  let board = put(emptyBoard(), "red", "C", 1, 2);
  board = put(board, "red", "P", 1, 4);
  board = put(board, "black", "P", 1, 6);
  board = put(board, "red", "K", 4, 0);
  board = put(board, "black", "K", 8, 9);
  const quiet = accept(board, "red", { file: 1, rank: 2 }, { file: 1, rank: 3 });
  assert.equal(quiet.captured, null);
  reject(board, "red", { file: 1, rank: 2 }, { file: 1, rank: 5 }, "illegal");
  const captured = accept(board, "red", { file: 1, rank: 2 }, { file: 1, rank: 6 });
  assert.equal(captured.captured.type, "P");
  assert.equal(captured.captured.side, "black");
  assert.equal(captured.board[6][1].side, "red");
  assert.equal(captured.board[4][1].type, "P");

  let bare = put(emptyBoard(), "red", "C", 1, 2);
  bare = put(bare, "black", "P", 1, 6);
  bare = put(bare, "red", "K", 4, 0);
  bare = put(bare, "black", "K", 8, 9);
  reject(bare, "red", { file: 1, rank: 2 }, { file: 1, rank: 6 }, "illegal");

  let two = put(board, "black", "A", 1, 5);
  reject(two, "red", { file: 1, rank: 2 }, { file: 1, rank: 6 }, "illegal");
});

test("兵 and 卒: forward only before the river; forward or sideways, never backward, after crossing", () => {
  let before = put(emptyBoard(), "red", "P", 4, 3);
  before = put(before, "red", "K", 4, 0);
  before = put(before, "black", "K", 0, 9);
  accept(before, "red", { file: 4, rank: 3 }, { file: 4, rank: 4 });
  reject(before, "red", { file: 4, rank: 3 }, { file: 3, rank: 3 }, "illegal");
  reject(before, "red", { file: 4, rank: 3 }, { file: 4, rank: 2 }, "illegal");

  let after = put(emptyBoard(), "red", "P", 4, 5);
  after = put(after, "red", "K", 4, 0);
  after = put(after, "black", "K", 0, 9);
  accept(after, "red", { file: 4, rank: 5 }, { file: 4, rank: 6 });
  accept(after, "red", { file: 4, rank: 5 }, { file: 3, rank: 5 });
  reject(after, "red", { file: 4, rank: 5 }, { file: 4, rank: 4 }, "illegal");

  let blackBefore = put(emptyBoard(), "black", "P", 4, 6);
  blackBefore = put(blackBefore, "black", "K", 4, 9);
  blackBefore = put(blackBefore, "red", "K", 0, 0);
  accept(blackBefore, "black", { file: 4, rank: 6 }, { file: 4, rank: 5 });
  reject(blackBefore, "black", { file: 4, rank: 6 }, { file: 3, rank: 6 }, "illegal");

  let blackAfter = put(emptyBoard(), "black", "P", 4, 4);
  blackAfter = put(blackAfter, "black", "K", 4, 9);
  blackAfter = put(blackAfter, "red", "K", 0, 0);
  accept(blackAfter, "black", { file: 4, rank: 4 }, { file: 5, rank: 4 });
  reject(blackAfter, "black", { file: 4, rank: 4 }, { file: 4, rank: 5 }, "illegal");
});

test("a side in check must answer it; other moves leave the position unchanged", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "red", "N", 7, 0);
  board = put(board, "black", "R", 4, 3);
  board = put(board, "black", "K", 0, 9);
  assert.equal(gameStatus(board, "red").inCheck, true);
  reject(board, "red", { file: 4, rank: 0 }, { file: 4, rank: 1 }, "leaves-check");
  reject(board, "red", { file: 7, rank: 0 }, { file: 6, rank: 2 }, "leaves-check");
  const escaped = accept(board, "red", { file: 4, rank: 0 }, { file: 3, rank: 0 });
  assert.equal(escaped.inCheck, false);
  assert.equal(isLegalMove(board, "red", { file: 4, rank: 0 }, { file: 4, rank: 1 }), false);
});

test("将死: the side to move is in check and has no legal answer, so it loses", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "R", 4, 2);
  board = put(board, "black", "R", 3, 1);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 4, 9);
  const status = gameStatus(board, "red");
  assert.equal(status.over, true);
  assert.equal(status.inCheck, true);
  assert.equal(status.winReason, "checkmate");
  assert.equal(status.winner, "black");
  reject(board, "red", { file: 4, rank: 0 }, { file: 3, rank: 0 });
  reject(board, "red", { file: 4, rank: 0 }, { file: 5, rank: 0 });
  reject(board, "red", { file: 4, rank: 0 }, { file: 4, rank: 1 });
});

test("困毙: the side to move is not in check but has no legal move, so it loses", () => {
  let board = put(emptyBoard(), "red", "K", 4, 0);
  board = put(board, "black", "R", 0, 1);
  board = put(board, "black", "N", 2, 2);
  board = put(board, "black", "N", 6, 2);
  board = put(board, "black", "K", 0, 9);
  const status = gameStatus(board, "red");
  assert.equal(status.over, true);
  assert.equal(status.inCheck, false);
  assert.equal(status.winReason, "stalemate");
  assert.equal(status.winner, "black");
  assert.equal(generalsFace(board), false);
});

test("players alternate and a capture occupies the intersection", () => {
  const board = openingBoard();
  const first = accept(board, "red", { file: 1, rank: 0 }, { file: 2, rank: 2 });
  assert.equal(first.side, "black");
  reject(first.board, "black", { file: 7, rank: 0 }, { file: 6, rank: 2 }, "wrong-side");
  const second = commitMove(first.board, "black", { file: 1, rank: 9 }, { file: 2, rank: 7 });
  assert.equal(second.ok, true);
  assert.equal(second.side, "red");
  assert.equal(second.board[7][2].side, "black");
  assert.equal(second.board[7][2].type, "N");
});
