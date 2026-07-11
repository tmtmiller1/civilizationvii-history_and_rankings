// lineage-ledger.js
//
// The one new piece of capture: a tiny, decimation-proof record of each player's
// civ per age, keyed by stable player id. Persisted to its own GameConfiguration
// key, so "Rome -> Iceland -> ..." is always exact even when sampled history is
// thinned. Read-only at the menu (no live game), write-on-change in-game.

import { readJSON, writeJSON } from "/history-and-rankings/ui/timeline-store.js";
import {
  currentAgeType, gameTurn, civType, leaderType, aliveMajorIds, seedOf
} from "/history-and-rankings/ui/timeline-runtime.js";

const KEY = "lineage-v1";
const VERSION = 1;
let _mem = null;

export function readLedger() {
  if (_mem) return _mem;
  _mem = readJSON(KEY, null) || { version: VERSION, seed: seedOf(), players: {} };
  return _mem;
}

function foldStint(p, age, civ, turn) {
  const stint = p.ages[age];
  if (!stint) { p.ages[age] = { civ, firstTurn: turn, lastTurn: turn }; return true; }
  let changed = false;
  if (stint.lastTurn !== turn) { stint.lastTurn = turn; changed = true; }
  if (stint.civ !== civ) { stint.civ = civ; changed = true; }
  return changed;
}

function foldPlayer(led, pid, age, turn) {
  const civ = civType(pid);
  if (!civ) return false;
  const ldr = leaderType(pid);
  const key = String(pid);
  const p = led.players[key] || (led.players[key] = { leader: ldr || "?", ages: {} });
  let changed = false;
  if (ldr && p.leader !== ldr) { p.leader = ldr; changed = true; }
  if (foldStint(p, age, civ, turn)) changed = true;
  return changed;
}

/** Fold the current world state into the ledger. Returns true if it changed. */
export function captureNow() {
  const led = readLedger();
  const age = currentAgeType();
  const turn = gameTurn();
  if (!age) return false;
  let changed = false;
  const alive = aliveMajorIds();
  for (const pid of alive) {
    if (foldPlayer(led, pid, age, turn)) changed = true;
  }
  if (deriveEliminations(led, alive, turn)) changed = true;
  if (changed) writeJSON(KEY, led);
  return changed;
}

/**
 * Record elimination for any major that appeared in the ledger (so it was alive at some
 * capture) but is no longer among the alive majors — no player-defeat engine event is wired,
 * so it's derived here. Skipped when the alive list is empty (a transient/unreadable state
 * that must not stamp every player as eliminated). Idempotent: `eliminatedTurn` is set once.
 * @param {*} led The ledger. @param {number[]} alive Current alive-major ids. @param {number} turn Current turn.
 * @returns {boolean} True if any elimination was newly recorded.
 */
function deriveEliminations(led, alive, turn) {
  if (!Array.isArray(alive) || alive.length === 0) return false;
  const aliveSet = new Set(alive.map(Number));
  let changed = false;
  for (const key of Object.keys(led.players)) {
    const p = led.players[key];
    if (p && p.eliminatedTurn == null && !aliveSet.has(Number(key))) {
      p.eliminatedTurn = turn;
      changed = true;
    }
  }
  return changed;
}

/** Mark a player eliminated; idempotent. */
export function markEliminated(pid) {
  const led = readLedger();
  const p = led.players[String(pid)];
  if (p && p.eliminatedTurn == null) { p.eliminatedTurn = gameTurn(); writeJSON(KEY, led); }
}
