/**
 * Fold one assistant-stream frame into the chess surface.
 * Only real reasoning text is shown. A frame with none does not invent any.
 * Piece movement is never decided here.
 */

import { ingestAiTurn } from "./thinking.js";

let activeAttempt = null;
let buffer = "";

export function resetReasoningWatch() {
  activeAttempt = null;
  buffer = "";
}

export function noteReasoningFrame(session, frame) {
  if (!frame || session.winner) return false;
  if (frame.type === "start") {
    if (session.turn !== session.aiSide) {
      activeAttempt = null;
      return false;
    }
    activeAttempt = frame.attemptId ?? null;
    buffer = "";
    ingestAiTurn(session, {});
    return true;
  }
  if (activeAttempt === null || frame.attemptId !== activeAttempt) return false;
  const chunk = frame.chunk;
  if (frame.type === "chunk" && chunk?.type === "reasoning-delta" && typeof chunk.text === "string" && chunk.text.length > 0) {
    buffer += chunk.text;
    ingestAiTurn(session, { reasoning: buffer });
    return true;
  }
  if (frame.type === "chunk" && chunk?.type === "block-end" && chunk.block?.type === "reasoning" && typeof chunk.block.text === "string") {
    buffer = chunk.block.text;
    ingestAiTurn(session, { reasoning: buffer });
    return true;
  }
  return false;
}
