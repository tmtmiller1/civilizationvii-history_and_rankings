// view-historical-map.js
//
// THE single map renderer — a Civ V-style territory replay drawn as a hex field with
// each civ's land filled in its color, cities marked, and a scrubber to play the whole
// game turn-by-turn. One core (renderGridReplay) feeds two callers:
//   • renderHistoricalMap(host, game) — an ARCHIVED run, grid from the recap, civ colors
//     from recap.players.
//   • renderLiveMap(host) — the RUNNING game, grid from the live mapgrid-v1 capture, civ
//     colors from the live lineage ledger.
// Returns false when there's no captured replay so the caller can show a hint.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { makeTooltip } from "/history-and-rankings/ui/timeline-tooltip.js";
import { makeScrubber } from "/history-and-rankings/ui/timeline-scrubber.js";
import { civName, civColor } from "/history-and-rankings/ui/lineage-read.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";
import { loadGameMap, readJSON } from "/history-and-rankings/ui/timeline-store.js";
import { readLedger } from "/history-and-rankings/ui/lineage-ledger.js";
import { paintMinimap, unrle, miniCanvasSize } from "/history-and-rankings/ui/map-grid.js";

function makeMiniCanvas(grid) {
  const cv = document.createElement("canvas");
  cv.className = "htimeline-map";
  const sz = miniCanvasSize(grid);
  cv.width = sz.w; cv.height = sz.h;
  return cv;
}

// Size the canvas to the LARGEST aspect-correct rectangle that fits its wrap, so the
// map fills the window on any resolution (instead of width-only with empty space below).
// Re-fits on resize; retries until the wrap has been laid out (cold-start safe).
function fitCanvas(cv, wrap) {
  const ar = cv.width / cv.height;
  const apply = (tries) => {
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if ((!cw || !ch) && tries < 30) { requestAnimationFrame(() => apply(tries + 1)); return; }
    if (!cw || !ch) return;
    let w = cw, h = cw / ar;
    if (h > ch) { h = ch; w = ch * ar; }
    cv.style.width = Math.floor(w) + "px";
    cv.style.height = Math.floor(h) + "px";
  };
  apply(0);
  try { window.addEventListener("resize", () => apply(0)); } catch (_) { /* */ }
}

// Flat-grid hit-test: map the pointer to a cell by fraction of the canvas.
function pickCell(cv, grid, ev) {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return 0;
  const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
  const col = Math.max(0, Math.min(grid.w - 1, Math.floor(fx * grid.w)));
  const row = Math.max(0, Math.min(grid.h - 1, Math.floor(fy * grid.h)));
  return row * grid.w + col;
}

function wireHover(cv, grid, tip, st, civTypeFor) {
  cv.addEventListener("mousemove", (ev) => {
    const o = st.owners[pickCell(cv, grid, ev)];
    const type = o >= 0 ? civTypeFor(o, st.age) : null;
    if (type) { tip.setHTML(`<b>${civName(type)}</b>`); tip.show(); tip.move(ev); } else tip.hide();
  });
  cv.addEventListener("mouseleave", () => tip.hide());
}

// Legend: a terrain key + every civ on the map in its real color, so the colored
// territory reads at a glance.
const TERRAIN_LEGEND = [
  ["#16314d", "LOC_HTIMELINE_TERRAIN_WATER", "Water"],
  ["#566b3c", "LOC_HTIMELINE_TERRAIN_LAND", "Land"],
  ["#474450", "LOC_HTIMELINE_TERRAIN_MOUNTAIN", "Mountain"]
];

function legendItem(color, label) {
  const item = el("span", "htimeline-legend-item");
  const sw = el("span", "htimeline-legend-sw");
  sw.style.background = color;
  item.appendChild(sw);
  item.appendChild(el("span", "htimeline-legend-lbl", label));
  return item;
}

