# Phase 1 — Lineage ledger + Ribbon view (the hero feature)

**Goal.** Capture each player's civ-per-age across the whole game and render the
**Lineage Ribbon**: one swimlane per leader, segmented by age, each segment
showing the civ they were at that time, with a prose tooltip. This alone fulfils
the original wish ("what was Machiavelli in Antiquity?").

**Exit criteria.**
- A `LineageLedger` is captured every turn and on age transitions, persisted via
  GameConfiguration, and survives save/load and age changes.
- Opening the **Ribbon** sub-tab shows every alive (and eliminated) leader's full
  civ history across ages, colored + crested per civ, with hover tooltips.
- Works identically in integrated and standalone modes (ledger is self-owned).

Depends on Phase 0. Uses reference §C (persistence), §D (runtime reads), §E
(sampler), §F (DOM helpers).

---

## 1. Data shape — `LineageLedger`

Persisted to key `lineage-v1` (reference §C). A few hundred bytes; never
decimated, so it stays authoritative even as any sampled history is thinned.

```js
/**
 * @typedef {Object} AgeStint  One player's identity during one age.
 * @property {string} civ        e.g. "CIVILIZATION_ROME"
 * @property {number} firstTurn  game turn first observed in this age
 * @property {number} lastTurn   game turn last observed
 *
 * @typedef {Object} PlayerLineage
 * @property {string} leader                 e.g. "LEADER_NAPOLEON" (stable across ages)
 * @property {Record<string, AgeStint>} ages keyed by AgeType ("AGE_ANTIQUITY", ...)
 * @property {number} [eliminatedTurn]
 *
 * @typedef {Object} LineageLedger
 * @property {number} version
 * @property {string|number} seed
 * @property {Record<string, PlayerLineage>} players  keyed by player id
 */
```

---

## 2. Capture — `ui/lineage-ledger.js`

Records on every `PlayerTurnActivated` (idempotent: only writes when something
changed) and forces a write on `PlayerAgeTransitionComplete` (the precise moment
a civ swaps). Reads via §D helpers; persists via §C helpers.

```js
import { readJSON, writeJSON } from "/historical-timeline/ui/timeline-store.js";
import { currentAgeType, gameTurn, civType, leaderType, aliveMajorIds } from "/historical-timeline/ui/timeline-runtime.js";
import { dlog } from "/historical-timeline/ui/timeline-log.js";

const KEY = "lineage-v1";
const VERSION = 1;
let _mem = null;

function seedOf() {
  try { return Configuration?.getGame?.()?.startPosition ?? "unknown"; } catch (_) { return "unknown"; }
}

export function readLedger() {
  if (_mem) return _mem;
  _mem = readJSON(KEY, null) || { version: VERSION, seed: seedOf(), players: {} };
  return _mem;
}

/** Fold the current world state into the ledger. Returns true if it changed. */
export function captureNow() {
  const led = readLedger();
  const age = currentAgeType();
  const turn = gameTurn();
  if (!age) return false;
  let changed = false;

  for (const pid of aliveMajorIds()) {
    const civ = civType(pid);
    const ldr = leaderType(pid);
    if (!civ) continue;
    const key = String(pid);
    const p = led.players[key] || (led.players[key] = { leader: ldr || "?", ages: {} });
    if (ldr && p.leader !== ldr) { p.leader = ldr; changed = true; } // robustness
    const stint = p.ages[age];
    if (!stint) {
      p.ages[age] = { civ, firstTurn: turn, lastTurn: turn };
      changed = true;
    } else {
      if (stint.lastTurn !== turn) { stint.lastTurn = turn; changed = true; }
      if (stint.civ !== civ) { stint.civ = civ; changed = true; } // mid-age civ swap (rare)
    }
  }
  if (changed) writeJSON(KEY, led);
  return changed;
}

/** Mark a player eliminated (call from elimination event if available; else inferred later). */
export function markEliminated(pid) {
  const led = readLedger();
  const p = led.players[String(pid)];
  if (p && p.eliminatedTurn == null) { p.eliminatedTurn = gameTurn(); writeJSON(KEY, led); }
}
```

