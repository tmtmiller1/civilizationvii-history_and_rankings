# Historical Timeline — Design

> **Document set.** This file is the overview/rationale. Implementation detail is split across:
> - `00_IMPLEMENTATION_REFERENCE.md` — verified runtime APIs, persistence, handshake, modinfo, release (the shared appendix every phase cites).
> - `PHASE_0_SCAFFOLD.md` — the standalone-mod skeleton (modinfo, bootstrap dual-mode, dock + screen, empty tab in both modes).
> - `PHASE_1_LEDGER_AND_RIBBON.md` — the hero feature: lineage ledger + SVG ribbon (delivers the whole wish on its own).
> - `PHASE_2_CHRONICLE.md` — event unification + prose narrative + shared scrubber.
> - `PHASE_3_LIVING_MAP.md` — abstract canvas map + self-capture history fallback.
> - `PHASE_4_TERRITORY_CAPTURE.md` — optional real map-centroid capture.
>
> **Data-ownership correction (verified during code extraction):** Emigration's companion panel renders from data it captures *itself* (`gatherDashboard()`), not from Demographics' `samples[]`. So Historical Timeline likewise **owns its own capture in both modes** — Demographics integration is only about *where the tab mounts*, never the data source. The views opportunistically read `ctx.history` if Demographics happens to expose it, but never depend on it (`timeline-source.js` resolves this).


A new top-level tab in the demographics screen that tells the story of every
civilization across the game's ages: who each leader *was* in each age, how
their empire spread, and a generated prose narrative of the whole game.

Directly fulfills the community suggestion: *"Show some indication in the UI to
what civ the AI / other players were in previous ages."* (e.g. remembering that
Machiavelli of Spain was Greece in Antiquity, or what Napoleon of Iceland played
before).

---

## The key feasibility finding

**The game keeps no record of a player's past-age civilizations — but the
demographics mod already does, almost by accident.** Every per-turn `Snapshot`
it writes to the `DemoHistory` blob already stamps `age` plus a per-player
`{ leader, civ }` map (keyed by player ID, which is stable across age
transitions while `civilizationType` changes). So the raw material for "what was
Machiavelli in Antiquity" is *already being persisted* across saves and age
transitions. We don't need new game hooks to answer the wish — we need a reader
and a renderer.

One caveat the design works around: `samples[]` is decimated to ~500 entries, so
the *exact* turn a civ first appeared can get thinned out of early ages. So the
design adds one tiny authoritative side-ledger rather than trusting the
decimated stream for lineage.

---

## 1. What it is

A new top-level tab titled **"Historical Timeline"** presenting three linked,
animated views sharing one timeline scrubber:

1. **The Lineage Ribbon** *(hero view)* — one horizontal swimlane per leader,
   flowing left→right across Antiquity → Exploration → Modern. Each ribbon
   visibly *changes identity* (color, crest, name) at every age boundary, so you
   read "Napoleon: Rome → Iceland → …" at a glance. This is the direct answer to
   the request.
2. **The Living Map** — an abstracted world; each civ is a territory blob that
   grows/shrinks over scrubbed time and **recolors at age transitions** to show
   the civ swap. Play it back to watch empires spread.
3. **The Chronicle** — auto-generated prose narrative per civ, woven from the
   same data ("In Antiquity, Napoleon forged the Roman state…"). The "narrative
   of sorts."

Prose tooltips everywhere; everything driven by the existing persisted history.

---

## 2. Integration approach (decided)

Ship it the way Emigration ships: a **companion panel registered via
`DemographicsMetricsAPI.registerPanel({ topLevel: true })`**, not edits to
demographics core. This is the established, proven seam
(`demographics/ui/metrics/demographics-metrics.js:667`, `EXTERNAL_PANELS` +
`_topLevelPanelTabs()` at
`demographics/ui/screen-demographics/screen/screen-demographics.js:435`). It
gives the tab full-screen real estate, keeps the feature decoupled and
independently shippable, and matches the "readable JS, transparent source"
release norm.

The panel's `render(host, ctx)` receives `ctx.history` (the full `DemoHistory`
blob), which is all three views need.

### 2a. Standalone operation (ships as its own mod, like Emigration)

Historical Timeline is built as a **self-contained, independently installable
mod** — its own `.modinfo`, its own folder, its own Steam item — exactly the way
Emigration is a standalone mod that *also* enriches Demographics when both are
present. It must never hard-depend on Demographics being installed.

Two runtime modes, decided by a presence check at bootstrap (probe for
`DemographicsMetricsAPI` / `registerPanel`, the same handshake Emigration uses —
see the Demographics↔Emigration integration notes):

- **Integrated mode (Demographics present):** register the "Historical Timeline"
  tab via `registerPanel({ topLevel: true })` and render inside the demographics
  screen, sharing its `ctx.history` blob. This is the primary, richest experience.