function buildLegend(grid, civTypeFor) {
  const legend = el("div", "htimeline-map-legend");
  const terr = el("div", "htimeline-legend-row");
  TERRAIN_LEGEND.forEach(([c, key, fb]) => terr.appendChild(legendItem(c, loc(key, fb))));
  legend.appendChild(terr);
  const civs = el("div", "htimeline-legend-row");
  const age = grid.frames[grid.frames.length - 1].a;
  const colors = grid.colors || {};
  Object.keys(colors).forEach((pid) => {
    const type = civTypeFor(pid, age);
    civs.appendChild(legendItem(colors[pid], type ? civName(type) : "—"));
  });
  legend.appendChild(civs);
  return legend;
}

/**
 * Render a hex territory replay from a grid, scrubbable.
 * @param {HTMLElement} host Mount point.
 * @param {*} grid The map grid ({ w, h, terrain, frames }), or null.
 * @param {(pid:number, age:string)=>(string|null)} civTypeFor Owner id + age → civ type.
 * @returns {boolean} True if rendered; false when the grid has no frames.
 */
function mountCanvas(host, grid) {
  const cv = makeMiniCanvas(grid);
  const wrap = el("div", "htimeline-map-wrap");
  wrap.appendChild(cv);
  const tip = makeTooltip(wrap);
  host.appendChild(wrap);
  fitCanvas(cv, wrap);
  return { cv, tip };
}

function renderGridReplay(host, grid, civTypeFor) {
  const frames = grid && Array.isArray(grid.frames) ? grid.frames : [];
  if (!frames.length) return false;
  const { cv, tip } = mountCanvas(host, grid);
  const st = { owners: [], age: frames[frames.length - 1].a };
  const colors = grid.colors || {};
  const colorFor = (pid) => {
    if (colors[pid]) return colors[pid];               // real captured civ color
    const type = civTypeFor(pid, st.age);              // fallback: distinct hex by civ
    return type ? civColor(type) : null;
  };
  const draw = (i) => {
    st.owners = unrle(frames[i].o, grid.w * grid.h); st.age = frames[i].a;
    paintMinimap(cv, grid, st.owners, colorFor, frames[i].c);
  };
  const scrubber = makeScrubber(frames.map((f) => f.t));
  scrubber.subscribe((_t, i) => draw(i));
  draw(frames.length - 1);
  host.appendChild(scrubber.root);
  host.appendChild(buildLegend(grid, civTypeFor));
  wireHover(cv, grid, tip, st, civTypeFor);
  return true;
}

// An archived run's grid: the per-game key first, then legacy inline (old entries).
function gridFor(game) {
  if (game && game.map && game.map.grid) return game.map.grid;
  const m = game ? loadGameMap(game.id) : null;
  return m && m.grid ? m.grid : null;
}

// Civ-of-the-moment from a recap's compact players map (age → civ type string).
function recapCiv(players, pid, age) {
  const ages = players[pid] && players[pid].ages ? players[pid].ages : {};
  return ages[age] || Object.values(ages).at(-1) || null;
}

/**
 * Render an ARCHIVED run's replay map.
 * @param {HTMLElement} host Mount point. @param {*} game The archived recap.
 * @returns {boolean} True if a captured replay was rendered.
 */
export function renderHistoricalMap(host, game) {
  const players = game && game.players ? game.players : {};
  return renderGridReplay(host, gridFor(game), (pid, age) => recapCiv(players, String(pid), age));
}

/**
 * Render the RUNNING game's replay map from the live capture + lineage ledger.
 * @param {HTMLElement} host Mount point.
 * @returns {boolean} True if anything has been captured yet.
 */
export function renderLiveMap(host) {
  const grid = readJSON("mapgrid-v1", null);
  const led = readLedger();
  const players = led && led.players ? led.players : {};
  const liveCiv = (pid, age) => {
    const stint = players[String(pid)] && players[String(pid)].ages ? players[String(pid)].ages[age] : null;
    return stint ? stint.civ : null;
  };
  return renderGridReplay(host, grid, liveCiv);
}
