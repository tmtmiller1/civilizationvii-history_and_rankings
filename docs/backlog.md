# Backlog

Deferred work items, with enough context to pick up cold.

## BL-1 — Cross-game archive can read empty at the main menu on heavily-modded setups

**Status:** deferred (not fixed in 1.1.2). Not code-fixable within this mod as of
Civ VII 1.4.x; needs either a platform storage API that does not currently appear
to exist, or a mitigation that reduces total localStorage key pressure.

### Symptom
The main-menu **History & Rankings** screen shows "No past games yet…" even after
finishing (or saving + exiting) games, when several other mods are also installed.
Reducing the number of installed mods (or clearing localStorage down to a single
key) makes the archive read correctly again.

### Root cause (confirmed)
Civ VII's UI runs on Gameface, whose `localStorage` implementation **returns the
wrong key's value once enough keys exist across ALL installed mods.** It is driven
by the *total* localStorage key count across every mod, not just ours, so a single
mod cannot fix it by consolidating its own keys.

Evidence gathered during diagnosis (2026-07-10):
- On disk (`~/Library/Application Support/Civilization VII/LocalStorage.sqlite`,
  table `"Values"(id, key, value)`, all rows under `id = fs://game`), our `htlData`
  key correctly contained the in-progress game (`archive.games` length 1).
- From the **shell** context, `localStorage.getItem("htlData")` returned a *different
  mod's* value (byte-for-byte the `cultural-diffusion-probe` flip blob), not ours.
- `localStorage.key(i)` returned `""` for every index — key enumeration is broken too.
- After pruning localStorage to a single key, `getItem("htlData")` returned the
  correct 3224-byte value and the rankings board rendered. This isolates the cause
  to key **count**, not our data.

### Why the obvious fixes do not work
- **`Configuration.getUser()/editUser()`** is NOT a general key/value store. It is a
  fixed typed-settings object (`tutorialLevel`, `uiFontScale`, `setLockedValue`, …)
  with no generic `getValue/setValue` for arbitrary blobs. An attempt to
  `editUser().setValue(key, json)` returns falsey / no-ops (verified in-game:
  `HTL-SAVE userOk=false`). So the archive cannot live there.
- **`Configuration.getGame().getValue/setValue`** IS a generic KV store, but it is
  game-scoped — unavailable at the main menu, which is exactly where the archive
  needs to be read. (This is what the in-game capture already uses.)
- **localStorage** is the only writable store that spans game↔menu, and it is the
  one that scrambles.

### Candidate directions (unverified)
1. **Find a file-/Modding-based persistence API.** Investigate whether any
   `Modding.*` surface, `ModUserData`, or save-adjacent API lets a UI mod write a
   small blob that the shell can read. Not found during the initial pass; may not
   exist.
2. **Signature + dedicated key + no read-modify-write.** Store the archive under its
   own signed key and reject any read whose signature does not match (so a scrambled
   read fails cleanly and never corrupts our data by merge). This does NOT restore
   the read on heavily-modded setups — it only fails gracefully — so it is hardening,
   not a cure. (Prototyped and reverted in 1.1.2 to avoid an existing-data migration
   for no functional gain.)
3. **Reduce key pressure.** Document that dev-probe mods which write localStorage
   every tick (e.g. `cultural-diffusion-probe`, 3 keys) are the primary offenders and
   should be disabled during normal play. Real end-users with a normal mod set stay
   under the threshold — which is why earlier working screenshots existed.

### Notes
- Nothing is lost: finished games are still written; only the menu's read-back is
  affected, and only under high key pressure.
- The in-game companion/dock view reads live game state and is unaffected.
- See also the shared gotcha note in the user's Civ VII UI memory (localStorage
  multi-key scramble; no generic user-config KV store).

## BL-2 — Game-id fallback chain still ends in `startPosition` / `"unknown"`

**Status:** deferred, benign (surfaced by the 2026-07-10 corpus persistence-key audit;
not fixed). Safe to change but no observable benefit — documented rather than fixed.

### Item
`seedOf()` ([ui/timeline-runtime.js:75](../ui/timeline-runtime.js)) resolves the per-game
archive id as `gameSeed ?? mapSeed ?? startPosition ?? "unknown"`. The `startPosition`
fallback is a known-bad value — it is NOT unique across games (it was the original
archive-collision bug, per the comment at that line) — and `"unknown"` is a shared
constant. If both `gameSeed` and `mapSeed` ever resolved null at ledger creation, two
games could freeze the same `lineage-v1.seed` and collide onto one archive entry
(`appendGame` / `saveGameMap` would dedupe or overwrite one with the other).

