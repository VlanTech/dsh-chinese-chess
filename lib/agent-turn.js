/**
 * Ask the in-session agent to follow the dafeiyu-xiangqi skill.
 * Opening the board wakes the left-hand conversation. A later player move
 * wakes it again for the AI's turn. Neither message contains a move.
 */

import { SKILL_NAME } from "./skill.js";

export const MCP_SERVER_NAME = "dafeiyu";

export function modelToolName(rawName) {
  return `mcp__${MCP_SERVER_NAME}__${rawName}`;
}

function sideName(side) {
  return side === "red" ? "红方" : "黑方";
}

function workflowLines(session) {
  const readTool = modelToolName("read_position");
  const moveTool = modelToolName("submit_move");
  return [
    `请先调用 skill 工具，name 为 ${SKILL_NAME}，读完技能全文再行动。不要凭这段摘要走子。`,
    `你执${sideName(session.aiSide)}，玩家执${sideName(session.playerSide)}，当前轮到${sideName(session.turn)}。`,
    `然后调用 ${readTool}。`,
    `只有读到的局面轮到你时，才调用 ${moveTool} 提交唯一一着。`,
    "轮到玩家时不要提交。在左侧对话写出你的判断，思维链留在这一轮里。思维链和对话都不是着法，棋子只在 submit_move 成功时移动。",
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

function deliver(session, agent, text) {
  const request = {
    kind: "agent-request",
    role: "user",
    text,
    tools: [modelToolName("read_position"), modelToolName("submit_move")],
    appliesMove: false,
  };
  session.lastAgentRequest = request;
  const target = agent || session.agent;
  if (!target) {
    request.delivered = false;
    return request;
  }
  const message = userMessage(text);
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
  }
  return request;
}

/** Wake the left-hand conversation when the board opens or a new game starts. */
export function requestGameEntry(session, agent) {
  return deliver(session, agent, enterGamePrompt(session));
}

/**
 * After the player moves, ask the same agent to take the AI turn.
 * The board is left untouched.
 */
export function requestAiTurn(session, agent) {
  return deliver(session, agent, aiTurnPrompt(session));
}
