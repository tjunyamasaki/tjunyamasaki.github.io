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

- **P2-12** thrown-food meshes, gait-to-world binding, eating mouth, pet FX, arrival presentation (`setFoods` fill-in).
- **P2-13** swap live `scene.mjs` from `createHabitat` to `createFarmHabitat`; wire P2-09 camera + pointer router; replace competing canvas listeners; `advanceActive` for visible time; wire P2-11 HUD callbacks.

Gate leaves are visual only. Navigation already treats the opening as permanently open (`world/layout.mjs` / P2-05).

## 17. P2-11 Game HUD and contextual controls

Landed on `feat/slime` after P2-10. **HTML/CSS/UI only.** `src/main.mjs`, scene, world, and core are unchanged. Live `/slime-garden/` still mounts the v1 circular habitat; the new chrome overlays it.

### 17.1 HUD regions

| Region | Implementation |
| --- | --- |
| Top-left resources | Glow wallet, rate, berries current/max, regen `<progress>`. Berry label selects the Berry tool. |
| Top-right | Population/capacity opens the roster sheet. Settings opener unchanged. |
| Farm viewport | Existing `#scene-stage` / `#scene-host`. Scene remains circular until P2-13. |
| Bottom-center tool belt | Berry / Hand / Orbit with visible text labels and `aria-pressed`. |
| Camera cluster | +, −, Reset, Focus selected. ≥44px. Optional until P2-13 wires `onZoom` / `onResetView` / `onFocusSelected`. |
| Milestone strip | Care / lifetime Glow / pad condition. No Welcome button. Capacity-only shortfall links to the resting-area card. |
| Context panel | Selected resident **or** selected farm object, dismissible. Desktop right 280–320px; mobile sheet `max-height: 35vh` then scroll. |
| Farm controls | Nine region presets, 0.5 reticle, Toss at reticle. Shown on demand, or always when `setRendererAvailable(false)`. |

Desktop ≥900px: centered shell max 1440px; scene ~73svh, min 480px when height ≥700px. HUD overlays the play frame as narrow bands (not `position: fixed` fullscreen). At 360px and 200% browser zoom the overlays become normal document flow so controls reflow instead of clipping.

Care: `touch-action: pan-y` on the stage/canvas. Orbit: `touch-action: none`, orbit hint, conspicuous **Back to care**. Viewport stays `width=device-width, initial-scale=1` (no `maximum-scale`).

### 17.2 IDs

Removed as required nodes: `#welcome-button`. Never un-hidden; arrivals stay automatic.

Kept (live `bindDom` / `bindSettings` / `main.mjs`): `#game`, `#loading`, `#error`, `#play`, `#scene-host`, `#scene-stage`, `#scene-status`, `#settings-open`, `#settings-dialog`, `#settings-form`, `#import-dialog`, `#reset-dialog`, `#import-file`, `#settings-feedback`, `#import-summary`, `#import-confirm`, `#settings-export`, `#settings-import`, `#settings-reset`, `#reset-export`, `#reset-confirm`, recovery IDs, `#persist-status`, `#notice`, `#tab-banner`, `#offline-summary`, `#try-again`, `#live-region`, `#play-controls`, `#feed-button` (label **Offer near selected**), `#upgrade-list`, `#resident-list`, `#companion-status`, `#companion-progress`.

New: tool/camera/context/roster/keyboard IDs (`#tool-berry`, `#camera-zoom-in`, `#context-panel`, `#population-button`, `#farm-upgrades-open`, `#region-presets`, `#reticle-readout`, …).

### 17.3 Callbacks

`bindDom(root, callbacks)` does **not** throw on the existing P2-10 object (`onSelect`, `onFeed`, `onBuy`, `onWelcome`, `onTryAgain`, dismiss/recovery, `onOpenSettings`). `onWelcome` stays on the typedef and is never bound to a primary control.

Optional (no-op if missing): `onSetMode`, `onSetTool`, `onZoom`, `onResetView`, `onFocusSelected`, `onPet`, `onOfferNear`, `onThrowPreset`, `onReticleThrow`, `onSelectObject`, `onOpenFarmUpgrades`.

**Offer near selected** calls `onOfferNear?.()` and falls back to `onFeed()` so the live page still has a click path. That path still dispatches `FEED`, which is an invalid no-op until P2-13. Pet does not call FEED; without `onPet` it only updates a local status string (2s feedback cooldown). Equipping a tool does not spend a berry.

Mode/tool/selection live in UI state (`createHudControlState`); `update()` patches text, it does not rebuild HUD HTML. Resident buttons keep identity. `setRendererAvailable(boolean)` exists for P2-13; default assumes a renderer.

### 17.4 Copy

Throw reject reasons live in `formatThrowReject` / `throwDisabledReason`: `NO_BERRIES` → `More berries in 0:08`, `THROW_COOLDOWN` → `Ready to toss in 0:01`, `FOOD_LIMIT` / `INVALID_TARGET` / `NO_VALID_TARGET` as document 04 §10. Valid throw status copy is `Berry tossed` (not applied until P2-13). `feedDisabledReason` remains as the offer-near wrapper. Tutorial strings no longer say “offer a berry” or “welcome a new slime”. `#live-region` is unchanged; currency ticks are not announced from the HUD.

