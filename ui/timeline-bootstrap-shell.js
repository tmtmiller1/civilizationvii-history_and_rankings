// timeline-bootstrap-shell.js
//
// Shell-scope entry (executed at the main menu). Registers the screen control and
// adds the main-menu button. Does NOT capture or read a game — the screen falls
// back to the cross-game archive, which lives in user storage.

import { derr } from "/history-and-rankings/ui/timeline-log.js";

function boot() {
  import("/history-and-rankings/ui/screen-historical-timeline.js").catch((e) => derr("screen import failed", e));
  import("/history-and-rankings/ui/timeline-mainmenu.js")
    .then((m) => m.installMainMenuButton())
    .catch((e) => derr("mainmenu install failed", e));
}

if (typeof engine !== "undefined" && typeof engine.whenReady?.then === "function") {
  engine.whenReady.then(boot).catch((e) => derr("whenReady threw", e));
} else { boot(); }
