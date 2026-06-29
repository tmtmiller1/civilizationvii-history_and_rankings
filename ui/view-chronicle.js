// view-chronicle.js
//
// Per-leader prose cards. Each card is a paragraph of generated, localized prose
// with the civ-color accent, and a clickable mini-rail of event dots that drive
// the shared scrubber.

import { el, esc } from "/history-and-rankings/ui/timeline-dom.js";
import { buildEvents } from "/history-and-rankings/ui/timeline-events.js";
import { narrateByPlayer } from "/history-and-rankings/ui/chronicle-narrate.js";
import { buildLineageRows } from "/history-and-rankings/ui/lineage-read.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";

function indexRows() {
  const rows = buildLineageRows();
  return {
    nameByPid: Object.fromEntries(rows.map((r) => [r.pid, r.leaderName])),
    colorByPid: Object.fromEntries(rows.map((r) => [r.pid, r.stints.at(-1)?.color || "#888"]))
  };
}

function railFor(story, scrubber) {
  const rail = el("div", "htimeline-chron-rail");
  for (const evn of story.events) {
    const dot = el("span", "htimeline-chron-dot");
    dot.title = String(evn.turn);
    dot.addEventListener("click", () => scrubber && scrubber.goToTurn(evn.turn));
    rail.appendChild(dot);
  }
  return rail;
}

function card(story, idx) {
  const c = el("div", "htimeline-chron-card");
  c.style.borderLeft = `4px solid ${idx.colorByPid[story.pid] || "#888"}`;
  c.appendChild(el("div", "htimeline-chron-name", idx.nameByPid[story.pid] || ("#" + story.pid)));
  const p = el("div", "htimeline-chron-prose");
  p.innerHTML = story.sentences.map(esc).join(" ");
  c.appendChild(p);
  return c;
}

export function renderChronicle(host, ctx, scrubber) {
  host.textContent = "";
  const stories = narrateByPlayer(buildEvents(ctx));
  if (!stories.length) {
    host.appendChild(el("div", "htimeline-empty", loc("LOC_HTIMELINE_EMPTY", "No history captured yet.")));
    return;
  }
  const idx = indexRows();
  const wrap = el("div", "htimeline-chronicle");
  for (const story of stories) {
    const c = card(story, idx);
    c.appendChild(railFor(story, scrubber));
    wrap.appendChild(c);
  }
  host.appendChild(wrap);
}
