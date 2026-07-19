# Contributing

Thanks for your interest. History & Rankings is a read-only Civilization VII UI mod that archives finished games and presents them as a leaderboard, a replayable historical map, lineages, and a chronicle. This doc covers the setup, the one check to run before you submit, and the few conventions the code follows.

## Plain JavaScript, no build step

The mod is plain `.js`. Civ VII loads it directly into the Coherent GameFace engine at runtime — there is no transpile in the mod pipeline, and **what ships is exactly what you wrote** (no minification, no generated output). Please don't add `.ts` files or a build step.

## Setup

```sh
npm install
```

## Before you submit: `npm run verify`

```sh
npm run verify
```

This must pass with **zero errors and zero warnings**. It runs:

1. `eslint ui` — style + size limits.
2. `node -c` on every `ui/**/*.js` — a syntax check.

## Style limits (enforced by ESLint)

- cyclomatic complexity ≤ 10
- max statements per function ≤ 18
- max lines per function ≤ 50
- max nesting depth ≤ 4
- max parameters ≤ 5 (bundle extras into a single options/context object)
- line length ≤ 120

When a function trips a limit, prefer extracting a small, named helper or a context object over disabling the rule.

## Conventions

- **Defensive engine access.** The GameFace API surface can be absent or throw (`Configuration`, `UI.Player`, `GameplayMap`, etc. may be undefined). Guard with `typeof X !== "undefined"` and fall back cleanly — never assume an engine global exists. Bad canvas commands (invalid color strings, too many ops) can crash the renderer thread uncatchably, so sanitize colors before painting the minimap.
- **Persistence.** The games archive and per-run map replays are stored under a **single** `localStorage` key (`htlData`) — never add a second top-level `localStorage` key, as the engine wipes all of `localStorage` when a mod creates more than one. Per-game scratch data uses the GameConfiguration KV store (`Configuration.editGame().setValue` / `getGame().getValue`) under the `HistoricalTimeline__` namespace.
- **Isolates.** UIScripts run in separate V8 isolates (menu vs in-game); module caches do not share across contexts, so the reader must reload from persistence rather than trust an in-memory cache.
- **GameFace quirks.** The renderer rejects `hsl()` and `display:grid`/`1fr` — use hex colors and flexbox. Civ colors come from `UI.Player.getPrimaryColorValueAsString(playerId)`; the unique per-game id is `Configuration.getGame().gameSeed`.
- **Localization.** User-facing strings are LOC keys. Add every new key to all 10 locales under `text/<locale>/ModText.xml` (en_us is the base/fallback).
- **Comments.** Explain *why* (engine quirks, workarounds), not *what*.

## Project layout

```
ui/
  timeline-bootstrap*.js   entry UIScripts (in-game + main-menu shell)
  screen-historical-timeline.{js,html}   the History & Rankings screen
  timeline-panel.js        tab shell + drill-down navigation
  view-archive.js          Civilization Rankings (podium + ranked list)
  view-historical-map.js   the turn-by-turn hex-minimap replay
  view-chronicle.js / chronicle-narrate.js   the narrative chronicle
  lineage-*.js             per-leader lineage across ages
  timeline-capture.js / map-grid.js / territory-capture.js   per-turn capture
  timeline-store.js        persistence (single htlData key + GameConfig KV)
  styles/                  CSS
text/<locale>/ModText.xml  localized strings (10 locales)
```

## Releasing

`./release.sh` produces the upload zip and the Steam Workshop assets (preview PNG + `workshop_item.vdf`). It mutes debug logging in the dist copy and **always ships readable JS — there is no minification path.** The shipped file layout matches the dev tree.

## License

MIT. See [LICENSE](LICENSE). By contributing you agree your changes are licensed under the same terms.
