# Changelog

All notable changes to the Historical Timeline mod are documented here. Format
follows Keep a Changelog; this mod adheres to semantic versioning.

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
