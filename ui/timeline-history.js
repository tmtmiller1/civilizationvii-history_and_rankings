// timeline-history.js
//
// Lightweight self-capture for the non-lineage signals (score/land/settlements)
// the map + chronicle want. Only used in STANDALONE mode; when Demographics is
// present we read its richer samples[] instead. Capped + decimated by merging
// oldest adjacent same-age frames so the blob stays small.

import { readJSON, writeJSON } from "/history-and-rankings/ui/timeline-store.js";
import { currentAgeType, gameTurn, aliveMajorIds } from "/history-and-rankings/ui/timeline-runtime.js";

const KEY = "history-v1";
const CAP = 600;
let _mem = null;

function read() { return _mem || (_mem = readJSON(KEY, { version: 1, frames: [] })); }

function num(fn) { try { const v = fn(); return typeof v === "number" && isFinite(v) ? v : 0; } catch (_) { return 0; } }
function safePlayer(pid) { try { return Players?.get?.(pid); } catch (_) { return null; } }
function cityCount(p) {
  try { const l = p?.Cities?.getCities?.(); return Array.isArray(l) ? l.length : 0; } catch (_) { return 0; }
}

function plotCount(c) {
  try {
    const pl = c?.getPurchasedPlots?.();
    return pl && typeof pl.length === "number" ? pl.length : 0;
  } catch (_) { return 0; }
}

function tilesOwned(p) {
  try {
    const list = p?.Cities?.getCities?.();
    if (!Array.isArray(list)) return 0;
    let t = 0;
    for (const c of list) { t += plotCount(c); }
    return t;
  } catch (_) { return 0; }
}

function scoreOf(p, ctx) {
  const heuristic = (ctx.settlements | 0) * 2 + Math.floor((ctx.gold | 0) / 100);
  try {
    const s = p?.Stats;
    if (s && typeof s.getScore === "function") { const v = s.getScore(); if (typeof v === "number" && v >= heuristic) return v; }
  } catch (_) { /* ignore */ }
  return heuristic;
}

function playerFrame(pid) {
  const p = safePlayer(pid);
  const settlements = cityCount(p);
  const gold = num(() => p?.Treasury?.getGoldBalance?.());
  return {
    score: scoreOf(p, { settlements, gold }),
    land: tilesOwned(p),
    settlements,
    pop: num(() => p?.Stats?.totalPopulation)
  };
}

function decimate(h) {
  const f = h.frames;
  for (let i = 1; i < f.length - 1; i++) {
    if (f[i].age === f[i - 1].age) { f.splice(i, 1); return; }
  }
  if (f.length > 1) f.splice(1, 1);
}

export function captureFrame() {
  const h = read();
  const players = {};
  for (const pid of aliveMajorIds()) players[String(pid)] = playerFrame(pid);
  h.frames.push({ turn: gameTurn(), age: currentAgeType(), players });
  if (h.frames.length > CAP) decimate(h);
  writeJSON(KEY, h);
}
