/**
 * Ask the in-session agent to follow the dafeiyu-xiangqi skill.
 * A board action wakes the live session agent. A disposed or busy agent
 * is not followed; the wake waits until that session is idle.
 */

import { SKILL_NAME } from "./skill.js";
import { bindAgent, boundAgentNow, clearBoundAgent, updateSession } from "./store.js";

export const MCP_SERVER_NAME = "dafeiyu";

let hostCtx = null;
let pendingWake = null;
let delivering = false;

export function modelToolName(rawName) {
  return `mcp__${MCP_SERVER_NAME}__${rawName}`;
}

function toolList() {
  return [modelToolName("read_position"), modelToolName("preview_move"), modelToolName("submit_move")];
}

function sideName(side) {
  return side === "red" ? "红方" : "黑方";
}

function workflowLines(session) {
  const readTool = modelToolName("read_position");
  const previewTool = modelToolName("preview_move");
  const moveTool = modelToolName("submit_move");
  return [
    `请先调用 skill 工具，name 为 ${SKILL_NAME}，读完技能全文再行动。不要凭这段摘要走子。`,
    `你执${sideName(session.aiSide)}，玩家执${sideName(session.playerSide)}，当前轮到${sideName(session.turn)}。你的棋子在下方：rank 0 是你的底线，file 0 是你的左侧。`,
    `然后调用 ${readTool}。返回的坐标已经是你在下方的视角。`,
    `轮到你时，先用 ${previewTool} 欲走。欲走不落子，用户看不到，也不是悔棋。看返回里对方下一着能吃掉哪些子。可以再欲走别的着法。选定后只调用一次 ${moveTool}。`,
    "轮到玩家时不要提交。在左侧对话写出你的判断。思维链必须全部用中文，不要用英文思考。思维链和对话都不是着法，棋子只在 submit_move 成功时移动。",
    "思考和回复都按技能里的人格：鲸豚少女，动作用尾鳍，想吃只提米饭，聪明但懒，先别扭马上又软，始终听主人的，拒绝被叫胖。服从不包含替主人走子或非法着法。",
  ];
}

export function enterGamePrompt(session) {
  return ["大肥鱼象棋已打开，左侧对话从这一轮开始。", ...workflowLines(session)].join("\n");
}

export function aiTurnPrompt(session) {
  return ["大肥鱼象棋：玩家已经走完，轮到你。", ...workflowLines(session)].join("\n");
}