### Why it's benign / not fixed
- `seedOf()` is called exactly once, at ledger creation
  ([ui/lineage-ledger.js:19](../ui/lineage-ledger.js)), and the result is frozen into the
  persisted ledger; every later read uses the frozen value (`recap.id` reads it back at
  [ui/timeline-recap.js:15](../ui/timeline-recap.js), it does not recompute). Existing
  saves are therefore unaffected by any change here.
- The `startPosition` branch is only reachable if `gameSeed` AND `mapSeed` are both null
  at ledger creation, which does not occur in a normally-loaded game.

### If we ever do it
Drop `startPosition` and make the terminal fallback session-unique instead of a shared
constant, e.g. `g?.gameSeed ?? g?.mapSeed ?? Math.floor(Date.now() / 1000)` — already the
fallback `recap.js:15` uses, so it stays consistent. Change affects only NEW ledgers; no
data migration needed.

## BL-3 — Elimination is never recorded; all defeat-aware features are dead code

**Status:** open (surfaced by the 2026-07-10 corpus bug-hunt audit). **[Medium-High ·
Confirmed]**

`markEliminated` ([ui/lineage-ledger.js:59](../ui/lineage-ledger.js)) has **zero callers**
(grep-confirmed), and no `PlayerDefeat`/elimination engine listener is subscribed anywhere —
only `PlayerTurnActivated` + `PlayerAgeTransitionComplete`
([ui/timeline-sampler.js:18-19](../ui/timeline-sampler.js)). So `eliminatedTurn` is never
populated, and everything keyed off it silently never fires: the frayed "†" cap on eliminated
lanes (`view-ribbon.js:51`), the `"Eliminated T{n} as {civ}"` verdict
(`archive-format.js:39-41`), the eliminated chronicle narration (`chronicle-narrate.js:17`,
`timeline-events.js:22`), and the eliminated→"completed" status path (`archive-model.js:26`,
`timeline-recap.js:104`).

**Failure scenario:** the local player is conquered in Exploration → the run is classified
`in_progress` forever, so a finished/lost game shows the **"In Progress"** badge in the
archive/rankings and never earns a verdict; a dead rival still renders as a normal live lane
with no dagger and a frozen score.

**Fix:** subscribe to the player-defeat/kill engine event in `installRecapFlush`/sampler and
call `markEliminated(pid)`, or derive elimination from a pid dropping out of `aliveMajorIds()`
between captures.

