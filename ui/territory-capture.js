// territory-capture.js
//
// Optional, additive: a throttled centroid-per-civ snapshot so the Living Map
// can anchor blobs at real map locations. Strictly degrades to "no territory
// data" if any engine surface is missing; the map then falls back to layout.

import { readJSON, writeJSON } from "/history-and-rankings/ui/timeline-store.js";
import { currentAgeType, gameTurn, aliveMajorIds } from "/history-and-rankings/ui/timeline-runtime.js";

const KEY = "territory-v1";
const EVERY = 5;
const CAP = 400;
let _mem = null;

function read() { return _mem || (_mem = readJSON(KEY, { version: 1, frames: [] })); }

function mapDims() {
  try {
    const w = GameplayMap?.getGridWidth?.(), h = GameplayMap?.getGridHeight?.();
    return (typeof w === "number" && typeof h === "number" && w && h) ? { w, h } : null;
  } catch (_) { return null; }
}

function validLoc(loc) {
  return loc && typeof loc.x === "number" && typeof loc.y === "number";
}

function cityList(pid) {
  try { return Players?.get?.(pid)?.Cities?.getCities?.() || []; } catch (_) { return []; }
}

function cityCentroid(pid) {
  let sx = 0, sy = 0, n = 0;
  for (const c of cityList(pid)) {
    const loc = c?.location;
    if (validLoc(loc)) { sx += loc.x; sy += loc.y; n += 1; }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

export function maybeCaptureTerritory(force) {
  const turn = gameTurn();
  if (!force && turn % EVERY !== 0) return;
  const dim = mapDims();
  if (!dim) return;
  const civs = [];
  for (const pid of aliveMajorIds()) {
    const c = cityCentroid(pid);
    if (c) civs.push({ pid: String(pid), x: c.x / dim.w, y: c.y / dim.h, n: c.n });
  }
  const h = read();
  h.frames.push({ turn, age: currentAgeType(), civs });
  if (h.frames.length > CAP) h.frames.splice(1, 1);
  writeJSON(KEY, h);
}
