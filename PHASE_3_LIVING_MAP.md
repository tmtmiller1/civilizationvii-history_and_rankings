# Phase 3 — Living Map (abstract canvas)

**Goal.** The spectacle: an abstracted world where each civ is a territory blob
that grows/shrinks over scrubbed time and **recolors + re-crests at age
transitions** to show the civ swap. Play it back to watch empires spread.

**Exit criteria.**
- The **Map** sub-tab renders a 2D canvas of civ blobs sized by `land`, laid out
  by a stable seeded force layout, recoloring at age boundaries.
- The shared scrubber (Phase 2) drives the map frame; play animates growth.
- Hover a blob → prose tooltip naming the civ *at that moment*, its size rank,
  recent events.
- Works in both modes (reads frames via the resolver).

Depends on Phases 1–2. Heavily reuses emigration's canvas/paint/sim/timeline
primitives — **import or port, don't reinvent.**

---

## 1. Reused emigration primitives

| Need | Source (verbatim/port) |
|---|---|
| Canvas + Hi-DPI | `emigration-network-viz.js:254-267` (`makeCanvas`), size consts `:28-35` |
| Force layout for civ centers | `emigration-network-sim.js` (seed + settle) |
| Dot/blob paint | `emigration-network-paint.js:90-126` (`drawCivCircle`/`drawCityDiscs`) |
| Ease/anim | `emigration-network-viz.js:575-597` (`advanceAnims`, `ANIM_STEP`, `PLAY_INTERVAL`) |
| Tooltip | already ported in Phase 1 (`timeline-tooltip.js`) |
| Scrubber | already ported in Phase 2 (`timeline-scrubber.js`) |

The map is conceptually emigration's destination-cluster view with the migration
flows removed and **blob radius driven by `land` instead of population dots, and
fill color driven by the civ-of-the-moment from the ledger.**

---

## 2. Frame model for the map

A map frame is `{ turn, age, civs: [{ pid, civ, civName, color, land, rank }] }`,
derived by joining the frame history (`land`, for size + rank) with the ledger
(`civ` for that age, for color/crest). Built once when the Map tab opens:

```js
import { resolveSource } from "/historical-timeline/ui/timeline-source.js";
import { readLedger } from "/historical-timeline/ui/lineage-ledger.js";
import { civName, civColor } from "/historical-timeline/ui/lineage-read.js";

export function buildMapFrames(ctx) {
  const src = resolveSource(ctx);
  const led = readLedger();
  return src.frames.map((f) => {
    const players = f.players || {};
    const civs = Object.keys(players).map((pid) => {
      const stint = ledgerStintAt(led, pid, f.age);
      const civ = stint ? stint.civ : null;
      const land = (players[pid].land ?? players[pid].land) || 0; // see note in Phase 2 §1
      return { pid, civ, civName: civ ? civName(civ) : "?", color: civ ? civColor(civ) : "#888", land };
    });
    // rank by land
    civs.sort((a, b) => b.land - a.land).forEach((c, i) => (c.rank = i + 1));
    return { turn: f.turn, age: f.age, civs };
  });
}

function ledgerStintAt(led, pid, age) {
  const p = led.players[String(pid)];
  return p && p.ages[age] ? p.ages[age] : null;
}
```

> In integrated mode `players[pid].land` comes straight from demographics
> `CivSample` (its `land` metric). Standalone, it comes from `timeline-history.js`
> (Phase 2 §1). The resolver hides the difference.

---

## 3. Map view — `ui/view-map.js`

