// lineage-read.js
//
// Turns the raw ledger into render-ready rows: age order, display names from the
// game's own LOC (so translations are inherited), and a per-civ color. Local
// player first, then alive, then eliminated.

import { readLedger } from "/history-and-rankings/ui/lineage-ledger.js";
import { localPlayerId } from "/history-and-rankings/ui/timeline-runtime.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";

export function ageOrder() {
  try {
    const ages = [];
    for (const row of GameInfo?.Ages || []) {
      if (row && typeof row.AgeType === "string") ages.push([row.AgeType, row.ChronologyIndex ?? 0]);
    }
    ages.sort((a, b) => a[1] - b[1]);
    if (ages.length) return ages.map((a) => a[0]);
  } catch (_) { /* fall through */ }
  return ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
}

export function civName(type) {
  if (!type) return "?";
  return loc("LOC_" + type, type.replace(/^CIVILIZATION_/, ""));
}

export function leaderName(type) {
  if (!type) return "?";
  return loc("LOC_" + type + "_NAME", type.replace(/^LEADER_/, ""));
}

// Distinct per-civ fallback color as HEX. Civ VII's UI engine (Gameface) rejects
// hsl() in ANY form for style values, so we resolve the hue to a hex string.
export function civColor(type) {
  let h = 0;
  for (const c of String(type)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return hslHex(h % 360, 0.55, 0.48);
}

function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = hslSextant(h, c, x);
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

function hslSextant(h, c, x) {
  if (h < 60) return [c, x, 0];
  if (h < 120) return [x, c, 0];
  if (h < 180) return [0, c, x];
  if (h < 240) return [0, x, c];
  if (h < 300) return [x, 0, c];
  return [c, 0, x];
}

function stintsOf(p, order) {
  return order.filter((age) => p.ages[age]).map((age) => {
    const s = p.ages[age];
    return {
      age, civ: s.civ, civName: civName(s.civ), color: civColor(s.civ),
      firstTurn: s.firstTurn, lastTurn: s.lastTurn
    };
  });
}

export function buildLineageRows() {
  const led = readLedger();
  const order = ageOrder();
  const local = String(localPlayerId());
  const rows = [];
  for (const pid in led.players) {
    const p = led.players[pid];
    const stints = stintsOf(p, order);
    if (!stints.length) continue;
    rows.push({
      pid, leader: p.leader, leaderName: leaderName(p.leader),
      stints, eliminatedTurn: p.eliminatedTurn
    });
  }
  rows.sort((a, b) => {
    if (a.pid === local) return -1;
    if (b.pid === local) return 1;
    const ae = a.eliminatedTurn != null ? 1 : 0, be = b.eliminatedTurn != null ? 1 : 0;
    return ae - be;
  });
  return rows;
}
