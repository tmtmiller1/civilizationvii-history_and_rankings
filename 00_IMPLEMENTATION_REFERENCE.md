# 00 — Implementation Reference (verified runtime APIs)

Shared appendix for all phase docs. Every snippet here is modeled on **real code
extracted from the shipping `demographics` and `emigration` mods** at
`/Users/tylermiller/Downloads/Contents copy/{demographics,emigration}/`. Source
file + line numbers are cited so you can diff against the real thing.

Mod id: **`historical-timeline`**. LOC namespace: **`LOC_HTIMELINE_*`**. Its own
Steam Workshop item (new — *not* demographics' 3737200066).

Install/test path (per project memory): copy `dist/historical-timeline` →
`~/Library/Application Support/Civilization VII/Mods/historical-timeline` and
relaunch. New `text/*` requires a full relaunch to load.

---

## A. Directory layout (standalone mod)

```
historical-timeline/
  historical-timeline.modinfo
  release.sh
  ui/
    timeline-bootstrap.js          # UIScripts entry (executed); dual-mode boot
    timeline-dock-decorator.js     # standalone dock button → push own screen
    screen-historical-timeline.js  # standalone screen shell (mirrors emigration's screen)
    screen-historical-timeline.html
    timeline-companion.js          # integrated mode: registerPanel handshake
    timeline-panel.js              # SHARED render(host, ctx, subId) — used by both modes
    timeline-source.js             # data-source resolver (own capture vs ctx.history)
    lineage-ledger.js              # self-owned capture + persistence (Phase 1)
    lineage-read.js                # derive per-player age→civ lineage (Phase 1)
    timeline-history.js            # lightweight self-capture for map/chronicle (Phase 3)
    timeline-events.js             # unify wars/wonders/eliminations/age-changes (Phase 2)
    chronicle-narrate.js           # event → localized sentence templates (Phase 2)
    view-ribbon.js                 # SVG lineage ribbon (Phase 1)
    view-chronicle.js              # DOM prose (Phase 2)
    view-map.js                    # canvas living map (Phase 3)
    timeline-tooltip.js            # shared prose tooltip
    timeline-dom.js                # el() + small DOM helpers
    timeline-i18n.js               # t()/loc() wrappers
    timeline-log.js                # dlog/derr + DBG flag
  text/
    en_us/ModText.xml   de_de/   es_es/   fr_fr/   it_it/
    ja_jp/   ko_kr/   pt_br/   ru_ru/   zh_cn/ModText.xml
  images/                          # optional crests/icons (svg/png)
```

---

## B. The Demographics handshake (order-independent)

Verified at `demographics/ui/metrics/demographics-metrics.js:770-789`. The API is
attached to `globalThis.DemographicsMetricsAPI` with `??=`, and **whoever loads
second drains a `pending` queue**, so registration is order-independent:

```js
// demographics drains this on load:
if (Array.isArray(_api.pending)) {
  for (const job of _api.pending.splice(0)) { try { job(_api); } catch (_) {} }
}
```

Companion side (`timeline-companion.js`). Mirrors how emigration defers
(`emigration-main.js:300-308`, "registers now if its API is up, else queues"):

```js
// Run `job(api)` as soon as DemographicsMetricsAPI is available — now or later.
// Returns true if it ran synchronously (Demographics already loaded).
export function withDemographicsApi(job) {
  const api = (globalThis.DemographicsMetricsAPI ??= {});
  if (typeof api.registerPanel === "function") { try { job(api); } catch (_) {} return true; }
  (api.pending ??= []).push(job);   // demographics drains this when it loads
  return false;
}

// Detect presence right now (for the bootstrap mode decision).
export function demographicsPresent() {
  const api = globalThis.DemographicsMetricsAPI;
  return !!(api && typeof api.registerPanel === "function");
}
```

### `registerPanel` spec shape

Verified from emigration's `PANEL_SPEC` (`emigration-migration-page.js:68-79`) and
the `registerPanel` JSDoc (`demographics-metrics.js:627-670`):

```js
const PANEL_SPEC = {
  id: "htimeline_panel",            // unique; rejected on duplicate
  pageLabel: "LOC_HTIMELINE_TAB",   // top-level tab label
  title: "LOC_HTIMELINE_TITLE",
  topLevel: true,                   // own top-level tab (right of other tabs)
  tabs: [                           // optional sub-tabs → one synthetic metric each
    { id: "ribbon",    label: "LOC_HTIMELINE_SUB_RIBBON",    title: "LOC_HTIMELINE_SUB_RIBBON_T" },
    { id: "chronicle", label: "LOC_HTIMELINE_SUB_CHRONICLE", title: "LOC_HTIMELINE_SUB_CHRONICLE_T" },
    { id: "map",       label: "LOC_HTIMELINE_SUB_MAP",       title: "LOC_HTIMELINE_SUB_MAP_T" }
  ],
  // container: HTMLElement, ctx: Demographics render ctx, subId: selected sub-tab id
  render: (container, ctx, subId) => renderPanel(container, ctx, subId)
};
```

> The render contract is `render(container, ctx, subId)`. `subId` is the selected
> sub-tab id (or `undefined` for a single-tab panel). `ctx` may carry
> `groupView`, `panelControls` — and *possibly* `history`, which we treat as
> opportunistic only (see `timeline-source.js`, §G). A render failure must never
> throw out of the panel (wrap the body in try/catch like
> `emigration-migration-page.js:48-60`).

---

## C. Persistence (GameConfiguration KV)

Survives save/load **and** age transitions. Pattern verified in
`emigration-migration-stats.js:103-219` and `demographics/ui/storage/storage-backend.js:141-167`.
Namespace keys like demographics does (`"Demographics__" + scope + "__" + key`):

```js
// timeline-store.js (helper used by lineage-ledger.js and timeline-history.js)
const NS = "HistoricalTimeline__";

export function readKey(key) {
  try {
    const g = Configuration?.getGame?.();
    const v = g && typeof g.getValue === "function" ? g.getValue(NS + key) : null;
    return typeof v === "string" && v.length ? v : null;
  } catch (_) { return null; }
}

export function writeKey(key, str) {
  try { Configuration?.editGame?.()?.setValue?.(NS + key, str); return true; }
  catch (_) { return false; }
}

export function readJSON(key, fallback) {
  const raw = readKey(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}
export function writeJSON(key, obj) { return writeKey(key, JSON.stringify(obj)); }
```

Keys this mod owns:
- `lineage-v1` → the `LineageLedger` (Phase 1).
- `history-v1` → the lightweight self-captured frame history (Phase 3).

Flush points: persist on every capture (cheap — ledger is a few hundred bytes),
and additionally hook `BeforeUnload` / `PlayerAgeTransitionComplete` for the
heavier history blob (pattern: `demographics-storage.js:306-324`).

---

## D. Runtime reads — age, civ, leader, roster

All verbatim-faithful to emigration helpers. **Player id is stable across ages;
`civilizationType` changes, `leaderType` does not.**

```js
// Current age type, e.g. "AGE_ANTIQUITY"  (emigration-population.js:59-67)
export function currentAgeType() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return undefined;
    const row = GameInfo?.Ages?.lookup?.(Game.age);
    return row && typeof row.AgeType === "string" ? row.AgeType : undefined;
  } catch (_) { return undefined; }
}

// Current game turn (emigration-migration-stats.js:418-424)
export function gameTurn() {
  try { return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0; }
  catch (_) { return 0; }
}

// Civ type, e.g. "CIVILIZATION_ROME"  (emigration-naming.js:36-44)
export function civType(pid) {
  try {
    const ct = Players?.get?.(pid)?.civilizationType;
    return GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType ?? null;
  } catch (_) { return null; }
}

// Leader type, e.g. "LEADER_NAPOLEON"  (migration-probe.js:493-534)
export function leaderType(pid) {
  try {
    const lt = Players?.get?.(pid)?.leaderType;
    return GameInfo?.Leaders?.lookup?.(lt)?.LeaderType ?? null;
  } catch (_) { return null; }
}

// Alive MAJOR player ids — VERIFIED primary API (demographics sampler-player-ids.js:10-19).
// `Players.getAliveMajorIds()` returns number[] of major-civ ids directly.
export function aliveMajorIds() {
  try {
    if (typeof Players !== "undefined" && typeof Players.getAliveMajorIds === "function") {
      const arr = Players.getAliveMajorIds();
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  // Fallback (relations-queries.js:93-126): getAliveIds()/getAlive() then filter by isMajor.
  try {
    let ids = [];
    if (typeof Players?.getAliveIds === "function") {
      const a = Players.getAliveIds(); if (Array.isArray(a)) ids = a.slice();
    } else if (typeof Players?.getAlive === "function") {
      ids = (Players.getAlive() || []).map((p) => (typeof p === "number" ? p : p?.id)).filter((v) => typeof v === "number");
    }
    return ids.filter((id) => { try { const p = Players.get(id); return !p || p.isMajor !== false; } catch (_) { return false; } });
  } catch (_) { return []; }
}

// Major-civ test (relations-queries.js:31-40): `player.isMajor` is a boolean property.
// Minor/city-state test (sampler-wars-augment.js:119-146): isMinor || isIndependent || isCityState.
export function isMajor(pid) {
  try { const p = Players?.get?.(pid); return !!p && p.isMajor !== false; } catch (_) { return false; }
}

// Local player (demographics-sampler.js:263-276)
export function localPlayerId() {
  try {
    const v = GameContext?.localPlayerID;
    if (typeof v === "number") return v;
    const o = GameContext?.localObserverID;
    return typeof o === "number" ? o : undefined;
  } catch (_) { return undefined; }
}
```

Display names come from the game's own LOC, so translations are inherited:
`Locale.compose("LOC_" + civType)` for the civ name, the `_ADJECTIVE` suffix for
the adjective (`emigration-naming.js:101-115`), and the same for leaders.

---

## E. Per-turn + age-change subscription (with kill switch)

Verified pattern: `engine.on("PlayerTurnActivated", h)` and
`engine.on("PlayerAgeTransitionComplete", h)` (`sampler-registration.js:22-58`),
with a defensive kill-switch that unsubscribes after N throws
(`demographics-sampler.js:151-236`). Compact form for this mod:

```js
// timeline-sampler.js
let _turnRef = null, _ageRef = null, _errs = 0, _dead = false;
const KILL = 3;

export function startSampler({ onTurn, onAge }) {
  try {
    stopSampler();
    _turnRef = (data) => safe("onTurn", () => onTurn(data));
    _ageRef  = (data) => safe("onAge",  () => onAge(data));
    engine.on("PlayerTurnActivated", _turnRef);
    engine.on("PlayerAgeTransitionComplete", _ageRef);
  } catch (e) { derr("startSampler threw", e); }
}

export function stopSampler() {
  try { if (_turnRef) engine.off("PlayerTurnActivated", _turnRef); } catch (_) {}
  try { if (_ageRef)  engine.off("PlayerAgeTransitionComplete", _ageRef); } catch (_) {}
  _turnRef = _ageRef = null;
}

function safe(label, fn) {
  if (_dead) return;
  try { fn(); }
  catch (e) {
    derr("error in " + label, e);
    if (++_errs >= KILL) { _dead = true; stopSampler(); derr("kill switch tripped"); }
  }
}
```

---

## F. DOM + i18n + logging helpers

```js
// timeline-dom.js  (el() verbatim from emigration-network-viz.js:76-81)
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function svg(tag, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}
export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
```

```js
// timeline-i18n.js  (loc() verbatim-style from emigration-network-viz.js:91-104)
export function loc(key, fallback, ...args) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {}
  return String(fallback).replace(/\{(\d+)_[A-Za-z]+\}/g, (m, n) => {
    const a = args[Number(n) - 1]; return a == null ? m : String(a);
  });
}
```

```js
// timeline-log.js  (DBG flipped to false by release.sh — see §I)
const DBG = true;
export function dlog(...a) { if (DBG) try { console.log("[htimeline]", ...a); } catch (_) {} }
export function derr(...a) { try { console.error("[htimeline]", ...a); } catch (_) {} }
```

---

## G. Data-source resolver

Because the mod owns its data (see the design's data-ownership correction), the
views read through one resolver. It prefers Demographics' richer `ctx.history`
*only if present*, else falls back to self-capture:

```js
// timeline-source.js
import { readJSON } from "/historical-timeline/ui/timeline-store.js";
import { readLedger } from "/historical-timeline/ui/lineage-ledger.js";

export function resolveSource(ctx) {
  // Lineage is ALWAYS self-owned (decimation-proof) — never from ctx.
  const ledger = readLedger();
  // Frame history: opportunistic from Demographics, else our own capture.
  const demoHistory = ctx && ctx.history && Array.isArray(ctx.history.samples)
    ? ctx.history : null;
  const ownHistory = demoHistory ? null : readJSON("history-v1", { frames: [] });
  return {
    ledger,                                  // { version, seed, players:{pid:{leader, ages:{...}}} }
    frames: demoHistory ? demoHistory.samples : (ownHistory.frames || []),
    ageBoundaries: demoHistory ? (demoHistory.ageBoundaries || []) : null,
    mode: demoHistory ? "demographics" : "standalone"
  };
}
```

---

## H. `.modinfo` skeleton

Modeled on `demographics.modinfo` and `emigration.modinfo`. **`UIScripts` are
executed in order; `ImportFiles` are merely made importable** by dynamic
`import()`. Put the one bootstrap in `UIScripts`; everything else in
`ImportFiles`. LoadOrder **70** so it settles after demographics(50)/emigration(60)
— though the `pending` queue makes order irrelevant for the handshake.

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mod id="historical-timeline" version="1" xmlns="ModInfo">
    <Properties>
        <Name>LOC_HTIMELINE_MOD_NAME</Name>
        <Description>LOC_HTIMELINE_MOD_DESC</Description>
        <Authors>Tower</Authors>
        <Package>HistoricalTimelineMod</Package>
        <Version>0.1.0</Version>
    </Properties>
    <Dependencies>
        <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME" />
    </Dependencies>
    <!-- NOTE: do NOT hard-depend on demographics; integration is optional/runtime. -->
    <ActionCriteria>
        <Criteria id="always"><AlwaysMet></AlwaysMet></Criteria>
    </ActionCriteria>
    <ActionGroups>
        <ActionGroup id="htimeline-shell" scope="shell" criteria="always">
            <Properties><LoadOrder>70</LoadOrder></Properties>
            <Actions>
                <UpdateText>
                    <Item>text/en_us/ModText.xml</Item>
                    <Item locale="de_DE">text/de_de/ModText.xml</Item>
                    <Item locale="es_ES">text/es_es/ModText.xml</Item>
                    <Item locale="fr_FR">text/fr_fr/ModText.xml</Item>
                    <Item locale="it_IT">text/it_it/ModText.xml</Item>
                    <Item locale="ja_JP">text/ja_jp/ModText.xml</Item>
                    <Item locale="ko_KR">text/ko_kr/ModText.xml</Item>
                    <Item locale="pt_BR">text/pt_br/ModText.xml</Item>
                    <Item locale="ru_RU">text/ru_ru/ModText.xml</Item>
                    <Item locale="zh_Hans_CN">text/zh_cn/ModText.xml</Item>
                </UpdateText>
            </Actions>
        </ActionGroup>
        <ActionGroup id="htimeline-game" scope="game" criteria="always">
            <Properties><LoadOrder>70</LoadOrder></Properties>
            <Actions>
                <UpdateText> <!-- same 10 locale rows as above --> </UpdateText>
                <UIScripts>
                    <Item>ui/timeline-bootstrap.js</Item>
                    <Item>ui/screen-historical-timeline.js</Item>
                </UIScripts>
                <ImportFiles>
                    <Item>ui/screen-historical-timeline.js</Item>
                    <Item>ui/screen-historical-timeline.html</Item>
                    <Item>ui/styles/htimeline.css</Item>
                    <Item>ui/timeline-companion.js</Item>
                    <Item>ui/timeline-dock-decorator.js</Item>
                    <Item>ui/timeline-panel.js</Item>
                    <Item>ui/timeline-source.js</Item>
                    <Item>ui/timeline-store.js</Item>
                    <Item>ui/timeline-sampler.js</Item>
                    <Item>ui/lineage-ledger.js</Item>
                    <Item>ui/lineage-read.js</Item>
                    <Item>ui/timeline-history.js</Item>
                    <Item>ui/timeline-events.js</Item>
                    <Item>ui/chronicle-narrate.js</Item>
                    <Item>ui/view-ribbon.js</Item>
                    <Item>ui/view-chronicle.js</Item>
                    <Item>ui/view-map.js</Item>
                    <Item>ui/timeline-tooltip.js</Item>
                    <Item>ui/timeline-dom.js</Item>
                    <Item>ui/timeline-i18n.js</Item>
                    <Item>ui/timeline-log.js</Item>
                </ImportFiles>
            </Actions>
        </ActionGroup>
    </ActionGroups>
</Mod>
```

> Engine module specifiers are absolute from the mod root, e.g.
> `import { el } from "/historical-timeline/ui/timeline-dom.js";` (matching how
> demographics uses `/demographics/ui/...`).

---

## I. Localization files

`en_us` uses `<Row>` (base/fallback); the other 9 locales use `<Replace
Language=...>`. Add **every** new `LOC_HTIMELINE_*` key to all 10 files (memory:
demographics localization).

```xml
<!-- text/en_us/ModText.xml -->
<Row Tag="LOC_HTIMELINE_TAB"><Text>Historical Timeline</Text></Row>
```
```xml
<!-- text/fr_fr/ModText.xml -->
<Replace Tag="LOC_HTIMELINE_TAB" Language="fr_FR"><Text>Chronologie historique</Text></Replace>
```

`Locale.compose` parameter substitution (`{1_Civ}`, `{2_Age}`, …) drives the
chronicle templates in Phase 2.

---

## J. `release.sh`

Copy demographics' `release.sh` and retarget to `historical-timeline`. Keep the
three load-bearing parts (verified `demographics/release.sh:101-146`):

```bash
# Allow-list (NO stray root .md/.pdf — transparent but tight):
ALLOW='^historical-timeline/(historical-timeline\.modinfo|README\.md|LICENSE|CHANGELOG\.md)$'
ALLOW="$ALLOW"'|^historical-timeline/ui/.+\.(js|html|css)$'
ALLOW="$ALLOW"'|^historical-timeline/images/.+\.(svg|png)$'
ALLOW="$ALLOW"'|^historical-timeline/text/[a-z_]+/ModText\.xml$'

# Disable debug (readable JS, NOT minified — transparent source is core to this mod family):
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 sed -i '' -E \
    -e 's/^const DBG = true;/const DBG = false;/'

# Mirror to dist, then zip:
rsync -a --exclude='.git' --exclude='.DS_Store' --exclude='dist' --exclude='release.sh' \
    --exclude='docs' --exclude='types' --exclude='*.d.ts' --exclude='tests' \
    "$SRC_DIR"/ "$TARGET_DIR"/
( cd "$DIST_DIR" && zip -qr historical-timeline.zip historical-timeline )
```

Then steamcmd to the mod's **own new** Workshop item.

---

## K. Verified data accessors (score / land / population / settlements)

All confirmed against the production demographics sampler — these replace the
earlier best-effort guesses.

### Score — there is **no cumulative engine score**; use the heuristic

`demographics-metrics-helpers.js:210-253`. Civ7 scoring is per-age Legacy Points,
so demographics synthesizes a continuous score and only trusts `stats.getScore()`
if it exists *and* doesn't regress below the heuristic:

```js
// stats = player.Stats
function scoreFallback(ctx) {
  return (ctx.techsCount|0) + (ctx.civicsCount|0) + 2*(ctx.settlementsCount|0) + Math.floor((ctx.gold|0)/100);
}
function scoreOf(player, ctx) {
  const heuristic = scoreFallback(ctx);
  try {
    const s = player?.Stats;
    if (s && typeof s.getScore === "function") {
      const v = s.getScore();
      if (typeof v === "number" && v >= heuristic) return v;  // reject per-age cliff
    }
  } catch (_) {}
  return heuristic;
}
```

### Land (tiles owned) — sum `city.getPurchasedPlots().length`

`sampler-collectors-economy.js:221-243` + `:328-349`. There is no
`player.Stats.getLandArea()`; demographics sums purchased plots across cities:

```js
function tilesOwned(player) {
  try {
    const cities = player?.Cities;
    const list = cities && typeof cities.getCities === "function" ? cities.getCities() : null;
    if (!Array.isArray(list)) return 0;
    let total = 0;
    for (const c of list) {
      try {
        const plots = typeof c.getPurchasedPlots === "function" ? c.getPurchasedPlots() : null;
        if (plots && typeof plots.length === "number") total += plots.length;
      } catch (_) {}
    }
    return total;
  } catch (_) { return 0; }
}
```

### Settlements / population — read off `player.Cities` and `player.Stats`

```js
// settlement count (sampler-collectors-economy.js:336-339):
const settlements = (() => { try {
  const l = player?.Cities?.getCities?.(); return Array.isArray(l) ? l.length : 0;
} catch (_) { return 0; } })();

// totalPopulation (sampler-collectors-economy.js:478, read defensively :422-431):
const pop = (() => { try {
  const v = player?.Stats?.totalPopulation; return typeof v === "number" && isFinite(v) ? v : 0;
} catch (_) { return 0; } })();
```

> `player.Stats` also exposes `numCities`, `numTowns`, `numSettlements`,
> `settlementCap` as plain numeric properties; net yields via
> `Stats.getNetYield(YieldTypes.YIELD_*)` / a `netYield(stats, "YIELD_GOLD")`
> wrapper. Gold balance: `player.Treasury.getGoldBalance()`.

---

## L. Standalone screen — VERIFIED template (Panel + Controls.define)

Resolved from emigration's actual screen file (`emigration/ui/emigration-screen.js`,
full file) and demographics' `Controls.define` (`screen-demographics.js:766-793`).
A screen is a `Panel` subclass registered with `Controls.define`, pushed with
`ContextManager.push`. No guesswork remains.

`ui/screen-historical-timeline.js`:

```js
import Panel from "/core/ui/panel-support.js";
import { dlog, derr } from "/historical-timeline/ui/timeline-log.js";

class ScreenHistoricalTimeline extends Panel {
  onInitialize() {
    super.onInitialize?.();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
    try { this.Root?.setAttribute?.("data-audio-group-ref", "audio-screen-unlocks"); } catch (_) {}
  }
  onAttach() {
    super.onAttach();
    this._wireCloseButton();
    this._render();
    suspendPopups(this);   // defer research/civic popups while open (optional, see emigration-screen.js)
  }
  onDetach() { resumePopups(this); super.onDetach?.(); }
  _wireCloseButton() {
    try {
      const btn = this.Root.querySelector("[data-ia-close]");
      if (btn) btn.addEventListener("action-activate", () => { try { this.close(); } catch (_) {} });
    } catch (e) { derr("close wiring failed", e); }
  }
  _render() {
    try {
      const host = this.Root.querySelector(".htimeline-screen-host");
      if (!host) return derr("content host not found");
      import("/historical-timeline/ui/timeline-panel.js")
        .then((m) => m.renderPanel(host, {}, this._activeSubId || "ribbon"))
        .catch((e) => derr("panel import failed", e));
    } catch (e) { derr("render failed", e); }
  }
  close() { super.close?.(); }
}

try {
  if (typeof Controls !== "undefined" && typeof Controls.define === "function") {
    Controls.define("screen-historical-timeline", {
      createInstance: ScreenHistoricalTimeline,
      description: "Historical Timeline panel.",
      styles: ["fs://game/historical-timeline/ui/styles/htimeline.css"],
      content: ["fs://game/historical-timeline/ui/screen-historical-timeline.html"],
      attributes: [],
      classNames: ["htimeline-screen", "w-full", "h-full"]
    });
  } else { derr("Controls.define unavailable"); }
} catch (e) { derr("Controls.define threw", e); }

export function openTimelineScreen() {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      const ContextManager = m.default || m.ContextManager || m;
      ContextManager.push("screen-historical-timeline", { singleton: true, createMouseGuard: true });
    })
    .catch((e) => derr("context-manager import failed", e));
}

