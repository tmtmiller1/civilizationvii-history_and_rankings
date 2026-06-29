// view-archive.js
//
// Archive and cross-game rankings. In game mode it supports side-by-side
// compare; in shell mode it acts as a launchpad into detail tabs.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { loadArchive } from "/history-and-rankings/ui/timeline-store.js";
import { civName, civColor, ageOrder, leaderName } from "/history-and-rankings/ui/lineage-read.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";
import { renderHistoricalMap } from "/history-and-rankings/ui/view-historical-map.js";

function localPlayer(g) {
  return g && g.localPid != null ? g.players?.[g.localPid] : null;
}

function localScore(g) {
  return localPlayer(g)?.finalScore | 0;
}

function localLand(g) {
  return localPlayer(g)?.finalLand | 0;
}

function statusFromOutcome(g) {
  return (g?.outcome === "in_progress" || g?.outcome === "abandoned") ? "in_progress" : null;
}

function statusFromState(g, p) {
  return (p?.eliminatedTurn != null || g?.lastAge === "AGE_MODERN") ? "completed" : null;
}

function statusOf(g) {
  if (g?.status === "completed" || g?.status === "in_progress") return g.status;
  const p = localPlayer(g);
  const byOutcome = statusFromOutcome(g);
  if (byOutcome) return byOutcome;
  const byState = statusFromState(g, p);
  if (byState) return byState;
  return "in_progress";
}

function statusLabel(g) {
  return statusOf(g) === "completed"
    ? loc("LOC_HTIMELINE_STATUS_COMPLETED", "Completed")
    : loc("LOC_HTIMELINE_STATUS_IN_PROGRESS", "In Progress");
}

function statusClass(g) {
  return statusOf(g) === "completed" ? "is-completed" : "is-progress";
}

function dateStr(iso) {
  try { return new Date(iso).toLocaleDateString(); } catch (_) { return iso || "?"; }
}

function lineageStr(g) {
  const p = localPlayer(g);
  if (!p) return "?";
  return ageOrder().filter((a) => p.ages?.[a]).map((a) => civName(p.ages[a])).join(" -> ") || "?";
}

function verdict(g) {
  const p = localPlayer(g);
  const civ = p ? civName(Object.values(p.ages || {}).at(-1)) : "?";
  if (statusOf(g) !== "completed") return loc("LOC_HTIMELINE_STATUS_IN_PROGRESS", "In Progress");
  if (p?.eliminatedTurn != null) {
    return loc("LOC_HTIMELINE_VERDICT_OUT", "Eliminated T{1_T} as {2_C}", p.eliminatedTurn, civ);
  }
  return loc("LOC_HTIMELINE_VERDICT_END", "Reached {1_A} as {2_C}", String(g.lastAge || "").replace(/^AGE_/, ""), civ);
}

// The headline ranking number is the civilization's OWN score — the value the
// game itself keeps (Player.Stats.getScore(), captured per run), not a
// normalized 0–1000 index. Runs sort by it and earn their world-leader title
// from where they land relative to the best score in the archive. (maxScore /
// maxLand are kept in the signature so existing call sites stay untouched.)
function overallScore(g, _maxScore, _maxLand) {
  return localScore(g);
}

function badge(text, cls) {
  const b = el("span", `htimeline-badge ${cls}`, text);
  return b;
}

