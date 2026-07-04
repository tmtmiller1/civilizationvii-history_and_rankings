# Changelog

All notable changes to the Historical Timeline mod are documented here. Format
follows Keep a Changelog; this mod adheres to semantic versioning.

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