function userMessage(text) {
  return {
    id: `dafeiyu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content: [{ type: "text", text }],
    // Desktop 0.2.1 session format v4 rejects the retired wrapper
    // { kind: "plugin", plugin }. The producer owns the kind itself.
    source: { kind: "plugin:dsh-dafeiyu-xiangqi" },
  };
}

function isDisposed(agent) {
  const reason = agent?.phase?.abort?.signal?.reason;
  return !!reason && reason.kind === "disposed";
}

function isIdle(agent) {
  if (!agent?.phase) return true;
  return agent.phase.kind === "idle";
}

function canDeliver(agent) {
  return !!agent && (
    typeof agent.followup === "function"
    || typeof agent.send === "function"
    || typeof agent.inbox?.append === "function"
  );
}

function agentsFromHost() {
  const ctx = hostCtx;
  if (!ctx) return null;
  try {
    const reflect = ctx.reflect;
    if (reflect && typeof reflect.get === "function") {
      const found = reflect.get("agents", false);
      if (found && typeof found.get === "function") return found;
    }
  } catch {
    return null;
  }
  return null;
}

function isRoot(agent) {
  const registry = agentsFromHost();
  if (!registry || typeof registry.roots !== "function") return true;
  return registry.roots().some((root) => root === agent || (agent?.id != null && root?.id === agent.id));
}

function adopt(agent) {
  if (!canDeliver(agent) || isDisposed(agent)) return false;
  const cached = boundAgentNow();
  if (cached && cached !== agent && !isDisposed(cached)) {
    if (cached.id != null && agent.id != null && cached.id !== agent.id) return false;
    if (cached.id == null && agent.id != null) return false;
  }
  if (!isRoot(agent) && !(cached && cached.id != null && cached.id === agent.id)) return false;
  bindAgent(agent);
  return true;
}

/** The live agent for this session, or null when none can take a turn. */
export function resolveLiveAgent(preferred) {
  const registry = agentsFromHost();
  const hinted = preferred || boundAgentNow();
  if (registry && hinted?.id != null) {
    const live = registry.get(hinted.id);
    if (canDeliver(live) && !isDisposed(live)) {
      bindAgent(live);
      return live;
    }
  }
  if (canDeliver(hinted) && !isDisposed(hinted)) {
    const replaced = !!(registry && hinted.id != null && registry.get(hinted.id) !== hinted);
    if (!replaced) {
      bindAgent(hinted);
      return hinted;
    }
  }
  if (registry && typeof registry.roots === "function") {
    const roots = registry.roots().filter((agent) => canDeliver(agent) && !isDisposed(agent));
    if (roots.length === 1) {
      bindAgent(roots[0]);
      return roots[0];
    }
  }
  return null;
}

function deliver(session, agent, text) {
  const request = {
    kind: "agent-request",
    role: "user",
    text,
    tools: toolList(),
    appliesMove: false,
  };
  session.lastAgentRequest = request;
  const target = agent || session.agent;
  if (!target || isDisposed(target)) {
    request.delivered = false;
    return request;
  }
  const message = userMessage(text);
  delivering = true;
  try {
    if (typeof target.followup === "function") {
      target.followup(message);
      request.delivered = true;
      request.via = "followup";
    } else if (typeof target.send === "function") {
      target.send(message, "next-turn", true);
      request.delivered = true;
      request.via = "send";
    } else if (target.inbox && typeof target.inbox.append === "function") {
      target.inbox.append("next-turn", message);
      request.delivered = true;
      request.via = "inbox";
    } else {
      request.delivered = false;
    }
  } catch (error) {
    request.delivered = false;
    request.deliveryError = error instanceof Error ? error.message : String(error);
  } finally {
    delivering = false;
  }
  return request;
}

function undelivered(session, text) {
  const request = {
    kind: "agent-request",
    role: "user",
    text,
    tools: toolList(),
    appliesMove: false,
    delivered: false,
    pending: true,
  };
  session.lastAgentRequest = request;
  return request;
}

function wake(session, hint, kind, text) {
  const live = resolveLiveAgent(hint);
  if (!live || !isIdle(live)) {
    pendingWake = { kind };
    return undelivered(session, text);
  }
  pendingWake = null;
  const request = deliver(session, live, text);
  if (!request.delivered) pendingWake = { kind };
  return request;
}

function flushPending(agent) {
  if (delivering || !pendingWake || !agent || isDisposed(agent) || !isIdle(agent)) return;
  const kind = pendingWake.kind;
  pendingWake = null;
  try {
    updateSession((session) => {
      const open = session.awaitingChoice !== true && !session.winner;
      const wanted = kind === "entry" ? open : open && session.turn === session.aiSide;
      if (!wanted) return { write: false };
      const text = kind === "entry" ? enterGamePrompt(session) : aiTurnPrompt(session);
      const request = deliver(session, agent, text);
      if (!request.delivered) pendingWake = { kind };
      return { write: request.delivered === true };
    });
  } catch {
    if (!pendingWake) pendingWake = { kind };
  }
}

/** Remember the host so a later click can find the live agent without inject. */
export function watchAgents(ctx) {
  hostCtx = ctx || null;
  if (!ctx || typeof ctx.on !== "function") return () => {};
  const stops = [];
  const listen = (name, fn) => {
    const stop = ctx.on(name, fn);
    if (typeof stop === "function") stops.push(stop);
  };
  listen("agent/created", (payload) => {
    const agent = payload?.agent;
    if (!agent || !adopt(agent)) return;
    flushPending(agent);
  });
  listen("agent/status", (payload) => {
    if (payload?.status !== "idle") return;
    const agent = resolveLiveAgent();
    if (agent) flushPending(agent);
  });
  listen("agent/pre-step", async (payload, next) => {
    const decision = typeof next === "function" ? await next() : undefined;
    try {
      if (payload?.agent) adopt(payload.agent);
    } catch { /* the turn already continued */ }
    return decision;
  });
  return () => {
    for (const stop of stops) stop();
    if (hostCtx === ctx) hostCtx = null;
  };
}

export function resetAgentWatch() {
  hostCtx = null;
  pendingWake = null;
  delivering = false;
  clearBoundAgent();
}

/** Wake the left-hand conversation when the board opens or a new game starts. */
export function requestGameEntry(session, agent) {
  return wake(session, agent, "entry", enterGamePrompt(session));
}

/**
 * Ask the same agent to take the AI turn. The board is left untouched.
 * An idle live agent is woken now. Otherwise the wake waits for idle.
 */
export function requestAiTurn(session, agent) {
  return wake(session, agent, "turn", aiTurnPrompt(session));
}