Wire the sampler (reference §E) from the bootstrap or a small `timeline-capture.js`
started in Phase 1:

```js
import { startSampler } from "/historical-timeline/ui/timeline-sampler.js";
import { captureNow } from "/historical-timeline/ui/lineage-ledger.js";

export function startLineageCapture() {
  // capture once on start (covers mid-game install) then on every turn + age change
  try { captureNow(); } catch (_) {}
  startSampler({ onTurn: () => captureNow(), onAge: () => captureNow() });
}
```

> **Why a dedicated ledger and not the sampled history:** the demographics
> `samples[]` is decimated to ~500 entries, so the exact first-appearance turn of
> an early-age civ can be thinned out. The ledger is tiny and never decimated, so
> "Rome → Iceland → …" is always exact. (This is the core feasibility insight.)

Put `currentAgeType/gameTurn/civType/leaderType/aliveMajorIds/localPlayerId` in
`ui/timeline-runtime.js` (reference §D verbatim).

---

## 3. Read/derive — `ui/lineage-read.js`

Turns the ledger into render-ready rows, sorted in age order via the `Ages`
table's `ChronologyIndex`, with display names resolved from game LOC.

```js
import { readLedger } from "/historical-timeline/ui/lineage-ledger.js";
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

/** Age order from GameInfo.Ages (ChronologyIndex), defensively. */
export function ageOrder() {
  try {
    const ages = [];
    for (const row of GameInfo?.Ages || []) {
      if (row && typeof row.AgeType === "string") ages.push([row.AgeType, row.ChronologyIndex ?? 0]);
    }
    ages.sort((a, b) => a[1] - b[1]);
    return ages.map((a) => a[0]);
  } catch (_) { return ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"]; }
}

export function civName(civType) {
  if (!civType) return "?";
  return loc("LOC_" + civType, civType.replace(/^CIVILIZATION_/, ""));
}
export function leaderName(leaderType) {
  if (!leaderType) return "?";
  return loc("LOC_" + leaderType + "_NAME", leaderType.replace(/^LEADER_/, ""));
}
export function civColor(civType) {
  // Prefer the game's player-color primary; fall back to a hashed hue.
  try {
    // (engine color lookups vary by build; resolve from GameInfo.Civilizations row if available)
  } catch (_) {}
  let h = 0; for (const c of String(civType)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

/** One row per player: { pid, leader, leaderName, stints:[{age, civ, civName, color, firstTurn, lastTurn}], eliminatedTurn } */
export function buildLineageRows() {
  const led = readLedger();
  const order = ageOrder();
  const rows = [];
  for (const pid in led.players) {
    const p = led.players[pid];
    const stints = order
      .filter((age) => p.ages[age])
      .map((age) => {
        const s = p.ages[age];
        return { age, civ: s.civ, civName: civName(s.civ), color: civColor(s.civ),
                 firstTurn: s.firstTurn, lastTurn: s.lastTurn };
      });
    if (!stints.length) continue;
    rows.push({ pid, leader: p.leader, leaderName: leaderName(p.leader),
                stints, eliminatedTurn: p.eliminatedTurn });
  }
  // Local player first, then alive, then eliminated; stable otherwise.
  return rows;
}
```

---

## 4. Ribbon view — `ui/view-ribbon.js` (SVG)

One horizontal lane per row; each age stint is a colored segment; a notch marks
each age boundary where the civ changes; eliminated lanes end with a frayed cap.
SVG via reference §F `svg()`. Tooltip via `timeline-tooltip.js` (below).

