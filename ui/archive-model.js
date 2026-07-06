// archive-model.js
//
// Pure data logic for the archive and rankings views: reading a run's local
// player, deriving its status/score/land, ranking runs, and mapping a run's
// score onto the world-leader ladder. No engine, DOM, i18n or other-module
// dependencies — everything here is a deterministic function of the saved game
// objects, so it is unit-testable off-engine.

export function localPlayer(g) {
  return g && g.localPid != null ? g.players?.[g.localPid] : null;
}

export function localScore(g) {
  return localPlayer(g)?.finalScore | 0;
}

export function localLand(g) {
  return localPlayer(g)?.finalLand | 0;
}

function statusFromOutcome(g) {
  return (g?.outcome === "in_progress" || g?.outcome === "abandoned") ? "in_progress" : null;
}

function statusFromState(g, p) {
  return (p?.eliminatedTurn != null || g?.lastAge === "AGE_MODERN") ? "completed" : null;
}

export function statusOf(g) {
  if (g?.status === "completed" || g?.status === "in_progress") return g.status;
  const p = localPlayer(g);
  const byOutcome = statusFromOutcome(g);
  if (byOutcome) return byOutcome;
  const byState = statusFromState(g, p);
  if (byState) return byState;
  return "in_progress";
}

export function statusClass(g) {
  return statusOf(g) === "completed" ? "is-completed" : "is-progress";
}

// The headline ranking number is the civilization's OWN score — the value the
// game itself keeps (Player.Stats.getScore(), captured per run), not a
// normalized 0–1000 index. Runs sort by it and earn their world-leader title
// from where they land relative to the best score in the archive. (maxScore /
// maxLand are kept in the signature so existing call sites stay untouched.)
export function overallScore(g, _maxScore, _maxLand) {
  return localScore(g);
}

export function maxOf(g) {
  return { s: localScore(g), l: localLand(g) };
}

export function archiveStats(games) {
  const maxScore = Math.max(1, ...games.map((g) => localScore(g)));
  const maxLand = Math.max(1, ...games.map((g) => localLand(g)));
  return { maxScore, maxLand };
}

// Civilization V-style honor roll: a run's overall score earns a historical
// world-leader title, best (index 0) to worst. The top-scoring run is crowned
// Cincinnatus — the Roman who took absolute power only to lay it down again.
// Pure data: reorder or reword freely, the mapping scales to the list length.
export const LEADER_LADDER = [
  "Cincinnatus", "Augustus Caesar", "Alexander the Great", "Catherine the Great",
  "Abraham Lincoln", "Elizabeth I", "Theodore Roosevelt", "Charlemagne",
  "Ashoka the Great", "Winston Churchill", "Napoleon Bonaparte", "Ramesses II",
  "Mansa Musa", "Ivan the Terrible", "Nero", "Neville Chamberlain", "Dan Quayle", "John Barron"
];

// Map a run's score (relative to the best run in the archive) onto the ladder:
// fraction 1.0 → Cincinnatus, 0.0 → the bottom of the list.
export function worldLeader(overall, maxOverall) {
  const frac = maxOverall > 0 ? overall / maxOverall : 0;
  const span = LEADER_LADDER.length - 1;
  let idx = Math.round((1 - frac) * span);
  if (idx < 0) idx = 0;
  if (idx > span) idx = span;
  return LEADER_LADDER[idx];
}

// How many ranked runs the list shows (the podium always shows the top 3).
export const RANK_LIMIT = 25;