```js
import { el } from "/historical-timeline/ui/timeline-dom.js";
import { makeTooltip } from "/historical-timeline/ui/timeline-tooltip.js";
import { buildMapFrames } from "/historical-timeline/ui/map-frames.js";
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

const WX = 1120, WY = 560;

export function renderMap(host, ctx, scrubber) {
  host.textContent = "";
  const frames = buildMapFrames(ctx);
  if (!frames.length) { host.appendChild(el("div", "htimeline-empty",
    loc("LOC_HTIMELINE_EMPTY", "No history captured yet."))); return; }

  const wrap = el("div", "htimeline-map-wrap");
  const cv = makeCanvas();
  cv.style.width = "100%";
  wrap.appendChild(cv);
  const tip = makeTooltip(wrap);
  host.appendChild(wrap);

  // Stable layout: seed civ centers once from the FINAL frame (all civs present),
  // settle with the ported force sim, then reuse those positions across all frames.
  const layout = seedLayout(frames.at(-1).civs);   // → Map<pid, {x,y}>

  let curIdx = frames.length - 1;
  const draw = (idx) => {
    curIdx = idx;
    const f = frames[idx];
    paintFrame(cv, f, layout);
  };

  // Subscribe to the shared scrubber
  if (scrubber) scrubber.onSet = (turn, i) => draw(nearestFrame(frames, turn));
  draw(curIdx);

  // Hover → tooltip
  cv.addEventListener("mousemove", (ev) => {
    const hit = pickBlob(cv, frames[curIdx], layout, ev);
    if (hit) { tip.setHTML(blobTooltipHTML(hit, frames[curIdx])); tip.show(); tip.move(ev); }
    else tip.hide();
  });
  cv.addEventListener("mouseleave", () => tip.hide());
}

// makeCanvas() — verbatim from emigration-network-viz.js:254-267 (renamed class)
function makeCanvas() {
  const cv = document.createElement("canvas");
  cv.className = "htimeline-map";
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio > 0) ? window.devicePixelRatio : 2;
  const f = Math.min(3, Math.max(2, Math.ceil(dpr * 1.5)));
  cv.width = WX * f; cv.height = WY * f;
  return cv;
}

function paintFrame(cv, frame, layout) {
  const g = cv.getContext("2d");
  const sx = cv.width / WX, sy = cv.height / WY;
  g.setTransform(sx, 0, 0, sy, 0, 0);
  g.clearRect(0, 0, WX, WY);
  const maxLand = Math.max(1, ...frame.civs.map((c) => c.land));
  for (const c of frame.civs) {
    const pos = layout.get(c.pid); if (!pos) continue;
    const r = 16 + 64 * Math.sqrt(c.land / maxLand);   // area ∝ land
    g.beginPath(); g.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    g.fillStyle = c.color; g.globalAlpha = 0.82; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.35)"; g.stroke();
    // civ label
    g.fillStyle = "#0b0e14"; g.font = "13px sans-serif"; g.textAlign = "center";
    g.fillText(c.civName, pos.x, pos.y + 4);
  }
}

function blobTooltipHTML(hit, frame) {
  const ageName = loc("LOC_" + frame.age + "_NAME", String(frame.age).replace(/^AGE_/, ""));
  return `<b>${hit.civName}</b> · ${ageName}<br>` +
    loc("LOC_HTIMELINE_MAP_RANK", "#{1_R} by territory", hit.rank);
}
```

`seedLayout`, `pickBlob`, `nearestFrame` are small helpers: `seedLayout` runs the
ported force sim (`emigration-network-sim.js`) on the final-frame civ set to get
stable, non-overlapping centers; `pickBlob` hit-tests the cursor against the
current frame's circles (cheap distance check); `nearestFrame` maps a turn to the
closest frame index.

---

## 4. Age-transition recolor

Because each map frame independently resolves civ color from the ledger for that
frame's `age`, crossing an age boundary during playback **automatically recolors
and relabels** every blob — no special-case code. Optionally add a brief
cross-fade by easing color over a few frames (reuse `advanceAnims` easing).

---

## 5. Panel wiring

Route the `map` sub-tab to `renderMap`, passing the shared scrubber created in the
panel. Lazy-import `view-map.js` only when the Map tab is first opened (it pulls
in the heavier canvas/sim code — mirror demographics' `ensureChartForMetric`
single-flight lazy load, `screen-demographics.js:605-620`).

---

## 6. Localization keys this phase

```
LOC_HTIMELINE_MAP_RANK ("#{1_R} by territory")
```

---

## 7. Verification

1. Open Map, scrub across an age boundary → blobs recolor + relabel to the new
   civ; sizes track `land`.
2. Press play → smooth growth/recolor across the whole game; speed chips work.
3. Hover blobs → correct civ-of-the-moment + territory rank.
4. Standalone mode renders identically (frames from self-capture).
5. Performance: confirm a long Marathon game (600 frames) stays smooth — blob
   count = player count, far cheaper than emigration's dot swarms, so this should
   be comfortable.