function gameRow(ctx) {
  const { g, rank, stats, opts, selected, onPick } = ctx;
  const r = el("div", "htimeline-arc-row");
  if (selected) r.classList.add("on");
  const status = el("div", "htimeline-arc-status");
  status.appendChild(badge(statusLabel(g), statusClass(g)));
  r.appendChild(status);
  r.appendChild(el("div", "htimeline-arc-rank", `#${rank}`));
  r.appendChild(el("div", "htimeline-arc-date", dateStr(g.endedIso)));
  r.appendChild(el("div", "htimeline-arc-turns", loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", g.turns | 0)));
  r.appendChild(el("div", "htimeline-arc-score", String(overallScore(g, stats.maxScore, stats.maxLand))));
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
  row.appendChild(el("span", "htimeline-bar-val", String(val)));
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

function maxOf(g) {
  return { s: localScore(g), l: localLand(g) };
}

function archiveStats(games) {
  const maxScore = Math.max(1, ...games.map((g) => localScore(g)));
  const maxLand = Math.max(1, ...games.map((g) => localLand(g)));
  return { maxScore, maxLand };
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
  stats.appendChild(el("span", "htimeline-shell-pill", `${loc("LOC_HTIMELINE_SCORE", "Score")}: ${localScore(game)}`));
  stats.appendChild(el("span", "htimeline-shell-pill", `${loc("LOC_HTIMELINE_LAND", "Land")}: ${localLand(game)}`));
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
  c.appendChild(el("div", "htimeline-cmp-verdict", `${loc("LOC_HTIMELINE_LED", "{1_Leader} led {2_Civ}", p?.leader || "?", ln)}`));
  c.appendChild(el("div", "htimeline-cmp-verdict", `${loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", game.turns | 0)} · ${verdict(game)}`));
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

// ── Civilization Rankings (leaderboard) ───────────────────────────────────────
// A demographics-style board of your past runs: a top-3 podium (gold/silver/bronze)
// beside the full ranked list, each entry colored by its final-age civ and clickable
// to open the per-run detail pop-up (lineage / chronicle / living map).

function primaryCivColor(g) {
  const p = localPlayer(g);
  const last = p ? Object.values(p.ages || {}).at(-1) : null;
  return last ? civColor(last) : "rgba(201,162,76,.85)";
}

function leaderOf(g) {
  const p = localPlayer(g);
  return p && p.leader ? leaderName(p.leader) : "";
}

function lineageSwatches(g) {
  const wrap = el("div", "htimeline-rank-lineage");
  const p = localPlayer(g);
  ageOrder().filter((a) => p?.ages?.[a]).forEach((a) => {
    const seg = el("span", "htimeline-rank-seg", civName(p.ages[a]));
    seg.style.background = civColor(p.ages[a]);
    wrap.appendChild(seg);
  });
  return wrap;
}

function rankScoreBar(overall, max, color) {
  const track = el("div", "htimeline-rank-bar");
  const fill = el("div", "htimeline-rank-bar-fill");
  fill.style.width = `${Math.round(100 * overall / Math.max(1, max))}%`;
  fill.style.background = color;
  track.appendChild(fill);
  return track;
}

// "Augustus · Rome → America" — leader plus the civ lineage, the headline for a run.
function titleOf(g) {
  const leader = leaderOf(g);
  const line = lineageStr(g);
  return leader ? `${leader} · ${line}` : line;
}

function metaLine(g) {
  return `${dateStr(g.endedIso)} · ${loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", g.turns | 0)} · ${verdict(g)}`;
}

// Civilization V-style honor roll: a run's overall score earns a historical
// world-leader title, best (index 0) to worst. The top-scoring run is crowned
// Cincinnatus — the Roman who took absolute power only to lay it down again.
// Pure data: reorder or reword freely, the mapping scales to the list length.
const LEADER_LADDER = [
  "Cincinnatus", "Augustus Caesar", "Alexander the Great", "Catherine the Great",
  "Abraham Lincoln", "Elizabeth I", "Theodore Roosevelt", "Charlemagne",
  "Ashoka the Great", "Winston Churchill", "Napoleon Bonaparte", "Ramesses II",
  "Mansa Musa", "Ivan the Terrible", "Nero", "Neville Chamberlain", "Dan Quayle", "John Barron"
];

// Map a run's score (relative to the best run in the archive) onto the ladder:
// fraction 1.0 → Cincinnatus, 0.0 → the bottom of the list.
function worldLeader(overall, maxOverall) {
  const frac = maxOverall > 0 ? overall / maxOverall : 0;
  const span = LEADER_LADDER.length - 1;
  let idx = Math.round((1 - frac) * span);
  if (idx < 0) idx = 0;
  if (idx > span) idx = span;
  return LEADER_LADDER[idx];
}

function leaderTitleEl(overall, maxOverall, cls) {
  const wrap = el("div", `htimeline-rank-worldleader ${cls || ""}`);
  wrap.appendChild(el("span", "htimeline-wl-lbl", loc("LOC_HTIMELINE_WORLD_LEADER", "World Leader")));
  wrap.appendChild(el("span", "htimeline-wl-name", worldLeader(overall, maxOverall)));
  return wrap;
}

function podiumCard(b, maxOverall, onOpen) {
  const { g, rank, overall, color } = b;
  const card = el("div", `htimeline-rank-podium-card htimeline-rank-place-${rank}`);
  card.style.borderColor = color;
  const head = el("div", "htimeline-rank-podium-head");
  head.appendChild(el("div", `htimeline-medal htimeline-medal-${rank}`, String(rank)));
  head.appendChild(badge(statusLabel(g), statusClass(g)));
  card.appendChild(head);
  card.appendChild(el("div", "htimeline-rank-podium-leader", leaderOf(g) || dateStr(g.endedIso)));
  card.appendChild(lineageSwatches(g));
  card.appendChild(el("div", "htimeline-rank-podium-meta", metaLine(g)));
  card.appendChild(leaderTitleEl(overall, maxOverall, "is-podium"));
  const scoreRow = el("div", "htimeline-rank-podium-scorerow");
  scoreRow.appendChild(el("span", "htimeline-rank-podium-score", String(overall)));
  scoreRow.appendChild(el("span", "htimeline-rank-podium-lbl", loc("LOC_HTIMELINE_SCORE", "Score")));
  card.appendChild(scoreRow);
  card.appendChild(rankScoreBar(overall, maxOverall, color));
  card.addEventListener("click", () => onOpen(g));
  return card;
}

function rankRow(b, maxOverall, onOpen) {
  const { g, rank, overall, color } = b;
  const row = el("div", "htimeline-rank-row");
  row.style.setProperty("border-left-color", color);
  row.appendChild(el("div", "htimeline-rank-num", `#${rank}`));
  const mid = el("div", "htimeline-rank-mid");
  const top = el("div", "htimeline-rank-row-top");
  top.appendChild(el("span", "htimeline-rank-leader", titleOf(g)));
  top.appendChild(badge(statusLabel(g), statusClass(g)));
  mid.appendChild(top);
  mid.appendChild(lineageSwatches(g));
  mid.appendChild(el("div", "htimeline-rank-meta", metaLine(g)));
  mid.appendChild(leaderTitleEl(overall, maxOverall, "is-row"));
  mid.appendChild(rankScoreBar(overall, maxOverall, color));
  row.appendChild(mid);
  row.appendChild(el("div", "htimeline-rank-score", String(overall)));
  row.addEventListener("click", () => onOpen(g));
  return row;
}

function buildBoard(games, stats) {
  const ranked = [...games].sort(
    (a, b) => overallScore(b, stats.maxScore, stats.maxLand) - overallScore(a, stats.maxScore, stats.maxLand)
  );
  return ranked.map((g, i) => ({
    g,
    rank: i + 1,
    overall: overallScore(g, stats.maxScore, stats.maxLand),
    color: primaryCivColor(g)
  }));
}

// How many ranked runs the list shows (the podium always shows the top 3).
const RANK_LIMIT = 25;

function rankingsSplit(board, maxOverall, onOpen) {
  const split = el("div", "htimeline-rank-split");
  const left = el("div", "htimeline-rank-left");
  left.appendChild(el("div", "htimeline-rank-section-title", loc("LOC_HTIMELINE_RANKINGS_PODIUM", "Top Runs")));
  left.appendChild(el("div", "htimeline-rank-note",
    loc("LOC_HTIMELINE_RANKINGS_NOTE", "Your past games ranked by overall score.")));
  const podium = el("div", "htimeline-rank-podium");
  board.slice(0, 3).forEach((b) => podium.appendChild(podiumCard(b, maxOverall, onOpen)));
  left.appendChild(podium);
  const right = el("div", "htimeline-rank-right");
  right.appendChild(el("div", "htimeline-rank-section-title",
    loc("LOC_HTIMELINE_RANKINGS_TITLE", "Civilization Rankings")));
  const list = el("div", "htimeline-rank-list");
  board.slice(0, RANK_LIMIT).forEach((b) => list.appendChild(rankRow(b, maxOverall, onOpen)));
  right.appendChild(list);
  split.appendChild(left);
  split.appendChild(right);
  return split;
}

export function renderRankings(host, opts = {}) {
  host.textContent = "";
  const games = loadArchive().games || [];
  if (!games.length) {
    host.appendChild(el("div", "htimeline-empty",
      loc("LOC_HTIMELINE_ARC_EMPTY", "No past games yet — finish a game to start an archive.")));
    return;
  }
  const stats = archiveStats(games);
  const board = buildBoard(games, stats);
  const maxOverall = Math.max(1, ...board.map((b) => b.overall));
  const onOpen = (g) => { if (opts.onOpenGame) opts.onOpenGame(g); };
  host.appendChild(rankingsSplit(board, maxOverall, onOpen));
}
