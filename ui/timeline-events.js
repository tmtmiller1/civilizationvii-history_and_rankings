// timeline-events.js
//
// Unifies captured data into one sorted event stream: born / civ_change /
// took_lead / eliminated. Lineage drives identity events; frame history adds
// rank crossings. Wars/wonders are added only if a source exposes them.

import { buildLineageRows } from "/history-and-rankings/ui/lineage-read.js";
import { resolveSource } from "/history-and-rankings/ui/timeline-source.js";

function lineageEvents(rows, ev) {
  for (const row of rows) {
    row.stints.forEach((st, i) => {
      ev.push({
        turn: st.firstTurn, pid: row.pid,
        type: i === 0 ? "born" : "civ_change",
        data: {
          age: st.age, civ: st.civ, civName: st.civName,
          prevCiv: i ? row.stints[i - 1].civName : null, leader: row.leaderName
        }
      });
    });
    if (row.eliminatedTurn != null) {
      ev.push({ turn: row.eliminatedTurn, pid: row.pid, type: "eliminated", data: { leader: row.leaderName } });
    }
  }
}

function addRankShifts(ev, frames) {
  const prevRank = {};
  for (const f of frames) {
    const players = f.players || {};
    const ranked = Object.keys(players)
      .map((pid) => [pid, players[pid].score || 0])
      .sort((a, b) => b[1] - a[1]);
    ranked.forEach(([pid], idx) => {
      const rank = idx + 1, was = prevRank[pid];
      if (was != null && rank === 1 && was !== 1) ev.push({ turn: f.turn, pid, type: "took_lead", data: { rank } });
      prevRank[pid] = rank;
    });
  }
}

export function buildEvents(ctx) {
  const src = resolveSource(ctx);
  const rows = buildLineageRows();
  const ev = [];
  lineageEvents(rows, ev);
  addRankShifts(ev, src.frames || []);
  ev.sort((a, b) => a.turn - b.turn);
  return ev;
}