```js
import { svg, el, esc } from "/historical-timeline/ui/timeline-dom.js";
import { makeTooltip } from "/historical-timeline/ui/timeline-tooltip.js";
import { buildLineageRows, ageOrder } from "/historical-timeline/ui/lineage-read.js";
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

const LANE_H = 46, LANE_GAP = 10, LEFT = 150, RIGHT = 24, TOP = 36;

export function renderRibbon(host) {
  host.textContent = "";
  const rows = buildLineageRows();
  const ages = ageOrder();
  if (!rows.length) { host.appendChild(el("div", "htimeline-empty",
    loc("LOC_HTIMELINE_EMPTY", "No history captured yet — play a few turns."))); return; }

  const wrap = el("div", "htimeline-ribbon-wrap");
  const W = 1100, H = TOP + rows.length * (LANE_H + LANE_GAP) + 20;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "htimeline-ribbon", width: "100%" });
  const colW = (W - LEFT - RIGHT) / ages.length;
  const tip = makeTooltip(wrap);

  // Age column headers
  ages.forEach((age, i) => {
    const t = svg("text", { x: LEFT + i * colW + colW / 2, y: 22, class: "htimeline-age-hdr",
      "text-anchor": "middle" });
    t.textContent = loc("LOC_" + age + "_NAME", age.replace(/^AGE_/, ""));
    s.appendChild(t);
  });

  rows.forEach((row, r) => {
    const y = TOP + r * (LANE_H + LANE_GAP);
    // Leader label
    const lbl = svg("text", { x: 12, y: y + LANE_H / 2 + 4, class: "htimeline-leader-lbl" });
    lbl.textContent = row.leaderName;
    s.appendChild(lbl);

    row.stints.forEach((st) => {
      const ai = ages.indexOf(st.age);
      const x = LEFT + ai * colW;
      const seg = svg("rect", { x: x + 3, y, width: colW - 6, height: LANE_H, rx: 8,
        fill: st.color, class: "htimeline-seg" });
      // crest + civ name inside the segment
      const name = svg("text", { x: x + colW / 2, y: y + LANE_H / 2 + 4,
        "text-anchor": "middle", class: "htimeline-seg-lbl" });
      name.textContent = st.civName;

      // Hover → prose tooltip
      const onMove = (ev) => { tip.move(ev); };
      seg.addEventListener("mouseenter", (ev) => {
        tip.setHTML(stintTooltipHTML(row, st)); tip.show(); tip.move(ev);
      });
      seg.addEventListener("mousemove", onMove);
      seg.addEventListener("mouseleave", () => tip.hide());

      s.appendChild(seg); s.appendChild(name);
    });

    // morph notch between adjacent stints (visual "became")
    for (let i = 1; i < row.stints.length; i++) {
      const ai = ages.indexOf(row.stints[i].age);
      const x = LEFT + ai * colW + 3;
      s.appendChild(svg("polygon", { points: `${x-6},${y+LANE_H/2-7} ${x+4},${y+LANE_H/2} ${x-6},${y+LANE_H/2+7}`,
        class: "htimeline-morph" }));
    }

    if (row.eliminatedTurn != null) {
      const lastAi = ages.indexOf(row.stints[row.stints.length - 1].age);
      const x = LEFT + (lastAi + 1) * colW;
      s.appendChild(svg("text", { x: Math.min(x, W - RIGHT), y: y + LANE_H / 2 + 4,
        class: "htimeline-elim" })).textContent = "†";
    }
  });

  wrap.appendChild(s);
  host.appendChild(wrap);
}

function stintTooltipHTML(row, st) {
  // Prose: "Antiquity (turn 1–84). Napoleon led Rome." Phase 2 enriches with rank/wars.
  const ageName = loc("LOC_" + st.age + "_NAME", st.age.replace(/^AGE_/, ""));
  const turns = loc("LOC_HTIMELINE_TURN_RANGE", "turns {1_A}–{2_B}", st.firstTurn, st.lastTurn);
  return `<b>${esc(ageName)}</b> · ${esc(turns)}<br>` +
    `<span class="htimeline-tip-sw" style="background:${esc(st.color)}"></span>` +
    esc(loc("LOC_HTIMELINE_LED", "{1_Leader} led {2_Civ}", row.leaderName, st.civName));
}
```

