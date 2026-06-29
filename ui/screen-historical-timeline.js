// screen-historical-timeline.js
//
// The standalone screen shell, used both in-game (dock) and from the main menu.
// A Panel subclass registered with Controls.define and pushed via ContextManager.
// _render() delegates the body host to the shared timeline-panel. In the shell
// (no game) the panel falls back to the archive, which reads only user storage.

import Panel from "/core/ui/panel-support.js";
import { derr } from "/history-and-rankings/ui/timeline-log.js";

// Mode the next push should render in, set by openTimelineScreen() right before the
// push and read once in _render(). Same isolate + module, so no plumbing needed.
let _pendingMode = null;

class ScreenHistoricalTimeline extends Panel {
  onInitialize() {
    super.onInitialize?.();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
    try { this.Root?.setAttribute?.("data-audio-group-ref", "audio-screen-unlocks"); } catch (_) { /* */ }
  }
  onAttach() { super.onAttach(); this._mountWhenReady(0); }
  onDetach() { super.onDetach?.(); }
  // On a COLD start the screen's HTML content isn't injected yet when onAttach fires,
  // so .htimeline-screen-host doesn't exist and the window renders blank. Retry across
  // frames until the content host appears (warm starts find it on the first try).
  _mountWhenReady(tries) {
    const host = this.Root?.querySelector?.(".htimeline-screen-host");
    if (host) { this._wireCloseButton(); this._render(host); return; }
    if (tries < 30) { requestAnimationFrame(() => this._mountWhenReady(tries + 1)); return; }
    derr("content host not found after retries");
  }
  _wireCloseButton() {
    try {
      const btn = this.Root.querySelector("[data-ia-close]");
      if (btn) btn.addEventListener("action-activate", () => { try { this.close(); } catch (_) { /* */ } });
    } catch (e) { derr("close wiring failed", e); }
  }
  _render(host) {
    try {
      // The opener tells us which mode to use (the menu button forces "shell", the
      // in-game dock forces "game"). Configuration.getGame() is truthy even at the
      // main menu, so it can't be trusted to distinguish the two — only fall back
      // to it when no explicit mode was passed.
      const mode = _pendingMode || (Configuration?.getGame?.() ? "game" : "shell");
      const initialTab = "archive"; // both modes lead with Civilization Rankings
      import("/history-and-rankings/ui/timeline-panel.js")
        .then((m) => m.renderPanel(host, { mode }, initialTab))
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
      styles: ["fs://game/history-and-rankings/ui/styles/htimeline.css"],
      content: ["fs://game/history-and-rankings/ui/screen-historical-timeline.html"],
      attributes: [],
      classNames: ["htimeline-screen", "w-full", "h-full"]
    });
  } else { derr("Controls.define unavailable"); }
} catch (e) { derr("Controls.define threw", e); }

/**
 * Open the timeline screen. Pass "shell" from the main menu (cross-game rankings only)
 * or "game" from the in-game dock (full four-tab panel); omit to auto-detect.
 * @param {"shell"|"game"} [mode] The mode to render in.
 */
export function openTimelineScreen(mode) {
  _pendingMode = mode === "shell" || mode === "game" ? mode : null;
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      const ContextManager = m.default || m.ContextManager || m;
      ContextManager.push("screen-historical-timeline", { singleton: true });
    })
    .catch((e) => derr("context-manager import failed", e));
}
