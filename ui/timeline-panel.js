// timeline-panel.js
//
// The single render entry used by BOTH the in-game Demographics companion tab /
// dock screen and the standalone menu screen.
//
// In GAME mode it draws the four sub-tabs (Lineage / Chronicle / Historical Map /
// Archive) over a shared scrubber. In SHELL mode (main menu, no live game) the
// root is just the Civilization Rankings leaderboard — clicking a run drills, in
// place, into its Lineage / Chronicle / Historical Map (Back returns). Never throws out.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";
import { renderRibbon } from "/history-and-rankings/ui/view-ribbon.js";
import { renderChronicle } from "/history-and-rankings/ui/view-chronicle.js";
import { renderRankings, renderArchiveDetail } from "/history-and-rankings/ui/view-archive.js";
import { renderLiveMap } from "/history-and-rankings/ui/view-historical-map.js";
import { loadArchive } from "/history-and-rankings/ui/timeline-store.js";
import { resolveSource } from "/history-and-rankings/ui/timeline-source.js";
import { makeScrubber } from "/history-and-rankings/ui/timeline-scrubber.js";
import { startLineageCapture } from "/history-and-rankings/ui/timeline-capture.js";
import { derr } from "/history-and-rankings/ui/timeline-log.js";

// Civilization Rankings leads in-game too (it's the persisted cross-game list), so
// loading into a game shows your games; the other tabs are the CURRENT game's views.
const GAME_TABS = [
  ["archive", "LOC_HTIMELINE_RANKINGS_TITLE", "Civilization Rankings"],
  ["ribbon", "LOC_HTIMELINE_SUB_RIBBON", "Lineage"],
  ["chronicle", "LOC_HTIMELINE_SUB_CHRONICLE", "Chronicle"],
  ["map", "LOC_HTIMELINE_SUB_MAP", "Historical Map"]
];

let _captureStarted = false;

function turnList(ctx) {
  const frames = resolveSource(ctx).frames || [];
  const turns = [...new Set(frames.map((f) => f.turn))].sort((a, b) => a - b);
  return turns.length ? turns : [0];
}

function renderGameMap(body) {
  if (renderLiveMap(body)) return;
  body.appendChild(el("div", "htimeline-empty",
    loc("LOC_HTIMELINE_MAP_NONE", "No map captured yet — play a few turns.")));
}

function renderGameView(body, sub, ctx) {
  body.textContent = "";
  if (sub === "archive") {
    renderRankings(body, { onOpenGame: (g) => renderShellDetail(body, g, () => renderGameView(body, "archive", ctx)) });
    return;
  }
  if (sub === "map") { renderGameMap(body); return; }
  const scrubber = sub === "chronicle" ? makeScrubber(turnList(ctx)) : null;
  const host = el("div", "htimeline-view-host"); body.appendChild(host);
  if (sub === "chronicle") renderChronicle(host, ctx, scrubber);
  else renderRibbon(host);
  if (scrubber) body.appendChild(scrubber.root);
}

function renderGamePanel(host, ctx, subId) {
  let active = subId || "archive";
  const redraw = (next) => {
    if (next) active = next;
    host.textContent = "";
    const wrap = el("div", "htimeline-wrap");
    const bar = el("div", "htimeline-tabs");
    const body = el("div", "htimeline-body");
    GAME_TABS.forEach(([id, key, fb]) => {
      const b = el("button", "htimeline-tab" + (id === active ? " on" : ""), loc(key, fb));
      b.addEventListener("click", () => redraw(id));
      bar.appendChild(b);
    });
    wrap.appendChild(bar); wrap.appendChild(body); host.appendChild(wrap);
    renderGameView(body, active, ctx);
  };
  redraw(active);
}

// The three per-run tabs shown after drilling into a ranking entry (the rankings
// list itself is the "home" view one level up, reached via the Back button).
const DETAIL_TABS = [
  ["ribbon", "LOC_HTIMELINE_SUB_RIBBON", "Lineage"],
  ["chronicle", "LOC_HTIMELINE_SUB_CHRONICLE", "Chronicle"],
  ["map", "LOC_HTIMELINE_SUB_MAP", "Historical Map"]
];

function detailBar(active, onBack, draw) {
  const bar = el("div", "htimeline-tabs");
  const back = el("button", "htimeline-tab htimeline-back",
    "‹ " + loc("LOC_HTIMELINE_RANKINGS_TITLE", "Civilization Rankings"));
  back.addEventListener("click", onBack);
  bar.appendChild(back);
  DETAIL_TABS.forEach(([id, key, fb]) => {
    const b = el("button", "htimeline-tab" + (id === active ? " on" : ""), loc(key, fb));
    b.addEventListener("click", () => draw(id));
    bar.appendChild(b);
  });
  return bar;
}

// Drill into one run IN PLACE (the rankings screen is already full-screen, so this
// reuses it instead of layering a second, cramped pop-up). Back returns to the list.
function renderShellDetail(host, game, onBack) {
  let active = "ribbon";
  const draw = (next) => {
    if (next) active = next;
    host.textContent = "";
    const wrap = el("div", "htimeline-wrap");
    const body = el("div", "htimeline-body");
    wrap.appendChild(detailBar(active, onBack, draw));
    wrap.appendChild(body);
    host.appendChild(wrap);
    renderArchiveDetail(body, game, active);
  };
  draw("ribbon");
}

function renderShellRankings(host) {
  const showList = () => {
    host.textContent = "";
    const wrap = el("div", "htimeline-wrap");
    const body = el("div", "htimeline-body");
    wrap.appendChild(body); host.appendChild(wrap);
    renderRankings(body, { onOpenGame: (g) => renderShellDetail(host, g, showList) });
  };
  showList();
  // Cold start: the archive store can be unhydrated on the first paint. If we came up
  // empty, re-read + re-render a moment later in case it loads late.
  try {
    if (!(loadArchive().games || []).length) setTimeout(showList, 900);
  } catch (_) { /* */ }
}

export function renderPanel(host, ctx, subId) {
  try {
    if (!_captureStarted) { try { startLineageCapture(); } catch (_) { /* */ } _captureStarted = true; }
    const mode = ctx?.mode === "shell" ? "shell" : "game";
    if (mode === "shell") renderShellRankings(host);
    else renderGamePanel(host, ctx, subId);
  } catch (e) { derr("renderPanel failed", e); }
}
