// timeline-bootstrap.js
//
// Game-scope entry (executed in a loaded game). Always starts lineage capture
// and the recap flush; registers the integrated companion tab; installs the
// standalone dock only when Demographics is absent (integrated mount wins).

import { dlog, derr } from "/history-and-rankings/ui/timeline-log.js";
import { demographicsPresent } from "/history-and-rankings/ui/timeline-companion.js";

function boot() {
  import("/history-and-rankings/ui/timeline-capture.js")
    .then((m) => m.startLineageCapture()).catch((e) => derr("capture start failed", e));
  import("/history-and-rankings/ui/timeline-recap.js")
    .then((m) => m.installRecapFlush()).catch((e) => derr("recap install failed", e));
  import("/history-and-rankings/ui/timeline-companion.js")
    .then((m) => m.registerCompanionPanel()).catch((e) => derr("companion register failed", e));

  const installDock = () => {
    if (demographicsPresent()) { dlog("Demographics present; skipping standalone dock"); return; }
    import("/history-and-rankings/ui/timeline-dock-decorator.js")
      .then((m) => m.installTimelineDock()).catch((e) => derr("dock install failed", e));
  };
  if (typeof Loading !== "undefined" && typeof Loading.runWhenLoaded === "function") Loading.runWhenLoaded(installDock);
  else setTimeout(installDock, 250);
}

if (typeof engine !== "undefined" && typeof engine.whenReady?.then === "function") {
  engine.whenReady.then(boot).catch((e) => derr("whenReady threw", e));
} else { boot(); }
