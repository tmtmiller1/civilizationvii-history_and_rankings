# Historical Timeline

Tells the story of every civilization across the ages — accessible from the main
menu and from the in-game dock. Four views:

- **Lineage** — each leader's civilization through every age.
- **Chronicle** — a generated, fully local narrative of the game.
- **Living Map** — empires growing and changing across captured frames.
- **Archive** — past games remembered and compared side by side.

## Privacy

No network, no LLM, no telemetry. The chronicle is built entirely from local
`Locale.compose` templates. Past-game records live in browser `localStorage` and
the engine's user store so the archive survives back to the main menu.

## Compatibility

Depends only on `base-standard`. Demographics integration is optional/runtime —
not a hard dependency. All identifiers are namespaced (`LOC_HTIMELINE_*`,
`HistoricalTimeline__*`) to avoid conflicts with other mods.

## Build

Dev tooling lives in this folder and is excluded from the shipped zip.

```sh
npm install
npm run verify   # lint + node syntax check
./release.sh     # produces dist/historical-timeline-vX.Y.Z.zip
```
