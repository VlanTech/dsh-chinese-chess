/**
 * File-backed session shared by the host process and the MCP stdio process.
 * Writes are atomic under a lock so a submit and a click cannot tear the board.
 */

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createSession } from "./session.js";

export function sessionFilePath() {
  if (process.env.DAFEIYU_SESSION_FILE) return process.env.DAFEIYU_SESSION_FILE;
  return path.join(homedir(), ".dsh", "profiles", "desktop", "dafeiyu-xiangqi.json");
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* short lock wait */ }
}

function withLock(file, fn) {
  const lock = `${file}.lock`;
  mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      fd = openSync(lock, "wx");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      sleep(15);
    }
  }
  if (fd === undefined) throw new Error("大肥鱼象棋 session lock timed out");
  try {
    return fn();
  } finally {
    closeSync(fd);
    try { unlinkSync(lock); } catch { /* another waiter may have lost the race */ }
  }
}

export function serializeSession(session) {
  return {
    board: session.board,
    turn: session.turn,
    playerSide: session.playerSide,
    aiSide: session.aiSide,
    selected: session.selected,
    inCheck: session.inCheck,
    winner: session.winner,
    winReason: session.winReason,
    reasoning: session.reasoning,
    lastMove: session.lastMove,
    lastAgentRequest: session.lastAgentRequest,
    sidebarNonce: session.sidebarNonce,
    openedAt: session.openedAt || 0,
    awaitingChoice: session.awaitingChoice === true,
    notice: session.notice || null,
    noticeMark: session.noticeMark || null,
  };
}

function restoredMark(value) {
  if (!value || !Number.isInteger(value.file) || !Number.isInteger(value.rank)) return null;
  if (value.file < 0 || value.file > 8 || value.rank < 0 || value.rank > 9) return null;
  return { file: value.file, rank: value.rank };
}

export function sessionFromJSON(raw) {
  const session = createSession({
    board: raw.board,
    turn: raw.turn,
    playerSide: raw.playerSide,
  });
  session.selected = raw.selected || null;
  session.reasoning = typeof raw.reasoning === "string" && raw.reasoning.trim() ? raw.reasoning : null;
  session.lastMove = raw.lastMove || null;
  session.lastAgentRequest = raw.lastAgentRequest || null;
  session.sidebarNonce = Number.isInteger(raw.sidebarNonce) ? raw.sidebarNonce : 0;
  session.openedAt = Number.isFinite(raw.openedAt) ? raw.openedAt : 0;
  if (typeof raw.awaitingChoice === "boolean") session.awaitingChoice = raw.awaitingChoice;
  else session.awaitingChoice = !raw.lastMove && !raw.winner;
  session.notice = raw.notice === "不能送将" || raw.notice === "马腿被挡" ? raw.notice : null;
  session.noticeMark = session.notice === "马腿被挡" ? restoredMark(raw.noticeMark) : null;
  if (session.notice === "马腿被挡" && !session.noticeMark) session.notice = null;
  return session;
}

export function loadSession(file = sessionFilePath()) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || !Array.isArray(raw.board)) return null;
    return sessionFromJSON(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return null;
  }
}

export function saveSession(session, file = sessionFilePath()) {
  const body = JSON.stringify(serializeSession(session));
  withLock(file, () => {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, body);
    renameSync(tmp, file);
  });
}

export function updateSession(mutator, file = sessionFilePath()) {
  return withLock(file, () => {
    const existing = loadUnlocked(file);
    const loaded = existing || createSession();
    const result = mutator(loaded);
    let session = loaded;
    let write = true;
    if (result && typeof result === "object" && Object.hasOwn(result, "write")) {
      write = result.write !== false;
      if (result.session) session = result.session;
    } else if (result === false) {
      write = false;
    }
    if (write || !existing) {
      saveUnlocked(session, file);
      remember(session, file);
    }
    return { session, result };
  });
}

function loadUnlocked(file) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || !Array.isArray(raw.board)) return null;
    return sessionFromJSON(raw);
  } catch {
    return null;
  }
}

function saveUnlocked(session, file) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(serializeSession(session)));
  renameSync(tmp, file);
}

/** Host-process cache. Reloads when the MCP process rewrites the file. */
let cache = null;
let cacheMtime = -1;
let boundAgent = null;

export function bindAgent(agent) {
  if (agent) boundAgent = agent;
  return boundAgent;
}

export function boundAgentNow() {
  return boundAgent;
}

export function clearBoundAgent() {
  boundAgent = null;
}

function remember(session, file) {
  if (path.resolve(file) !== path.resolve(sessionFilePath())) return;
  cache = session;
  try { cacheMtime = statSync(file).mtimeMs; } catch { cacheMtime = -1; }
}

export function readHostSession() {
  const file = sessionFilePath();
  let mtime = -1;
  try { mtime = statSync(file).mtimeMs; } catch { mtime = -1; }
  if (!cache || mtime !== cacheMtime) {
    cache = mtime === -1 ? createSession({ awaitingChoice: true }) : (loadSession(file) || createSession({ awaitingChoice: true }));
    cacheMtime = mtime;
  }
  return cache;
}
