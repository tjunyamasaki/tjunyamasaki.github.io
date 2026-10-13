# Tessera

A tile-laying game in the spirit of the classic medieval-kingdom board game, played on a 3D board that comes alive as you build it.

Draw a tile, fit it to the kingdom, and send one of your seven followers to claim the town, road, abbey or meadow on the tile you just laid. Every tile grows its own little world when it lands: walls and towers rise around towns, houses fill the streets, farms, forests and orchards spread across the meadows, travellers walk the roads, sheep graze, smoke curls from chimneys and windmills turn.

## Playing

- **Lay a tile.** Every edge must match its neighbours: town to town, road to road, meadow to meadow. Tap a glowing spot, turn the tile with ↻ (or **R**, or right-click), then press **Place** (or **Enter**).
- **Send a follower** onto the new tile, if no one already holds that feature. Tap a glowing figure, press its number key, or choose **No follower**.
- **Score.**
  - A finished town scores 2 per tile and 2 per blue shield. Its owner's flags are raised on its towers.
  - A finished road scores 1 per tile.
  - An abbey scores 9 once all eight neighbours are filled.
  - Followers come home when their feature is finished. Whoever has the most followers in a feature takes the points, and ties share them.
- **At the end:**
  - An unfinished town scores 1 per tile and shield, and an unfinished road 1 per tile.
  - An unfinished abbey scores 1 plus each neighbour.
  - Meadow farmers score 3 for every finished town their meadow touches.

Up to five seats, each played by a person at this screen or by a bot (Easy, Steady or Cunning). The game saves after every turn, so you can close the page and continue later.

## Looking around

- Drag to move.
- Right-drag, **Q / E** or two fingers to turn and tilt.
- Scroll or pinch to zoom.
- **V** cycles Tabletop, Map, Street and Cinematic views.
- **T** cycles the sky: day, golden hour, night (lit windows, lanterns and fireflies) or a full day–night cycle.
- **F** returns to the last tile.

## Code

Plain ES modules, no build step.

- `src/tiles.mjs`: the 72-tile land. Each tile's towns, roads and abbey are described once. Meadows, ports, edges and follower spots are derived by rasterising those shapes, so the rules and the painted artwork can never disagree.
- `src/game.mjs`: the deterministic rules engine (union-find over features, scoring, final scoring). A seed and the action list replay a saved game exactly.
- `src/ai.mjs`: the bots. They simulate every placement and follower choice, then value each player's likely final score.
- `src/world.js`, `src/life.js`, `src/camera.js`, `src/art.js`: the Three.js stage, the growing life on each tile, the orbit camera, and the procedural tile faces.
- `tests/`: `node --test tessera/tests/*.test.mjs`

Three.js is included locally under its MIT license in `vendor/LICENSE`.
