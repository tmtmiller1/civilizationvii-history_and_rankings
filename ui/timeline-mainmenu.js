// timeline-mainmenu.js
//
// Main-menu entry: decorates the shell's main-menu and appends one extra button
// ("Historical Timeline") that opens our screen with NO game loaded — the
// archive/compare view reads only user-scoped storage, so it works at the menu.
// Fully namespaced + idempotent + guarded so it can never break the menu.

import { dlog, derr } from "/history-and-rankings/ui/timeline-log.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";
import { openTimelineScreen } from "/history-and-rankings/ui/screen-historical-timeline.js";

class TimelineMenuDecorator {
  constructor(component) { this._c = component; }
  beforeAttach() {}
  afterAttach() { try { this._inject(); } catch (e) { derr("menu inject failed", e); } }
  beforeDetach() {}
  afterDetach() {}
  _isMenuLabel(node, needle) {
    const cap = String(node?.getAttribute?.("caption") || "").toUpperCase();
    const txt = String(node?.textContent || "").toUpperCase();
    return cap.includes(needle) || txt.includes(needle);
  }

  _insertPosition(box, b) {
    const kids = Array.from(box.children || []);
    const afterAdditional = kids.find((n) => this._isMenuLabel(n, "ADDITIONAL"));
    if (afterAdditional && afterAdditional.nextSibling) {
      box.insertBefore(b, afterAdditional.nextSibling);
      return;
    }
    const beforeOptions = kids.find((n) => this._isMenuLabel(n, "OPTIONS"));
    if (beforeOptions) { box.insertBefore(b, beforeOptions); return; }
    box.appendChild(b);
  }

  _inject() {
    const root = this._c?.Root; if (!root) return;
    const box = root.querySelector(".main-menu-button-container"); if (!box) return;
    if (box.querySelector(".htimeline-menu-button")) return;
    const b = document.createElement("fxs-text-button");
    b.classList.add("main-menu-text-button", "self-start", "whitespace-nowrap", "htimeline-menu-button");
    b.setAttribute("type", "big");
    b.setAttribute("centered", "false");
    b.setAttribute("highlight-style", "decorative");
    b.setAttribute("caption", loc("LOC_HTIMELINE_MENU_RANKINGS", "History & Rankings").toUpperCase());
    b.setAttribute("data-tooltip-style", "none");
    b.addEventListener("action-activate", () => { try { openTimelineScreen("shell"); } catch (_) { /* */ } });
    this._insertPosition(box, b);
    dlog("main-menu button injected");
  }
}

export function installMainMenuButton() {
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate("main-menu", (val) => new TimelineMenuDecorator(val));
      dlog("main-menu decorator registered");
    }
  } catch (e) { derr("main-menu decorate threw", e); }
}
