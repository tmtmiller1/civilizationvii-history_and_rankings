// view-ribbon.js
//
// The hero view: one horizontal swimlane per leader, segmented at age
// boundaries, each segment the civ-of-that-age in its color, with a morph notch
// at each change and a frayed cap for eliminated lines. Hover -> prose tooltip.

import { svg, el, esc } from "/history-and-rankings/ui/timeline-dom.js";
import { makeTooltip } from "/history-and-rankings/ui/timeline-tooltip.js";
import { buildLineageRows, ageOrder } from "/history-and-rankings/ui/lineage-read.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";

const LANE_H = 46, LANE_GAP = 12, LEFT = 160, RIGHT = 28, TOP = 40, W = 1100;

function stintTooltipHTML(row, st) {
  const ageName = loc("LOC_" + st.age + "_NAME", st.age.replace(/^AGE_/, ""));
  const turns = loc("LOC_HTIMELINE_TURN_RANGE", "Turns {1_A}\u2013{2_B}", st.firstTurn, st.lastTurn);
  return `<b>${esc(ageName)}</b> \u00b7 ${esc(turns)}<br>` +
    `<span class="htimeline-tip-sw" style="background:${esc(st.color)}"></span>` +
    esc(loc("LOC_HTIMELINE_LED", "{1_Leader} led {2_Civ}", row.leaderName, st.civName));
}

function ageHeaders(s, ages, colW) {
  ages.forEach((age, i) => {
    const t = svg("text", { x: LEFT + i * colW + colW / 2, y: 24, class: "htimeline-age-hdr", "text-anchor": "middle" });
    t.textContent = loc("LOC_" + age + "_NAME", age.replace(/^AGE_/, ""));
    s.appendChild(t);
  });
}

function drawSegment(ctx, row, st, x, y) {
  const { s, tip, colW } = ctx;
  const seg = svg("rect", { x: x + 3, y, width: colW - 6, height: LANE_H, rx: 9, fill: st.color, class: "htimeline-seg" });
  const name = svg("text", { x: x + colW / 2, y: y + LANE_H / 2 + 4, "text-anchor": "middle", class: "htimeline-seg-lbl" });
  name.textContent = st.civName;
  seg.addEventListener("mouseenter", (ev) => { tip.setHTML(stintTooltipHTML(row, st)); tip.show(); tip.move(ev); });
  seg.addEventListener("mousemove", (ev) => tip.move(ev));
  seg.addEventListener("mouseleave", () => tip.hide());
  s.appendChild(seg); s.appendChild(name);
}

function drawLane(ctx, row, r) {
  const { s, ages, colW } = ctx;
  const y = TOP + r * (LANE_H + LANE_GAP);
  const lbl = svg("text", { x: 14, y: y + LANE_H / 2 + 4, class: "htimeline-leader-lbl" });
  lbl.textContent = row.leaderName; s.appendChild(lbl);
  row.stints.forEach((st) => drawSegment(ctx, row, st, LEFT + ages.indexOf(st.age) * colW, y));
  for (let i = 1; i < row.stints.length; i++) {
    const x = LEFT + ages.indexOf(row.stints[i].age) * colW + 3;
    s.appendChild(svg("polygon", { points: `${x - 6},${y + LANE_H / 2 - 7} ${x + 5},${y + LANE_H / 2} ${x - 6},${y + LANE_H / 2 + 7}`, class: "htimeline-morph" }));
  }
  if (row.eliminatedTurn != null) {
    const x = LEFT + (ages.indexOf(row.stints[row.stints.length - 1].age) + 1) * colW;
    const t = svg("text", { x: Math.min(x, W - RIGHT), y: y + LANE_H / 2 + 6, class: "htimeline-elim" });
    t.textContent = "\u2020"; s.appendChild(t);
  }
}

export function renderRibbon(host) {
  host.textContent = "";
  const rows = buildLineageRows();
  const ages = ageOrder();
  if (!rows.length) {
    host.appendChild(el("div", "htimeline-empty", loc("LOC_HTIMELINE_EMPTY", "No history captured yet \u2014 play a few turns.")));
    return;
  }
  const wrap = el("div", "htimeline-ribbon-wrap");
  const H = TOP + rows.length * (LANE_H + LANE_GAP) + 20;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "htimeline-ribbon", width: "100%" });
  const colW = (W - LEFT - RIGHT) / ages.length;
  const tip = makeTooltip(wrap);
  ageHeaders(s, ages, colW);
  rows.forEach((row, r) => drawLane({ s, tip, ages, colW }, row, r));
  wrap.appendChild(s);
  host.appendChild(wrap);
}
