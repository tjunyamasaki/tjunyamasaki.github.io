# Replaceable theme format

The simulation in `src/engine.mjs` never imports artwork, browser rendering, audio or a theme. `src/content.mjs` contains balance, recipe identifiers and display labels. Rendering, motion and sound are adapters.

The default theme lives in `harvest/theme.json`. `loadTheme()` in `src/renderer.mjs` accepts another manifest URL. To reskin the game, replace that default URL or the manifest and assets. Keep the simulation identifiers stable; none of the mechanics depend on filenames, pixel dimensions, colors or character appearance.

## Sprites

Every resource, building, enemy, character and inventory icon has a stable key in `sprites`. Each entry contains:

| Field | Meaning |
| --- | --- |
| `src` | Image URL relative to the manifest; SVG, PNG, WebP and browser-supported raster sheets work. |
| `size` | `[width, height]` in world units; independent of source resolution. |
| `anchor` | `[x, y]` normalized from the image's lower left. `[0.5, 0]` puts the feet at the world position. |
| `columns`, `rows` | Uniform grid dimensions for an animation sheet. Single images use 1 and 1. |
| `clips` | Named clips. Each has a zero-based row-major `frames` array and `fps`. |

Recognized clip names: `idle`, `walk`, `attack`, `gather`, `dash`, `down`. Missing clips fall back to `idle`. Enemy movement uses `walk`, enemy attack preparation uses `attack`. Characters have independent materials and UVs, so animations do not synchronize accidentally. Resource/building `idle` clips can animate flames, leaves, doors or machinery. Actors are camera-facing sprites on a 3D ground plane.

For example:

```json
{
  "src": "./sprites/your-character.webp",
  "size": [1.65, 2.48],
  "anchor": [0.5, 0.04],
  "columns": 8,
  "rows": 2,
  "clips": {
    "idle": { "frames": [0, 1], "fps": 2 },
    "walk": { "frames": [2, 3, 4, 5], "fps": 9 },
    "attack": { "frames": [8, 9, 10], "fps": 12 },
    "gather": { "frames": [11, 12, 13], "fps": 8 },
    "down": { "frames": [15], "fps": 1 }
  }
}
```

Use transparent padding consistently between frames. Sprite sizes affect presentation; collision shapes and interaction distances belong to the simulation and stay stable during an art replacement.

## Motion, color and audio

`motion.walkBob`, `walkTilt`, `idleSway`, `hitSquash` and `attackTilt` are presentation-only parameters. Set procedural motion to zero when the sprite sheet contains all the desired motion. The UI stylesheet is a separate skin in `hollowstead/style.css`; its CSS variables control the UI's main colors. Terrain palette values live in the manifest.

`audio` maps event names to audio URLs relative to the manifest. Supported events include `hit`, `swing`, `hurt`, `loot`, `craft`, `build`, `heal`, `phase`, `kill`, `dash`, `bolt` and `impact`. Missing entries use small synthesized cues. Muting applies to both systems.

All supplied SVGs are original editable vector artwork. The character sheets contain four starter poses. The Three.js renderer reuses the repository's existing vendored Three.js and license under `hushlight/vendor/`; no runtime asset CDN or new game engine is introduced.

## Change the setting

For a full setting change, replace the theme images, animation clips, sounds and palette; replace the UI skin; then edit display names and narrative copy in `content.mjs`, `index.html` and `main.mjs`. Keep item keys such as `wood`, `ember` and `hearth` as stable gameplay identifiers. This keeps recipes, multiplayer packets and existing saves compatible.
