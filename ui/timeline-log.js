// timeline-log.js
//
// Tiny debug logger. DBG is flipped to false by release.sh in the shipped copy,
// so verbose traces never fire in production but stay available in source.

const DBG = true;

export function dlog(...a) {
  if (DBG) { try { console.log("[htimeline]", ...a); } catch (_) { /* ignore */ } }
}

export function derr(...a) {
  try { console.error("[htimeline]", ...a); } catch (_) { /* ignore */ }
}
