// timeline-sampler.js
//
// Per-turn + age-change subscription with a kill switch: after N consecutive
// throws it unsubscribes itself so a broken capture never spams the log or
// degrades the turn loop (reference §E).

import { derr } from "/history-and-rankings/ui/timeline-log.js";

let _turnRef = null, _ageRef = null, _errs = 0, _dead = false;
const KILL = 3;

export function startSampler({ onTurn, onAge }) {
  try {
    stopSampler();
    _dead = false; _errs = 0;
    _turnRef = (data) => safe("onTurn", () => onTurn && onTurn(data));
    _ageRef = (data) => safe("onAge", () => onAge && onAge(data));
    engine.on("PlayerTurnActivated", _turnRef);
    engine.on("PlayerAgeTransitionComplete", _ageRef);
  } catch (e) { derr("startSampler threw", e); }
}

export function stopSampler() {
  try { if (_turnRef) engine.off("PlayerTurnActivated", _turnRef); } catch (_) { /* ignore */ }
  try { if (_ageRef) engine.off("PlayerAgeTransitionComplete", _ageRef); } catch (_) { /* ignore */ }
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
