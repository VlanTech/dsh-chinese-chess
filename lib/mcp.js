/**
 * MCP adapter over the shared session. Tools are `read_position`,
 * `preview_move`, `submit_move`, and `restart_game`. The harness publishes
 * them as `mcp__dafeiyu__*`. submit_move is the only way the AI side changes
 * the board. preview_move does not write the session.
 */

import { applyOpen } from "./command.js";
import { pieceList } from "./session.js";
import { fromSeat, toSeat } from "./seat.js";
import { at, commitMove, legalMoves } from "./xiangqi.js";
import { surfaceState } from "./thinking.js";
import { loadSession, saveSession, updateSession } from "./store.js";
import { MCP_SERVER_NAME, modelToolName } from "./agent-turn.js";

export { MCP_SERVER_NAME, modelToolName };

export const TOOLS = [
  {
    name: "read_position",
    description: "读取大肥鱼象棋当前局面、轮到谁、以及是否已分出胜负。坐标以 AI 自己在下方为准：rank 0 是 AI 的底线，file 0 是 AI 的左侧。不会走子。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "preview_move",
    description: "欲走一着，不落子，用户看不到，也不是悔棋。返回这一着之后的棋盘，以及对方下一着可以吃掉哪些子。可以多次调用，比较后再用 submit_move 提交唯一一着。坐标与 read_position 相同。",
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
    name: "submit_move",
    description: "在 AI 行棋时提交唯一一着。坐标与 read_position 相同：你的棋子在下方，rank 0 是你的底线，file 0 是你的左侧。只能走 AI 一方，且必须是 AI 的回合。非法着法不会改变局面。",
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

const SEAT_NOTE = "你的棋子在下方。rank 0 是你的底线，file 0 是你的左侧。对方在上方。";

function place(square, seat) {
  if (!square) return square;
  const viewed = toSeat(square, seat);
  return { ...square, file: viewed.file, rank: viewed.rank };
}

/** Tool payload. Piece coordinates are the AI's seat, not the engine's. */
export function modelSurface(session) {
  const raw = surfaceState(session);
  const seat = session.aiSide;
  return {
    ...raw,
    orientation: SEAT_NOTE,
    pieces: (raw.pieces || []).map((piece) => place(piece, seat)),
    targets: (raw.targets || []).map((square) => place(square, seat)),
    captures: (raw.captures || []).map((square) => place(square, seat)),
    selected: raw.selected ? place(raw.selected, seat) : null,
    lastMove: raw.lastMove?.from ? {
      ...raw.lastMove,
      from: place(raw.lastMove.from, seat),
      to: place(raw.lastMove.to, seat),
    } : raw.lastMove,
    noticeMark: raw.noticeMark ? place(raw.noticeMark, seat) : null,
  };
}

function canonicalMove(session, input) {
  const viewed = parseMove(input);
  if (!viewed) return null;
  return {
    viewed,
    from: fromSeat(viewed.from, session.aiSide),
    to: fromSeat(viewed.to, session.aiSide),
  };
}

function capturesAfter(board, side, seat) {
  const found = [];
  for (const move of legalMoves(board, side)) {
    const victim = at(board, move.to);
    if (!victim) continue;
    const attacker = at(board, move.from);
    found.push({
      by: { side: attacker.side, type: attacker.type, label: attacker.label, ...toSeat(move.from, seat) },
      takes: { side: victim.side, type: victim.type, label: victim.label, ...toSeat(move.to, seat) },
    });
  }
  return found;
}

function captureText(captures) {
  if (captures.length === 0) return "对方下一着没有可吃的子。";
  const parts = captures.map((item) => `${item.by.label}（${item.by.file},${item.by.rank}）吃${item.takes.label}（${item.takes.file},${item.takes.rank}）`);
  return `对方下一着可以吃：${parts.join("；")}。`;
}

/**
 * Show the board after one candidate move, including every capture the
 * opponent could make next. The session the player sees is not written.
 */
export function previewAiMove(session, input) {
  const hidden = { committed: false, visibleToPlayer: false, undo: false };
  if (session.awaitingChoice) return { ok: false, error: "awaiting-choice", ...hidden };
  if (session.winner) return { ok: false, error: "game-over", ...hidden };
  if (session.turn !== session.aiSide) return { ok: false, error: "not-ai-turn", ...hidden };
  const move = canonicalMove(session, input);
  if (!move) return { ok: false, error: "bad-move", ...hidden };
  const cell = session.board[move.from.rank]?.[move.from.file];
  if (!cell || cell.side !== session.aiSide) return { ok: false, error: "not-ai-piece", ...hidden };
  const committed = commitMove(session.board, session.aiSide, move.from, move.to);
  if (!committed.ok) return { ok: false, error: committed.reason, ...hidden };
  const seat = session.aiSide;
  const captured = committed.captured
    ? { side: committed.captured.side, type: committed.captured.type, label: committed.captured.label, ...move.viewed.to }
    : null;
  const captures = capturesAfter(committed.board, committed.side, seat);
  return {
    ok: true,
    ...hidden,
    orientation: SEAT_NOTE,
    move: { from: move.viewed.from, to: move.viewed.to },
    captured,
    takenText: captured ? `这一着吃掉${captured.label}。` : "这一着不吃子。",
    inCheck: committed.inCheck,
    over: committed.over,
    winner: committed.over ? committed.winner : null,
    winReason: committed.over ? committed.winReason : null,
    nextTurn: committed.side,
    pieces: pieceList(committed.board).map((piece) => place(piece, seat)),
    captures,
    captureText: captureText(captures),
  };
}

/** Return to the side chooser and open the sidebar. Pieces stay where they are. */
export function restartGame(session) {
  applyOpen(session, { restart: true });
  return { ok: true, restarted: true, surface: modelSurface(session) };
}

/**
 * Apply one AI move on the session object. Rejects illegal moves, moves of
 * the player's pieces, and moves when it is not the AI's turn. The board
 * object is replaced only after `commitMove` accepts the move.
 */
export function submitAiMove(session, input) {
  if (session.awaitingChoice) {
    return { ok: false, error: "awaiting-choice", surface: modelSurface(session) };
  }
  if (session.winner) {
    return { ok: false, error: "game-over", surface: modelSurface(session) };
  }
  if (session.turn !== session.aiSide) {
    return { ok: false, error: "not-ai-turn", surface: modelSurface(session) };
  }
  const move = canonicalMove(session, input);
  if (!move) {
    return { ok: false, error: "bad-move", surface: modelSurface(session) };
  }
  const cell = session.board[move.from.rank]?.[move.from.file];
  if (!cell || cell.side !== session.aiSide) {
    return { ok: false, error: "not-ai-piece", surface: modelSurface(session) };
  }
  const committed = commitMove(session.board, session.aiSide, move.from, move.to);
  if (!committed.ok) {
    return { ok: false, error: committed.reason, surface: modelSurface(session) };
  }
  session.board = committed.board;
  session.turn = committed.side;
  session.selected = null;
  session.notice = null;
  session.noticeMark = null;
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
  return { ok: true, surface: modelSurface(session) };
}

export function readPosition(session) {
  return { ok: true, surface: modelSurface(session) };
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
      instructions: "大肥鱼象棋。用中文思考。read_position 的坐标以你自己在下方为准。欲走用 preview_move，它不落子，用户看不到。选定后只用 submit_move 走一着。用户要重开时用 restart_game 回到选边，不要自己走子。思维链不会移动棋子。",
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
      if (name === "preview_move") return { write: false, value: previewAiMove(session, args) };
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
