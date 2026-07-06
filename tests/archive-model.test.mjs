import test from "node:test";
import assert from "node:assert/strict";

import {
  localPlayer,
  localScore,
  localLand,
  statusOf,
  statusClass,
  overallScore,
  maxOf,
  archiveStats,
  worldLeader,
  LEADER_LADDER,
  RANK_LIMIT,
} from "../ui/archive-model.js";

// A saved run with one local player. Fields mirror what timeline-store persists.
function game(overrides = {}) {
  const { player, ...rest } = overrides;
  return {
    localPid: 0,
    players: { 0: { finalScore: 100, finalLand: 40, ...(player || {}) } },
    ...rest,
  };
}

test("localPlayer resolves the local player, or null when unavailable", () => {
  const g = game();
  assert.equal(localPlayer(g), g.players[0]);
  assert.equal(localPlayer(null), null);
  assert.equal(localPlayer({ players: { 0: {} } }), null); // no localPid
  assert.equal(localPlayer({ localPid: 3, players: {} }), undefined); // pid not present
});

test("localScore / localLand read finals and default to 0", () => {
  assert.equal(localScore(game({ player: { finalScore: 512 } })), 512);
  assert.equal(localLand(game({ player: { finalLand: 77 } })), 77);
  assert.equal(localScore({ localPid: 0, players: { 0: {} } }), 0); // missing field
  assert.equal(localLand({ localPid: 0, players: { 0: {} } }), 0);
  assert.equal(localScore(null), 0);
  assert.equal(localLand(null), 0);
});

test("statusOf honors an explicit status first", () => {
  assert.equal(statusOf(game({ status: "completed" })), "completed");
  assert.equal(statusOf(game({ status: "in_progress" })), "in_progress");
});

test("statusOf: outcome takes precedence over derived state", () => {
  // abandoned outcome maps to in_progress even if the player was eliminated
  assert.equal(
    statusOf(game({ outcome: "abandoned", player: { eliminatedTurn: 12 } })),
    "in_progress"
  );
  assert.equal(statusOf(game({ outcome: "in_progress" })), "in_progress");
});

test("statusOf: derived completed from elimination or reaching the modern age", () => {
  assert.equal(statusOf(game({ player: { eliminatedTurn: 30 } })), "completed");
  assert.equal(statusOf(game({ lastAge: "AGE_MODERN" })), "completed");
});

test("statusOf: defaults to in_progress with nothing to go on", () => {
  assert.equal(statusOf(game()), "in_progress");
  assert.equal(statusOf(null), "in_progress");
});

test("statusClass maps status to a css class", () => {
  assert.equal(statusClass(game({ status: "completed" })), "is-completed");
  assert.equal(statusClass(game()), "is-progress");
});

test("overallScore is the run's own score, ignoring the max args", () => {
  const g = game({ player: { finalScore: 250 } });
  assert.equal(overallScore(g), 250);
  assert.equal(overallScore(g, 9999, 8888), 250); // maxScore/maxLand are inert
});

test("maxOf returns the run's score/land pair", () => {
  assert.deepEqual(maxOf(game({ player: { finalScore: 3, finalLand: 9 } })), { s: 3, l: 9 });
});

test("archiveStats takes the max across games, with a floor of 1", () => {
  const games = [
    game({ player: { finalScore: 100, finalLand: 20 } }),
    game({ player: { finalScore: 300, finalLand: 50 } }),
  ];
  assert.deepEqual(archiveStats(games), { maxScore: 300, maxLand: 50 });
  assert.deepEqual(archiveStats([]), { maxScore: 1, maxLand: 1 }); // floor
});

test("worldLeader maps score fraction onto the ladder", () => {
  const best = 1000;
  assert.equal(worldLeader(best, best), LEADER_LADDER[0]); // top → Cincinnatus
  assert.equal(worldLeader(0, best), LEADER_LADDER.at(-1)); // bottom of ladder
  assert.equal(worldLeader(0, 0), LEADER_LADDER.at(-1)); // no best → bottom
  // clamps when a run somehow exceeds the recorded best
  assert.equal(worldLeader(best * 2, best), LEADER_LADDER[0]);
  // a middling run lands in the middle of the ladder
  const mid = worldLeader(500, 1000);
  assert.ok(LEADER_LADDER.includes(mid));
  assert.notEqual(mid, LEADER_LADDER[0]);
  assert.notEqual(mid, LEADER_LADDER.at(-1));
});

test("ladder and rank-limit constants are stable", () => {
  assert.equal(LEADER_LADDER[0], "Cincinnatus");
  assert.equal(LEADER_LADDER.length, 18);
  assert.equal(RANK_LIMIT, 25);
});
