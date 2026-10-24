/**
 * AI-turn intake. Reasoning text is displayed; it never moves a piece.
 * A turn with no reasoning text leaves the surface without one — nothing
 * is invented to fill the gap.
 */

import { boardKey, legalTargets, statusText } from "./xiangqi.js";
import { pieceList } from "./session.js";

export function surfaceState(session) {
  const selected = session.selected;
  const targets = selected && session.turn === session.playerSide && !session.winner
    ? legalTargets(session.board, session.turn, selected)
    : [];
  return {
    title: "大肥鱼象棋",
    region: "right-sidebar",
    mainConversation: false,
    turn: session.turn,
    playerSide: session.playerSide,
    aiSide: session.aiSide,
    inCheck: session.inCheck,
    winner: session.winner,
    winReason: session.winReason,
    statusText: statusText(session),
    reasoning: session.reasoning,
    selected: selected ? { file: selected.file, rank: selected.rank } : null,
    targets: targets.map((square) => ({ file: square.file, rank: square.rank })),
    awaitingChoice: session.awaitingChoice === true,
    lastMove: session.lastMove,
    captures: targets.filter((square) => {
      const cell = session.board[square.rank]?.[square.file];
      return cell && cell.side !== session.playerSide;
    }).map((square) => ({ file: square.file, rank: square.rank })),
    pieces: pieceList(session.board),
    sidebarNonce: session.sidebarNonce,
    openedAt: session.openedAt || 0,
    boardKey: boardKey(session.board),
    notice: session.notice || null,
    noticeMark: session.noticeMark
      ? { file: session.noticeMark.file, rank: session.noticeMark.rank }
      : null,
  };
}

/**
 * Record the reasoning text of one AI turn.
 * `payload.reasoning` must be a non-empty string to appear. Any other
 * value clears the trace. The board is not read for a move and is not written.
 */
export function ingestAiTurn(session, payload = {}) {
  const text = payload && typeof payload.reasoning === "string" ? payload.reasoning : "";
  session.reasoning = text.trim() ? text : null;
  return surfaceState(session);
}