CSS (`ui/styles/htimeline.css`, modeled on emigration's inline style strings):

```css
.htimeline-ribbon { font-family: inherit; }
.htimeline-age-hdr { fill:#c9a24c; font-size:15px; letter-spacing:.04em; text-transform:uppercase; }
.htimeline-leader-lbl { fill:#e5d2ac; font-size:14px; }
.htimeline-seg { stroke:rgba(0,0,0,.35); stroke-width:1; }
.htimeline-seg-lbl { fill:#0b0e14; font-size:13px; font-weight:600; pointer-events:none; }
.htimeline-morph { fill:#e5d2ac; opacity:.8; }
.htimeline-elim { fill:#c44; font-size:18px; }
```

---

## 5. Tooltip — `ui/timeline-tooltip.js`

Verbatim port of emigration's `makeTooltip()` (`emigration-network-interact.js:61-80`)
+ the `.emig-netc-tip` CSS (`emigration-network-viz.js:161-167`), renamed:

```js
import { el } from "/historical-timeline/ui/timeline-dom.js";

export function makeTooltip(wrap) {
  const tip = el("div", "htimeline-tip");
  wrap.appendChild(tip);
  return {
    setHTML: (h) => { tip.innerHTML = h; },
    show: () => { tip.style.display = "block"; },
    hide: () => { tip.style.display = "none"; },
    move: (ev) => {
      const r = wrap.getBoundingClientRect();
      tip.style.left = (ev.clientX - r.left) + "px";
      tip.style.top  = (ev.clientY - r.top) + "px";
    }
  };
}
```
```css
.htimeline-tip{position:absolute;pointer-events:none;background:rgba(8,10,16,.96);
  border:.0555rem solid rgba(201,162,76,.5);border-radius:.3rem;padding:.3rem .55rem;
  font-size:.9rem;color:#e5d2ac;z-index:60;transform:translate(-50%,-115%);display:none;}
.htimeline-tip-sw{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;
  margin-right:.3rem;vertical-align:middle;}
```

---

## 6. Hook into the panel

In `timeline-panel.js`, route the `ribbon` sub-tab to `renderRibbon` and ensure
capture is running:

```js
import { renderRibbon } from "/historical-timeline/ui/view-ribbon.js";
import { startLineageCapture } from "/historical-timeline/ui/timeline-capture.js";

let _captureStarted = false;
export function renderPanel(host, ctx, subId) {
  try {
    if (!_captureStarted) { startLineageCapture(); _captureStarted = true; }
    host.textContent = "";
    const sub = subId || "ribbon";
    if (sub === "ribbon") return renderRibbon(host);
    // chronicle/map handled in later phases
    renderRibbon(host);
  } catch (_) {}
}
```

> Capture should ideally start at **mod boot** (so history accrues even if the
> player never opens the tab). Move `startLineageCapture()` into
> `timeline-bootstrap.js`'s `boot()` for production; the panel-side guard above is
> a safety net.

---

## 7. Localization keys this phase

```
LOC_HTIMELINE_EMPTY, LOC_HTIMELINE_TURN_RANGE ("turns {1_A}–{2_B}")
LOC_HTIMELINE_LED   ("{1_Leader} led {2_Civ}")
```
(Civ/leader/age display names come from base-game LOC — no new keys needed.)

---

## 8. Verification

1. Start a fresh game, play through one age transition, reopen the tab → the
   leader who changed civ shows two colored segments with both civ names.
2. Save, quit to menu, reload → ribbon identical (persistence works).
3. Disable Demographics → standalone screen shows the same ribbon.
4. Install the mod **mid-game** (Exploration age) → current age captured
   immediately; prior age shows as unknown/absent (expected; documents the
   limitation honestly in the tooltip if a stint is missing).
