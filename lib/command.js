/**
 * /chessplay opens 大肥鱼象棋 in the right sidebar and wakes the session
 * agent. It does not move a piece.
 */

export const placementLog = [];

/**
 * Open the sidebar. A finished game, or an explicit restart, returns to the
 * side chooser and does not wake a move. Pieces stay until a side is chosen.
 */
export function applyOpen(session, options = {}) {
  const toChooser = options.restart === true || Boolean(session.winner);
  if (toChooser) {
    session.awaitingChoice = true;
    session.selected = null;
    session.notice = null;
    session.noticeMark = null;
  }
  session.sidebarNonce = (session.sidebarNonce || 0) + 1;
  session.openedAt = Date.now();
  const wake = !toChooser && session.awaitingChoice !== true && !session.winner;
  return { toChooser, wake };
}

export function openChessplay(invocation = {}, deps = {}) {
  const placement = {
    title: "大肥鱼象棋",
    region: "right-sidebar",
    mainConversation: false,
    ok: true,
  };
  const log = deps.log || placementLog;
  log.push(placement);
  if (typeof deps.openSession === "function") {
    const decision = deps.openSession(invocation) || {};
    const text = decision.toChooser
      ? "大肥鱼象棋已在右侧栏打开，请先选择执红或执黑"
      : "大肥鱼象棋已在右侧栏打开，左侧对话开始执棋";
    return { kind: "success", text };
  }
  const store = deps.store;
  if (store) {
    store.sidebarNonce = (store.sidebarNonce || 0) + 1;
    store.placement = placement;
    if (invocation.agent && typeof deps.bindAgent === "function") deps.bindAgent(invocation.agent);
    if (invocation.agent && typeof deps.wake === "function") deps.wake(invocation.agent);
  }
  return { kind: "success", text: "大肥鱼象棋已在右侧栏打开，左侧对话开始执棋" };
}

export function chessplayDefinition(deps = {}) {
  return {
    name: "chessplay",
    description: "在右侧栏打开大肥鱼象棋，与 AI 下中国象棋",
    handler(invocation) {
      return openChessplay(invocation, deps);
    },
  };
}
