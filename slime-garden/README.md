# Slime garden

A small, peaceful garden for the approved mint slime. Feed regenerating berries, collect Glow while you watch, spend Glow on upgrades, and welcome companions when they are ready. Leaving earns up to eight hours of progress. Nobody goes hungry if you are away.

Play: [https://tjunyamasaki.github.io/slime-garden/](https://tjunyamasaki.github.io/slime-garden/)  
Also listed from [Games](/links/).

## How to play

- Select a slime, then **Offer berry**. Feeding is optional; Glow still grows on its own.
- Spend Glow on the berry shrub, pantry, glow bloom, and resting pads.
- When the companion strip is ready, **Welcome companion**. You choose when someone new arrives.
- Settings cover reduced motion, pausing the scene (Glow still grows), optional sound (off by default), quality, export, import, and reset. Reset removes only this game’s save keys.

A second tab that cannot take the writer lock stays read-only. If 3D cannot start, feeding, upgrades, and saving still work.

## This MVP

One habitat, one slime appearance, up to six residents, one food, one currency, four upgrade tracks, local saves, and an eight-hour offline cap. There is no account, combat, breeding, cloud save, or paid currency.

The garden setting and visitor arrival are a provisional default. A later presentation can replace them without changing unlocks or saves.

## Play locally

From the repository root (`npm start` is `npx --yes serve .`):

```bash
npm start
```

Then open:

- Game: http://localhost:3000/slime-garden/
- Original slime preview: http://localhost:3000/slime-garden/reference/original-preview
- Actor inspection: http://localhost:3000/slime-garden/dev/inspection
- Six-slime stress: http://localhost:3000/slime-garden/dev/stress

`serve` defaults to port 3000. If the terminal prints a different Local URL, use that host with the same `/slime-garden/` path.

That local server may 301 `*.html` to the extensionless path and **drop query strings**. For autotests use `/slime-garden/dev/stress?autotest=1` and `/slime-garden/dev/inspection?autotest=1` (no `.html`). GitHub Pages serves the `.html` files directly.

Opening the HTML files as `file://` is not supported.

Economy and layout tests (no WebGL):

```bash
node --test slime-garden/tests/*.test.mjs
```

## Local modules, no CDN

Three.js **0.180.0** is vendored under `vendor/three/` (`three.module.js`, `three.core.js`, and `LICENSE`). The game and the comparison preview import that local copy. There is no runtime CDN.

The original handoff fragment imported Three from jsDelivr. `reference/original-preview.html` keeps that fragment’s comparison controls, camera, lights, materials, tone mapping, and floor. The only source-level behavior change is the import path `../vendor/three/three.module.js`. The unchanged handoff markdown is at `reference/anime-slime-handoff.md`.

Requires a modern browser with JavaScript. WebGL2 is required for the 3D garden.

## Limits

- Saves are local to this browser. Export a JSON file if you want a copy.
- Offline Glow stops after eight hours of absence; the clock then jumps to now.
- Real-phone and discrete-GPU frame times are not certified. Engineering notes: `docs/qa-results.md`.
