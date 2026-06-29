// timeline-source.js
//
// One resolver so the views never care where data comes from. Lineage is ALWAYS
// self-owned (decimation-proof). Frame history is opportunistic: prefer
// Demographics' ctx.history.samples[] when present, else our own self-capture.

import { readJSON } from "/history-and-rankings/ui/timeline-store.js";
import { readLedger } from "/history-and-rankings/ui/lineage-ledger.js";

export function resolveSource(ctx) {
  const ledger = readLedger();
  const demoHistory = ctx && ctx.history && Array.isArray(ctx.history.samples) ? ctx.history : null;
  const ownHistory = demoHistory ? null : readJSON("history-v1", { frames: [] });
  return {
    ledger,
    frames: demoHistory ? demoHistory.samples : (ownHistory.frames || []),
    ageBoundaries: demoHistory ? (demoHistory.ageBoundaries || []) : null,
    mode: demoHistory ? "demographics" : "standalone"
  };
}
