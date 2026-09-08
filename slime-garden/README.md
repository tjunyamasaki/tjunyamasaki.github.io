# Slime garden

A small, peaceful habitat for the approved mint anime slime. The `/slime-garden/` entry is a playable DOM garden: feed berries, collect Glow, buy upgrades, welcome companions, and keep a local save. The 3D habitat is still a placeholder; comparison, inspection, and six-actor stress pages remain for the approved slime.

## Play locally

From the repository root (this site already uses `npm start` as `npx --yes serve .`):

```bash
npm start
```

Then open:

- Game entry: http://localhost:3000/slime-garden/
- Original comparison preview: http://localhost:3000/slime-garden/reference/original-preview.html
- Extracted actor inspection: http://localhost:3000/slime-garden/dev/inspection.html
- Six-actor stress: http://localhost:3000/slime-garden/dev/stress.html

`serve` defaults to port 3000. If the terminal prints a different Local URL, use that host and port with the same `/slime-garden/` path.

The local `serve` tool may 301 `/slime-garden/reference/original-preview.html` to `/slime-garden/reference/original-preview` (it strips `.html`). Browsers follow that redirect; both paths are the same file.

No extra test script is required at the repository root. Use the existing `package.json` scripts only; this game does not add a root test command.

Opening the HTML files as `file://` is not a supported runtime.

## Local modules, no CDN

Three.js **0.180.0** is vendored under `vendor/three/` (`three.module.js`, `three.core.js`, and `LICENSE`). The game entry and the comparison preview import that local copy. There is no runtime CDN.

The original handoff fragment imported Three from jsDelivr:

`https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js`

`reference/original-preview.html` keeps that fragment’s comparison controls, camera, lights, materials, tone mapping, and floor. The only source-level behavior change is switching that import to:

`../vendor/three/three.module.js`

The unchanged handoff markdown is at `reference/anime-slime-handoff.md`.

Requires a modern browser with JavaScript. The comparison preview also needs WebGL2.

## Playable garden (DOM)

The main page loads a local save (or starts fresh), runs Glow and berry timers while the tab is visible, and writes checkpoints after commands. Settings cover reduced motion, animation pause, quality (stored for the later 3D habitat), export, import, and reset. A second tab that cannot take the writer lock stays read-only.

Economy tests (no DOM or WebGL):

```bash
node --test slime-garden/tests/*.test.mjs
```
