// timeline-recap.js
//
// Builds the post-game recap from the live game store and mirrors it to the
// shell-readable USER tier (timeline-store.saveRecap) so screen-historical-
// timeline can show it at the main menu with no game loaded. Hooks the same
// flush points the design uses for the heavy blob (BeforeUnload + age complete).

import { readJSON, appendGame, loadArchive, saveGameMap } from "/history-and-rankings/ui/timeline-store.js";
import { localPlayerId, gameTurn, currentAgeType } from "/history-and-rankings/ui/timeline-runtime.js";
import { dlog, derr } from "/history-and-rankings/ui/timeline-log.js";

// A finished game becomes one archive entry. Use a stable per-game id (seed if
// present) so re-flushes during the same game update the same entry, not pile up.
function gameId() {
  try { return readJSON("lineage-v1", null)?.seed ?? Math.floor(Date.now() / 1000); }
  catch (_) { return Math.floor(Date.now() / 1000); }
}

// Final score/land per player from the last captured frame (if any).
function finalsOf(history) {
  const frames = history && Array.isArray(history.frames) ? history.frames : [];
  const last = frames.length ? frames[frames.length - 1].players || {} : {};
  return last;
}

// Compact per-player recap: leader, age->civ, final score/land, eliminated turn.
function compactPlayers(lineage, finals) {
  const out = {};
  const players = lineage && lineage.players ? lineage.players : {};
  for (const pid in players) {
    const p = players[pid];
    const ages = {};
    for (const age in p.ages || {}) ages[age] = p.ages[age].civ;
    const f = finals[pid] || {};
    out[pid] = { leader: p.leader, ages, finalScore: f.score | 0, finalLand: f.land | 0 };
    if (p.eliminatedTurn != null) out[pid].eliminatedTurn = p.eliminatedTurn;
  }
  return out;
}

// ── Compact map series ────────────────────────────────────────────────────────
// Bake a small, self-contained expansion timeline into each archive entry so the
// menu can replay the empire growing turn-by-turn with no game loaded. Layout is
// FIXED from the final per-civ centroids (territory-v1); only land (blob size)
// animates, exactly like the in-game map. Land per turn comes from history-v1.
const MAP_FRAME_CAP = 24;

function round3(v) { return Math.round(v * 1000) / 1000; }

// Pick at most `cap` evenly-spaced entries (always keeping first + last).
function sampleEven(arr, cap) {
  if (arr.length <= cap) return arr.slice();
  const out = [];
  const step = (arr.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

// Final per-civ centroid (normalized [0,1]) → the fixed blob layout, or null.
function finalPositions(terr) {
  const frames = terr && Array.isArray(terr.frames) ? terr.frames : [];
  const last = frames.length ? frames[frames.length - 1] : null;
  if (!last) return null;
  const pos = {};
  for (const c of last.civs || []) pos[c.pid] = [round3(c.x), round3(c.y)];
  return Object.keys(pos).length ? pos : null;
}

// Tiny land-over-time blob series (fallback when no minimap grid was captured), or null.
function blobSeries(history, terr) {
  const frames = history && Array.isArray(history.frames) ? history.frames : [];
  if (!frames.length) return null;
  const out = {
    frames: sampleEven(frames, MAP_FRAME_CAP).map((f) => {
      const l = {};
      for (const pid in f.players || {}) l[pid] = f.players[pid].land | 0;
      return { t: f.turn, a: f.age, l };
    })
  };
  const pos = finalPositions(terr);
  if (pos) out.pos = pos;
  return out;
}

// The captured minimap grid, if it has terrain + at least one ownership frame.
function readGrid() {
  const grid = readJSON("mapgrid-v1", null);
  const ok = grid && grid.terrain && Array.isArray(grid.frames) && grid.frames.length;
  return ok ? grid : null;
}

// The recap's map payload: the real downsampled minimap series (grid) when captured,
// plus the blob series as a fallback. { grid?, frames?, pos? } or null.
function buildMapSeries(history, terr) {
  const out = blobSeries(history, terr) || {};
  const grid = readGrid();
  if (grid) out.grid = grid;
  return (out.grid || out.frames) ? out : null;
}

function classifyRecap(localStr, lineage, age) {
  const eliminated = localStr && lineage?.players?.[localStr]?.eliminatedTurn != null;
  const completed = age === "AGE_MODERN";
  const status = eliminated ? "completed" : (completed ? "completed" : "in_progress");
  const outcome = eliminated ? "defeat" : (completed ? "reached_end_age" : "in_progress");
  return { status, outcome };
}

// Compact snapshot the menu + comparison view can show. Capped by bytes upstream.
function buildRecap() {
  const lineage = readJSON("lineage-v1", null);
  const history = readJSON("history-v1", null);
  const finals = finalsOf(history);
  const local = localPlayerId();
  const localStr = local == null ? null : String(local);
  const age = currentAgeType() || null;
  const run = classifyRecap(localStr, lineage, age);
  const recap = {
    id: gameId(),
    endedIso: (() => { try { return new Date().toISOString(); } catch (_) { return null; } })(),
    turns: gameTurn(),
    lastAge: age,
    localPid: localStr,
    status: run.status,
    outcome: run.outcome,
    players: compactPlayers(lineage, finals)
  };
  const map = buildMapSeries(history, readJSON("territory-v1", null));
  if (map) recap.map = map;
  return recap;
}

/**
 * Build the current game's recap + append it to the shell-readable archive. The heavy
 * map replay is written under its own per-game key (saveGameMap), NOT inline in the
 * list, so the games list stays small and always persists.
 */
export function flushRecap() {
  try {
    const recap = buildRecap();
    if (recap.map) {
      if (saveGameMap(recap.id, recap.map)) recap.hasMap = true;
      delete recap.map;
    }
    const ok = appendGame(recap);
    dlog(`recap flushed (id=${recap.id} hasMap=${!!recap.hasMap} mirrored=${ok})`);
    return ok;
  } catch (e) { derr("flushRecap failed", e); return false; }
}

/** Read the archive of past games at the menu. */
export function getArchive() { return loadArchive(); }

/** Wire flush points once; the menu never installs these. */
export function installRecapFlush() {
  const eng = typeof engine !== "undefined" ? engine : null;
  if (!eng || typeof eng.on !== "function") return;
  try { eng.on("BeforeUnload", flushRecap); } catch (_) {}
  try { eng.on("PlayerAgeTransitionComplete", flushRecap); } catch (_) {}
}
