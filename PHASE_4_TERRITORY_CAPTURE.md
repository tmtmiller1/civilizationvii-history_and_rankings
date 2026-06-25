# Phase 4 — Real territory capture (optional)

**Goal.** Upgrade the Living Map from a force-layout abstraction to
**geographically truthful** blobs by capturing each civ's real territory centroid
(and optionally a coarse footprint) at low frequency. Strictly additive — the
base map never depends on it.

**Exit criteria.**
- A low-frequency, bounded territory snapshot is captured and persisted.
- When present, `view-map.js` positions blobs at real (normalized) map centroids
  instead of force-layout centers; when absent, it falls back to Phase 3 layout.
- No measurable per-turn cost regression (capture is throttled + sampled).

This phase is the only one that reads the actual game map, so it carries the most
build-version risk. Keep every read defensive and the feature behind a setting.

---

## 1. Why it's separate / optional

Stored *history* has no per-plot owner data (neither mod persists it). A literal
per-turn plot-ownership replay would be large and slow. So:

- The base experience (Phases 1–3) uses the **abstraction the brief asked for.**
- This phase adds *just enough* real geography — a centroid per civ per captured
  age/turn — to anchor blobs truthfully, at a fraction of the cost of full plot
  capture.

**Verified bonus — true footprints are feasible (optional upgrade).** The engine
*does* expose per-plot ownership at runtime:
`GameplayMap.getOwningCityFromXY(x, y)` → owning city's ComponentID
(`emigration-events.js:32-40`), with `GameplayMap.getPlotIndicesInRadius(x,y,r)`,
`GameplayMap.getLocationFromIndex(idx)` / `getIndexFromLocation({x,y})`
(`cinematic-tour-highlights.js:36-46`, `canals-test.js:445`), and
`GameplayMap.getRevealedState(pid,x,y)` for fog. So a coarse **footprint hull**
(sample plots on a stride, group by owning city → player, store a downsampled
ownership grid) is possible if centroids ever feel too abstract. Centroids stay
the default — cheaper and enough to anchor blobs — with the footprint as a future
opt-in. Capturing on a stride (e.g. every 2nd plot) and only on age boundaries
keeps even the footprint variant bounded.

---

## 2. Capture — `ui/territory-capture.js`

Throttled to once per N turns (default 5) and once per age transition. For each
alive major, average the (x, y) of its cities (cheap, stable proxy for territory
center); normalize to `[0,1]` against map dimensions so the renderer is
resolution-independent.

```js
import { readJSON, writeJSON } from "/historical-timeline/ui/timeline-store.js";
import { currentAgeType, gameTurn, aliveMajorIds } from "/historical-timeline/ui/timeline-runtime.js";

const KEY = "territory-v1";
const EVERY = 5;
let _mem = null;
function read() { return _mem || (_mem = readJSON(KEY, { version: 1, frames: [] })); }

export function maybeCaptureTerritory(force) {
  const turn = gameTurn();
  if (!force && turn % EVERY !== 0) return;
  const dim = mapDims(); if (!dim) return;
  const civs = [];
  for (const pid of aliveMajorIds()) {
    const c = cityCentroid(pid);
    if (c) civs.push({ pid: String(pid), x: c.x / dim.w, y: c.y / dim.h, n: c.n });
  }
  const h = read();
  h.frames.push({ turn, age: currentAgeType(), civs });
  if (h.frames.length > 400) h.frames.splice(1, 1);
  writeJSON(KEY, h);
}

function mapDims() {
  try {
    const w = GameplayMap?.getGridWidth?.(), h = GameplayMap?.getGridHeight?.();
    return (typeof w === "number" && typeof h === "number") ? { w, h } : null;
  } catch (_) { return null; }
}

function cityCentroid(pid) {
  try {
    const p = Players?.get?.(pid);
    const cities = p?.Cities?.getCities?.() || [];   // VERIFIED: returns city HANDLES (settlements-data.js:740-750)
    let sx = 0, sy = 0, n = 0;
    for (const c of cities) {
      const loc = c?.location; // VERIFIED: {x,y} plot coords (settlements-data.js:469-476)
      if (loc && typeof loc.x === "number" && typeof loc.y === "number") { sx += loc.x; sy += loc.y; n++; }
    }
    return n ? { x: sx / n, y: sy / n, n } : null;
  } catch (_) { return null; }
}
```

> **All map APIs are now VERIFIED** against shipping code, not guessed:
> `GameplayMap.getGridWidth()/getGridHeight()` (map dims), `city.location` →
> `{x,y}` (settlements-data.js:469-476), `player.Cities.getCities()` → city
> handles (settlements-data.js:740-750). Calls stay defensively wrapped so a
> build that renames one degrades to "no territory data" rather than breaking.

Hook `maybeCaptureTerritory()` into the existing sampler `onTurn`/`onAge`
(alongside the ledger + frame capture); it self-throttles.

---

## 3. Renderer integration

In `view-map.js`, prefer real centroids when available:

```js
function resolveLayout(frames, ctx) {
  const terr = readJSON("territory-v1", null);
  if (terr && terr.frames && terr.frames.length) {
    return { kind: "geo", terr };   // map normalized x,y → canvas WX,WY per frame
  }
  return { kind: "force", layout: seedLayout(frames.at(-1).civs) }; // Phase 3 fallback
}
```

For `kind:"geo"`, position each blob at `x*WX, y*WY` from the territory frame
nearest the scrubbed turn; keep the same `land`-driven radius and ledger-driven
color from Phase 3. Smoothly interpolate centroid positions between captured
frames for clean playback (reuse the easing helper).

---

## 4. Setting / guard

Expose a toggle (default **on** if the map APIs resolve, else silently off). If
you add a demographics-style options page, register it the same way; otherwise a
simple persisted boolean in `timeline-store.js` is enough. Log (don't silently
drop) when geo capture is unavailable so the fallback is observable.

---

## 5. Verification

1. With capture on, open Map → blobs sit roughly where each empire actually is on
   the real map; neighbors match the in-game world.
2. Disable capture (or run a build where map APIs differ) → map falls back to the
   Phase 3 force layout with no errors.
3. Confirm no per-turn cost regression: capture only fires every `EVERY` turns and
   on age changes; the territory blob stays bounded (≤400 frames).
4. Scrub/playback: centroids interpolate smoothly; recolor at age boundaries
   still works (color is independent of position).
