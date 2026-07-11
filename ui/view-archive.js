// view-archive.js
//
// Archive and cross-game compare/detail. In game mode it supports side-by-side
// compare; in shell mode it acts as a launchpad into detail tabs. Pure logic
// lives in archive-model, shared presentation in archive-format, and the
// leaderboard in view-rankings; this file only builds the archive DOM.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { loadArchive } from "/history-and-rankings/ui/timeline-store.js";
import { civName, civColor, ageOrder, leaderName } from "/history-and-rankings/ui/lineage-read.js";
import { loc, num } from "/history-and-rankings/ui/timeline-i18n.js";
import { renderHistoricalMap } from "/history-and-rankings/ui/view-historical-map.js";
import {
  localPlayer, localScore, localLand, statusClass,
  overallScore, archiveStats, maxOf, worldLeader
} from "/history-and-rankings/ui/archive-model.js";
import {
  badge, statusLabel, dateStr, lineageStr, verdict
} from "/history-and-rankings/ui/archive-format.js";

function gameRow(ctx) {
  const { g, rank, stats, opts, selected, onPick } = ctx;
  const r = el("div", "htimeline-arc-row");
  if (selected) r.classList.add("on");
  const status = el("div", "htimeline-arc-status");
  status.appendChild(badge(statusLabel(g), statusClass(g)));
  r.appendChild(status);
  r.appendChild(el("div", "htimeline-arc-rank", `#${rank}`));
  r.appendChild(el("div", "htimeline-arc-date", dateStr(g.endedIso)));
  r.appendChild(el("div", "htimeline-arc-turns", loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", num(g.turns | 0))));
  r.appendChild(el("div", "htimeline-arc-score", num(overallScore(g, stats.maxScore, stats.maxLand))));
  r.appendChild(el("div", "htimeline-arc-line", lineageStr(g)));
  r.appendChild(el("div", "htimeline-arc-verdict", verdict(g)));
  r.addEventListener("click", () => {
    if (opts.onOpenGame) opts.onOpenGame(g);
    else onPick(g.id);
  });
  return r;
}

function bar(label, val, max) {
  const row = el("div", "htimeline-bar-row");
  row.appendChild(el("span", "htimeline-bar-lbl", label));
  const track = el("div", "htimeline-bar-track");
  const fill = el("div", "htimeline-bar-fill");
  fill.style.width = `${Math.round(100 * val / Math.max(1, max))}%`;
  track.appendChild(fill); row.appendChild(track);
  row.appendChild(el("span", "htimeline-bar-val", num(val)));
  return row;
}

function compareCard(g, other) {
  const c = el("div", "htimeline-cmp-card");
  c.appendChild(el("div", "htimeline-cmp-title", dateStr(g.endedIso)));
  const lin = el("div", "htimeline-cmp-lineage");
  const order = ageOrder(); const p = localPlayer(g);
  order.filter((a) => p?.ages?.[a]).forEach((a) => {
    const seg = el("span", "htimeline-cmp-seg", civName(p.ages[a]));
    seg.style.background = civColor(p.ages[a]);
    lin.appendChild(seg);
  });
  c.appendChild(lin);
  const ms = localScore(g), ml = localLand(g);
  c.appendChild(bar(loc("LOC_HTIMELINE_SCORE", "Score"), ms, Math.max(ms, other.s)));
  c.appendChild(bar(loc("LOC_HTIMELINE_LAND", "Land"), ml, Math.max(ml, other.l)));
  c.appendChild(el("div", "htimeline-cmp-verdict", verdict(g)));
  return c;
}

function buildArchiveHead() {
  const head = el("div", "htimeline-arc-head");
  [
    loc("LOC_HTIMELINE_STATUS", "Status"), "#",
    loc("LOC_HTIMELINE_DATE", "Date"),
    loc("LOC_HTIMELINE_TURN_N", "Turn"),
    loc("LOC_HTIMELINE_OVERALL", "Overall"),
    loc("LOC_HTIMELINE_SUB_RIBBON", "Lineage"),
    loc("LOC_HTIMELINE_RESULT", "Result")
  ].forEach((h) => head.appendChild(el("div", "htimeline-arc-head-cell", h)));
  return head;
}

function renderCompare(cmp, ranked, sel) {
  cmp.textContent = "";
  if (sel.length !== 2) {
    cmp.appendChild(el("div", "htimeline-empty", loc("LOC_HTIMELINE_ARC_HINT", "Pick two games to compare.")));
    return;
  }
  const a = ranked.find((g) => g.id === sel[0]), b = ranked.find((g) => g.id === sel[1]);
  cmp.appendChild(compareCard(a, maxOf(b)));
  cmp.appendChild(compareCard(b, maxOf(a)));
}

function repaintList(ctx) {
  const { list, ranked, stats, opts, sel, onPick } = ctx;
  list.textContent = "";
  ranked.forEach((g, i) => {
    list.appendChild(gameRow({ g, rank: i + 1, stats, opts, selected: sel.includes(g.id), onPick }));
  });
}

function archiveUi(host, opts) {
  const wrap = el("div", "htimeline-archive");
  const head = buildArchiveHead();
  const list = el("div", "htimeline-arc-list");
  const cmp = el("div", "htimeline-arc-cmp");
  wrap.appendChild(head);
  wrap.appendChild(list);
  if (!opts.onOpenGame) wrap.appendChild(cmp);
  host.appendChild(wrap);
  return { list, cmp };
}

function shellDetailHeader(host, game, maxScore, _maxLand) {
  const head = el("div", "htimeline-shell-head");
  head.appendChild(el("div", "htimeline-shell-title", `${dateStr(game.endedIso)}  ·  ${lineageStr(game)}`));
  const stats = el("div", "htimeline-shell-stats");
  stats.appendChild(badge(statusLabel(game), statusClass(game)));
  stats.appendChild(el("span", "htimeline-shell-pill", `${loc("LOC_HTIMELINE_SCORE", "Score")}: ${num(localScore(game))}`));
  stats.appendChild(el("span", "htimeline-shell-pill", `${loc("LOC_HTIMELINE_LAND", "Land")}: ${num(localLand(game))}`));
  stats.appendChild(el("span", "htimeline-shell-pill htimeline-shell-pill-leader",
    `${loc("LOC_HTIMELINE_WORLD_LEADER", "World Leader")}: ${worldLeader(localScore(game), maxScore)}`));
  head.appendChild(stats);
  host.appendChild(head);
}

function renderDetailLineage(host, game) {
  const p = localPlayer(game);
  const card = el("div", "htimeline-cmp-card");
  card.appendChild(el("div", "htimeline-cmp-title", loc("LOC_HTIMELINE_SUB_RIBBON", "Lineage")));
  const lin = el("div", "htimeline-cmp-lineage");
  ageOrder().filter((a) => p?.ages?.[a]).forEach((a) => {
    const seg = el("span", "htimeline-cmp-seg", civName(p.ages[a]));
    seg.style.background = civColor(p.ages[a]);
    lin.appendChild(seg);
  });
  card.appendChild(lin);
  card.appendChild(el("div", "htimeline-cmp-verdict", verdict(game)));
  host.appendChild(card);
}

function renderDetailChronicle(host, game) {
  const p = localPlayer(game);
  const c = el("div", "htimeline-cmp-card");
  c.appendChild(el("div", "htimeline-cmp-title", loc("LOC_HTIMELINE_SUB_CHRONICLE", "Chronicle")));
  const ln = lineageStr(game);
  c.appendChild(el("div", "htimeline-cmp-verdict", `${loc("LOC_HTIMELINE_LED", "{1_Leader} led {2_Civ}", leaderName(p?.leader), ln)}`));
  c.appendChild(el("div", "htimeline-cmp-verdict", `${loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", num(game.turns | 0))} · ${verdict(game)}`));
  c.appendChild(el("div", "htimeline-cmp-verdict", loc("LOC_HTIMELINE_ARCHIVE_CONTEXT", "This summary is reconstructed from your saved timeline recap.")));
  host.appendChild(c);
}

function renderDetailMap(host, game) {
  host.appendChild(el("div", "htimeline-cmp-title", loc("LOC_HTIMELINE_SUB_MAP", "Historical Map")));
  // The replay needs map data captured DURING play. Runs recorded before this version
  // (or never resumed on it) have none — say so plainly instead of faking a map.
  if (renderHistoricalMap(host, game)) return;
  host.appendChild(el("div", "htimeline-empty",
    loc("LOC_HTIMELINE_MAP_NONE",
      "No replay was recorded for this game. Load or start a game with this version, play a few turns, then return to the menu — the map fills in as you play.")));
}

export function renderArchiveDetail(host, game, sub) {
  host.textContent = "";
  if (!game) {
    host.appendChild(el("div", "htimeline-empty", loc("LOC_HTIMELINE_ARC_HINT", "Pick a game from Archive.")));
    return;
  }
  const stats = archiveStats(loadArchive().games || []);
  shellDetailHeader(host, game, stats.maxScore, stats.maxLand);
  if (sub === "chronicle") renderDetailChronicle(host, game);
  else if (sub === "map") renderDetailMap(host, game);
  else renderDetailLineage(host, game);
}

export function renderArchive(host, opts = {}) {
  host.textContent = "";
  const games = loadArchive().games || [];
  if (!games.length) {
    host.appendChild(el("div", "htimeline-empty", loc("LOC_HTIMELINE_ARC_EMPTY", "No past games yet — finish a game to start an archive.")));
    return;
  }
  const stats = archiveStats(games);
  const ranked = [...games].sort(
    (a, b) => overallScore(b, stats.maxScore, stats.maxLand) - overallScore(a, stats.maxScore, stats.maxLand)
  );

  const sel = [];
  const ui = archiveUi(host, opts);

  const onPick = (id) => {
    const i = sel.indexOf(id);
    if (i >= 0) sel.splice(i, 1);
    else { sel.push(id); if (sel.length > 2) sel.shift(); }
    repaint();
  };

  const repaint = () => {
    repaintList({ list: ui.list, ranked, stats, opts, sel, onPick });
    if (!opts.onOpenGame) renderCompare(ui.cmp, ranked, sel);
  };
  repaint();
}
