/**
 * Player interaction. Selecting a piece does not change the position.
 * A legal destination commits through the shared rules and hands the turn
 * over. Anything illegal leaves the pieces where they are. A finished
 * game reports the winner and refuses further moves.
 */

import { requestAiTurn } from "./agent-turn.js";
import { at, boardKey, commitMove, horseDelta, onBoard } from "./xiangqi.js";
import { surfaceState } from "./thinking.js";

function same(a, b) {
  return !!a && !!b && a.file === b.file && a.rank === b.rank;
}

function clearNotice(session) {
  session.notice = null;
  session.noticeMark = null;
}

/**
 * Explain a refused step from the rules reason, before a click on an
 * enemy piece rewrites that reason to "opponent-piece".
 */
function noteRefusal(session, from, to, reason) {
  clearNotice(session);
  if (reason === "leaves-check") {
    session.notice = "不能送将";
    return;
  }
  if (reason !== "illegal") return;
  const mover = at(session.board, from);
  if (!mover || mover.type !== "N") return;
  const leg = horseDelta(from, to);
  if (!leg || !onBoard(leg.file, leg.rank) || !session.board[leg.rank][leg.file]) return;
  session.notice = "马腿被挡";
  session.noticeMark = { file: leg.file, rank: leg.rank };
}

function view(session, extra) {
  return {
    ...surfaceState(session),
    positionUnchanged: extra.positionUnchanged,
    action: extra.action,
    reason: extra.reason || null,
    ok: extra.ok,
    request: extra.request || null,
  };
}

export function playerInteract(session, square, agent) {
  const beforeKey = boardKey(session.board);
  const beforeTurn = session.turn;

  if (session.awaitingChoice) {
    return view(session, {
      ok: false,
      action: "rejected",
      reason: "awaiting-choice",
      positionUnchanged: true,
    });
  }

  if (session.winner) {
    return view(session, {
      ok: false,
      action: "rejected",
      reason: "game-over",
      positionUnchanged: true,
    });
  }

  if (session.turn !== session.playerSide) {
    let request = null;
    if (session.turn === session.aiSide) request = requestAiTurn(session, agent || session.agent);
    return view(session, {
      ok: false,
      action: "rejected",
      reason: "not-player-turn",
      positionUnchanged: true,
      request,
    });
  }

  const occupant = at(session.board, square);
  if (!session.selected) {
    if (occupant && occupant.side === session.playerSide) {
      session.selected = { file: square.file, rank: square.rank };
      clearNotice(session);
      return view(session, { ok: true, action: "select", positionUnchanged: true });
    }
    clearNotice(session);
    return view(session, {
      ok: false,
      action: "rejected",
      reason: occupant ? "opponent-piece" : "empty",
      positionUnchanged: true,
    });
  }

  if (same(session.selected, square)) {
    session.selected = null;
    clearNotice(session);
    return view(session, { ok: true, action: "deselect", positionUnchanged: true });
  }

  if (occupant && occupant.side === session.playerSide) {
    session.selected = { file: square.file, rank: square.rank };
    clearNotice(session);
    return view(session, { ok: true, action: "select", positionUnchanged: true });
  }

  const origin = { file: session.selected.file, rank: session.selected.rank };
  const committed = commitMove(session.board, session.turn, origin, square);
  if (!committed.ok) {
    noteRefusal(session, origin, square, committed.reason);
    const reason = occupant && occupant.side !== session.playerSide && committed.reason !== "leaves-check"
      ? "opponent-piece"
      : committed.reason;
    return view(session, {
      ok: false,
      action: "rejected",
      reason,
      positionUnchanged: boardKey(session.board) === beforeKey && session.turn === beforeTurn,
    });
  }

  session.board = committed.board;
  session.turn = committed.side;
  session.selected = null;
  clearNotice(session);
  session.inCheck = committed.inCheck;
  session.winner = committed.over ? committed.winner : null;
  session.winReason = committed.over ? committed.winReason : null;
  session.lastMove = {
    from: origin,
    to: { file: square.file, rank: square.rank },
    captured: committed.captured
      ? { side: committed.captured.side, type: committed.captured.type, label: committed.captured.label }
      : null,
  };
  session.reasoning = null;

  let request = null;
  if (!session.winner && session.turn === session.aiSide) {
    request = requestAiTurn(session, agent || session.agent);
  }
  return view(session, {
    ok: true,
    action: committed.captured ? "capture" : "move",
    positionUnchanged: false,
    request,
  });
}
