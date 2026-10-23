/**
 * Host routes the sidebar calls, plus the /chessplay registration.
 * Opening the board wakes the left-hand conversation. A player move wakes
 * it again so the model can take the AI turn.
 */

import { requestGameEntry } from "./agent-turn.js";
import { applyOpen, chessplayDefinition, openChessplay } from "./command.js";
import { watchInvite } from "./invite.js";
import { playerInteract } from "./interact.js";
import { noteReasoningFrame, resetReasoningWatch } from "./reasoning.js";
import { createSession } from "./session.js";
import { bindAgent, boundAgentNow, readHostSession, updateSession } from "./store.js";
import { surfaceState } from "./thinking.js";

/** Bind the agent that /chessplay names. Reasoning is not subscribed here. */
export function watchAgent(agent) {
  if (agent) bindAgent(agent);
}

function acceptReasoning(payload) {
  const agent = boundAgentNow();
  if (agent && payload?.agent && payload.agent !== agent) return;
  updateSession((session) => {
    const changed = noteReasoningFrame(session, payload?.frame);
    return { write: changed === true };
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function startGame(playerSide) {
  resetReasoningWatch();
  const outcome = updateSession((previous) => {
    const session = createSession({ playerSide });
    session.sidebarNonce = previous.sidebarNonce;
    session.awaitingChoice = false;
    if (!session.winner) requestGameEntry(session, boundAgentNow());
    return { write: true, session, value: surfaceState(session) };
  });
  return outcome.result.value;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function mountRoutes(connection) {
  if (!connection?.fetch?.register) return () => {};
  const stops = [];
  const add = (path, methods, fetch) => {
    const stop = connection.fetch.register({ path, methods, requestBody: "buffered", fetch });
    if (typeof stop === "function") stops.push(stop);
  };
  add("/api/dafeiyu-xiangqi/state", ["GET"], () => json(surfaceState(readHostSession())));
  add("/api/dafeiyu-xiangqi/click", ["POST"], async (request) => {
    const body = await readJson(request);
    const file = Number(body.file);
    const rank = Number(body.rank);
    if (!Number.isInteger(file) || !Number.isInteger(rank)) return json({ ok: false, error: "bad-square" }, 400);
    const outcome = updateSession((session) => {
      const value = playerInteract(session, { file, rank }, boundAgentNow());
      return { write: true, value };
    });
    return json(outcome.result.value);
  });
  add("/api/dafeiyu-xiangqi/new", ["POST"], async (request) => {
    const body = await readJson(request);
    const playerSide = body.playerSide === "black" ? "black" : "red";
    return json(startGame(playerSide));
  });
  add("/api/dafeiyu-xiangqi/again", ["POST"], () => {
    const outcome = updateSession((session) => {
      session.awaitingChoice = true;
      session.selected = null;
      return { write: true, value: surfaceState(session) };
    });
    return json(outcome.result.value);
  });
  return () => {
    for (const stop of stops) stop();
  };
}

function hostDeps() {
  return {
    store: {
      get sidebarNonce() { return readHostSession().sidebarNonce; },
      set sidebarNonce(value) {
        updateSession((session) => {
          session.sidebarNonce = value;
          session.openedAt = Date.now();
          return { write: true };
        });
      },
    },
    bindAgent(agent) {
      bindAgent(agent);
      watchAgent(agent);
    },
    wake(agent) {
      bindAgent(agent);
      watchAgent(agent);
      updateSession((session) => {
        if (!session.awaitingChoice && !session.winner) requestGameEntry(session, agent);
        return { write: true };
      });
    },
    openSession(invocation) {
      const agent = invocation?.agent;
      if (agent) {
        bindAgent(agent);
        watchAgent(agent);
      }
      let decision = { toChooser: false, wake: false };
      updateSession((session) => {
        decision = applyOpen(session, { restart: invocation?.restart === true });
        if (decision.wake) requestGameEntry(session, agent);
        return { write: true };
      });
      return decision;
    },
  };
}

export function registerCommand(ctx) {
  return ctx.commands.register(chessplayDefinition(hostDeps()));
}

export function attachHost(ctx) {
  const deps = hostDeps();
  const disposeCommand = ctx.commands.register(chessplayDefinition(deps));
  const disposeInvite = watchInvite(ctx, (agent, options) => {
    openChessplay({ agent, restart: options?.restart === true }, deps);
  });
  // Scoped agent events are also delivered to an unscoped listener. A second
  // listener on agent.ctx would append the same reasoning delta twice.
  if (typeof ctx.on === "function") ctx.on("agent/assistant-stream", acceptReasoning);
  if (typeof ctx.inject === "function") {
    ctx.inject(["connection"], (child) => {
      const connection = child.connection || child.get?.("connection");
      const stop = mountRoutes(connection);
      if (typeof child.effect === "function") child.effect(() => stop);
    });
  }
  return () => {
    if (typeof disposeCommand === "function") disposeCommand();
    if (typeof disposeInvite === "function") disposeInvite();
  };
}