- **Standalone mode (Demographics absent):** mount the same three views in the
  mod's **own minimal screen** — its own dock/HUD button and a bare host shell —
  with the identical `timeline-panel.js` render entry. The only thing Demographics
  provides that we lose is `samples[]`; standalone mode falls back to the data the
  mod captures itself (see below).

**Data independence is the crux.** In integrated mode the derived views read
`DemoHistory.samples[]`. Standalone, that blob doesn't exist, so the mod must own
enough capture to stand on its own:

- The **lineage ledger (§3a) is already self-owned** — it's our own
  GameConfiguration key, captured by our own sampler hook, so the *hero feature
  (Ribbon + who-was-who) works fully standalone with zero dependence on
  Demographics.*
- For the Map and Chronicle, add a **lightweight self-capture fallback**: a
  compact per-turn snapshot of just the fields those views need (`land`,
  `settlementsCount`, `score`, plus the war/wonder/elimination event stream we
  already unify in `timeline-events.js`), written to our own
  `htimeline-history-v1` key. When Demographics *is* present we prefer its richer
  `samples[]` and skip our own capture to avoid double work.

This means a single shared core (`timeline-panel.js` + the three view modules +
the ledger) drives both modes; only the **data source** and the **mount point**
differ. The bootstrap picks the mode; everything downstream is identical.

---

## 3. Data model

### 3a. Lineage ledger (the one new piece of capture)

A dedicated, decimation-proof record. Recorded by a tiny sampler hook on
`PlayerTurnActivated` and, critically, on `PlayerAgeChanged` /
`PlayerAgeTransitionComplete`:

```
LineageLedger {
  version: 1,
  seed,
  players: {
    [pid]: {
      leader: "LEADER_NAPOLEON",
      ages: {
        "AGE_ANTIQUITY":   { civ: "CIVILIZATION_ROME",    firstTurn, lastTurn },
        "AGE_EXPLORATION": { civ: "CIVILIZATION_ICELAND", firstTurn, lastTurn },
        ...
      },
      eliminatedTurn?: number
    }
  }
}
```

Persisted to its **own** GameConfiguration key (`htimeline-lineage-v1`) via
`Configuration.editGame().setValue(...)` — the exact pattern proven in
`emigration/ui/emigration-migration-stats.js:104`. It's a few hundred bytes,
never decimated, so the lineage is always exact even when `samples[]` has been
thinned. APIs confirmed live: `Players.get(pid).civilizationType` / `.leaderType`,
`Game.age` → `GameInfo.Ages.lookup`.

### 3b. Everything else is derived (no new capture)

All other views read the existing `DemoHistory.samples[]`:

- **Empire spread / size** → existing `land` + `settlementsCount` per player per turn.
- **Rank trajectory** (for prose) → existing `score`.
- **Wars / wonders / crises / eliminations** → already tracked by
  `sampler-war-events.js`, the chart-line wonder/crisis event plugins, and
  `history.eliminated`.
- **Age boundaries** → existing `history.ageBoundaries[]`.

So the feature is overwhelmingly a *reader*, which keeps the per-turn cost near
zero and the save-size impact trivial.

---

## 4. The three views

### 4a. Lineage Ribbon (SVG)

Rendered as SVG (matching the Gantt/radar precedent in `charts/conflicts` and
`charts/triumphs`), not canvas — it's static-ish, label-dense, and benefits from
crisp text and easy hit-testing.

- One lane per **leader** (stable identity), sorted by current power or alive-first.
- Each lane = a ribbon segmented at age boundaries. Segment fill = that age's
  **civ color**; a civ **crest/symbol** and civ name sit on each segment; a
  stylized "morph" notch sits on the boundary to signal the change.
- Living players' ribbons run to the present; eliminated players' ribbons end
  with a frayed cap at `eliminatedTurn`.
- **Hover a segment → prose tooltip**: *"Antiquity (Turn 1–84). Napoleon led
  **Rome**, a militarist power that peaked at #2 by score and fought 2 wars."*
  Built from lineage + score trajectory + war counts. Tooltip mechanism reuses
  emigration's `makeTooltip()` pattern
  (`emigration/ui/emigration-network-interact.js:61`) with HTML + color swatches.
- This view alone fully satisfies the original suggestion — open the tab, read
  every opponent's full civ history including your own.

### 4b. Living Map (2D canvas)

Reuses Emigration's canvas + force-layout + playback machinery wholesale
(`emigration/ui/emigration-network-viz.js`, `makeTimeline()` at
`emigration/ui/emigration-network-timeline.js:206`, `advanceAnims()` playback).

- **Abstraction, not literal geography** (which is what the brief asks for, and
  honest about the data: stored history has no per-plot owners). Each civ is a
  blob whose **area scales to `land`** at the scrubbed turn, positioned by a
  stable seeded force layout so neighbors stay neighbors. Diplomacy adjacency
  nudges rivals apart.
- As the scrubber crosses an **age boundary, blobs recolor and re-crest** to the
  new civ — you literally watch Rome become Iceland.
- Play button replays the empire's spread/contraction over the whole game; speed
  chips (0.5×–4×) reused from emigration.
