# Wizard cast / attack animation

Offline viewer: open `index.html`, or from this folder run `npm install`, `npm run build`, `npm run serve`, then http://127.0.0.1:4174

The player is 8 frames on a 64×48 canvas. Play/pause, frame stepping, speed, background, and onion-skin are in the page. Space and arrow keys work when focus is not on a control.

## Rebuild

Node 20.9+. Sharp 0.35.4 is the only dependency (network needed once).

```sh
npm install
npm run build
npm run validate
```

`npm run build` overwrites `wizard-cast/generated/` and this folder's `index.html`. It does not modify `source/` or the original Codex directory.

## Layout

- `source/` — immutable copies from the Codex export (cleric workflow, wizard base, validator, example frames)
- `wizard-cast/` — wizard-specific rig, build script, and generated frames
- `tools/validate-animation.cjs` — mechanical palette / rest-pose / sheet / GIF timing check
- `PROCESS.md` — what was done and why
- `GAPS.md` — holes in the inherited animation process
- `IMPROVEMENTS.md` — how to make the next character cheaper and cleaner
