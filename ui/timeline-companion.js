// timeline-companion.js
//
// Integrated mode: register a top-level "Historical Timeline" tab in the
// Demographics screen. Order-independent via the shared `pending` queue — works
// whether Demographics loads before or after us. No hard dependency.

import { dlog } from "/history-and-rankings/ui/timeline-log.js";

export function demographicsPresent() {
  const api = globalThis.DemographicsMetricsAPI;
  return !!(api && typeof api.registerPanel === "function");
}

export function withDemographicsApi(job) {
  const api = (globalThis.DemographicsMetricsAPI ??= {});
  if (typeof api.registerPanel === "function") { try { job(api); } catch (_) { /* */ } return true; }
  (api.pending ??= []).push(job);
  return false;
}

const PANEL_SPEC = {
  id: "htimeline_panel",
  pageLabel: "LOC_HTIMELINE_TAB",
  title: "LOC_HTIMELINE_TITLE",
  topLevel: true,
  tabs: [
    { id: "ribbon", label: "LOC_HTIMELINE_SUB_RIBBON", title: "LOC_HTIMELINE_SUB_RIBBON_T" },
    { id: "chronicle", label: "LOC_HTIMELINE_SUB_CHRONICLE", title: "LOC_HTIMELINE_SUB_CHRONICLE_T" },
    { id: "map", label: "LOC_HTIMELINE_SUB_MAP", title: "LOC_HTIMELINE_SUB_MAP_T" },
    { id: "archive", label: "LOC_HTIMELINE_SUB_ARCHIVE", title: "LOC_HTIMELINE_SUB_ARCHIVE_T" }
  ],
  render: (container, ctx, subId) => {
    import("/history-and-rankings/ui/timeline-panel.js")
      .then((m) => m.renderPanel(container, ctx, subId))
      .catch(() => { try { container.textContent = ""; } catch (_) { /* */ } });
  }
};

export function registerCompanionPanel() {
  const ran = withDemographicsApi((api) => { api.registerPanel(PANEL_SPEC); dlog("panel registered into Demographics"); });
  dlog(ran ? "Demographics present" : "Demographics deferred/absent");
}