### 17.5 Preview

`slime-garden/dev/phase2-hud.html` + `phase2-hud.mjs` mocks the new callbacks. Live `/slime-garden/` still imports `src/main.mjs`.

### 17.6 Remaining P2-13 wiring

- Connect optional HUD callbacks to THROW_FOOD, pet cooldown, camera rig, pointer-router tool/mode, object picks.
- Replace Offer-near → `onFeed`/`FEED` with `resolveNearSelectedTarget` + `THROW_FOOD`.
- Auto-join already has no Welcome UI; drop obsolete FEED/WELCOME callers.
- Pass `setRendererAvailable(false)` on scene failure; show pending foods from `state.world.foods`.
- Swap circular habitat for the farm; `completeHint` for throw/pet/camera.
- Failed-command copy into `actionStatus` / `announce` using `formatThrowReject`.

## 18. P2-12 Food, petting and arrivals feel physical

Landed on `feat/slime` after P2-11. **Presentation only.** Core/world clocks already throw, land, walk, and eat. This packet binds meshes to those snapshots.

### 18.1 v1 vs v2 scene split

| Path | Role |
| --- | --- |
| `createScene()` default `presentation: 'v1'` | Unchanged circular `createHabitat` + `createMotionWorld`. Live `/slime-garden/` still looks coherent with the P2-11 HUD. |
| `createScene(..., { presentation: 'world' })` | Farm `createFarmHabitat`, P2-09 `createCameraRig`, actors bound to `state.world.residents`, foods in `habitat.foodsGroup`. `motion.mjs` is not gameplay authority. |
| `src/scene/motion.mjs` | Kept for live v1 circular wander/feed presentation. |
| `src/scene/pose-adapter.mjs` | v2 walk phase from route clock (stride 1.0, 1250 ms, travel 0.29–0.68). Blink/idle offsets stay per-id. Does not call `actor.update()`. |
| `src/scene/food.mjs` | One mesh per food ID; throw arcs; mouth attachment. Never grants Glow. |
| `src/scene/arrivals.mjs` | v1 helpers kept (`FEED_DURATION_SEC=1.1`). v2 `arrivalVisualPlan` / `createWorldFxPool` consume core snapshots and do not call `planRoute`. |

Approved slime actor, `reference/`, and original preview are unchanged. Reactions use existing `setFeedSquash` / `getMouthWorldPosition` / `setWorldPose` / `setPose`.

### 18.2 Isolated preview

`slime-garden/dev/phase2-presentation.html` + `phase2-presentation.mjs`.

Open with `npx serve .` from the repo root:

- `/slime-garden/dev/phase2-presentation` (extensionless; `serve` 301s `.html?…` and drops the query)
- `/slime-garden/dev/phase2-presentation.html`

Harness uses real `advanceActive` + `applyCommand({ type: 'THROW_FOOD' })`. Throw button (preset `{x:4.5,z:4}`) or Care-mode ground click. Pet does not change Glow/berries. Arrival button seeds eligibility then `advanceActive` so core `planActiveArrival` may reserve a gate walk.

**Live `/slime-garden/` is still circular + `advancePassive` until P2-13.**

### 18.3 Food mesh ownership

`createFarmHabitat().setFoods` is no longer a no-op. It reconciles `createFoodPresentation` into `farm-foods`. Extra IDs are removed from the graph. Shared berry + leaf + landing shadow. Reconstructing a flying food without a visible `FOOD_THROWN` sits at the world target (no fake throw origin). New throws capture a camera-relative foreground origin; duration/target come from `createdWorldMs` / `landAtWorldMs` / `target`. Eating lerps ground → `getMouthWorldPosition` over `EAT_DURATION_MS` (800). Mesh callbacks never call `finishMeal`.

### 18.4 Gait binding

v2 `actor.worldRoot` position/yaw come from `WorldResident`. Visual walk phase is `(world.timeMs - route.startedWorldMs) / 1250` (same clock as `progressResident`). Walk blend ~200 ms. Contact shadow and selection ring stay on `worldRoot`. Idle/social look is renderer-only when `activity==='idle'` and does not interrupt eating. No auto-face-camera on every idle resident.

### 18.5 FX caps

v2 replaces single `feedFx` / `arrivalFx` with `createWorldFxPool`: at most **10** brief reactions and **40** celebration particles. `playFeed` has a 150 ms aggregate limiter in `src/audio/audio.mjs`. Optional quiet `playPet`. Pet never dispatches FEED and never writes Glow/world. Hidden `setVisible(false)` does not enqueue effects. Reduced motion: still snapshots, no arcs/particles/squash. Pause: freeze interpolation; roster/food membership still tracks; resume snaps to current snapshots without replaying missed rewards.

### 18.6 What P2-13 still wires

- Pass `presentation: 'world'` from live `createScene` (default remains `'v1'` until then).
- Visible time uses `advanceActive`; absence stays `advancePassive`.
- Pointer router on the live canvas (world scene currently installs no competing pointer listeners).
- HUD throw/pet/arrival callbacks, `completeHint`, Offer-near → `THROW_FOOD`.
- Audio limiter already helps multi-meal FED bursts once main plays `playFeed` per event.

Gate arrivals are core-planned. Presentation never invents a second gate walk in Three.

