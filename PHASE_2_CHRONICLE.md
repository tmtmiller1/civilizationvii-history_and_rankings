# Phase 2 — Chronicle (prose narrative) + shared scrubber

**Goal.** Turn the captured data into a readable, localized story per civ, and
add the shared timeline scrubber that binds the views. This is the "narrative of
sorts" the brief asks for, and it enriches the Phase 1 ribbon tooltips with rank
and war context.

**Exit criteria.**
- A unified event stream (age changes, civ swaps, rank shifts, wars, wonders,
  eliminations) is derived from captured data.
- The **Chronicle** sub-tab renders per-leader prose built from localized
  templates (no concatenated English).
- A shared scrubber sits above all views; moving it moves the ribbon playhead and
  scrolls/marks the chronicle.

Depends on Phase 1. Uses the lightweight self-capture from `timeline-history.js`
(introduced here; reused by Phase 3) for the non-lineage signals (score/land).

---

## 1. Lightweight self-capture — `ui/timeline-history.js`

The ledger covers civ-per-age. The chronicle also wants **score** (for rank
trajectory) and **land/settlements** (for "expansion" beats). When Demographics
is present we read its `samples[]` via the resolver (§G); standalone we capture a
compact frame ourselves on the same sampler tick.

```js
import { readJSON, writeJSON } from "/historical-timeline/ui/timeline-store.js";
import { currentAgeType, gameTurn, aliveMajorIds } from "/historical-timeline/ui/timeline-runtime.js";

const KEY = "history-v1";
const CAP = 600;              // decimate beyond this (merge oldest adjacent pairs)
let _mem = null;

function read() { return _mem || (_mem = readJSON(KEY, { version: 1, frames: [] })); }

/** One compact frame: { turn, age, players:{ pid:{ score, land, settlements } } } */
export function captureFrame() {
  const h = read();
  const turn = gameTurn(), age = currentAgeType();
  const players = {};
  for (const pid of aliveMajorIds()) {
    const p = safePlayer(pid);
    const tech = treeCount(p, "tech"), civic = treeCount(p, "culture");
    const tiles = tilesOwned(p);                          // see reference §K (verified)
    const settlements = cityCount(p);
    const gold = num(() => p?.Treasury?.getGoldBalance?.());
    players[String(pid)] = {
      // Score: no cumulative engine score — use the demographics heuristic (reference §K).
      score: scoreOf(p, { techsCount: tech, civicsCount: civic, settlementsCount: settlements, gold }),
      land: tiles,
      settlements,
      pop: num(() => p?.Stats?.totalPopulation)
    };
  }
  h.frames.push({ turn, age, players });
  if (h.frames.length > CAP) decimate(h);
  writeJSON(KEY, h);
}

// ---- verified accessors (reference §K) ----
function scoreOf(p, ctx) {
  const heuristic = (ctx.techsCount|0) + (ctx.civicsCount|0) + 2*(ctx.settlementsCount|0) + Math.floor((ctx.gold|0)/100);
  try { const s = p?.Stats; if (s && typeof s.getScore === "function") { const v = s.getScore(); if (typeof v === "number" && v >= heuristic) return v; } } catch (_) {}
  return heuristic;
}
function tilesOwned(p) {
  try {
    const list = p?.Cities?.getCities?.(); if (!Array.isArray(list)) return 0;
    let t = 0;
    for (const c of list) { try { const pl = c?.getPurchasedPlots?.(); if (pl && typeof pl.length === "number") t += pl.length; } catch (_) {} }
    return t;
  } catch (_) { return 0; }
}
function cityCount(p) { try { const l = p?.Cities?.getCities?.(); return Array.isArray(l) ? l.length : 0; } catch (_) { return 0; } }
function treeCount(_p, _kind) { return 0; /* optional: count fully-unlocked nodes via Game.ProgressionTrees.getTree(pid, treeType); 0 is a safe floor for scoring */ }

function decimate(h) {
  // merge oldest adjacent pair, preserving age boundaries (emigration mergeAdjacentDeltas idea)
  const f = h.frames;
  for (let i = 1; i < f.length - 1; i++) {
    if (f[i].age === f[i - 1].age) { f.splice(i, 1); return; }
  }
  f.splice(1, 1);
}

function safePlayer(pid){ try { return Players?.get?.(pid); } catch(_){ return null; } }
function num(fn){ try { const v = fn(); return typeof v === "number" ? v : 0; } catch(_){ return 0; } }
```

> Accessors above are **verified** against the production demographics sampler
> (reference §K): score has no cumulative engine value (heuristic =
> `techs + civics + 2·settlements + gold/100`); land = summed
> `city.getPurchasedPlots().length`; settlements = `Cities.getCities().length`;
> population = `Stats.totalPopulation`. In integrated mode we skip this capture
> entirely and read `samples[]` (score/land already there). `treeCount` is left
> at 0 (a safe scoring floor); wire it to `Game.ProgressionTrees.getTree(pid,
> treeType)` node counts if you want the heuristic to track tech/civic progress.

