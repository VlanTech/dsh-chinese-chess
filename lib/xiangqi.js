/**
 * Xiangqi rules. Pure: no I/O. The board, the player path, and the MCP
 * handlers all commit moves through `commitMove`.
 *
 * Files 0–8 run left to right from Red's view. Ranks 0–9 run from Red's
 * back rank up to Black's back rank. Pieces sit on intersections.
 */

export const FILES = 9;
export const RANKS = 10;

const LABELS = {
  red: { K: "帅", A: "士", B: "相", N: "马", R: "车", C: "炮", P: "兵" },
  black: { K: "将", A: "士", B: "象", N: "马", R: "车", C: "炮", P: "卒" },
};

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
const ELEPHANT = [[2, 2], [2, -2], [-2, 2], [-2, -2]];

export function opponent(side) {
  return side === "red" ? "black" : "red";
}

export function piece(side, type) {
  return { side, type, label: LABELS[side][type] };
}

export function emptyBoard() {
  return Array.from({ length: RANKS }, () => Array(FILES).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { side: cell.side, type: cell.type, label: cell.label } : null)));
}

export function boardKey(board) {
  return board.map((row) => row.map((cell) => (cell ? `${cell.side[0]}${cell.type}` : ".")).join("")).join("/");
}

export function at(board, square) {
  if (!square || !onBoard(square.file, square.rank)) return null;
  return board[square.rank][square.file];
}

export function onBoard(file, rank) {
  return file >= 0 && file < FILES && rank >= 0 && rank < RANKS;
}

/** Place one piece. Does not mutate `board`. */
export function put(board, side, type, file, rank) {
  const next = cloneBoard(board);
  next[rank][file] = piece(side, type);
  return next;
}

export function openingBoard() {
  let board = emptyBoard();
  const back = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  back.forEach((type, file) => {
    board = put(board, "red", type, file, 0);
    board = put(board, "black", type, file, 9);
  });
  for (const file of [1, 7]) {
    board = put(board, "red", "C", file, 2);
    board = put(board, "black", "C", file, 7);
  }
  for (const file of [0, 2, 4, 6, 8]) {
    board = put(board, "red", "P", file, 3);
    board = put(board, "black", "P", file, 6);
  }
  return board;
}

export function inventory(board) {
  const counts = {};
  let n = 0;
  const pieces = [];
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const cell = board[rank][file];
      if (!cell) continue;
      n += 1;
      const key = `${cell.side}:${cell.type}:${cell.label}`;
      counts[key] = (counts[key] || 0) + 1;
      pieces.push({ side: cell.side, type: cell.type, label: cell.label, file, rank });
    }
  }
  return { n, counts, pieces };
}

export function findKing(board, side) {
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const cell = board[rank][file];
      if (cell && cell.side === side && cell.type === "K") return { file, rank };
    }
  }
  return null;
}

function inPalace(side, file, rank) {
  if (file < 3 || file > 5) return false;
  if (side === "red") return rank >= 0 && rank <= 2;
  return rank >= 7 && rank <= 9;
}

function crossedRiver(side, rank) {
  return side === "red" ? rank >= 5 : rank <= 4;
}

/** True when the two generals see each other along an empty file. */
export function generalsFace(board) {
  const red = findKing(board, "red");
  const black = findKing(board, "black");
  if (!red || !black || red.file !== black.file) return false;
  const lo = Math.min(red.rank, black.rank);
  const hi = Math.max(red.rank, black.rank);
  for (let rank = lo + 1; rank < hi; rank++) {
    if (board[rank][red.file]) return false;
  }
  return true;
}

function pushDest(out, board, side, file, rank) {
  if (!onBoard(file, rank)) return;
  const target = board[rank][file];
  if (target && target.side === side) return;
  out.push({ file, rank });
}

