// timeline-dock-decorator.js
//
// Standalone in-game entry: adds a button to the HUD sub-system dock that opens
// our own screen. Only installed when Demographics is absent (integrated tab
// wins). Verbatim-faithful to emigration's dock decorator pattern.

import { dlog, derr } from "/history-and-rankings/ui/timeline-log.js";
import { openTimelineScreen } from "/history-and-rankings/ui/screen-historical-timeline.js";

class TimelineDockDecorator {
  constructor(panel) { this._panel = panel; }
  beforeAttach() {}
  afterAttach() {
    try {
      this._panel.addButton({
        tooltip: "LOC_HTIMELINE_OPEN",
        modifierClass: "htimeline",
        callback: () => openTimelineScreen("game"),
        class: ["htimeline-dock-button"],
        audio: "data-audio-tab-selected",
        focusedAudio: "data-audio-focus-small"
      });
    } catch (e) { derr("addButton threw", e); }
  }
  beforeDetach() {}
  afterDetach() {}
}

export function installTimelineDock() {
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate("panel-sub-system-dock", (val) => new TimelineDockDecorator(val));
      dlog("dock decorator registered");
    }
  } catch (e) { derr("Controls.decorate threw", e); }
}