Add `captureFrame()` to the sampler `onTurn` alongside `captureNow()` (only in
standalone mode — gate on `demographicsPresent()`).

---

## 2. Event unification — `ui/timeline-events.js`

Produces a flat, sorted event list per player and globally. Sources: the ledger
(age/civ changes, eliminations) + the frame history (rank crossings, expansion).
Wars/wonders are added if available from Demographics (`history.eliminated`,
war-event tracker) or skipped gracefully.

```js
import { buildLineageRows } from "/historical-timeline/ui/lineage-read.js";
import { resolveSource } from "/historical-timeline/ui/timeline-source.js";

/** @typedef {{turn:number, pid:string, type:string, data:object}} TLEvent */

export function buildEvents(ctx) {
  const src = resolveSource(ctx);
  const rows = buildLineageRows();
  /** @type {TLEvent[]} */ const ev = [];

  for (const row of rows) {
    row.stints.forEach((st, i) => {
      ev.push({ turn: st.firstTurn, pid: row.pid,
        type: i === 0 ? "born" : "civ_change",
        data: { age: st.age, civ: st.civ, civName: st.civName,
                prevCiv: i ? row.stints[i-1].civName : null, leader: row.leaderName } });
    });
    if (row.eliminatedTurn != null)
      ev.push({ turn: row.eliminatedTurn, pid: row.pid, type: "eliminated", data: { leader: row.leaderName } });
  }

  // Rank crossings from frame history (score-ordered per frame)
  addRankShifts(ev, src.frames);

  ev.sort((a, b) => a.turn - b.turn);
  return ev;
}

function addRankShifts(ev, frames) {
  let prevRank = {};
  for (const f of frames) {
    const players = f.players || {};
    const ranked = Object.keys(players)
      .map((pid) => [pid, players[pid].score || 0])
      .sort((a, b) => b[1] - a[1]);
    ranked.forEach(([pid], idx) => {
      const rank = idx + 1, was = prevRank[pid];
      if (was != null && rank === 1 && was !== 1)
        ev.push({ turn: f.turn, pid, type: "took_lead", data: { rank } });
      prevRank[pid] = rank;
    });
  }
}
```

---

## 3. Narrative templates — `ui/chronicle-narrate.js`

Each event → one localized sentence via `Locale.compose` parameters. **No string
concatenation of translatable fragments** — the whole sentence is one LOC key
with positional params, so translators control word order.

```js
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

const TEMPLATES = {
  born:        (d) => loc("LOC_HTIMELINE_NARR_BORN",
                  "In the {1_Age}, {2_Leader} forged the {3_Civ} people.", ageName(d.age), d.leader, d.civName),
  civ_change:  (d) => loc("LOC_HTIMELINE_NARR_CHANGE",
                  "At the dawn of the {1_Age}, the people remade themselves from {2_Prev} into {3_Civ}.",
                  ageName(d.age), d.prevCiv, d.civName),
  took_lead:   (_d) => loc("LOC_HTIMELINE_NARR_LEAD",
                  "They rose to first among the world's powers."),
  eliminated:  (d) => loc("LOC_HTIMELINE_NARR_END",
                  "{1_Leader}'s line passed from history.", d.leader)
};

function ageName(age) { return loc("LOC_" + age + "_NAME", String(age).replace(/^AGE_/, "")); }

export function narrateEvent(ev) {
  const f = TEMPLATES[ev.type];
  return f ? f(ev.data) : "";
}

/** Group events by player into prose paragraphs (chronological). */
export function narrateByPlayer(events) {
  const byPid = {};
  for (const ev of events) (byPid[ev.pid] ||= []).push(ev);
  const out = [];
  for (const pid in byPid) {
    const sentences = byPid[pid].map(narrateEvent).filter(Boolean);
    out.push({ pid, sentences, events: byPid[pid] });
  }
  return out;
}
```

---

## 4. Chronicle view — `ui/view-chronicle.js` (DOM)

Per-leader cards; each card is a paragraph of generated prose with the civ-color
accents from the ribbon, and an inline mini-rail of clickable event dots that
drive the shared scrubber.