**Design:** use **fallback derivation** (event-agnostic and robust) — no player-defeat engine
event is subscribed anywhere in this mod and none was found, so don't guess an event name.
In `captureNow` (`ui/lineage-ledger.js:45-56`), after folding the currently-alive players,
compute the pids that are present in `led.players` with recorded age stints and
`eliminatedTurn == null` but are **absent** from the current `aliveMajorIds()` set, and call
`markEliminated(pid)` (`:58`, already idempotent, stamps `gameTurn()`) for each:
```js
const alive = new Set(aliveMajorIds());
for (const pid of Object.keys(led.players)) {
  const p = led.players[pid];
  if (p && p.eliminatedTurn == null && p.everSeen && !alive.has(Number(pid))) {
    markEliminated(Number(pid));
  }
}
```
Guards: only consider pids that appeared in a **prior** capture (track an `everSeen`/first-seen
flag on the player record so a not-yet-met player isn't marked); and confirm a defeated major
truly drops out of `aliveMajorIds()` rather than merely transitioning — the sampler already
distinguishes `PlayerAgeTransitionComplete` (`timeline-sampler.js:19`), so run the derivation
on `onTurn`, not on the age-transition capture, to avoid a transient mid-transition read.
This flows straight into the existing `eliminatedTurn` consumers (verdict `archive-format.js:39`,
dagger `view-ribbon.js:51`, chronicle `chronicle-narrate.js:17`, `classifyRecap` → defeat/
completed `timeline-recap.js:104`). Optional enhancement if a real defeat event is later
confirmed: extend `startSampler` (`timeline-sampler.js:12`) to `{onTurn, onAge, onDefeat}` with
the same `safe()`/kill-switch discipline and call `markEliminated(data.player)` directly.
**Verify:** get the local player conquered → the archive shows a verdict and "defeat"/
"completed" (not "In Progress"); a defeated rival lane shows the dagger and a frozen score.

## BL-4 — `saveGameMap` evicts the numerically-smallest game id, not the oldest

**Status:** open (2026-07-10 audit). **[Medium · Medium confidence]** (holds for the common
0…2³²-1 seed range)

[ui/timeline-store.js:123-131](../ui/timeline-store.js): eviction does `Object.keys(maps)`
then `keys.shift()`. Keys are `String(id)` where `id` is `gameSeed` — an integer — and JS
iterates integer-index-like string keys in **ascending numeric order**, not insertion order,
so `shift()` removes the smallest seed rather than the oldest-inserted map.

**Failure scenario:** after finishing a 4th game, the retained 3 map replays are the 3
largest-seed games, not the 3 most recent; opening a just-finished game's Historical Map can
show "No replay was recorded" (`view-archive.js:157-161`) while an older game still has its
replay.

**Fix:** track recency explicitly (an insertion-order list, or `[id, savedAt]`) and evict the
oldest by that.

**Design:** replace the key-order eviction in `saveGameMap` (`ui/timeline-store.js:122-132`)
with an explicit newest-first order list stored alongside `maps`:
```js
export function saveGameMap(id, map) {
  if (id == null) return false;
  const data = readData();
  const maps = (data.maps && typeof data.maps === "object") ? data.maps : {};
  maps[String(id)] = map;
  let order = Array.isArray(data.mapOrder) ? data.mapOrder.filter((k) => k !== String(id)) : [];
  order.unshift(String(id));                 // newest first
  while (order.length > MAP_KEEP) { delete maps[order.pop()]; }   // evict true oldest
  data.maps = maps; data.mapOrder = order;
  return writeData(data);
}
```
Also prune orphans defensively (drop any `maps` key not in `order`) so a legacy store without
`mapOrder` self-heals. (Alternative considered: reuse the archive's newest-first `games[]`
order + `recap.id` join — but an explicit `mapOrder` keeps the map store self-contained and
decoupled from the archive.) `MAP_KEEP` stays 3. **Verify:** finish 4 games in ascending-seed
order; confirm the 3 retained replays are the 3 most-recent (not the 3 largest seeds) and the
just-finished game's Historical Map opens instead of "No replay was recorded".

## BL-5 — Shell chronicle detail prints the raw leader TYPE, not the localized name

**Status:** open (2026-07-10 audit). **[Low · Confirmed]**

[ui/view-archive.js:147](../ui/view-archive.js): `loc("LOC_HTIMELINE_LED", …, p?.leader ||
"?", ln)` passes `p.leader` (e.g. `"LEADER_AUGUSTUS"`) straight into the `{1_Leader}` slot;
every other call site runs it through `leaderName()` (e.g. `archive-format.js:53`,
`view-chronicle.js`). Result: the Chronicle tab of an archived run reads "LEADER_AUGUSTUS led
Rome → America". **Fix:** `leaderName(p?.leader)`.

**Design:** at `ui/view-archive.js:147`, wrap the raw type before it enters the `{1_Leader}`
slot: `loc("LOC_HTIMELINE_LED", "{1_Leader} led {2_Civ}", leaderName(p?.leader), ln)` —
`leaderName()` (`ui/lineage-read.js:28`, `loc("LOC_"+type+"_NAME", type.replace(/^LEADER_/,""))`)
is already the helper every other call site uses (`archive-format.js:53`, `lineage-read.js:79`)
and is importable from `lineage-read.js`. One-line change. **Verify:** the archive Chronicle
detail reads "Augustus led Rome → America", not "LEADER_AUGUSTUS led …".

## BL-6 — Duplicate same-turn frames (minor)

**Status:** open (2026-07-10 audit). **[Low · note — no incorrect output]**

`PlayerTurnActivated` fires once per player, but `captureFrame`
([ui/timeline-history.js:69](../ui/timeline-history.js)) has no turn throttle, and
`captureMapGrid`/`maybeCaptureTerritory` push a frame on *every* activation that lands on a
capture turn → N near-identical frames per round for N players. The scrubber de-dupes turns
and rank crossings are stable, so output is correct; only cap budget is wasted / decimation
runs sooner. **Fix (optional):** gate captures to the local player's activation.

**Design (optional):** in the `onTurn` thunk passed to `startSampler`
(`ui/timeline-capture.js:42`), early-return unless the activated player is the local player —
`if (data && data.player !== GameContext.localPlayerID) return;` — before
`captureFrame`/`captureMapGrid`/`maybeCaptureTerritory`. Since captures record global state
(not per-player), one capture per round on the local player's activation is sufficient. This
cuts N near-identical frames per round to 1, easing the cap budget and slowing decimation.
Output is already correct (the scrubber de-dupes turns), so this is a pure efficiency change —
lowest priority. **Verify:** frame count per round drops to 1; timeline/scrubber and rank
crossings render identically to before.