- Hover a blob → prose tooltip naming the civ *at that moment in time*, its size
  rank, and recent events.
- *Optional enhancement (Phase 4):* add a low-frequency real territory-centroid
  capture (one cheap pass every N turns) to position blobs at true map locations
  instead of force-layout. Designed as additive so the base feature never depends
  on it.

### 4c. Chronicle (DOM prose)

A scrollable, per-civ generated narrative — the storytelling layer.

- Template-driven sentence generation from structured events, composed through
  `Locale.compose` with parameters so it's fully localizable (no concatenated
  English). Event types: age transition / civ change, rank rises and falls (from
  `score`), wars (attacker/defender, outcome), wonders built, crises endured,
  eliminations and conquests.
- Reads like: *"Born in Antiquity as **Rome** under Napoleon… At the dawn of
  Exploration the people remade themselves as **Iceland**, turning from the
  legions to the sea… By the Modern age, having outlasted Greece, they stood
  second among the world's powers."*
- A compact **timeline rail** at the top doubles as the shared scrubber; clicking
  an event scrolls the prose and moves the map/ribbon to that turn.

### 4d. Shared scrubber

One timeline control binds all three views (ribbon playhead, map frame,
chronicle scroll position) so scrubbing is coherent. Built on emigration's
range-input + play/pause + age-tick overlay.

---

## 5. File layout

Ships as its **own standalone mod** (its own `.modinfo` + folder + Steam item),
mirroring Emigration's tight module decomposition. The shared core drives both
integrated and standalone modes:

```
historical-timeline/
  historical-timeline.modinfo    # own mod manifest; globs the JS/XML below
  ui/
    timeline-bootstrap.js        # probe DemographicsMetricsAPI → integrated vs standalone mode
    timeline-screen.js           # standalone-only: own dock/HUD button + bare host shell
    timeline-panel.js            # shared render(host, ctx): tab chrome + view switch + shared scrubber
    lineage-ledger.js            # self-owned capture + GameConfiguration KV (works in BOTH modes)
    lineage-read.js              # derive per-player age→civ lineage (ledger first, samples[] fallback)
    timeline-history.js          # standalone self-capture fallback (htimeline-history-v1 key)
    timeline-source.js           # data-source resolver: Demographics samples[] vs self-captured
    view-ribbon.js               # SVG lineage ribbon
    view-map.js                  # canvas living map (wraps emigration network-viz primitives)
    view-chronicle.js            # DOM prose narrative
    chronicle-narrate.js         # event extraction → localized sentence templates
    timeline-tooltip.js          # shared prose tooltip (from emigration pattern)
    timeline-events.js           # unify wars/wonders/crises/eliminations/age-changes into one event stream
  text/<9 locales>/ModText.xml   # LOC_HTIMELINE_* keys
```

`timeline-source.js` is the seam that lets one set of view modules feed from
either Demographics' `samples[]` (integrated) or our own `timeline-history.js`
capture (standalone) without the views knowing the difference.

---

## 6. Localization

Keys live under the mod's own `LOC_HTIMELINE_*` namespace (not
`LOC_DEMOGRAPHICS_*`) since it's a standalone mod — `LOC_HTIMELINE_TAB`,
tooltips, and the parameterized chronicle sentence templates — added to **all 9
locales** per the standing rule, en_us `<Row>` as base and `<Replace
Language=…>` for the rest. Civ/leader display names come from the game's own
`GameInfo.Civilizations` / `GameInfo.Leaders` LOC, so we inherit those
translations for free; only our narrative connective tissue needs authoring. New
text requires a game relaunch to load.

---

## 7. Build / install / ship

Its **own** release pipeline modeled on demographics/emigration `release.sh`
(readable JS, no minify, DBG-disabled, allow-list audit), producing
`dist/historical-timeline` copied to the Civ7 Mods dir to test, then steamcmd to
its **own new Steam Workshop item** (to be created — not the demographics item
3737200066). The mod self-registers at runtime: in integrated mode it calls
`registerPanel` into Demographics; in standalone mode it mounts its own screen —
no edits to the demographics package either way.

Recommended: ship and test it **standalone first** (proves the self-capture path
and the hero Ribbon feature in isolation), then verify integrated mode with
Demographics installed.

---

## 8. Suggested phasing

1. **Lineage ledger + Ribbon view** — delivers the entire original wish
   (who-was-who across ages) on its own. Shippable alone.
2. **Chronicle prose** — the narrative layer.
3. **Living Map** (abstract/force-layout) — the spectacle.
4. *(Optional)* real territory-centroid capture for geographically-true map
   positions.

---

## Foundations this rests on (verified during exploration)

- The `registerPanel({ topLevel: true })` companion seam (proven by Emigration).
- The already-persisted per-turn `{ age, leader, civ }` data in every `Snapshot`.
- Emigration's reusable canvas / timeline-scrubber / tooltip toolkit.

So most of the build is assembly plus the one small lineage ledger, not new
engine integration.
