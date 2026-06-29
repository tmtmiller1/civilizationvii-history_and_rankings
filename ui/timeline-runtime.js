// timeline-runtime.js
//
// Verified runtime reads (reference §D/§K). Player id is stable across ages;
// civilizationType changes, leaderType does not. Every accessor is defensive so
// a renamed engine surface degrades to a safe default rather than throwing.

export function currentAgeType() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return undefined;
    const row = GameInfo?.Ages?.lookup?.(Game.age);
    return row && typeof row.AgeType === "string" ? row.AgeType : undefined;
  } catch (_) { return undefined; }
}

export function gameTurn() {
  try { return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0; }
  catch (_) { return 0; }
}

export function civType(pid) {
  try {
    const ct = Players?.get?.(pid)?.civilizationType;
    return GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType ?? null;
  } catch (_) { return null; }
}

export function leaderType(pid) {
  try {
    const lt = Players?.get?.(pid)?.leaderType;
    return GameInfo?.Leaders?.lookup?.(lt)?.LeaderType ?? null;
  } catch (_) { return null; }
}

function fallbackAliveIds() {
  try {
    let ids = [];
    if (typeof Players?.getAliveIds === "function") {
      const a = Players.getAliveIds();
      if (Array.isArray(a)) ids = a.slice();
    } else if (typeof Players?.getAlive === "function") {
      ids = (Players.getAlive() || [])
        .map((p) => (typeof p === "number" ? p : p?.id))
        .filter((v) => typeof v === "number");
    }
    return ids.filter((id) => { try { return isMajor(id); } catch (_) { return false; } });
  } catch (_) { return []; }
}

export function aliveMajorIds() {
  try {
    if (typeof Players !== "undefined" && typeof Players.getAliveMajorIds === "function") {
      const arr = Players.getAliveMajorIds();
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) { /* fall through */ }
  return fallbackAliveIds();
}

export function isMajor(pid) {
  try { const p = Players?.get?.(pid); return !!p && p.isMajor !== false; } catch (_) { return false; }
}

export function localPlayerId() {
  try {
    const v = GameContext?.localPlayerID;
    if (typeof v === "number") return v;
    const o = GameContext?.localObserverID;
    return typeof o === "number" ? o : undefined;
  } catch (_) { return undefined; }
}

// A UNIQUE per-game id. gameSeed (the game's RNG seed) is distinct per game and stable
// across save/reload; mapSeed/startPosition are fallbacks. The old startPosition value
// was shared across games, so every game collided to one archive entry.
export function seedOf() {
  try {
    const g = Configuration?.getGame?.();
    return g?.gameSeed ?? g?.mapSeed ?? g?.startPosition ?? "unknown";
  } catch (_) { return "unknown"; }
}
