# Driftacre

A cozy, semi-idle farm on a floating island. Grow crops, and every harvest feeds the **island heart**. When it blooms you get a land sprout to grow the island one tile at a time, anywhere along its edge.

2D painted sprites stand in a 3D world of blocky sky-islands, on a tile grid.

## How to play

- **Tend** (default tool): tap or drag across tiles. Ripe crops are harvested, empty ground gets your chosen seed, and a growing sprout can be tended once to speed it up. A drag only repeats the action it started with, so a harvest swipe never plants by accident.
- **Seeds**: 10 crops unlock as you level. Moonberry and Dreamcap love the night. Wishflowers give wisps.
- **Build**: Sprout Huts give you Sproutlings. They harvest, replant and tend crops, including while you are away. Drizzle Clouds, Beehives, Windmills, Wishing Wells, Moon Lanterns and Star Shrines add bonuses. Decor adds **cozy** (+1% growth each).
- **Land**: place land sprouts on the glowing edge spots. New land sometimes has buried coins, a sleeping wisp or a wild crop.
- **Wishes**: travelers ask for crops in exchange for coins, XP and wisps.
- **Sky visitors**: tap the sky whale for a growth rain, pop gift balloons, and catch falling stars at night.
- About 3% of crops ripen **golden**, worth 5× the coins plus a wisp.

Keys: WASD / arrows pan · Q E rotate · scroll or + − zoom · 1–9 pick a seed · B build · L land · F frame island · Esc back. Right-drag pans. On touch, drag empty sky to pan and pinch to zoom.

## Art styles

Switch styles at any time from the title screen or the **Style** button. All sprites are painted at runtime in code, then recolored and outlined for each style.

- **Peach Dawn**: soft storybook pastels with drifting petals.
- **Bitmoss**: 1× pixel sprites limited to a 32-color palette, rendered at one-third resolution.
- **Moonpetal**: a glowing twilight garden with fireflies and bioluminescent crops.
- **Inkwash**: paper grain, heavy ink outlines and muted color. Only the reds keep their color.

## Files

- `data.js`: crops, buildings, styles and balance curves (tune here).
- `state.js`: economy, Sproutling AI, offline catch-up, and save/load (`localStorage` key `driftacre-save-v1`).
- `sprites.js`: the procedural sprite painter and the per-style color transforms.
- `world.js`: three.js scene: island instancing, billboards, sky, day/night, particles and picking.
- `audio.js`: synthesized music box and sound effects (no audio files).
- `main.js`: UI, input and the game loop.

Add `?debug` to the URL to get `window.__drift` for testing.

Requires JavaScript and WebGL. Three.js r186 is bundled locally as `vendor/three.min.js` under its MIT license (`vendor/LICENSE`).
