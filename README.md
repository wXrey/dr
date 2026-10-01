# dr

**Black Reliquary** — a dark-gothic survivors-like for desktop web (PixiJS + TypeScript).
WASD to move, Space to roll (invulnerable while rolling), weapons fire on their own. Survive 15 minutes,
kill a boss every 3, collect relics.

- `black-reliquary.html` — playable single-file build: just open it in a browser.
- `game/` — source (see `game/README.md`): deterministic simulation in `src/core`, renderer with cut-out
  character rigs in `src/render`, synthesized audio, art pipeline in `tools/`.
- `assets/` — source art (generated with Grok, magenta backgrounds); `missing-assets.md` lists prompts for more.

```sh
cd game
npm install
npm run assets   # process ../assets into game-ready sprites (once, or `assets:watch` while adding art)
npm run dev      # http://127.0.0.1:5173
```
