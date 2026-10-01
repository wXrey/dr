# Black Reliquary

Top-down (¾ view) dark-gothic survivors-like for desktop web. WASD to move, SPACE to roll
(invulnerable while rolling), weapons fire automatically, 1/2/3 to pick cards, ESC to pause.

## Run

```sh
npm install
npm run dev            # http://127.0.0.1:5173
npm run assets:watch   # processes ../assets/** whenever new art lands (the game reloads on the menu)
```

## Build

```sh
npm run build          # -> dist/ (static files, relative paths)
npm run package        # build + ../black-reliquary-web.zip (upload as an itch.io HTML5 game)
npm run preview        # serve dist/ locally
```
The build must be served over http(s); opening `dist/index.html` directly from disk won't load the art.

## Art pipeline

Source art lives in `../assets/<category>/` exactly as generated (magenta background, JPG is fine).
`tools/process-assets.mjs` turns it into `public/assets/**` + `manifest.json`:

| folder | handling |
|---|---|
| `player`, `enemies`, `bosses`, `pets`, `weapons`, `items` | background keyed out, trimmed, downscaled |
| files with `parts`, `icons`, `gems`, `sheet` in the name, and everything in `props` | keyed, then split into one PNG per piece |
| `tiles` | resized to 512×512, no keying |
| `screens` | resized to 1920 wide, no keying |

The game finds art by keyword (e.g. any file in `enemies/` containing `werewolf` or `wolf`), so
file names just need to contain the obvious word. Anything missing renders as a placeholder.
`npm run assets:preview` also writes labelled previews to `tools/preview_*.jpg`.

## Code layout

- `src/core/` — deterministic simulation (seeded RNG, fixed 60 Hz step, no DOM). `data.ts` holds all
  content and balance numbers; `sim.ts` the systems; `cards.ts` level-up and relic choices.
  Runs headless: `npx tsx tools/smoke.ts`.
- `src/render/` — PixiJS 8 renderer: camera, ground/biomes, y-sorted sprites with procedural
  animation (bob, sway, roll spin with afterimages, hit punch), telegraphs, particles, lighting.
- `src/audio/` — every sound is synthesized with Web Audio (voice-limited); ambient drone per biome.
- `src/ui/` — DOM menu (armor / weapon / companion), HUD, cards, pause, end screen.
