# Changelog

All notable changes to the Historical Timeline mod are documented here. Format
follows Keep a Changelog; this mod adheres to semantic versioning.

## [Unreleased]

### Fixed
- **Defeated players are now recorded.** Elimination was never captured, so a conquered
  player's game stayed marked "In Progress" forever and never earned a verdict, and a
  defeated rival kept rendering as a live lane. Elimination is now derived when a player
  drops out of the living majors, driving the dagger marker, the "Eliminated" verdict, and
  the defeat/completed status.
- **A just-finished game's Historical Map no longer goes missing.** The map-replay cache
  evicted the numerically-smallest game seed instead of the oldest game, so a recent game's
  replay could be dropped while an older one was kept. Eviction now tracks true recency.
- **The archive Chronicle shows the leader's name, not its raw type** (e.g. "Augustus", not
  "LEADER_AUGUSTUS").
- **Fewer redundant per-turn captures.** Global timeline frames were recorded once per civ
  each round; they are now recorded once per round on the local player's turn.

## [1.1.2] - 2026-07-10

A bug-fix release addressing two issues that could make the mod appear broken.

### Fixed
- **History & Rankings screen appeared completely blank.** Several pieces of
  interface text (including the "no past games yet" message and the World Leader
  titles) were styled `font-style: italic`. Civ VII's interface font engine ships
  no italic face and does not synthesize one, so that text rendered as invisible
  zero-size glyphs — leaving the screen looking empty even though it was drawing
  correctly. All such text is now `font-style: normal` and displays properly.
- **Mod name showed as `LOC_HTIMELINE_MOD_NAME` in the Mods manager.** The mod's
  name/description localization was not being loaded early enough for the manager
  to resolve it. Added the top-level `<LocalizedText>` block so the name and
  description display correctly.

### Known issues
- On heavily-modded setups the cross-game archive shown at the main menu can come
  up empty. This is a Civ VII storage limitation (browser-storage reads can return
  the wrong value once many mods each persist data) and is tracked for a future
  release — see `docs/backlog.md`. Your finished games are still recorded; only the
  menu's ability to read them back is affected, and only when many mods are active.

## [1.1.1] - 2026-07-06

A code-quality and reliability release. There are **no gameplay or interface
changes** — every screen behaves exactly as in 1.1.0 — but the archive/rankings
code has been restructured into smaller, single-purpose modules and now ships
with an automated test safety net, so future updates are less likely to
regress.

### Quality
- **Archive/rankings refactor into layered modules.** The largest source file,
  `view-archive.js` (445 lines), was split along clean seams with its behavior
  preserved exactly: pure run logic (status, score, ranking, the world-leader
  ladder) moved to a new dependency-free `archive-model.js`; shared presentation
  helpers to `archive-format.js`; and the Civilization Rankings leaderboard to
  its own `view-rankings.js`. Every module is now well under the project's
  250-line gate, making the code easier to read, test and change safely.
- **First automated test suite.** Added unit tests (`node --test`) covering the
  extracted run logic — status resolution, score/land reads, ranking stats and
  the world-leader ladder mapping — plus the runtime helpers that read live game
  state (safe defaults when the engine globals are absent; correct age, turn,
  player and seed when present). This is the mod's first regression coverage.
- **Tests wired into the release gate.** `npm run verify` — the check that must
  pass before a release build is produced — now runs the test suite alongside
  the existing ESLint and syntax passes, so a regression can no longer ship.
- **Clean-bill quality audit.** A full audit (lint, per-file syntax check,
  source-structure and complexity profiling) records a passing baseline with no
  outstanding code-quality violations.

## [1.1.0] - 2026-07-04

A localization release, bringing the mod to parity with the Demographics mod's
recent full-localization pass. Polish is now a fully translated language, every
remaining hardcoded interface string has been moved behind a translation tag,
and displayed numbers now format for the player's language.

### Added
- **Polish (pl_PL) localization.** Polish is now a supported language with a
  complete translation covering every string in the mod, using the game's own
  Polish terminology (*Tura*, *Era*, *Cywilizacja*, *Przywódca*, *Wynik*). This
  brings the mod to eleven fully localized languages.
- **Full translation coverage for the interface.** Strings that were still
  hardcoded in English — the Historical Map's terrain legend (*Water / Land /
  Mountain*) and the Chronicle's "Player N" leader fallback — now resolve
  through translation tags, so they localize with the rest of the UI.
- **Completed the ten existing translations.** Three interface strings were used
  in code but never defined in any language (the *Completed* / *In Progress*
  run-status badges and the archive-summary caption), so they always showed
  their English fallback; the long "no replay recorded" map message was defined
  in English only and missing from every translation. All are now translated in
  German, Spanish, French, Italian, Japanese, Korean, Portuguese (BR), Russian
  and Simplified Chinese.

### Fixed
- **Numbers now format for the player's language.** Scores, land figures and
  turn counts on the rankings board, archive rows, compare bars and detail
  header previously always used English digit grouping. They now route through
  the game's own `Locale.toNumber`, the same API the base game uses, so a German
  player sees `1.234` and a French player `1 234`. Off-engine it falls back to
  the previous formatting, so nothing regresses.

## [1.0.0]

A post-game **History & Rankings** companion — in the spirit of Civilization V's
beloved replay screen — reachable from the main menu and from the in-game timeline.

### Added
- **Civilization Rankings** — your past games as a leaderboard: a gold/silver/bronze
  top-3 podium beside a ranked list (top 25) by the civilization's own **in-game score**
  (`Player.Stats.getScore()`, captured per run — the value the game itself keeps). Each
  entry is headlined by **Leader · civ lineage** (e.g. "Augustus · Rome → America"), with
  colored civ-progression chips and the run's result (reached age / eliminated turn).
- **World Leader titles** — in the spirit of Civilization V's end-game honor roll, every
  run earns a historical world-leader title from where its score lands relative to your
  best game. The top run is crowned **Cincinnatus**, descending a data-driven ladder of
  leaders to the bottom. Shown on each podium card, ranked row, and the per-run detail.
- **Historical Map** — a Civ V-style replay of the actual game world: a downsampled hex
  minimap (water / land / mountain) with each civilization's territory filled in its
  real color, cities marked, a **turn scrubber** to play the empire's expansion through
  the game, and a legend mapping colors to civs.
- **Lineage** — each leader's civilization across every age.
- **Chronicle** — a fully local, template-built narrative of the game.
- Click any ranked run to open its Lineage / Chronicle / Historical Map.
- Cross-session persistence of the games archive and per-run map replays.
- Ten localized languages: en, de, es, fr, it, ja, ko, pt-BR, ru, zh-Hans.
