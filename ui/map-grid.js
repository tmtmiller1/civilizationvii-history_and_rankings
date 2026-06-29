// map-grid.js
//
// The Historical Map's real data — a Civ V-style post-game replay: a LOW-DETAIL hex
// minimap of the actual game world (water / land / mountain + each civ's territory in
// its color, for size-and-space context). CAPTURE (in-game) reads per-tile terrain once
// and per-civ OWNERSHIP + city locations every few turns via GameplayMap, downsamples to
// a small hex grid, and run-length-encodes it compactly. RENDER (pure) paints the hexes.
//
// Safety: the engine's player-color string can be a form the canvas backend chokes on
// (a renderer-thread crash is NOT catchable in JS), so every color is validated before
// it ever reaches fillStyle, and the grid is kept small.
//
// Stored shape: { w, h, terrain:"<rle>", colors:{pid:"#rrggbb"}, frames:[{ t, a, o:"<rle>", c:[[cell,pid]] }] }

import { readJSON, writeJSON } from "/history-and-rankings/ui/timeline-store.js";
import { currentAgeType, gameTurn, aliveMajorIds } from "/history-and-rankings/ui/timeline-runtime.js";

const KEY = "mapgrid-v1";
const OUT_W = 36;        // target minimap width in cells (low detail; height from map aspect)
const EVERY = 5;         // capture an ownership frame every N turns
const FRAME_CAP = 10;    // keep at most this many frames (decimate the middle)
const HEXW = 20;         // on-canvas width of one hex column, in px (bigger = fewer, larger hexes)
let _mem = null;

// ── color safety ──────────────────────────────────────────────────────────────
// Only ever hand the canvas a color it definitely accepts. The engine's player-color
// string can be a form (e.g. 0xAARRGGBB) that crashes the canvas backend.
export function safeColor(c) {
  if (typeof c !== "string") return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  if (/^rgba?\(/i.test(c)) return c;
  if (/^0x[0-9a-fA-F]{6,8}$/.test(c)) return "#" + c.slice(-6); // 0xAARRGGBB / 0xRRGGBB → #RRGGBB
  return null;
}

// ── encode / decode ──────────────────────────────────────────────────────────

export function rle(arr) {
  const out = [];
  let v = arr[0], c = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === v) { c += 1; } else { out.push(v + "x" + c); v = arr[i]; c = 1; }
  }
  out.push(v + "x" + c);
  return out.join(".");
}

export function unrle(str, len) {
  const out = new Array(len).fill(0);
  let i = 0;
  for (const p of String(str).split(".")) {
    const xi = p.indexOf("x");
    if (xi < 0) continue;
    const v = +p.slice(0, xi), c = +p.slice(xi + 1);
    for (let k = 0; k < c && i < len; k++) out[i++] = v;
  }
  return out;
}

// ── capture (in-game; a no-op if the map surface is missing) ──────────────────

function gmDims() {
  try {
    const w = GameplayMap?.getGridWidth?.(), h = GameplayMap?.getGridHeight?.();
    if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
      const outW = Math.min(OUT_W, w);
      return { w, h, outW, outH: Math.max(1, Math.round(outW * h / w)) };
    }
  } catch (_) { /* ignore */ }
  return null;
}

function terrainAt(x, y) {
  try {
    if (GameplayMap.isWater(x, y)) return 0;
    if (GameplayMap.isMountain?.(x, y)) return 2;
  } catch (_) { /* ignore */ }
  return 1;
}

function ownerAt(x, y) {
  try { const o = GameplayMap.getOwner(x, y); return (typeof o === "number" && o >= 0 && o < 64) ? o : -1; }
  catch (_) { return -1; }
}

function sampleGrid(d, fn) {
  const out = new Array(d.outW * d.outH);
  for (let oy = 0; oy < d.outH; oy++) {
    const y = Math.min(d.h - 1, Math.floor((oy + 0.5) * d.h / d.outH));
    for (let ox = 0; ox < d.outW; ox++) {
      const x = Math.min(d.w - 1, Math.floor((ox + 0.5) * d.w / d.outW));
      out[oy * d.outW + ox] = fn(x, y);
    }
  }
  return out;
}

function getCities(pid) {
  try { const l = Players.get(pid).Cities.getCities(); return Array.isArray(l) ? l : []; }
  catch (_) { return []; }
}

function validLoc(loc) {
  return loc && typeof loc.x === "number" && typeof loc.y === "number";
}

function cityLocs(pid) {
  const out = [];
  for (const c of getCities(pid)) { if (validLoc(c && c.location)) out.push(c.location); }
  return out;
}

function citiesAt(d) {
  const out = [];
  let ids = [];
  try { ids = aliveMajorIds() || []; } catch (_) { return out; }
  for (const pid of ids) {
    for (const loc of cityLocs(pid)) {
      const cx = Math.min(d.outW - 1, Math.floor(loc.x * d.outW / d.w));
      const cy = Math.min(d.outH - 1, Math.floor(loc.y * d.outH / d.h));
      out.push([cy * d.outW + cx, pid]);
    }
  }
  return out;
}

