/**
 * MCP adapter over the shared session. Tools are `read_position`,
 * `submit_move`, and `restart_game`. The harness publishes them as
 * `mcp__dafeiyu__*`. submit_move is the only way the AI side changes the board.
 */

import { applyOpen } from "./command.js";
import { commitMove } from "./xiangqi.js";
import { surfaceState } from "./thinking.js";
import { loadSession, saveSession, updateSession } from "./store.js";
import { MCP_SERVER_NAME, modelToolName } from "./agent-turn.js";

export { MCP_SERVER_NAME, modelToolName };

export const TOOLS = [
  {
    name: "read_position",
    description: "读取大肥鱼象棋当前局面、轮到谁、以及是否已分出胜负。不会走子。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_move",
    description: "在 AI 行棋时提交唯一一着。fromFile/fromRank 为起点，toFile/toRank 为落点（file 0-8，rank 0-9，红方底线 rank 为 0）。只能走 AI 一方，且必须是 AI 的回合。非法着法不会改变局面。",
    inputSchema: {
      type: "object",
      properties: {
        fromFile: { type: "integer" },
        fromRank: { type: "integer" },
        toFile: { type: "integer" },
        toRank: { type: "integer" },
        move: { type: "string", description: "可选，形如 0,0-0,2" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "restart_game",
    description: "回到选边并打开右侧栏。用于开始、重来、再来一局。不走子，也不替玩家选红或选黑。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function numberOrNull(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

export function parseMove(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const match = input.trim().match(/^(\d)\s*,\s*(\d)\s*[-:>]\s*(\d)\s*,\s*(\d)$/);
    if (!match) return null;
    return {
      from: { file: Number(match[1]), rank: Number(match[2]) },
      to: { file: Number(match[3]), rank: Number(match[4]) },
    };
  }
  const fromFile = numberOrNull(input.fromFile ?? input.from?.file);
  const fromRank = numberOrNull(input.fromRank ?? input.from?.rank);
  const toFile = numberOrNull(input.toFile ?? input.to?.file);
  const toRank = numberOrNull(input.toRank ?? input.to?.rank);
  if (fromFile === null && typeof input.move === "string") return parseMove(input.move);
  if ([fromFile, fromRank, toFile, toRank].some((value) => value === null)) return null;
  return { from: { file: fromFile, rank: fromRank }, to: { file: toFile, rank: toRank } };
}

/** Return to the side chooser and open the sidebar. Pieces stay where they are. */
export function restartGame(session) {
  applyOpen(session, { restart: true });
  return { ok: true, restarted: true, surface: surfaceState(session) };
}

/**
 * Apply one AI move on the session object. Rejects illegal moves, moves of
 * the player's pieces, and moves when it is not the AI's turn. The board
 * object is replaced only after `commitMove` accepts the move.
 */
export function submitAiMove(session, input) {
  if (session.awaitingChoice) {
    return { ok: false, error: "awaiting-choice", surface: surfaceState(session) };
  }
  if (session.winner) {
    return { ok: false, error: "game-over", surface: surfaceState(session) };
  }
  if (session.turn !== session.aiSide) {
    return { ok: false, error: "not-ai-turn", surface: surfaceState(session) };
  }
  const move = parseMove(input);
  if (!move) {
    return { ok: false, error: "bad-move", surface: surfaceState(session) };
  }
  const cell = session.board[move.from.rank]?.[move.from.file];
  if (!cell || cell.side !== session.aiSide) {
    return { ok: false, error: "not-ai-piece", surface: surfaceState(session) };
  }
  const committed = commitMove(session.board, session.aiSide, move.from, move.to);
  if (!committed.ok) {
    return { ok: false, error: committed.reason, surface: surfaceState(session) };
  }
  session.board = committed.board;
  session.turn = committed.side;
  session.selected = null;
  session.inCheck = committed.inCheck;
  session.winner = committed.over ? committed.winner : null;
  session.winReason = committed.over ? committed.winReason : null;
  session.lastMove = {
    from: move.from,
    to: move.to,
    captured: committed.captured
      ? { side: committed.captured.side, type: committed.captured.type, label: committed.captured.label }
      : null,
  };
  return { ok: true, surface: surfaceState(session) };
}

export function readPosition(session) {
  return { ok: true, surface: surfaceState(session) };
}

/** JSON-RPC dispatch used by the stdio server. `sessionFile` selects the shared board. */
export function dispatchMcp(message, sessionFile) {
  const method = message?.method;
  if (!method) return null;
  if (method === "initialize") {
    const requested = message.params?.protocolVersion;
    return {
      protocolVersion: typeof requested === "string" ? requested : "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "dafeiyu-xiangqi", version: "0.1.0" },
      instructions: "大肥鱼象棋。用 read_position 看局面，用 submit_move 走 AI 一方的一着。用户要重开时用 restart_game 回到选边，不要自己走子。思维链不会移动棋子。",
    };
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return undefined;
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: TOOLS };
  if (method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const outcome = updateSession((session) => {
      if (name === "read_position") return { write: false, value: readPosition(session) };
      if (name === "restart_game") return { write: true, value: restartGame(session) };
      if (name === "submit_move") {
        const value = submitAiMove(session, args);
        return { write: value.ok, value };
      }
      return { write: false, value: { ok: false, error: "unknown-tool" } };
    }, sessionFile);
    const value = outcome.result.value;
    return {
      content: [{ type: "text", text: JSON.stringify(value) }],
      isError: value.ok !== true,
    };
  }
  return { error: true, code: -32601, message: `unknown method ${method}` };
}

export function runStdio(sessionFile = process.env.DAFEIYU_SESSION_FILE) {
  let buffer = "";
  const write = (payload) => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };
  const handle = (message) => {
    if (!message || typeof message !== "object") return;
    let result;
    try {
      result = dispatchMcp(message, sessionFile);
    } catch (error) {
      if (message.id === undefined) return;
      write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      });
      return;
    }
    if (message.id === undefined || result === undefined) return;
    if (result && result.error === true) {
      write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: result.code, message: result.message },
      });
      return;
    }
    write({ jsonrpc: "2.0", id: message.id, result });
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.trim()) continue;
      if (/^content-(length|type):/i.test(line)) continue;
      try {
        handle(JSON.parse(line));
      } catch (error) {
        process.stderr.write(`dafeiyu-xiangqi mcp: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  });
  process.stdin.on("end", () => {
    process.exit(0);
  });
  process.stdin.resume();
}

export function sessionForTools(sessionFile) {
  return loadSession(sessionFile);
}

export function saveToolSession(session, sessionFile) {
  saveSession(session, sessionFile);
}