```js
import { el, esc } from "/historical-timeline/ui/timeline-dom.js";
import { buildEvents } from "/historical-timeline/ui/timeline-events.js";
import { narrateByPlayer } from "/historical-timeline/ui/chronicle-narrate.js";
import { buildLineageRows } from "/historical-timeline/ui/lineage-read.js";

export function renderChronicle(host, ctx, scrubber) {
  host.textContent = "";
  const rows = buildLineageRows();
  const nameByPid = Object.fromEntries(rows.map((r) => [r.pid, r.leaderName]));
  const colorByPid = Object.fromEntries(rows.map((r) => [r.pid, r.stints.at(-1)?.color || "#888"]));
  const stories = narrateByPlayer(buildEvents(ctx));

  const wrap = el("div", "htimeline-chronicle");
  for (const story of stories) {
    const card = el("div", "htimeline-chron-card");
    card.style.borderLeft = `4px solid ${colorByPid[story.pid] || "#888"}`;
    card.appendChild(el("div", "htimeline-chron-name", nameByPid[story.pid] || ("#" + story.pid)));
    const p = el("div", "htimeline-chron-prose");
    p.innerHTML = story.sentences.map(esc).join(" ");
    card.appendChild(p);
    // clickable event dots
    const rail = el("div", "htimeline-chron-rail");
    for (const evn of story.events) {
      const dot = el("span", "htimeline-chron-dot");
      dot.title = String(evn.turn);
      dot.addEventListener("click", () => scrubber && scrubber.goToTurn(evn.turn));
      rail.appendChild(dot);
    }
    card.appendChild(rail);
    wrap.appendChild(card);
  }
  host.appendChild(wrap);
}
```

---

## 5. Shared scrubber — `ui/timeline-scrubber.js`

Port of emigration's `makeTimeline()` / `makeRangeInput()` / play-pause / speed
chips (`emigration-network-timeline.js:64-241`), generalized to broadcast a
"current turn" to subscribers (ribbon playhead, map frame, chronicle highlight).

```js
import { el } from "/historical-timeline/ui/timeline-dom.js";
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

const SPEEDS = [["0.5×", 0.5], ["1×", 1], ["2×", 2], ["4×", 4]];

export function makeScrubber(turns /* sorted unique turn list */, onSet) {
  const pb = { playing: false, idx: turns.length - 1, speedMul: 1 };
  const root = el("div", "htimeline-time");
  const btn = el("div", "htimeline-play", "▶");
  const input = document.createElement("input");
  input.type = "range"; input.min = "0"; input.max = String(turns.length - 1);
  input.value = String(pb.idx);
  const lbl = el("div", "htimeline-time-lbl");

  const setLabel = (i) => { lbl.textContent = loc("LOC_HTIMELINE_TURN_N", "turn {1_T}", turns[i]); };
  const goTo = (i) => { pb.idx = i; input.value = String(i); setLabel(i); onSet(turns[i], i); };
  const setPlaying = (p) => { pb.playing = p; btn.textContent = p ? "⏸" : "▶"; };

  btn.addEventListener("click", () => {
    if (!pb.playing && pb.idx >= turns.length - 1) goTo(0);
    setPlaying(!pb.playing);
  });
  input.addEventListener("input", () => { setPlaying(false); goTo(parseInt(input.value, 10)); });

  // playback loop (PLAY_INTERVAL/ANIM_STEP idea from emigration-network-viz.js:575-597)
  let tick = 0;
  const PLAY_INTERVAL = 42;
  const loop = () => {
    if (pb.playing) {
      tick += pb.speedMul;
      if (tick >= PLAY_INTERVAL) { tick = 0; if (pb.idx < turns.length - 1) goTo(pb.idx + 1); else setPlaying(false); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  root.appendChild(btn); root.appendChild(input); root.appendChild(lbl);
  setLabel(pb.idx);

  return {
    root,
    goToTurn: (turn) => { const i = nearest(turns, turn); goTo(i); },
    onSet // subscribers register via the onSet passed in
  };
}

function nearest(turns, t) {
  let best = 0, bd = Infinity;
  turns.forEach((v, i) => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = i; } });
  return best;
}
```

Panel wiring: build the unified turn list from the ledger + frames, create one
scrubber, and pass it to each view so they share the playhead.

---

## 6. Enrich the Phase-1 ribbon tooltip

Now that events exist, upgrade `stintTooltipHTML` (Phase 1 §4) to append rank +
war counts for that age stint by filtering `buildEvents(ctx)` to the stint's
`[firstTurn, lastTurn]` window. Keep the prose one localized template per fact.

---

## 7. Localization keys this phase

```
LOC_HTIMELINE_NARR_BORN, _NARR_CHANGE, _NARR_LEAD, _NARR_END
LOC_HTIMELINE_TURN_N ("turn {1_T}")
(+ any new beats you add: wars, wonders, expansion)
```
All four narrative templates use positional params so translators reorder freely.

---

## 8. Verification

1. Play through two age transitions → chronicle shows a "born → remade into …"
   paragraph per leader; sentences localized (switch game language to verify a
   non-en locale renders, not raw `LOC_` keys).
2. Drag the scrubber → ribbon playhead and chronicle highlight track together.
3. Click an event dot in a chronicle card → scrubber jumps to that turn.
4. Standalone mode: confirm `timeline-history.js` self-capture populates rank
   shifts (since `samples[]` is absent).
