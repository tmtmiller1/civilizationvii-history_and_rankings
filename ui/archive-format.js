// archive-format.js
//
// Presentation helpers shared by the archive and rankings views: turning a run
// into its localized status badge, date, lineage string, verdict, headline
// title and meta line. These sit between the pure model (archive-model.js) and
// the DOM-building views — they need the game's i18n and lineage lookups, but
// know nothing about how the result is laid out on screen.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { civName, civColor, ageOrder, leaderName } from "/history-and-rankings/ui/lineage-read.js";
import { loc, num } from "/history-and-rankings/ui/timeline-i18n.js";
import { localPlayer, statusOf } from "/history-and-rankings/ui/archive-model.js";

export function badge(text, cls) {
  const b = el("span", `htimeline-badge ${cls}`, text);
  return b;
}

export function statusLabel(g) {
  return statusOf(g) === "completed"
    ? loc("LOC_HTIMELINE_STATUS_COMPLETED", "Completed")
    : loc("LOC_HTIMELINE_STATUS_IN_PROGRESS", "In Progress");
}

export function dateStr(iso) {
  try { return new Date(iso).toLocaleDateString(); } catch (_) { return iso || "?"; }
}

export function lineageStr(g) {
  const p = localPlayer(g);
  if (!p) return "?";
  return ageOrder().filter((a) => p.ages?.[a]).map((a) => civName(p.ages[a])).join(" -> ") || "?";
}

export function verdict(g) {
  const p = localPlayer(g);
  const civ = p ? civName(Object.values(p.ages || {}).at(-1)) : "?";
  if (statusOf(g) !== "completed") return loc("LOC_HTIMELINE_STATUS_IN_PROGRESS", "In Progress");
  if (p?.eliminatedTurn != null) {
    return loc("LOC_HTIMELINE_VERDICT_OUT", "Eliminated T{1_T} as {2_C}", num(p.eliminatedTurn), civ);
  }
  return loc("LOC_HTIMELINE_VERDICT_END", "Reached {1_A} as {2_C}", String(g.lastAge || "").replace(/^AGE_/, ""), civ);
}

export function primaryCivColor(g) {
  const p = localPlayer(g);
  const last = p ? Object.values(p.ages || {}).at(-1) : null;
  return last ? civColor(last) : "rgba(201,162,76,.85)";
}

export function leaderOf(g) {
  const p = localPlayer(g);
  return p && p.leader ? leaderName(p.leader) : "";
}

// "Augustus · Rome → America" — leader plus the civ lineage, the headline for a run.
export function titleOf(g) {
  const leader = leaderOf(g);
  const line = lineageStr(g);
  return leader ? `${leader} · ${line}` : line;
}

export function metaLine(g) {
  return `${dateStr(g.endedIso)} · ${loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", num(g.turns | 0))} · ${verdict(g)}`;
}