function playerColor(pid) {
  try { return UI?.Player?.getPrimaryColorValueAsString?.(pid) || null; } catch (_) { return null; }
}

function mergeColors(g) {
  if (!g.colors) g.colors = {};
  let ids = [];
  try { ids = aliveMajorIds() || []; } catch (_) { return; }
  for (const pid of ids) { const col = safeColor(playerColor(pid)); if (col) g.colors[pid] = col; }
}

function read() { return _mem || (_mem = readJSON(KEY, null)); }

/**
 * Snapshot the map: terrain once, then an ownership + cities frame (throttled to
 * every EVERY turns, or immediately when forced). No-op with no live map.
 * @param {boolean} force Capture a frame now regardless of the throttle.
 */
export function captureMapGrid(force) {
  const d = gmDims();
  if (!d) return;
  let g = read();
  if (!g || g.w !== d.outW || g.h !== d.outH) {
    g = { w: d.outW, h: d.outH, terrain: rle(sampleGrid(d, terrainAt)), frames: [], colors: {} };
    _mem = g;
  }
  mergeColors(g);
  const turn = gameTurn();
  if (!force && turn % EVERY !== 0) { writeJSON(KEY, g); return; }
  g.frames.push({ t: turn, a: currentAgeType(), o: rle(sampleGrid(d, ownerAt)), c: citiesAt(d) });
  if (g.frames.length > FRAME_CAP) g.frames.splice(1, 1);
  _mem = g;
  writeJSON(KEY, g);
}

// ── render (pure; low-detail pointy-top hex field) ────────────────────────────

const TERRAIN_COLORS = { 0: "#16314d", 1: "#566b3c", 2: "#474450" };

// Precompute the six pointy-top hex vertex unit offsets (scaled by s at paint time).
const HEX_OFF = (() => {
  const o = [];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 90); o.push([Math.cos(a), Math.sin(a)]); }
  return o;
})();

function hexLayout(grid) {
  const width = HEXW;
  const s = width / Math.sqrt(3);
  const rowH = 1.5 * s;
  return {
    width, s, rowH,
    cw: Math.ceil((grid.w + 0.5) * width),
    ch: Math.ceil(2 * s + (grid.h - 1) * rowH)
  };
}

export function miniCanvasSize(grid) {
  const L = hexLayout(grid);
  return { w: L.cw, h: L.ch };
}

function cellXY(L, grid, i) {
  const col = i % grid.w, row = Math.floor(i / grid.w);
  return { cx: (col + (row % 2) * 0.5 + 0.5) * L.width, cy: L.s + row * L.rowH };
}

function hexPath(g, cx, cy, s) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const px = cx + s * HEX_OFF[k][0], py = cy + s * HEX_OFF[k][1];
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function paintCities(g, grid, L, cities) {
  if (!Array.isArray(cities)) return;
  g.fillStyle = "#fff";
  const total = grid.w * grid.h;
  const r = Math.max(2, L.s * 0.5);
  for (const c of cities) {
    const idx = Array.isArray(c) ? c[0] | 0 : -1;
    if (idx < 0 || idx >= total) continue;
    const { cx, cy } = cellXY(L, grid, idx);
    g.fillRect(cx - r / 2, cy - r / 2, r, r);
  }
}

/**
 * Paint one replay frame: terrain-tinted hexes, owned hexes in their civ's color,
 * cities marked. Defensive — bad dims/colors degrade rather than emit a bad command.
 * @param {HTMLCanvasElement} cv Canvas (pixel size = miniCanvasSize(grid)).
 * @param {{w:number,h:number,terrain:string}} grid Grid header.
 * @param {number[]} owners Decoded owner-per-cell for this frame.
 * @param {(pid:number)=>(string|null)} colorForOwner Owner id → civ color (or null).
 * @param {Array<[number,number]>} cities [cell, pid] city markers for this frame.
 */
export function paintMinimap(cv, grid, owners, colorForOwner, cities) {
  const g = cv.getContext("2d");
  if (!g) return;
  const w = Math.max(1, grid.w | 0), h = Math.max(1, grid.h | 0);
  const L = hexLayout(grid);
  if (!isFinite(L.s) || L.s <= 0) return;
  g.clearRect(0, 0, cv.width, cv.height);
  const terr = unrle(grid.terrain, w * h);
  for (let i = 0; i < w * h; i++) {
    const o = owners[i];
    const color = (o >= 0 ? safeColor(colorForOwner(o)) : null) || TERRAIN_COLORS[terr[i]] || "#222";
    const { cx, cy } = cellXY(L, grid, i);
    hexPath(g, cx, cy, L.s + 0.4);
    g.fillStyle = color;
    g.fill();
  }
  paintCities(g, grid, L, cities);
}
