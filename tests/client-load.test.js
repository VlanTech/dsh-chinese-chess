import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

function element(tag) {
  return {
    tagName: tag,
    children: [],
    attrs: {},
    className: "",
    textContent: "",
    innerHTML: "",
    style: {},
    dataset: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    addEventListener() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}

test("the browser client installs 大肥鱼象棋 without Node module or require", () => {
  const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.equal(source.includes("require("), true);
  assert.equal(/^\s*(?:const|var|let)\s+require\b/m.test(source), false);
  const document = {
    body: element("body"),
    head: element("head"),
    createElement: element,
  };
  const sandbox = {
    window: {
      document,
      addEventListener() {},
      setInterval() { return 0; },
      clearInterval() {},
    },
    console,
  };
  sandbox.window.window = sandbox.window;
  const context = createContext(sandbox);
  runInContext(source, context, { filename: "client.js" });
  const surface = sandbox.window.__DAFEIYU_XIANGQI__;
  assert.ok(surface, "surface was not installed");
  assert.equal(surface.title, "大肥鱼象棋");
  assert.equal(surface.region, "right-sidebar");
  assert.equal(surface.mainConversation, false);
  assert.equal(document.body.children.length, 1);
  assert.match(document.body.children[0].innerHTML, /大肥鱼象棋/);
  assert.match(document.body.children[0].innerHTML, /right-sidebar/);
  assert.match(document.body.children[0].innerHTML, /我执红/);
  assert.match(document.body.children[0].innerHTML, /dfy-start/);
  assert.equal(source.includes("思维链"), false);
  assert.equal(source.includes("CETACEA"), false);
  assert.equal(source.includes("欲走"), false);
  assert.equal(source.includes("dfy-capture"), true);
  assert.equal(source.includes("dfy-result"), true);
  assert.equal(source.includes("dfy-seal"), true);
  assert.equal(sandbox.module, undefined);
  assert.equal(sandbox.require, undefined);
});

function svgNode() {
  return {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
  };
}

function richRoot() {
  const root = {
    innerHTML: "",
    mover: svgNode(),
    ghost: svgNode(),
    preview: "",
    addEventListener() {},
    querySelector(selector) {
      const html = this.innerHTML;
      if (selector === ".dfy-start") return html.includes("dfy-start") ? this : null;
      if (selector === ".dfy") return html.includes('class="dfy"') ? this : null;
      if (selector === "[data-move='1']") {
        if (!html.includes('data-move="1"')) return null;
        if (!this.preview) this.preview = html;
        return this.mover;
      }
      if (selector === "[data-captured='1']") return html.includes('data-captured="1"') ? this.ghost : null;
      return null;
    },
  };
  return root;
}

test("the board animates a move, frames captures, and stamps the result", () => {
  const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  let clock = 0;
  const document = { body: element("body"), head: element("head"), createElement: element };
  const sandbox = {
    window: {
      document,
      addEventListener() {},
      setInterval() { return 0; },
      clearInterval() {},
      requestAnimationFrame(fn) {
        clock += 400;
        fn(clock);
        return clock;
      },
    },
    console,
  };
  sandbox.window.window = sandbox.window;
  runInContext(source, createContext(sandbox), { filename: "client.js" });
  const paint = sandbox.window.__DAFEIYU_XIANGQI__.paint;
  const root = richRoot();

  paint(root, { awaitingChoice: true, reasoning: "不要出现在棋盘上" });
  assert.match(root.innerHTML, /我执红/);
  assert.match(root.innerHTML, /dfy-start/);
  assert.equal(root.innerHTML.includes("不要出现在棋盘上"), false);

  paint(root, {
    awaitingChoice: false,
    turn: "red",
    playerSide: "red",
    inCheck: false,
    winner: null,
    reasoning: "先看中兵",
    selected: { file: 0, rank: 0 },
    targets: [{ file: 0, rank: 1 }, { file: 0, rank: 3 }],
    captures: [{ file: 0, rank: 3 }],
    pieces: [
      { side: "red", type: "R", label: "车", file: 0, rank: 0 },
      { side: "black", type: "P", label: "卒", file: 0, rank: 3 },
    ],
    lastMove: null,
    boardKey: "select",
    openedAt: 1,
  });
  assert.equal(root.innerHTML.includes("我执红"), false);
  assert.equal(root.innerHTML.includes("先看中兵"), false);
  assert.match(root.innerHTML, /红方走/);
  assert.match(root.innerHTML, /轮到你/);
  assert.match(root.innerHTML, /data-turn="red"/);
  assert.match(root.innerHTML, /dfy-capture/);
  assert.match(root.innerHTML, /dfy-target/);
  assert.equal(root.innerHTML.includes('class="dfy-target" data-file="0" data-rank="3"'), false);
  assert.equal(root.innerHTML.includes('class="dfy-land" data-file="0" data-rank="3"'), false);
  assert.match(root.innerHTML, /class="dfy-piece dfy-own"/);
  assert.match(root.innerHTML, /class="dfy-piece dfy-foe"/);
  assert.match(root.innerHTML, /font-weight="800"/);
  assert.match(root.innerHTML, /font-weight="500"/);
  assert.match(root.innerHTML, /dfy-hit/);
  assert.match(root.innerHTML, /width="46"/);

  paint(root, {
    awaitingChoice: false,
    turn: "black",
    playerSide: "red",
    inCheck: false,
    winner: "red",
    winReason: "checkmate",
    selected: null,
    targets: [],
    captures: [],
    pieces: [{ side: "red", type: "R", label: "车", file: 0, rank: 3 }],
    lastMove: {
      from: { file: 0, rank: 0 },
      to: { file: 0, rank: 3 },
      captured: { side: "black", type: "P", label: "卒" },
    },
    boardKey: "mated",
    openedAt: 1,
  });
  assert.match(root.preview, /data-move="1"/);
  assert.match(root.preview, /data-captured="1"/);
  assert.match(root.preview, /卒/);
  assert.equal(root.preview.includes("胜"), false);
  assert.equal(root.mover.attrs.transform, "translate(0 -138)");
  assert.equal(root.ghost.attrs.opacity, "0");
  assert.match(root.innerHTML, /你赢了/);
  assert.match(root.innerHTML, /dfy-seal/);
  assert.match(root.innerHTML, />胜</);
  assert.equal(root.innerHTML.includes('data-move="1"'), false);
  assert.equal(root.innerHTML.includes("卒"), false);

  paint(root, {
    awaitingChoice: false,
    turn: "red",
    playerSide: "red",
    winner: "black",
    winReason: "stalemate",
    selected: null,
    targets: [],
    captures: [],
    pieces: [{ side: "red", type: "R", label: "车", file: 0, rank: 3 }],
    lastMove: {
      from: { file: 0, rank: 0 },
      to: { file: 0, rank: 3 },
      captured: { side: "black", type: "P", label: "卒" },
    },
    boardKey: "loss",
    openedAt: 1,
  });
  assert.match(root.innerHTML, /你输了/);
  assert.match(root.innerHTML, /困毙/);
  assert.match(root.innerHTML, /is-loss/);
  assert.match(root.innerHTML, />负</);
  assert.match(root.innerHTML, /dfy-shake/);

  paint(root, {
    awaitingChoice: false,
    turn: "red",
    playerSide: "red",
    winner: null,
    selected: { file: 1, rank: 0 },
    targets: [],
    captures: [],
    pieces: [
      { side: "red", type: "N", label: "马", file: 1, rank: 0 },
      { side: "black", type: "P", label: "卒", file: 0, rank: 3 },
    ],
    lastMove: {
      from: { file: 0, rank: 0 },
      to: { file: 0, rank: 3 },
      captured: { side: "black", type: "P", label: "卒" },
    },
    notice: "马腿被挡",
    noticeMark: { file: 2, rank: 0 },
    boardKey: "horse-notice",
    openedAt: 1,
  });
  assert.match(root.innerHTML, /dfy-notice/);
  assert.match(root.innerHTML, /马腿被挡/);
  assert.match(root.innerHTML, /dfy-leg/);
  assert.equal(root.innerHTML.includes("思维链"), false);
});

test("the chosen side stays at the bottom, including black", () => {
  const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  let clock = 0;
  const document = { body: element("body"), head: element("head"), createElement: element };
  const sandbox = {
    window: {
      document,
      addEventListener() {},
      setInterval() { return 0; },
      clearInterval() {},
      requestAnimationFrame(fn) {
        clock += 400;
        fn(clock);
        return clock;
      },
    },
    console,
  };
  sandbox.window.window = sandbox.window;
  runInContext(source, createContext(sandbox), { filename: "client.js" });
  const paint = sandbox.window.__DAFEIYU_XIANGQI__.paint;
  const root = richRoot();
  const pieces = [
    { side: "red", type: "K", label: "帅", file: 4, rank: 0 },
    { side: "black", type: "K", label: "将", file: 4, rank: 9 },
    { side: "red", type: "R", label: "车", file: 0, rank: 0 },
  ];
  paint(root, {
    awaitingChoice: false,
    turn: "black",
    playerSide: "black",
    pieces,
    lastMove: null,
    boardKey: "black-bottom",
    openedAt: 2,
  });
  assert.match(root.innerHTML, /data-file="4" data-rank="9"/);
  assert.match(root.innerHTML, /cx="210" cy="440"/);
  assert.match(root.innerHTML, /cx="210" cy="26"/);
  assert.match(root.innerHTML, /class="dfy-piece dfy-own"[^>]*data-file="4" data-rank="9"/);
  assert.match(root.innerHTML, /class="dfy-piece dfy-foe"[^>]*data-file="4" data-rank="0"/);
  assert.equal(root.innerHTML.includes('data-file="4" data-rank="0"'), true);

  paint(root, {
    awaitingChoice: false,
    turn: "red",
    playerSide: "black",
    pieces: [{ side: "red", type: "R", label: "车", file: 0, rank: 3 }],
    lastMove: {
      from: { file: 0, rank: 0 },
      to: { file: 0, rank: 3 },
      captured: null,
    },
    boardKey: "black-moved",
    openedAt: 2,
  });
  assert.equal(root.mover.attrs.transform, "translate(0 138)");
  assert.match(root.innerHTML, /data-file="0" data-rank="3"/);
  assert.match(root.innerHTML, /cx="394" cy="164"/);
});
