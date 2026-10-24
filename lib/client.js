/**
 * Browser surface for 大肥鱼象棋. This file is a classic script: it installs
 * the surface when `window` exists and does not touch Node's `module` or
 * `require`. DSH's loader, when present, materializes the sidebar tab later.
 */
(function (window) {
  if (!window || typeof window !== "object") return;

  var TITLE = "大肥鱼象棋";
  var KIND = "dafeiyu-xiangqi";
  var TAB_ID = "dsh-dafeiyu-xiangqi";
  var CELL = 46;
  var PAD = 26;

  function xy(file, rank, flip) {
    var f = flip ? 8 - file : file;
    var r = flip ? 9 - rank : rank;
    return [PAD + f * CELL, PAD + (9 - r) * CELL];
  }

  function escapeText(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (ch) {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      return "&quot;";
    });
  }

  function pieceMarkup(piece, mark, flip, playerSide) {
    var point = xy(piece.file, piece.rank, flip);
    var mine = !!(playerSide && piece.side === playerSide);
    var red = piece.side === "red";
    var fill = mine ? "#fffdf8" : (red ? "#f3ddd6" : "#ddd6cc");
    var ink = mine ? (red ? "#9a1a14" : "#100e0c") : (red ? "#a24a42" : "#5c564c");
    var ring = mine ? (red ? "#8f1d16" : "#14110e") : (red ? "#a85a52" : "#6a645c");
    var radius = mine ? 21 : 17;
    var stroke = mine ? 3.4 : 1.05;
    var weight = mine ? 800 : 500;
    var size = mine ? 23 : 16;
    var family = mine
      ? "Songti SC, STSong, Noto Serif CJK SC, serif"
      : "Kaiti SC, STKaiti, KaiTi, serif";
    var extra = mark === "move" ? ' data-move="1"' : mark === "captured" ? ' data-captured="1"' : "";
    var klass = mine ? "dfy-piece dfy-own" : "dfy-piece dfy-foe";
    return '<g class="' + klass + '"' + extra + ' data-file="' + piece.file + '" data-rank="' + piece.rank + '">'
      + '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="' + radius + '" fill="' + fill + '" stroke="' + ring + '" stroke-width="' + stroke + '"></circle>'
      + '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="' + (mine ? 16.5 : 13.2) + '" fill="none" stroke="' + ring + '" stroke-width="' + (mine ? 1.3 : 0.7) + '"></circle>'
      + '<text x="' + point[0] + '" y="' + point[1] + '" text-anchor="middle" dominant-baseline="central" fill="' + ink + '" font-size="' + size + '" font-weight="' + weight + '" font-family="' + family + '">' + piece.label + "</text>"
      + "</g>";
  }

  function targetMarkup(target, flip) {
    var point = xy(target.file, target.rank, flip);
    var size = CELL;
    return '<rect class="dfy-land" data-file="' + target.file + '" data-rank="' + target.rank + '" x="' + (point[0] - size / 2) + '" y="' + (point[1] - size / 2) + '" width="' + size + '" height="' + size + '" fill="#2f6f4e" fill-opacity="0.18"></rect>'
      + '<circle class="dfy-target" data-file="' + target.file + '" data-rank="' + target.rank + '" cx="' + point[0] + '" cy="' + point[1] + '" r="8" fill="#2f6f4e"></circle>';
  }

  function captureMarkup(target, flip) {
    var point = xy(target.file, target.rank, flip);
    var size = 46;
    return '<rect class="dfy-capture" data-file="' + target.file + '" data-rank="' + target.rank + '" x="' + (point[0] - size / 2) + '" y="' + (point[1] - size / 2) + '" width="' + size + '" height="' + size + '" rx="5" fill="none" stroke="#b4332a" stroke-width="2.6"></rect>';
  }

  function legMarkup(mark, flip) {
    var point = xy(mark.file, mark.rank, flip);
    return '<circle class="dfy-leg" cx="' + point[0] + '" cy="' + point[1] + '" r="18" fill="none" stroke="#8a3a12" stroke-width="3" stroke-dasharray="4 3"></circle>';
  }

  function hitLayer(flip) {
    var marks = "";
    var size = CELL;
    for (var rank = 0; rank < 10; rank++) {
      for (var file = 0; file < 9; file++) {
        var point = xy(file, rank, flip);
        marks += '<rect class="dfy-hit" data-file="' + file + '" data-rank="' + rank + '" x="' + (point[0] - size / 2) + '" y="' + (point[1] - size / 2) + '" width="' + size + '" height="' + size + '" fill="transparent" pointer-events="all"></rect>';
      }
    }
    return marks;
  }

  function line(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#6b4328" stroke-width="1.2"></line>';
  }

  function boardSvg(state, preview) {
    var flip = !!(state && state.playerSide === "black");
    var width = PAD * 2 + 8 * CELL;
    var height = PAD * 2 + 9 * CELL;
    var parts = ['<svg class="dfy-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="大肥鱼象棋棋盘">'];
    var edge = state && state.turn === "black" ? "#1c1915" : "#b4332a";
    parts.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="8" fill="#e7c48a"></rect>');
    parts.push('<rect x="6" y="6" width="' + (width - 12) + '" height="' + (height - 12) + '" rx="6" fill="none" stroke="' + edge + '" stroke-width="4"></rect>');
    for (var file = 0; file < 9; file++) {
      var x = xy(file, 0, flip)[0];
      if (file === 0 || file === 8) parts.push(line(x, xy(0, 0, flip)[1], x, xy(0, 9, flip)[1]));
      else {
        parts.push(line(x, xy(0, 0, flip)[1], x, xy(0, 4, flip)[1]));
        parts.push(line(x, xy(0, 5, flip)[1], x, xy(0, 9, flip)[1]));
      }
    }
    for (var rank = 0; rank < 10; rank++) {
      var y = xy(0, rank, flip)[1];
      parts.push(line(xy(0, 0, flip)[0], y, xy(8, 0, flip)[0], y));
    }
    var palace = [[3, 0, 5, 2], [5, 0, 3, 2], [3, 7, 5, 9], [5, 7, 3, 9]];
    for (var i = 0; i < palace.length; i++) {
      var a = xy(palace[i][0], palace[i][1], flip);
      var b = xy(palace[i][2], palace[i][3], flip);
      parts.push(line(a[0], a[1], b[0], b[1]));
    }
    var riverY = (xy(0, 4, flip)[1] + xy(0, 5, flip)[1]) / 2;
    parts.push('<text x="' + xy(2, 0, flip)[0] + '" y="' + riverY + '" text-anchor="middle" fill="#8a5a32" font-size="18" font-family="Songti SC, STSong, serif">楚河</text>');
    parts.push('<text x="' + xy(6, 0, flip)[0] + '" y="' + riverY + '" text-anchor="middle" fill="#8a5a32" font-size="18" font-family="Songti SC, STSong, serif">汉界</text>');
    var captures = state && state.captures || [];
    var captureKey = {};
    for (var c = 0; c < captures.length; c++) captureKey[captures[c].file + "," + captures[c].rank] = true;
    var targets = state && state.targets || [];
    for (var t = 0; t < targets.length; t++) {
      if (!captureKey[targets[t].file + "," + targets[t].rank]) parts.push(targetMarkup(targets[t], flip));
    }
    var move = preview && state.lastMove;
    var pieces = state && state.pieces || [];
    for (var p = 0; p < pieces.length; p++) {
      var piece = pieces[p];
      var moving = move && piece.file === move.to.file && piece.rank === move.to.rank;
      var drawn = moving ? { side: piece.side, type: piece.type, label: piece.label, file: move.from.file, rank: move.from.rank } : piece;
      var selected = !moving && state.selected && state.selected.file === piece.file && state.selected.rank === piece.rank;
      if (selected) {
        var point = xy(piece.file, piece.rank, flip);
        parts.push('<circle cx="' + point[0] + '" cy="' + point[1] + '" r="23" fill="none" stroke="#c9862a" stroke-width="3"></circle>');
      }
      parts.push(pieceMarkup(drawn, moving ? "move" : "", flip, state.playerSide));
      if (moving && move.captured) {
        parts.push(pieceMarkup({
          side: move.captured.side,
          type: move.captured.type,
          label: move.captured.label,
          file: move.to.file,
          rank: move.to.rank,
        }, "captured", flip, state.playerSide));
      }
    }
    for (var k = 0; k < captures.length; k++) parts.push(captureMarkup(captures[k], flip));
    if (state && state.noticeMark) parts.push(legMarkup(state.noticeMark, flip));
    parts.push(hitLayer(flip));
    parts.push("</svg>");
    return parts.join("");
  }

  function turnBanner(state) {
    if (state.winner) {
      var win = state.winner === state.playerSide;
      var how = state.winReason === "stalemate" ? "困毙" : "将死";
      return '<div class="dfy-turn ' + (win ? "is-red" : "is-black") + '" data-turn="over">'
        + "<strong>" + (win ? "你赢了" : "你输了") + "</strong><span>" + how + "</span></div>";
    }
    var red = state.turn !== "black";
    var side = red ? "红方" : "黑方";
    var verb = state.inCheck ? "被将军" : "走";
    var mine = state.turn === state.playerSide;
    return '<div class="dfy-turn ' + (red ? "is-red" : "is-black") + '" data-turn="' + (red ? "red" : "black") + '">'
      + '<strong>' + side + verb + "</strong><span>" + (mine ? "轮到你" : "轮到对方") + "</span></div>";
  }

  function resultMarkup(state) {
    if (!state || !state.winner) return "";
    var win = state.winner === state.playerSide;
    var how = state.winReason === "stalemate" ? "困毙" : "将死";
    return '<div class="dfy-result ' + (win ? "is-win" : "is-loss") + '">'
      + '<div class="dfy-seal">' + (win ? "胜" : "负") + "</div>"
      + "<p>" + (win ? "你赢了" : "你输了") + " · " + how + "</p>"
      + '<button type="button" data-act="again">再来一局</button></div>';
  }

  function renderStart() {
    return '<section class="dfy" data-region="right-sidebar" data-title="大肥鱼象棋">'
      + "<style>" + CSS + "</style>"
      + '<header class="dfy-bar"><h1>大肥鱼象棋</h1></header>'
      + '<div class="dfy-start"><p>选择你执的一方</p>'
      + '<button type="button" class="dfy-red" data-act="red">我执红</button>'
      + '<button type="button" class="dfy-black" data-act="black">我执黑</button></div>'
      + "</section>";
  }

  function renderPlay(state, preview) {
    return '<section class="dfy" data-region="right-sidebar" data-title="大肥鱼象棋">'
      + "<style>" + CSS + "</style>"
      + '<header class="dfy-bar"><h1>大肥鱼象棋</h1></header>'
      + turnBanner(state)
      + (state.notice ? '<p class="dfy-notice">' + escapeText(state.notice) + "</p>" : "")
      + '<div class="dfy-board">' + boardSvg(state, preview) + resultMarkup(preview ? null : state) + "</div>"
      + "</section>";
  }

  var CSS = [
    ".dfy{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;padding:12px;box-sizing:border-box;background:#f4e6cf;color:#2b2118;font:14px/1.45 Songti SC,STSong,serif;position:relative}",
    ".dfy-bar{display:flex;align-items:center;gap:10px}",
    ".dfy h1{margin:0;font-size:20px;font-weight:700;letter-spacing:.08em}",
    ".dfy-turn{display:flex;align-items:baseline;justify-content:center;gap:10px;border-radius:12px;padding:8px 12px}",
    ".dfy-turn strong{font-size:28px;letter-spacing:.12em}",
    ".dfy-turn span{font-size:14px}",
    ".dfy-turn.is-red{background:#f8d6d2;color:#b4332a}",
    ".dfy-turn.is-black{background:#e6e1d8;color:#1c1915}",
    ".dfy-notice{margin:0;text-align:center;font-size:16px;font-weight:700;letter-spacing:.08em;color:#8a3a12}",
    ".dfy-own text{font-weight:800;font-family:Songti SC,STSong,'Noto Serif CJK SC',serif}",
    ".dfy-foe text{font-weight:500;font-family:'Kaiti SC',STKaiti,KaiTi,serif}",
    ".dfy-hit{cursor:pointer;pointer-events:all}",
    ".dfy-leg{pointer-events:none}",
    ".dfy-start{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}",
    ".dfy-start p{margin:0;font-size:18px}",
    ".dfy-start button{min-width:180px;border-radius:999px;padding:12px 18px;font-size:20px;cursor:pointer}",
    ".dfy-red{border:1px solid #8d241c;background:#f8d6d2;color:#b4332a}",
    ".dfy-black{border:1px solid #1c1915;background:#f4efe6;color:#1c1915}",
    ".dfy-board{position:relative;flex:1;min-height:0;overflow:auto}",
    ".dfy-svg{width:100%;height:auto;display:block;max-height:100%}",
    ".dfy-piece{cursor:pointer}",
    ".dfy-capture{animation:dfy-box 1s ease-in-out infinite}",
    "@keyframes dfy-box{50%{stroke-opacity:.35}}",
    ".dfy-result{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(244,230,207,.82)}",
    ".dfy-seal{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:700;animation:dfy-seal .55s ease-out both}",
    ".is-win .dfy-seal{color:#b4332a;border:4px solid #b4332a;background:rgba(248,214,210,.9)}",
    ".is-loss .dfy-seal{color:#1c1915;border:4px solid #1c1915;background:rgba(230,225,216,.9)}",
    ".is-loss{animation:dfy-shake .45s linear}",
    "@keyframes dfy-seal{0%{transform:scale(1.7) rotate(-14deg);opacity:0}70%{transform:scale(.94) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}",
    "@keyframes dfy-shake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}",
    ".dfy-result p{margin:0;font-size:22px;font-weight:700}",
    ".dfy-result button{border:1px solid #8a5a32;background:#f8e7c4;color:#2b2118;border-radius:999px;padding:6px 14px;cursor:pointer}",
  ].join("");

  async function post(path, body) {
    if (typeof fetch !== "function") return null;
    var response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  }

  function stateKey(state) {
    if (!state) return "choose";
    var selected = state.selected ? state.selected.file + "," + state.selected.rank : "";
    var targets = (state.targets || []).map(function (square) { return square.file + "," + square.rank; }).join(";");
    var captures = (state.captures || []).map(function (square) { return square.file + "," + square.rank; }).join(";");
    var move = state.lastMove && state.lastMove.from && state.lastMove.to
      ? state.lastMove.from.file + "," + state.lastMove.from.rank + ">" + state.lastMove.to.file + "," + state.lastMove.to.rank
      : "";
    var mark = state.noticeMark ? state.noticeMark.file + "," + state.noticeMark.rank : "";
    return [state.awaitingChoice ? "choose" : "play", state.boardKey || "", state.turn || "", state.statusText || "", selected, targets, captures, move, state.winner || "", state.openedAt || 0, state.notice || "", mark].join("|");
  }

  function moveKey(state) {
    var move = state && state.lastMove;
    if (!move || !move.from || !move.to) return "";
    return move.from.file + "," + move.from.rank + ">" + move.to.file + "," + move.to.rank;
  }

  function animateMove(group, ghost, dx, dy, done) {
    var raf = window.requestAnimationFrame;
    if (typeof raf !== "function" || !group) {
      done();
      return;
    }
    var start = null;
    var ms = 320;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ms);
      var eased = 1 - Math.pow(1 - t, 3);
      group.setAttribute("transform", "translate(" + (dx * eased) + " " + (dy * eased) + ")");
      if (ghost) ghost.setAttribute("opacity", String(1 - eased));
      if (t < 1) raf(frame);
      else done();
    }
    raf(frame);
  }

  function onRootClick(event) {
    var root = event.currentTarget;
    var act = event.target && event.target.closest && event.target.closest("[data-act]");
    if (act) {
      var name = act.getAttribute("data-act");
      var path = name === "again" ? "/api/dafeiyu-xiangqi/again" : "/api/dafeiyu-xiangqi/new";
      var body = name === "again" ? {} : { playerSide: name };
      post(path, body).then(function (next) {
        if (next) paint(root, next);
      });
      return;
    }
    var square = event.target && event.target.closest && event.target.closest("[data-file]");
    if (!square) return;
    post("/api/dafeiyu-xiangqi/click", {
      file: Number(square.getAttribute("data-file")),
      rank: Number(square.getAttribute("data-rank")),
    }).then(function (next) {
      if (next) paint(root, next);
    });
  }

  function paint(root, state) {
    if (!root) return;
    if (!root._dfyBound) {
      root._dfyBound = true;
      root.addEventListener("click", onRootClick);
    }
    if (root._dfyAnimating) {
      root._dfyPending = state;
      return;
    }
    if (!state || state.awaitingChoice) {
      if (root._dfyKey === "choose" && root.querySelector && root.querySelector(".dfy-start")) return;
      root._dfyKey = "choose";
      root.innerHTML = renderStart();
      return;
    }
    var key = stateKey(state);
    var nextMove = moveKey(state);
    var first = root._dfyMoveKey === undefined;
    if (!first && nextMove && nextMove !== root._dfyMoveKey) {
      root._dfyMoveKey = nextMove;
      root._dfyKey = "moving";
      root.innerHTML = renderPlay(state, true);
      var mover = root.querySelector && root.querySelector("[data-move='1']");
      var ghost = root.querySelector && root.querySelector("[data-captured='1']");
      var flip = state.playerSide === "black";
      var from = xy(state.lastMove.from.file, state.lastMove.from.rank, flip);
      var to = xy(state.lastMove.to.file, state.lastMove.to.rank, flip);
      root._dfyAnimating = true;
      animateMove(mover, ghost, to[0] - from[0], to[1] - from[1], function () {
        root._dfyAnimating = false;
        var pending = root._dfyPending || state;
        root._dfyPending = null;
        root._dfyKey = "";
        paint(root, pending);
      });
      return;
    }
    root._dfyMoveKey = nextMove;
    if (root._dfyKey === key && root.querySelector && root.querySelector(".dfy")) return;
    root._dfyKey = key;
    root.innerHTML = renderPlay(state, false);
  }

  function mount(parent) {
    var doc = window.document;
    if (!doc || !parent) return null;
    var el = doc.createElement("div");
    el.className = "dfy-surface";
    el.setAttribute("data-title", TITLE);
    el.setAttribute("data-region", "right-sidebar");
    parent.appendChild(el);
    paint(el, null);
    return el;
  }

  var surface = {
    title: TITLE,
    region: "right-sidebar",
    mainConversation: false,
    kind: KIND,
    mount: mount,
    paint: paint,
  };
  window.__DAFEIYU_XIANGQI__ = surface;

  if (!window.__ModuleLoader__ && window.document && window.document.body) {
    surface.mount(window.document.body);
  }

  if (!window.__ModuleLoader__ || typeof window.__ModuleLoader__.load !== "function") return;

  window.__ModuleLoader__.load({
    id: "dsh-dafeiyu-xiangqi",
    factory: function (require) {
      var module = { exports: {} };
      var React = null;
      try { React = require("react"); } catch (error) { React = null; }

      function BoardBody() {
        var ref = React.useRef(null);
        React.useEffect(function () {
          var root = ref.current;
          var stop = false;
          function tick() {
            post("/api/dafeiyu-xiangqi/state").then(function (state) {
              if (!stop && state && root) paint(root, state);
            }).catch(function () {});
          }
          tick();
          var timer = setInterval(tick, 700);
          return function () { stop = true; clearInterval(timer); };
        }, []);
        return React.createElement("div", { ref: ref, className: "dfy-slot", style: { height: "100%" } });
      }

      function apply(ctx) {
        if (ctx.sidebarRightTabs && typeof ctx.sidebarRightTabs.register === "function") {
          var registerType = function () {
            return ctx.sidebarRightTabs.register({
              id: TAB_ID,
              kind: KIND,
              priority: "extension",
              title: function () { return TITLE; },
              guide: [{ order: 15, title: function () { return TITLE; }, description: function () { return "与 AI 下中国象棋"; } }],
            });
          };
          if (typeof ctx.effect === "function") ctx.effect(registerType, "大肥鱼象棋 tab");
          else registerType();
        }
        if (React && ctx.slots && typeof ctx.slots.register === "function") {
          var registerBody = function () {
            var register = function () {
              return ctx.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID }, BoardBody);
            };
            return typeof ctx.slots.inject === "function"
              ? ctx.slots.inject("sidebar.right.pane.tab", register)
              : register();
          };
          if (typeof ctx.effect === "function") ctx.effect(registerBody, "大肥鱼象棋 body");
          else registerBody();
        }
        var seen = null;
        var timer = setInterval(function () {
          post("/api/dafeiyu-xiangqi/state").then(function (state) {
            if (!state || !ctx.sidebarRight || typeof ctx.sidebarRight.openTab !== "function") return;
            if (seen === null) {
              seen = state.openedAt || 0;
              return;
            }
            if ((state.openedAt || 0) !== seen) {
              seen = state.openedAt || 0;
              try { ctx.sidebarRight.openTab(KIND); } catch (error) { /* no mounted session dock yet */ }
            }
          }).catch(function () {});
        }, 400);
        if (typeof ctx.effect === "function") ctx.effect(function () { return function () { clearInterval(timer); }; });
      }

      module.exports = {
        name: "dsh-dafeiyu-xiangqi",
        inject: ["slots", "sidebarRightTabs", "sidebarRight"],
        apply: apply,
      };
      return module.exports;
    },
  });
})(typeof window !== "undefined" ? window : undefined);
