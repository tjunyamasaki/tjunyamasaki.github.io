# Slime garden implementation ledger

P2-00 through P2-09 live in `slime/slime-phase-2-plan/integration-ledger.md`. This file records P2-10 scene work in the game tree.

## 16. P2-10 bigger farm, fence, scene composition

Landed on `feat/slime` after P2-09. **Farm meshes are isolated.** Live `/slime-garden/` still mounts the v1 circular habitat.

### 16.1 Farm vs circular split

| Path | Role |
| --- | --- |
| `src/scene/habitat.mjs` `createHabitat` | Unchanged circular six-pad garden. `scene.mjs` still calls this. |
| `src/scene/habitat-farm.mjs` `createFarmHabitat` / `createHabitatV2` | New 24×20 farm. Preview only until P2-13. |
| `src/scene/farm-geometry.mjs` | Visual segments/posts/path/decor derived from `world/layout.mjs`. No second collision farm. |
| `src/scene/layout.mjs` | Still v1 circle (`CAMERA_PITCH` 0.65, six `HOME_SLOTS`). Comment only. |
| `src/scene/scene.mjs` | **Not switched.** Fog, far plane, and pick IDs stay v1. Circular garden still mounts. |
| `src/main.mjs` | Unchanged (P2-13). |

Collision source of truth remains `src/world/layout.mjs` (`FARM_INTERIOR_WIDTH/DEPTH` 24×20, fence ±12×±10, `GATE_OPENING_*`, `HOME_SLOTS`, `STATIC_PROPS` r=0.5). Habitat meshes import those numbers; tests fail if floor/pad/prop/gate drift.

### 16.2 Isolated preview

`slime-garden/dev/phase2-farm.html` + `phase2-farm.mjs`.

Open with `npx serve .` from repo root:

- `/slime-garden/dev/phase2-farm` (extensionless; `serve` 301s `.html?…` and drops the query)
- `/slime-garden/dev/phase2-farm.html`

Reuses P2-09 `createCameraRig` + `createPointerRouter`. Care picks; Orbit orbits/zooms. Capacity 6 vs 10, shrub 0–3, click/hover pick overlay (`interactableId` / kind). Fog/far from the camera rig (`setFarmFog`). Near-side fence fade ~0.25 from camera XZ.

**Live `/slime-garden/` is still the circular garden until P2-13.**

### 16.3 What the live garden still shows

Six circular pads, ring boundary, v1 basket/shrub, `skipRaycast` on the whole garden group, fixed camera pitch 0.65 fitted to enabled pads. No farm fence, no ten pads, no orbit.

### 16.4 `setCapacity` / `setShrubLevel`

Both mutate existing meshes. They do **not** recreate `habitat.group`.

- `setCapacity(n)` — first n of 10 `HOME_SLOTS` get the enabled pad; the rest show a small dormant ring, not a lock mesh.
- `setShrubLevel(0..3)` — toggles berry children on the r=0.5 shrub. No footprint rescaling.
- `setFoods` — no-op. Empty `farm-foods` group is reserved for P2-12.

### 16.5 Pick IDs and occlusion

`userData.interactableId` / `upgradeId` (router `kind: 'object'`):

| Id | Mesh |
| --- | --- |
| `shrub` | Berry bush at (−10.8, −5.5), visible r=0.5 disc |
| `pantry` | Crate at (−10.8, 5.5), visible r=0.5 disc |
| `bloom` | Glow flowers at (10.8, −4.5), visible r=0.5 disc |
| `beds` | Small resting-area marker beside the north pad row |

Floor and enabled pads are `role: 'ground'`. Fence/posts/leaves are `role: 'solid'` (occlude; no upgrade id). Decorative grass, flowers, dirt path, meadow, dormant marks, and distant bushes use `skipRaycast`. First unskipped hit wins, so a prop in front of grass/ground wins.

### 16.6 Fog / far / fade

Preview only: `setFarmFog` + rig `getFarPlane()` (P2-09: `max(60, maxDistance+40, distance+24)`). Production `scene.mjs` fog (near 24 / far 52, `setGameplayFog`) is unchanged.

Fence rails use per-side transparent materials. The side the camera is on fades to **0.25**. Posts stay opaque.

### 16.7 Still owned by later packets

- **P2-11** HUD / tool belt / contextual upgrade cards.
- **P2-12** thrown-food meshes, gait-to-world binding, eating mouth, pet FX, arrival presentation (`setFoods` fill-in).
- **P2-13** swap live `scene.mjs` from `createHabitat` to `createFarmHabitat`; wire P2-09 camera + pointer router; replace competing canvas listeners; `advanceActive` for visible time.

Gate leaves are visual only. Navigation already treats the opening as permanently open (`world/layout.mjs` / P2-05).
