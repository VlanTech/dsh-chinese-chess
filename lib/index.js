/**
 * 大肥鱼象棋 — DSH web plugin. `/chessplay` opens the right sidebar.
 * The AI side moves only through MCP tools on the shared session.
 */

import { attachHost } from "./host.js";
import { registerSkill } from "./skill.js";

export const name = "dsh-dafeiyu-xiangqi";
export const inject = ["commands"];

export function apply(ctx) {
  const disposeHost = attachHost(ctx);
  let disposeSkill = () => {};
  try {
    const dispose = registerSkill(ctx);
    if (typeof dispose === "function") disposeSkill = dispose;
  } catch {
    disposeSkill = () => {};
  }
  return () => {
    if (typeof disposeHost === "function") disposeHost();
    if (typeof disposeSkill === "function") disposeSkill();
  };
}

export { attachHost } from "./host.js";
