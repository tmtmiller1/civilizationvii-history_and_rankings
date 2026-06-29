// timeline-store.js
//
// Two-tier persistence for Historical Timeline.
//
//   1. GAME store — Configuration.getGame()/editGame(). Survives save/load and
//      age transitions; lost at the main menu. This is the live working store
//      while a game is running (lineage-v1, history-v1).
//
//   2. USER mirror — Configuration.getUser() with a localStorage fallback. The
//      ONLY tier that survives a finished game to the SHELL (main menu). We
//      copy a compact recap here at flush time so the post-game screen can read
//      it without a game loaded. Verified by persist-probe: getUser + (window)
//      localStorage both round-trip game→menu; getGame does not.
//
// All ops are defensive: read-only if the engine surface is missing; never
// throw out to callers. We only ever write our own namespaced keys.

// NS prefixes the GAME-scope store keys (Configuration.editGame) — game-config, not
// localStorage, so it's unaffected by the localStorage single-key rule below.
const NS = "HistoricalTimeline__";

function ok(v) {
  return typeof v === "string" && v.length ? v : null;
}

// ---- game store (live, in-session) ----------------------------------------

export function readKey(key) {
  try {
    const g = Configuration?.getGame?.();
    const v = g && typeof g.getValue === "function" ? g.getValue(NS + key) : null;
    return ok(v);
  } catch (_) { return null; }
}

export function writeKey(key, str) {
  try { Configuration?.editGame?.()?.setValue?.(NS + key, str); return true; }
  catch (_) { return false; }
}

export function readJSON(key, fallback) {
  const raw = readKey(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

export function writeJSON(key, obj) { return writeKey(key, JSON.stringify(obj)); }

// ---- persistence: ONE localStorage key holding { archive, maps } ----------------
// This is the shape that WORKED early on: the menu reads a single small key reliably.
// What broke it later was creating MANY keys (a separate key per game map) — that count
// corrupted localStorage's per-key reads. So everything lives under one key now, the map
// replay is capped, and every stray key earlier builds created is purged on load.

const DATA_KEY = "htlData";
const MAP_KEEP = 3;

function ls() {
  try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch (_) { /* */ }
  return null;
}

// Read our single data object, re-reading once to defeat a transient empty read.
function readData() {
  const s = ls();
  if (!s) return {};
  let raw = null;
  try { raw = s.getItem(DATA_KEY); if (!raw) raw = s.getItem(DATA_KEY); } catch (_) { return {}; }
  if (!raw) return {};
  try { const o = JSON.parse(raw); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
  catch (_) { return {}; }
}

function writeData(data) {
  const s = ls();
  if (!s) return false;
  try { s.setItem(DATA_KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
}

function isStrayKey(k) {
  return k === "aHTLarchive2" || k.indexOf("mHTL2_") === 0 ||
    k.indexOf("HistoricalTimeline__") === 0 || k.indexOf("PersistProbe__") === 0;
}

// Keep localStorage minimal — remove the extra keys earlier builds created (their count is
// what corrupts per-key reads). Never touch our DATA_KEY, modSettings, or other mods' keys.
function purgeStrayKeys() {
  const s = ls();
  if (!s) return;
  try {
    for (let i = (s.length | 0) - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k !== DATA_KEY && k !== "modSettings" && isStrayKey(k)) {
        try { s.removeItem(k); } catch (_) { /* */ }
      }
    }
  } catch (_) { /* */ }
}

// ---- archive (the games list) ----

function asArchive(o) {
  return (o && typeof o === "object" && Array.isArray(o.games)) ? o : null;
}

/** Persist the cross-game archive under our single data key. */
export function saveRecap(obj) {
  purgeStrayKeys();
  const data = readData();
  data.archive = obj;
  return writeData(data);
}

/** Read the cross-game archive (or the fallback). */
export function loadRecap(fallback) {
  purgeStrayKeys();
  return asArchive(readData().archive) || fallback;
}

// ---- per-game map replay (in the same key; capped so it stays lean) ----

/** Persist one game's map replay, evicting the oldest past MAP_KEEP. */
export function saveGameMap(id, map) {
  if (id == null) return false;
  const data = readData();
  const maps = (data.maps && typeof data.maps === "object") ? data.maps : {};
  maps[String(id)] = map;
  const keys = Object.keys(maps);
  while (keys.length > MAP_KEEP) { delete maps[keys.shift()]; }
  data.maps = maps;
  return writeData(data);
}

/** Load one game's map replay by id, or null. */
export function loadGameMap(id) {
  if (id == null) return null;
  const maps = readData().maps;
  const m = (maps && typeof maps === "object") ? maps[String(id)] : null;
  return (m && (Array.isArray(m.frames) || m.grid)) ? m : null;
}

// Total bytes the archive LIST may use; oldest games dropped past this. The list now
// holds only lightweight per-game summaries (the heavy minimap replay lives under its
// own per-game key, see saveGameMap), so this stays small and always writes cleanly.
const ARCHIVE_CAP = 32000;

// The id of the one-time injected diagnostic game — filtered out everywhere so it
// disappears on the next save.
const TEST_GAME_ID = 424242;

/** Read the archive of past games (most-recent first), or an empty archive. */
export function loadArchive() {
  const a = loadRecap(null);
  const games = (a && Array.isArray(a.games)) ? a.games.filter((g) => g && g.id !== TEST_GAME_ID) : [];
  return { version: 1, games };
}

/**
 * Prepend a finished game's recap, dedupe by id, and cap by total bytes. Returns
 * true if mirrored to a shell-readable store. Safe with no live game.
 */
export function appendGame(recap) {
  if (!recap || recap.id == null) return false;
  const a = loadArchive();
  const games = [recap, ...a.games.filter((g) => g && g.id !== recap.id)];
  while (games.length > 1 && JSON.stringify(games).length > ARCHIVE_CAP) games.pop();
  return saveRecap({ version: 1, games });
}
