import assert from "node:assert/strict";
import test from "node:test";
import { requestGameEntry } from "../lib/agent-turn.js";
import { openChessplay } from "../lib/command.js";
import { apply } from "../lib/index.js";
import { createSession } from "../lib/session.js";
import { loadSkillDocument, registerSkill, SKILL_NAME } from "../lib/skill.js";

test("the chess skill tells the model to load it and then use MCP", () => {
  const document = loadSkillDocument();
  assert.equal(document.name, SKILL_NAME);
  assert.match(document.description, /mcp__dafeiyu__read_position/);
  assert.match(document.description, /mcp__dafeiyu__submit_move/);
  assert.match(document.content, /skill/);
  assert.match(document.content, /mcp__dafeiyu__read_position/);
  assert.match(document.content, /mcp__dafeiyu__submit_move/);
  assert.match(document.content, /mcp__dafeiyu__restart_game/);
  assert.match(document.description, /mcp__dafeiyu__restart_game/);
  assert.match(document.content, /awaitingChoice/);
  assert.match(document.content, /mcp__dafeiyu__preview_move/);
  assert.match(document.description, /mcp__dafeiyu__preview_move/);
  assert.match(document.content, /唯一一着/);
  assert.match(document.content, /左侧对话/);
  assert.match(document.content, /思维链/);
  assert.match(document.content, /中文/);
  assert.match(document.content, /CETACEA_LOLI/);
  assert.match(document.content, /MODE_TAIL_FLUKES/);
  assert.match(document.content, /FOOD_RICE/);
  assert.match(document.content, /PERSONALITY_SMART_LAZY/);
  assert.match(document.content, /PERSONALITY_TSUNDERE_SWEET/);
  assert.match(document.content, /OBEY_MASTER_ALWAYS/);
  assert.match(document.content, /TRAIT_NOT_FAT_REFUSE/);
  assert.match(document.content, /你的棋子在下方/);
});

test("opening the board wakes the session agent without a move", () => {
  const delivered = [];
  const agent = { followup(message) { delivered.push(message); } };
  const session = createSession();
  let woke = 0;
  const opened = openChessplay({ agent }, {
    store: { sidebarNonce: 0 },
    wake(target) {
      woke += 1;
      assert.equal(target, agent);
      requestGameEntry(session, target);
    },
  });
  assert.equal(opened.kind, "success");
  assert.equal(woke, 1);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].source.kind, "plugin:dsh-dafeiyu-xiangqi");
  assert.match(delivered[0].content[0].text, new RegExp(SKILL_NAME));
  assert.match(delivered[0].content[0].text, /左侧对话从这一轮开始/);
  assert.match(delivered[0].content[0].text, /轮到玩家时不要提交/);
  assert.match(delivered[0].content[0].text, /中文/);
  assert.match(delivered[0].content[0].text, /mcp__dafeiyu__preview_move/);
  assert.match(delivered[0].content[0].text, /你的棋子在下方/);
  assert.equal(session.lastAgentRequest.appliesMove, false);
  assert.equal(session.turn, "red");
});

test("a runtime registry receives the same skill", () => {
  const registered = [];
  const dispose = registerSkill({
    skills: { register(skill) { registered.push(skill); return () => {}; } },
  });
  assert.equal(typeof dispose, "function");
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, SKILL_NAME);
  assert.equal(registered[0].invocation.modelInvocable, true);
  assert.match(registered[0].content, /submit_move/);
  assert.equal(typeof registerSkill({}), "function");
});

test("a closed skills service does not stop chessplay", () => {
  const registered = [];
  const closed = {
    reflect: {
      get(name, strict) {
        assert.equal(name, "skills");
        assert.equal(strict, false);
        return {
          register(skill) {
            registered.push(skill);
            return () => "off";
          },
        };
      },
    },
    get skills() {
      throw new Error('cannot get property "skills" without inject');
    },
    commands: {
      register(definition) {
        closed.definition = definition;
        return () => {};
      },
    },
    inject() {},
    on() { return () => {}; },
  };
  const dispose = apply(closed);
  assert.equal(closed.definition.name, "chessplay");
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, SKILL_NAME);
  assert.equal(dispose(), undefined);

  const blocked = {
    get skills() {
      throw new Error('cannot get property "skills" without inject');
    },
  };
  assert.equal(typeof registerSkill(blocked), "function");
});
