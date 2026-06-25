# Phase 0 — Standalone mod scaffold

**Goal.** A loadable `historical-timeline` mod that, in **both** modes
(Demographics present or absent), opens a "Historical Timeline" surface showing
an empty placeholder. No data yet — this proves the skeleton, the dual-mode
boot, the handshake, the dock button, and the localization/build pipeline.

**Exit criteria.**
- With Demographics installed: a new top-level **Historical Timeline** tab
  appears in the demographics screen and renders the placeholder.
- Without Demographics: a dock button opens a standalone screen rendering the
  same placeholder.
- `release.sh` produces a clean `dist/historical-timeline` that loads from the
  Civ7 Mods dir after relaunch.

Read `00_IMPLEMENTATION_REFERENCE.md` first — this phase wires up §B, §F, §H, §I, §J.

---

## Files created this phase

```
historical-timeline.modinfo                 (§H)
release.sh                                   (§J)
ui/timeline-bootstrap.js                     (new — below)
ui/timeline-companion.js                     (§B handshake + below)
ui/timeline-dock-decorator.js                (new — below)
ui/screen-historical-timeline.js  + .html    (new — below)
ui/timeline-panel.js                         (new — placeholder render)
ui/timeline-dom.js  timeline-i18n.js  timeline-log.js   (§F verbatim)
text/<10 locales>/ModText.xml                (§I)
```

---

## 1. Bootstrap (dual-mode) — `ui/timeline-bootstrap.js`

This is the only file in `UIScripts` (executed). It picks the mode and wires the
mount. The handshake's `pending` queue (§B) makes load order irrelevant, so we
*always* register the companion panel **and** *always* install the standalone
dock — but the dock hides itself when Demographics is present, to avoid two entry
points. (Simplest correct rule: integrated mount wins when available.)

```js
import { dlog, derr } from "/historical-timeline/ui/timeline-log.js";
import { withDemographicsApi, demographicsPresent } from "/historical-timeline/ui/timeline-companion.js";

function boot() {
  // 1) Integrated mode: register the panel (runs now or when Demographics loads).
  try {
    import("/historical-timeline/ui/timeline-companion.js")
      .then((m) => m.registerCompanionPanel())
      .catch((e) => derr("companion register failed", e));
  } catch (e) { derr("companion import threw", e); }

  // 2) Standalone fallback dock — only if Demographics is absent.
  //    Defer one tick so a late-loading Demographics can be detected.
  const installDock = () => {
    if (demographicsPresent()) { dlog("Demographics present; skipping standalone dock"); return; }
    import("/historical-timeline/ui/timeline-dock-decorator.js")
      .then((m) => m.installTimelineDock())
      .catch((e) => derr("dock install failed", e));
  };
  if (typeof Loading !== "undefined" && typeof Loading.runWhenLoaded === "function") {
    Loading.runWhenLoaded(installDock);
  } else {
    setTimeout(installDock, 250);
  }
}

if (typeof engine !== "undefined" && typeof engine.whenReady?.then === "function") {
  engine.whenReady.then(boot).catch((e) => derr("whenReady threw", e));
} else {
  boot();
}
```

---

## 2. Companion registration — `ui/timeline-companion.js`

Adds `registerCompanionPanel()` on top of the §B handshake helpers:

```js
import { dlog } from "/historical-timeline/ui/timeline-log.js";

export function demographicsPresent() {
  const api = globalThis.DemographicsMetricsAPI;
  return !!(api && typeof api.registerPanel === "function");
}

export function withDemographicsApi(job) {
  const api = (globalThis.DemographicsMetricsAPI ??= {});
  if (typeof api.registerPanel === "function") { try { job(api); } catch (_) {} return true; }
  (api.pending ??= []).push(job);
  return false;
}

const PANEL_SPEC = {
  id: "htimeline_panel",
  pageLabel: "LOC_HTIMELINE_TAB",
  title: "LOC_HTIMELINE_TITLE",
  topLevel: true,
  tabs: [
    { id: "ribbon",    label: "LOC_HTIMELINE_SUB_RIBBON",    title: "LOC_HTIMELINE_SUB_RIBBON_T" },
    { id: "chronicle", label: "LOC_HTIMELINE_SUB_CHRONICLE", title: "LOC_HTIMELINE_SUB_CHRONICLE_T" },
    { id: "map",       label: "LOC_HTIMELINE_SUB_MAP",       title: "LOC_HTIMELINE_SUB_MAP_T" }
  ],
  render: (container, ctx, subId) => {
    // Lazy-import the shared panel so the heavy view modules only parse on first open.
    import("/historical-timeline/ui/timeline-panel.js")
      .then((m) => m.renderPanel(container, ctx, subId))
      .catch((e) => { try { container.textContent = ""; } catch (_) {} });
  }
};

export function registerCompanionPanel() {
  const ran = withDemographicsApi((api) => {
    api.registerPanel(PANEL_SPEC);
    dlog("panel registered into Demographics");
  });
  dlog(ran ? "Demographics present" : "Demographics deferred/absent");
}
```

---

## 3. Standalone dock + screen

### `ui/timeline-dock-decorator.js`

Verbatim-faithful to `demographics-dock-decorator.js:144-202` and
`emigration-dock-decorator.js:114-152`:

