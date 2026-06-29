// timeline-capture.js
//
// Starts all capture once at boot: the lineage ledger, a lightweight per-turn
// land frame, and the per-civ territory centroid. We ALWAYS self-capture the
// frame + territory now — even when Demographics is present — because that data
// is what gets baked into the archive recap so the menu's Historical Map can
// replay a finished game with no game (and no Demographics ctx) loaded. The live
// in-game views still prefer Demographics' richer samples; this is purely the
// self-owned series the archive needs. Idempotent: safe to call repeatedly.

import { startSampler } from "/history-and-rankings/ui/timeline-sampler.js";
import { captureNow } from "/history-and-rankings/ui/lineage-ledger.js";
import { captureFrame } from "/history-and-rankings/ui/timeline-history.js";
import { maybeCaptureTerritory } from "/history-and-rankings/ui/territory-capture.js";
import { captureMapGrid } from "/history-and-rankings/ui/map-grid.js";
import { flushRecap } from "/history-and-rankings/ui/timeline-recap.js";

let _started = false;
let _sinceFlush = 0;
const FLUSH_EVERY = 4; // mirror the in-progress game to the archive every few turns

function selfCapture(force) {
  try { captureFrame(); } catch (_) { /* ignore */ }
  try { maybeCaptureTerritory(force); } catch (_) { /* ignore */ }
  try { captureMapGrid(force); } catch (_) { /* ignore */ }
}

// Mirror the running game into the archive periodically so an UNFINISHED game shows
// up in the menu list without relying on a clean exit (BeforeUnload isn't guaranteed).
function maybeFlush() {
  if (++_sinceFlush < FLUSH_EVERY) return;
  _sinceFlush = 0;
  try { flushRecap(); } catch (_) { /* ignore */ }
}

export function startLineageCapture() {
  if (_started) return;
  _started = true;
  try { captureNow(); } catch (_) { /* ignore */ }
  selfCapture(true);
  startSampler({
    onTurn: () => { captureNow(); selfCapture(false); maybeFlush(); },
    onAge: () => { captureNow(); selfCapture(true); }
  });
}