// suspendPopups/resumePopups: copy verbatim from emigration-screen.js (display-queue-manager
// suspend()/resume(), guarded by isSuspended() and a `popupsSuspended` owner flag). Optional but
// matches base-game cinematic etiquette so background popups don't reflow the screen.
```

`ui/screen-historical-timeline.html` (verbatim shape of emigration/demographics templates):

```html
<div class="htimeline-screen-root w-full h-full flex items-center justify-center">
    <fxs-frame frame-style="f2" class="htimeline-screen-frame relative flex flex-col">
        <fxs-header class="htimeline-screen-title relative font-title text-xl uppercase text-secondary"
                    filigree-style="h4" title="LOC_HTIMELINE_TITLE"></fxs-header>
        <div class="htimeline-screen-body relative flex flex-col flex-auto px-6 pb-6">
            <!-- sub-tab bar (ribbon / chronicle / map) renders here if desired -->
            <div class="htimeline-subtab-host w-full"></div>
            <!-- the shared timeline-panel mounts here -->
            <div class="htimeline-screen-host w-full flex flex-col flex-auto"></div>
        </div>
        <fxs-close-button data-ia-close
            data-audio-group-ref="audio-screen-unlocks"
            data-audio-activate-ref="data-audio-close-selected"
            data-audio-press-ref="data-audio-close-press"></fxs-close-button>
    </fxs-frame>
</div>
```

**`.modinfo`:** the screen JS goes in **both** `UIScripts` (so `Controls.define`
runs at load) and `ImportFiles`; the `.html`/`.css` go in `ImportFiles` only
(matching demographics `demographics.modinfo:50-92` and emigration `:77-136`).
The §H modinfo already lists `screen-historical-timeline.js` in `UIScripts` —
add the `.html` to `ImportFiles` too. The dock decorator (Phase 0 §3) calls
`openTimelineScreen()` instead of pushing a bare string.
