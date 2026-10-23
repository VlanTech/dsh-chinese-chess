/**
 * The in-session skill the model loads before it touches the chess MCP tools.
 * The same file is what ~/.dsh/skills discovers.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "dafeiyu-xiangqi";

const SKILL_FILE = fileURLToPath(new URL("../skills/dafeiyu-xiangqi/SKILL.md", import.meta.url));

export function loadSkillDocument() {
  const raw = readFileSync(SKILL_FILE, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("dafeiyu-xiangqi skill is missing frontmatter");
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description) throw new Error("dafeiyu-xiangqi skill is missing a description");
  const content = match[2].trim();
  if (!content) throw new Error("dafeiyu-xiangqi skill is missing instructions");
  return { name: SKILL_NAME, description, content };
}

export function skillDefinition() {
  const document = loadSkillDocument();
  return {
    name: document.name,
    description: document.description,
    whenToUse: "用户打开大肥鱼象棋、运行 /chessplay、要求重来或再来一局，或轮到你走子时。",
    source: "dsh-dafeiyu-xiangqi",
    content: document.content,
    invocation: { modelInvocable: true, userInvocable: true },
  };
}

function lookupSkills(ctx) {
  if (!ctx || typeof ctx !== "object") return undefined;
  try {
    const reflect = ctx.reflect;
    if (reflect && typeof reflect.get === "function") {
      const found = reflect.get("skills", false);
      if (found) return found;
    }
  } catch {
    // Desktop cordis throws on a service this plugin did not inject.
  }
  try {
    return ctx.skills;
  } catch {
    return undefined;
  }
}

export function registerSkill(ctx) {
  try {
    const skills = lookupSkills(ctx);
    if (typeof skills?.register !== "function") return () => {};
    return skills.register(skillDefinition());
  } catch {
    return () => {};
  }
}
