import test from "node:test";
import assert from "node:assert/strict";

import {
  currentAgeType,
  gameTurn,
  localPlayerId,
  seedOf,
} from "../ui/timeline-runtime.js";

test("runtime helpers degrade safely when globals are missing", () => {
  assert.equal(currentAgeType(), undefined);
  assert.equal(gameTurn(), 0);
  assert.equal(localPlayerId(), undefined);
  assert.equal(seedOf(), "unknown");
});

test("runtime helpers read values from provided globals", () => {
  globalThis.Game = { age: 1, turn: 27 };
  globalThis.GameInfo = { Ages: { lookup: () => ({ AgeType: "AGE_EXPLORATION" }) } };
  globalThis.GameContext = { localPlayerID: 3 };
  globalThis.Configuration = { getGame: () => ({ gameSeed: 777 }) };

  assert.equal(currentAgeType(), "AGE_EXPLORATION");
  assert.equal(gameTurn(), 27);
  assert.equal(localPlayerId(), 3);
  assert.equal(seedOf(), 777);

  delete globalThis.Game;
  delete globalThis.GameInfo;
  delete globalThis.GameContext;
  delete globalThis.Configuration;
});