function rayMoves(board, side, from, kind) {
  const out = [];
  for (const [df, dr] of ORTHO) {
    let file = from.file + df;
    let rank = from.rank + dr;
    let screened = false;
    while (onBoard(file, rank)) {
      const target = board[rank][file];
      if (kind === "rook") {
        if (!target) out.push({ file, rank });
        else {
          if (target.side !== side) out.push({ file, rank });
          break;
        }
      } else if (!screened) {
        if (!target) out.push({ file, rank });
        else screened = true;
      } else if (target) {
        if (target.side !== side) out.push({ file, rank });
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return out;
}

/** Geometric moves, including captures. Ignores self-check. */
export function pseudoMoves(board, from) {
  const cell = at(board, from);
  if (!cell) return [];
  const { side, type } = cell;
  const out = [];
  if (type === "K") {
    for (const [df, dr] of ORTHO) {
      const file = from.file + df;
      const rank = from.rank + dr;
      if (inPalace(side, file, rank)) pushDest(out, board, side, file, rank);
    }
    return out;
  }
  if (type === "A") {
    for (const [df, dr] of DIAG) {
      const file = from.file + df;
      const rank = from.rank + dr;
      if (inPalace(side, file, rank)) pushDest(out, board, side, file, rank);
    }
    return out;
  }
  if (type === "B") {
    for (const [df, dr] of ELEPHANT) {
      const file = from.file + df;
      const rank = from.rank + dr;
      if (!onBoard(file, rank)) continue;
      if (side === "red" && rank > 4) continue;
      if (side === "black" && rank < 5) continue;
      const eyeFile = from.file + df / 2;
      const eyeRank = from.rank + dr / 2;
      if (board[eyeRank][eyeFile]) continue;
      pushDest(out, board, side, file, rank);
    }
    return out;
  }
  if (type === "N") {
    for (const [df, dr] of HORSE) {
      const legFile = from.file + (Math.abs(df) === 2 ? Math.sign(df) : 0);
      const legRank = from.rank + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
      if (!onBoard(legFile, legRank) || board[legRank][legFile]) continue;
      pushDest(out, board, side, from.file + df, from.rank + dr);
    }
    return out;
  }
  if (type === "R") return rayMoves(board, side, from, "rook");
  if (type === "C") return rayMoves(board, side, from, "cannon");
  if (type === "P") {
    const forward = side === "red" ? 1 : -1;
    pushDest(out, board, side, from.file, from.rank + forward);
    if (crossedRiver(side, from.rank)) {
      pushDest(out, board, side, from.file + 1, from.rank);
      pushDest(out, board, side, from.file - 1, from.rank);
    }
    return out;
  }
  return out;
}

export function inCheck(board, side) {
  if (generalsFace(board)) return true;
  const king = findKing(board, side);
  if (!king) return true;
  const enemy = opponent(side);
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const cell = board[rank][file];
      if (!cell || cell.side !== enemy) continue;
      const hits = pseudoMoves(board, { file, rank });
      if (hits.some((hit) => hit.file === king.file && hit.rank === king.rank)) return true;
    }
  }
  return false;
}

function sameSquare(a, b) {
  return !!a && !!b && a.file === b.file && a.rank === b.rank;
}

function applyUnchecked(board, from, to) {
  const next = cloneBoard(board);
  next[to.rank][to.file] = next[from.rank][from.file];
  next[from.rank][from.file] = null;
  return next;
}

/**
 * Accept a legal move or reject it without changing the board.
 * `leaves-check` means the geometry was legal but the mover's general
 * would be in check (including 飞将).
 */
export function commitMove(board, side, from, to) {
  const cell = at(board, from);
  if (!cell || cell.side !== side) {
    return { ok: false, reason: cell ? "wrong-side" : "empty", board, side };
  }
  const hits = pseudoMoves(board, from);
  if (!hits.some((hit) => sameSquare(hit, to))) {
    return { ok: false, reason: "illegal", board, side };
  }
  const next = applyUnchecked(board, from, to);
  if (inCheck(next, side)) {
    return { ok: false, reason: "leaves-check", board, side };
  }
  const nextSide = opponent(side);
  const status = gameStatus(next, nextSide);
  return {
    ok: true,
    reason: "ok",
    board: next,
    side: nextSide,
    captured: at(board, to),
    inCheck: status.inCheck,
    over: status.over,
    winner: status.winner,
    winReason: status.winReason,
  };
}

export function isLegalMove(board, side, from, to) {
  return commitMove(board, side, from, to).ok;
}

export function legalMoves(board, side) {
  const moves = [];
  for (let rank = 0; rank < RANKS; rank++) {
    for (let file = 0; file < FILES; file++) {
      const cell = board[rank][file];
      if (!cell || cell.side !== side) continue;
      const from = { file, rank };
      for (const to of pseudoMoves(board, from)) {
        const next = applyUnchecked(board, from, to);
        if (!inCheck(next, side)) moves.push({ from, to });
      }
    }
  }
  return moves;
}

export function legalTargets(board, side, from) {
  return legalMoves(board, side)
    .filter((move) => sameSquare(move.from, from))
    .map((move) => move.to);
}

/** 将死 or 困毙 for the side about to move; otherwise the side is still playing. */
export function gameStatus(board, sideToMove) {
  const checked = inCheck(board, sideToMove);
  const moves = legalMoves(board, sideToMove);
  if (moves.length > 0) {
    return { over: false, winner: null, winReason: null, inCheck: checked };
  }
  return {
    over: true,
    winner: opponent(sideToMove),
    winReason: checked ? "checkmate" : "stalemate",
    inCheck: checked,
  };
}

export function statusText(session) {
  if (session.winner) {
    const who = session.winner === "red" ? "红方" : "黑方";
    const how = session.winReason === "checkmate" ? "将死" : "困毙";
    return `${who}胜（${how}）`;
  }
  const who = session.turn === "red" ? "红方" : "黑方";
  return session.inCheck ? `${who}被将军` : `${who}走`;
}
