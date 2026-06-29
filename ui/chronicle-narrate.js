// chronicle-narrate.js
//
// Each event -> one localized sentence via positional params, so translators
// control word order (no concatenated English). Pure templates, never an LLM.

import { loc } from "/history-and-rankings/ui/timeline-i18n.js";

function ageName(age) { return loc("LOC_" + age + "_NAME", String(age).replace(/^AGE_/, "")); }

const TEMPLATES = {
  born: (d) => loc("LOC_HTIMELINE_NARR_BORN",
    "In the {1_Age}, {2_Leader} forged the {3_Civ} people.", ageName(d.age), d.leader, d.civName),
  civ_change: (d) => loc("LOC_HTIMELINE_NARR_CHANGE",
    "At the dawn of the {1_Age}, the people remade themselves from {2_Prev} into {3_Civ}.",
    ageName(d.age), d.prevCiv, d.civName),
  took_lead: (_d) => loc("LOC_HTIMELINE_NARR_LEAD", "They rose to first among the world's powers."),
  eliminated: (d) => loc("LOC_HTIMELINE_NARR_END", "{1_Leader}'s line passed from history.", d.leader)
};

export function narrateEvent(ev) {
  const f = TEMPLATES[ev.type];
  return f ? f(ev.data) : "";
}

export function narrateByPlayer(events) {
  const byPid = {};
  for (const ev of events) (byPid[ev.pid] ||= []).push(ev);
  const out = [];
  for (const pid in byPid) {
    out.push({ pid, sentences: byPid[pid].map(narrateEvent).filter(Boolean), events: byPid[pid] });
  }
  return out;
}