```js
import { dlog, derr } from "/historical-timeline/ui/timeline-log.js";

class TimelineDockDecorator {
  constructor(panel) { this._panel = panel; }
  beforeAttach() {}
  afterAttach() {
    try {
      this._panel.addButton({
        tooltip: "LOC_HTIMELINE_OPEN",
        modifierClass: "htimeline",
        callback: openTimelineScreen,
        class: ["htimeline-dock-button"],
        audio: "data-audio-tab-selected",
        focusedAudio: "data-audio-focus-small"
      });
    } catch (e) { derr("addButton threw", e); }
  }
  beforeDetach() {}
  afterDetach() {}
}

function openTimelineScreen() {
  try {
    import("/core/ui/context-manager/context-manager.js").then((m) => {
      const ContextManager = m.default || m.ContextManager || m;
      ContextManager.push("screen-historical-timeline", { singleton: true, createMouseGuard: true });
    }).catch((e) => derr("context-manager import failed", e));
  } catch (e) { derr("openTimelineScreen threw", e); }
}

export function installTimelineDock() {
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate("panel-sub-system-dock", (val) => new TimelineDockDecorator(val));
      dlog("dock decorator registered");
    }
  } catch (e) { derr("Controls.decorate threw", e); }
}
```

### `ui/screen-historical-timeline.js` (+ `.html`)

**Resolved — full verbatim template is in `00_IMPLEMENTATION_REFERENCE.md` §L.**
The screen is a `Panel` subclass (`import Panel from "/core/ui/panel-support.js"`)
registered via `Controls.define("screen-historical-timeline", { createInstance,
description, styles, content, classNames })`, opened with
`ContextManager.push("screen-historical-timeline", { singleton: true,
createMouseGuard: true })` — exactly emigration's `emigration-screen.js` pattern
(verified full file) and demographics' `Controls.define` (`screen-demographics.js:766-793`).

Copy §L's `screen-historical-timeline.js` + `.html` as-is. The `.html` uses the
base-UI `fxs-frame` / `fxs-header` / `fxs-close-button` widgets and exposes a
`.htimeline-screen-host` div; the screen's `_render()` delegates that host to the
shared panel:

```js
import("/historical-timeline/ui/timeline-panel.js")
  .then((m) => m.renderPanel(host, /* ctx */ {}, this._activeSubId || "ribbon"))
  .catch(() => {});
```

In standalone mode `ctx` is `{}` — the panel resolves its own data via
`timeline-source.js`, so nothing else is required here. Optionally copy the
`suspendPopups`/`resumePopups` helpers from emigration (display-queue-manager
suspend/resume) so background popups don't reflow the screen while open.

---

## 4. Shared panel placeholder — `ui/timeline-panel.js`

The single render entry used by **both** the companion panel and the standalone
screen. This phase just renders a placeholder per sub-tab:

```js
import { el } from "/historical-timeline/ui/timeline-dom.js";
import { loc } from "/historical-timeline/ui/timeline-i18n.js";

export function renderPanel(host, ctx, subId) {
  try {
    host.textContent = "";
    const sub = subId || "ribbon";
    const wrap = el("div", "htimeline-wrap");
    wrap.appendChild(el("div", "htimeline-title",
      loc("LOC_HTIMELINE_TITLE", "Historical Timeline")));
    wrap.appendChild(el("div", "htimeline-placeholder",
      loc("LOC_HTIMELINE_PLACEHOLDER", "Coming soon: {1_Sub}", sub)));
    host.appendChild(wrap);
  } catch (_) { /* never throw out of a panel render */ }
}
```

---

## 5. Localization keys this phase

Add to all 10 locale files (en_us `<Row>`, others `<Replace>`):

```
LOC_HTIMELINE_MOD_NAME, LOC_HTIMELINE_MOD_DESC
LOC_HTIMELINE_TAB        = "Historical Timeline"
LOC_HTIMELINE_TITLE
LOC_HTIMELINE_OPEN       (dock tooltip)
LOC_HTIMELINE_PLACEHOLDER
LOC_HTIMELINE_SUB_RIBBON / _T,  _SUB_CHRONICLE / _T,  _SUB_MAP / _T
```

---

## 6. Verification

1. `./release.sh`; copy `dist/historical-timeline` → Civ7 Mods dir; relaunch.
2. **Both-mods test:** Demographics + this mod → Historical Timeline tab visible,
   placeholder renders, no standalone dock button (integrated mount wins).
3. **Standalone test:** disable Demographics → dock button appears, opens the
   screen, same placeholder. (Memory: stray top-level localStorage keys can
   cascade-break other mods — we persist only via GameConfiguration KV, so this
   is clean by construction. **If this mod ever adds ModOptions-style user
   options** (which DO live in the shared `localStorage.modSettings`), every write
   MUST be merge-safe per the REQUIREMENT in `civ7-modding-docs/08-pitfalls-and-debugging.md`
   — re-read on empty, refuse on unparseable, only ever touch our own slice, and
   NEVER reset the blob to `{}`. Reuse demographics/emigration's `_readForWrite()`.)
4. Confirm no console errors from `[htimeline]` and no thrown exceptions during
   age transition / save / load (the panel never throws).
