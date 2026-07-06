# Changelog

All notable changes to the Historical Timeline mod are documented here. Format
follows Keep a Changelog; this mod adheres to semantic versioning.

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
