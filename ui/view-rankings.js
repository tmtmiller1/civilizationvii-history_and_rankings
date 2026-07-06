// view-rankings.js
//
// Civilization Rankings (leaderboard): a demographics-style board of your past
// runs — a top-3 podium (gold/silver/bronze) beside the full ranked list, each
// entry colored by its final-age civ and clickable to open the per-run detail
// pop-up (lineage / chronicle / living map). Pure logic lives in archive-model,
// shared presentation in archive-format; this file only builds the DOM.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { loadArchive } from "/history-and-rankings/ui/timeline-store.js";
import { civName, civColor, ageOrder } from "/history-and-rankings/ui/lineage-read.js";
import { loc, num } from "/history-and-rankings/ui/timeline-i18n.js";
import {
  localPlayer, overallScore, worldLeader, archiveStats, statusClass, RANK_LIMIT
} from "/history-and-rankings/ui/archive-model.js";
import {
  badge, statusLabel, dateStr, leaderOf, primaryCivColor, titleOf, metaLine
} from "/history-and-rankings/ui/archive-format.js";

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
  scoreRow.appendChild(el("span", "htimeline-rank-podium-score", num(overall)));
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
  row.appendChild(el("div", "htimeline-rank-score", num(overall)));
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
