/**
 * A human message in the workspace that asks to play opens the same
 * board as /chessplay. Plugin follow-ups are not invitations.
 */

const REFUSAL = /不(要|想|下)|别下|别重|停止下棋|关掉象棋|退出象棋/;
const INVITE = /来下棋|下棋|下(?:一|1)?[盘局]?(?:中国)?象棋|玩(?:一|1)?[盘局]?(?:中国)?象棋/;
const RESTART = /重来|重新开始|再来一[盘局]|重开|新的一[盘局]/;

export function messageText(message) {
  if (!message || message.source?.kind !== "user" || !Array.isArray(message.content)) return "";
  return message.content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function compactText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, "");
}

export function asksToPlayChess(text) {
  const compact = compactText(text);
  if (!compact || REFUSAL.test(compact)) return false;
  return INVITE.test(compact);
}

export function asksToRestart(text) {
  const compact = compactText(text);
  if (!compact || REFUSAL.test(compact)) return false;
  return RESTART.test(compact);
}

export function noticeInvite(payload, open, seen = new Set()) {
  const messages = payload?.messages;
  if (!Array.isArray(messages) || typeof open !== "function") return false;
  for (const message of messages) {
    const text = messageText(message);
    const restart = asksToRestart(text);
    if (!restart && !asksToPlayChess(text)) continue;
    const id = message && typeof message.id === "string" ? message.id : "";
    if (id && seen.has(id)) return false;
    if (id) seen.add(id);
    open(payload.agent, { restart });
    return true;
  }
  return false;
}

export function watchInvite(ctx, open) {
  if (typeof ctx?.on !== "function") return () => {};
  const seen = new Set();
  return ctx.on("agent/pre-step", async (payload, next) => {
    const decision = typeof next === "function" ? await next() : undefined;
    try { noticeInvite(payload, open, seen); } catch { /* the turn still proceeds */ }
    return decision;
  });
}
