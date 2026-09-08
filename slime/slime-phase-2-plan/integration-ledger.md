# Phase 2 integration ledger

Map of v1 call sites that later packets must replace. Lines are from `feat/slime` at `afbf0398069b4a84a5029fea07d450b5e4b6ba68` (planning pack; game source unchanged by P2-00). Search covered `slime-garden/src`, `slime-garden/tests`, `slime-garden/index.html`, plus `dev/`, `docs/`, and `README.md`. Vendor Three.js matches are excluded.

Do not invent a second runtime. When P2-02+ change contracts, record temporary main/UI incompatibility here rather than keeping a parallel FEED path.

## 1. FEED callers (instant berry charge + boost)

Production:

| File | Symbol / site | Line | Notes |
| --- | --- | --- | --- |
| `slime-garden/index.html` | `#feed-button` “Offer berry” | 91 | Primary player control. Native button click/keyboard activate. |
| `slime-garden/src/ui/dom.mjs` | `UiCallbacks.onFeed` | 37 | Callback contract. |
| `slime-garden/src/ui/dom.mjs` | `feedButton.addEventListener('click', … onFeed)` | 205 | Only DOM listener that requests a feed. |
| `slime-garden/src/ui/dom.mjs` | `feedDisabledReason` | 113–124 | Copy for empty basket / cooldown / no selection. Used at 403. |
| `slime-garden/src/main.mjs` | `bindDom({ onFeed: feedSelected })` | 150 | Wires UI to controller. |
| `slime-garden/src/main.mjs` | `feedSelected` | 804–807 | `dispatch({ type: 'FEED', slimeId: app.selectedSlimeId })`. |
| `slime-garden/src/main.mjs` | `dispatch` | 744–757 | `applyCommand` then save + `syncScene` + audio. |
| `slime-garden/src/main.mjs` | `handleEvents` `FED` branch | 766–769 | Immediate “Offered a berry to …” copy. |
| `slime-garden/src/main.mjs` | `cuePresentationAudio` `FED` | 382 | `audio.playFeed()`. |
| `slime-garden/src/core/commands.mjs` | `FeedCommand` typedef | 24 | `{ type: 'FEED', slimeId }`. |
| `slime-garden/src/core/commands.mjs` | `applyFeed` | 86–129 | Charges berry, starts cooldown, applies boost **now**. Remove from new-core normal route in P2-07. |
| `slime-garden/src/core/commands.mjs` | `applyCommand` `case 'FEED'` | 232–233 | Dispatch table. |
| `slime-garden/src/scene/scene.mjs` | `play` `FED` | 491–505 | Starts cosmetic arc via `startFeed`. |
| `slime-garden/src/scene/scene.mjs` | `startFeed` | 312–337 | Writes the single `feedFx` slot. |

Tests (legacy fixtures; do not delete in later packets without replacing coverage):

| File | Site | Line |
| --- | --- | --- |
| `slime-garden/tests/commands.test.mjs` | `FEED_SLIME_1`, `describe('FEED')`, review-gate transcript | 32, 108+, 815+ |
| `slime-garden/tests/reconcile.test.mjs` | `type: 'FEED'` | 119 |
| `slime-garden/tests/ui-copy.test.mjs` | `feedDisabledReason` | 19–32 |
| `slime-garden/tests/arrivals.test.mjs` | feed presentation timing | 9, 43 |
| `slime-garden/tests/phase2-baseline-fixtures.test.mjs` | constructor FEED used only to build frozen v1 saves | (P2-00) |

P2-07/P2-11/P2-13: replace the player FEED route with `THROW_FOOD` + later consumption. Keep these tests as v1 goldens where they still describe old commands.

## 2. WELCOME_COMPANION callers (manual join)

Production:

| File | Symbol / site | Line | Notes |
| --- | --- | --- | --- |
| `slime-garden/index.html` | `#welcome-button` “Welcome companion” | 105 | Hidden until eligibility. |
| `slime-garden/src/ui/dom.mjs` | `UiCallbacks.onWelcome` | 39 | Callback contract. |
| `slime-garden/src/ui/dom.mjs` | `welcomeButton.addEventListener('click', … onWelcome)` | 206 | Only DOM listener that requests a welcome. |
| `slime-garden/src/ui/dom.mjs` | `update` welcome visibility / complete copy | 430–457 | Hides button at cap; “Your little colony is complete.” |
| `slime-garden/src/ui/dom.mjs` | tutorial copy `welcome` | 67 | “When the companion strip is ready…” |
| `slime-garden/src/main.mjs` | `onWelcome: welcomeCompanion` | 152 | |
| `slime-garden/src/main.mjs` | `welcomeCompanion` | 829–835 | `dispatch({ type: 'WELCOME_COMPANION', expectedPopulation })`. |
| `slime-garden/src/main.mjs` | `handleEvents` `COMPANION_ADDED` | 774–778 | Join copy. |
| `slime-garden/src/main.mjs` | `handleEvents` companion-ready edge | 786–790 | “A companion is ready”. |
| `slime-garden/src/main.mjs` | `cuePresentationAudio` `COMPANION_ADDED` | 384 | `audio.playWelcome()`. |
| `slime-garden/src/core/commands.mjs` | `WelcomeCommand` typedef | 26 | |
| `slime-garden/src/core/commands.mjs` | `applyWelcome` | 183–216 | Player-commanded membership. Remove from new-core in P2-04. |
| `slime-garden/src/core/commands.mjs` | `applyCommand` `case 'WELCOME_COMPANION'` | 236–237 | |
| `slime-garden/src/core/selectors.mjs` | `getCompanionEligibility` | 96–115 | `ready` drives the button. |
| `slime-garden/src/scene/scene.mjs` | `play` `COMPANION_ADDED` | 507–508 | `startArrival`. |
| `slime-garden/src/scene/scene.mjs` | `startArrival` | 340–384 | Writes the single `arrivalFx` slot. |

Tests:

| File | Site | Line |
| --- | --- | --- |
| `slime-garden/tests/commands.test.mjs` | `describe('WELCOME_COMPANION')`, review-gate slime-2 | 476+, 772+ |
| `slime-garden/tests/phase2-baseline-fixtures.test.mjs` | constructor WELCOME for frozen v1 saves | (P2-00) |

P2-04: automatic `resolveCompanionsNow`. P2-11/P2-13: delete the Welcome button and this caller chain.

## 3. Six-cap / four-bed / six-name assumptions

Authority (must change together in P2-02):

| File | Symbol | Line | Current v1 value |
| --- | --- | --- | --- |
| `slime-garden/src/core/balance.mjs` | `POPULATION_CAP` | 22 | `6` |
| `slime-garden/src/core/balance.mjs` | `SLIME_NAMES` | 46–53 | six names |
| `slime-garden/src/core/balance.mjs` | `UPGRADE_MAX_LEVEL.beds` | 63 | `4` |
| `slime-garden/src/core/balance.mjs` | `BEDS_CAPACITIES` | 79 | `[2, 3, 4, 5, 6]` |
| `slime-garden/src/core/balance.mjs` | `COMPANION_MILESTONES` | 117–148 | five gates, last `nextPopulation: 6` |
| `slime-garden/src/core/balance.mjs` | `BALANCE` freeze of the above | 150–193 | |
| `slime-garden/src/core/state.mjs` | `SlimeState.homeSlot` JSDoc | 25 | “Unique slot 0–5” |
| `slime-garden/src/core/commands.mjs` | `applyWelcome` cap reject | 190–191 | `POPULATION_CAP` |
| `slime-garden/src/core/commands.mjs` | `SLIME_NAMES[n - 1]` | 204 | seventh name is undefined today |
| `slime-garden/src/core/validate.mjs` | population invariant | 305 | `1 … POPULATION_CAP` |
| `slime-garden/src/core/selectors.mjs` | eligibility at cap | 100 | `population >= POPULATION_CAP` → no next |
| `slime-garden/src/core/selectors.mjs` | `getResidentCapacity` | 67 | `BEDS_CAPACITIES[beds]` |
| `slime-garden/src/ui/dom.mjs` | complete-colony copy | 432 | “Your little colony is complete.” |
| `slime-garden/src/ui/dom.mjs` | `UPGRADE_MAX_LEVEL[id]` level label | 412 | `Level n/4` for beds |
| `slime-garden/src/ui/format.mjs` | `formatNextUpgradeEffect` beds | 234 | `Room for ${BEDS_CAPACITIES[level + 1]} slimes` |

Scene / layout (six circular pads, not ten-slot farm):

| File | Symbol | Line |
| --- | --- | --- |
| `slime-garden/src/scene/layout.mjs` | `HOME_SLOTS` (6 points) | 37–44 |
| `slime-garden/src/scene/layout.mjs` | `enabledHomeSlots` clamps to `HOME_SLOTS.length` | 77–79 |
| `slime-garden/src/scene/layout.mjs` | pad-overlap loop over six slots | 118–126 |
| `slime-garden/src/scene/layout.mjs` | `GARDEN_LAYOUT.homeSlots` | 66–67 |
| `slime-garden/src/scene/habitat.mjs` | pad meshes `layout.homeSlots.length` | 95–105 |
| `slime-garden/src/scene/habitat.mjs` | `setCapacity` | 169–171 |
| `slime-garden/src/scene/scene.mjs` | `createHabitat({ homeSlots: HOME_SLOTS })` | 157–164 |
| `slime-garden/src/scene/scene.mjs` | `retargetCamera` slices `HOME_SLOTS` | 386–389 |
| `slime-garden/src/scene/motion.mjs` | `homeSlot` clamp `HOME_SLOTS.length - 1` | 274–275 |
| `slime-garden/src/scene/quality.mjs` | file comment “six-actor spike” | 2 |
| `slime-garden/dev/stress.mjs` | `POPULATION = HOME_SLOTS.length` / “cap stays at six” | 29–30 |
| `slime-garden/dev/stress.html` | copy “Six independent residents” | 6, 98 |

Tests asserting six:

| File | Site | Line |
| --- | --- | --- |
| `slime-garden/tests/layout.test.mjs` | `HOME_SLOTS.length === 6` | 26–29 |
| `slime-garden/tests/commands.test.mjs` | seventh welcome `POPULATION_CAP` | 526–536 |
| `slime-garden/tests/state.test.mjs` | rates for `POPULATION_CAP`, beds 4, six Bloom-5 residents | 217, 237, 253, 318 |
| `slime-garden/tests/advance.test.mjs` | six residents / six boosted bloom-5 | 461, 552 |

Player-facing docs (P2-16 copy, not P2-00): `slime-garden/README.md` “up to six residents”; `slime-garden/docs/qa-results.md` six-resident habitat section.

## 4. Single-effect / single-walker variables

| File | Symbol | Line | Why it must be replaced |
| --- | --- | --- | --- |
| `slime-garden/src/scene/scene.mjs` | `let feedFx = null` | 206 | One in-flight feed arc. |
| `slime-garden/src/scene/scene.mjs` | `let arrivalFx = null` | 208 | One in-flight arrival. |
| `slime-garden/src/scene/scene.mjs` | `clearPresentation` zeros both | 294–305 | |
| `slime-garden/src/scene/scene.mjs` | `startFeed` assigns `feedFx` | 321 | Second FED overwrites the first. |
| `slime-garden/src/scene/scene.mjs` | `startArrival` assigns `arrivalFx` | 362 / 372 | Second join overwrites the first. |
| `slime-garden/src/scene/scene.mjs` | `tickPresentation` | 609–692 | Updates the single slots. |
| `slime-garden/src/scene/arrivals.mjs` | `createPresentationPool` | 227–241 | Comment: “One pooled berry and eight particles.” |
| `slime-garden/src/scene/scene.mjs` | `const fx = createPresentationPool(...)` | 167 | Shared by the single `feedFx`. |
| `slime-garden/src/scene/motion.mjs` | `let walkerId = null` | 346 | One walking resident. |
| `slime-garden/src/scene/motion.mjs` | getter `walkerId` | 552–553 | |
| `slime-garden/src/scene/scene.mjs` | `startArrival` interrupts other walker | 352–354 | |
| `slime-garden/src/scene/layout.mjs` | `FOOD_POINT` | 47 | Single cosmetic basket / feed-arc origin, not world food IDs. |
| `slime-garden/src/scene/habitat.mjs` | basket at `layout.foodPoint` | 119–121 | |

Tests: `slime-garden/tests/motion.test.mjs` asserts a unique `world.walkerId` (147–154, 192–204).

P2-06/P2-12: up to three reserved paths; bounded per-id effect pools. Do not keep “one food target in the whole farm.”

## 5. Old camera / pointer listeners

Gameplay camera is **fixed yaw/pitch**, fitted to enabled pads. There is no OrbitControls dependency. Pointer listeners on the garden canvas are **pick-to-select**, not orbit.

| File | Symbol | Line | Role |
| --- | --- | --- | --- |
| `slime-garden/src/scene/layout.mjs` | `CAMERA_YAW`, `CAMERA_PITCH`, `CAMERA_TARGET` | 30–32 | Fixed framing. |
| `slime-garden/src/scene/layout.mjs` | `DRAG_THRESHOLD_PX` | 33 | 6 px click-vs-drag. Reuse in P2-09; do not add a second threshold. |
| `slime-garden/src/scene/layout.mjs` | `placeCamera` | 222–228 | Writes `camera.position` + `lookAt`. |
| `slime-garden/src/scene/scene.mjs` | `PerspectiveCamera` + `retargetCamera` / `applyCamera` | 155, 386–408 | Distance damp only (`CAMERA_DAMP`). |
| `slime-garden/src/scene/scene.mjs` | `onPointerDown` | 755–762 | Captures pointer; no yaw change. |
| `slime-garden/src/scene/scene.mjs` | `onPointerMove` | 764–768 | Sets `pointerMoved` past 6 px. |
| `slime-garden/src/scene/scene.mjs` | `onPointerUp` | 770–777 | Click → `pickFromClient` → `onSelect`. |
| `slime-garden/src/scene/scene.mjs` | `onPointerCancel` | 779–783 | |
| `slime-garden/src/scene/scene.mjs` | `canvas.addEventListener('pointerdown'…)` | 803–806 | Competing listeners P2-09/P2-13 must remove. |
| `slime-garden/src/scene/scene.mjs` | `pickFromClient` | 739–753 | Body-mesh raycast. |

Diagnostic / reference (keep as comparison; do not copy into gameplay as a second router):

| File | Listeners | Line |
| --- | --- | --- |
| `slime-garden/dev/inspection.mjs` | pointer drag orbit + `wheel` zoom | 225–229 |
| `slime-garden/dev/stress.mjs` | pick-only pointer, `placeCamera` fit | 416–419 |
| `slime-garden/reference/original-preview.html` | pointer orbit + `wheel` | 163–166 |

P2-09: one pointer owner (throw / orbit / pick). Do not add OrbitControls beside these listeners.

## 6. Positional resets (unsafe once food/path are authoritative)

| File | Symbol | Line | Trigger |
| --- | --- | --- | --- |
| `slime-garden/src/main.mjs` | `syncScene(..., extra)` | 314–321 | Forwards `resetPositions`. |
| `slime-garden/src/main.mjs` | `syncAfterReconcile` | 327–330 | Reset if away/credited > 5 s. |
| `slime-garden/src/main.mjs` | `mountScene` | 363 | `syncScene([], { resetPositions: true })` |
| `slime-garden/src/main.mjs` | `installPlayable` | 1023 | Reset on load/import/reset. |
| `slime-garden/src/scene/scene.mjs` | `sync` jump detector | 450–453 | `LARGE_SIM_JUMP_MS = 5000` or option flag. |
| `slime-garden/src/scene/scene.mjs` | `motion.syncRoster(..., { resetPositions })` | 456 | |
| `slime-garden/src/scene/scene.mjs` | actor snap + `clearPresentation` | 472–480 | |
| `slime-garden/src/scene/scene.mjs` | `setOptions` pause / reduced motion | 546–559 | `motion.restAll()` + home snap. Spec: visual settings must not change world food/paths. |
| `slime-garden/src/scene/scene.mjs` | `setVisible(false)` | 570 | `clearPresentation()` only (FX, not homes). |
| `slime-garden/src/scene/scene.mjs` | `onContextRestored` | 796 | `sync(lastState, { resetPositions: true })` |
| `slime-garden/src/scene/motion.mjs` | `syncRoster` `resetPositions` | 376–397 | `restAtHome`; clears `walkerId`. |
| `slime-garden/src/scene/motion.mjs` | `restAtHome` | 314 | |
| `slime-garden/src/scene/motion.mjs` | `restAll` | 415–417 | |
| `slime-garden/src/scene/motion.mjs` | reduced-motion step | 486 | `if (walkerId) restAll()` |

Tests: `slime-garden/tests/motion.test.mjs` “reset and reduced motion snap travel back to home pads” (160–172).

## 7. Save / lifecycle seams to keep

Do not replace these in early packets. P2-03/P2-13 route new validation through them.

| File | Symbol | Line |
| --- | --- | --- |
| `slime-garden/src/core/validate.mjs` | `createFreshEnvelope` | 122 |
| `slime-garden/src/core/validate.mjs` | `serializeEnvelope` | 149 |
| `slime-garden/src/core/validate.mjs` | `validateSave` | 349 |
| `slime-garden/src/persistence/save-store.mjs` | `PRIMARY_KEY` / `BACKUP_KEY` | 14–15 |
| `slime-garden/src/persistence/save-store.mjs` | `loadBest` | 136 |
| `slime-garden/src/persistence/save-store.mjs` | `writeCheckpoint` | 258 |
| `slime-garden/src/persistence/save-store.mjs` | `importSave` | 389 |
| `slime-garden/src/persistence/reconcile.mjs` | `reconcileAway` | 92 |
| `slime-garden/src/persistence/tab-lock.mjs` | `WRITER_LOCK_NAME` | 6 |
| `slime-garden/src/persistence/tab-lock.mjs` | `requestWriter` / `reacquireWriter` | 56, 151 |
| `slime-garden/src/main.mjs` | `bindLifecycle` visibility / pagehide / pageshow | 714–729 |
| `slime-garden/src/main.mjs` | `restoreFromBfCache` | 731 |

Storage keys stay `cozy-slime-mvp:primary:v1` / `cozy-slime-mvp:backup:v1` until a later packet explicitly changes them (P2-03 says keep existing keys).

## 8. Packet ownership reminders

| Later packet | Must consume this ledger |
| --- | --- |
| P2-02 | Six-cap / four-bed / `HOME_SLOTS` / `SLIME_NAMES` (section 3). Publish new exports here when they land. |
| P2-03 | Keep `valid-v1.json` + new v1 fixtures; `schema-v2.json` is invalid-v2 (`INVALID_STATE`); `future-schema3.json` is the unsupported envelope (`FUTURE_VERSION`); current schema is 2. |
| P2-04 | WELCOME callers (section 2). Leave UI removal to P2-13. |
| P2-07 | FEED command (section 1). |
| P2-09 | Camera/pointer (section 5). Scene API edits logged here for P2-13. |
| P2-11 | `#feed-button` / `#welcome-button` / complete-colony copy. |
| P2-12 | `feedFx` / `arrivalFx` / presentation pool (section 4). |
| P2-13 | All of the above plus `advanceBy` vs `dispatch` commit split and positional resets (section 6). |

Until P2-13, old `main.mjs` / DOM still speak FEED and WELCOME. That incompatibility is expected after P2-02+; do not add a compatibility instant-feed control.

## 9. P2-02 published exports and temporary incompatibilities

Landed on `feat/slime` after P2-01 (`825d200`). In-memory GameState is v2-shaped (`world`, `nextThrowAllowedAtMs`); persistence is still schema 1.

### 9.1 `slime-garden/src/core/balance.mjs`

Use these named exports (also frozen on `BALANCE`):

| Export | Value / note |
| --- | --- |
| `POPULATION_CAP` | `10` |
| `SLIME_NAMES` | `'Slime 1'` … `'Slime 10'` |
| `UPGRADE_MAX_LEVEL.beds` | `8` |
| `BEDS_COSTS_GLOW` | `[40, 140, 400, 1000, 1800, 3000, 5000, 8000]` |
| `BEDS_CAPACITIES` | `[2, 3, 4, 5, 6, 7, 8, 9, 10]` (index = beds level 0–8) |
| `COMPANION_MILESTONES` | nine gates; 2–6 unchanged; 7: 260 / 4000 Glow / cap 7; 8: 330 / 7000 / 8; 9: 410 / 11000 / 9; 10: 500 / 16000 / 10 |
| `FEED_COOLDOWN_MS` | still `4000` (v1 FEED + validate) |
| `THROW_COOLDOWN_MS` | `1000` (P2-07; do not alias onto `FEED_COOLDOWN_MS`) |
| `STARTING_NEXT_FEED_ALLOWED_AT_MS` | `0` |
| `STARTING_NEXT_THROW_ALLOWED_AT_MS` | `0` |
| `SCHEMA_VERSION` / `BALANCE_VERSION` | still `1` (validate.mjs) |
| `HABITAT_ID` | still `'garden-prototype-v1'` (validate.mjs + `createInitialState().habitatId`) |
| `SCHEMA_VERSION_V2` | `2` |
| `BALANCE_VERSION_V2` | `2` |
| `HABITAT_ID_V2` | `'farm-v2'` (layout identity only this packet) |
| `TUTORIAL_STEPS` | `feed`, `berry`, `welcome`, `upgrade`, `throw`, `pet`, `camera` |
| `WORLD_STEP_MS` | `50` |
| `WORLD_CARRY_MAX_MS` | `49` |
| `FOOD_FLIGHT_MS` | `600` |
| `EAT_DURATION_MS` | `800` |
| `POST_MEAL_REST_MS` | `1500` |
| `MAX_FOOD` | `12` |
| `MAX_WORLD_STEPS_PER_ADVANCE` | `100` |
| `GEOM_EPS` | `1e-6` |
| `MAX_ACTIVE_ROUTES` | `3` |
| `GAIT_CYCLE_MS` | `1250` |
| `STRIDE_UNITS` | `1` |
| `EAT_APPROACH_MIN` / `EAT_APPROACH_MAX` | `1.0` / `1.25` |
| `PET_FEEDBACK_COOLDOWN_MS` | `2000` (constant only) |

Shrub / pantry / bloom prices and intervals are unchanged.

### 9.2 `slime-garden/src/world/layout.mjs` (authority for farm geometry)

Do not duplicate these numbers in scene or selectors. `scene/layout.mjs` remains six-slot v1.

| Export | Role |
| --- | --- |
| `FARM_LAYOUT` | `{ id: HABITAT_ID_V2 ('farm-v2'), homeSlots, staticProps, fence, gate, footprint }` |
| `HOME_SLOTS` | ten pads; slot 0 is `(0, 2)` |
| `homePosition(slot)` | copy of that pad, or `null` |
| `STATIC_PROPS` | shrub `(-10.8,-5.5)`, pantry `(-10.8,5.5)`, bloom `(10.8,-4.5)`, r=`0.5` |
| `isFinitePoint(point)` | finite `x`/`z`; no integer rounding |
| `isValidFoodTarget(point)` | food rect, not gate lane / arrival corridor / prop food-exclusion; ≥1 of 16×3 approach samples in `[1.0,1.25]` is a valid slime center. Does not clamp. Ignores dynamic actors. |
| `isValidResidentCenter(point)` | resident domain, outside movement-inflated props (r+1.2) |
| `isInFoodRect` / `isInProtectedGateLane` / `isInArrivalCorridor` / `isInResidentDomain` | predicates |
| `freePositionCandidates()` | homes first, then bounded grid |
| `findFreePosition({ occupied, reserved })` | first candidate ≥ `MIN_SEPARATION` (2.4) from blockers |
| `isSeparatedFrom(point, others, minSep?)` | |
| `pairDistance` / `minHomeSlotSeparation` | min pair is 3 as designed (≥ 2.4 required) |
| `GATE_STAGING` `(0,-12)` / `GATE_INSIDE_WAYPOINT` `(0,-7)` | |
| `NEAR_SELECTED_TARGET_RADIUS` | `1.5` |
| Fence | centerlines `x=±12`, `z=±10` |

No A*, no Three.

### 9.3 `slime-garden/src/world/state.mjs`

| Export | Role |
| --- | --- |
| `createWorld(slimes)` | `timeMs` 0, `carryMs` 0, `nextFoodSequence` 1, `foods` `[]`, idle residents at homes in numeric id order; `nextDecisionWorldMs = 2000 + homeSlot*250` |
| `cloneWorld(world)` | field-by-field; new foods/residents/route.points |
| `createIdleResident(slime, position?)` | default idle record |
| `reconcileWorldResidents(world, slimes)` | add at home/free point, drop extras, keep survivor poses |
| `syncWorldRoster(state)` | cloned GameState + reconciled world (canonical roster helper) |
| `cloneGameState(state)` | used by `core/state.cloneState` |
| `attachThrowCooldownAlias` / `attachWorld` / `preferredCooldownMs` | in-memory v1 JSON compatibility |
| `decisionTimeForSlot` / `slimeNumericId` | |

World does **not** import `core/state.mjs` or scene.

### 9.4 `slime-garden/src/core/state.mjs` / `selectors.mjs`

| Export | Role |
| --- | --- |
| `createInitialState()` | one slime at slot 0; `world` via `createWorld`; both cooldown names `0`; **`habitatId` remains `garden-prototype-v1`** |
| `cloneState(state)` | deep clone including world; synthesizes `createWorld(slimes)` if `world` is missing (v1 load); copies both cooldown names to one integer (prefers `nextThrowAllowedAtMs`) |
| `syncWorldRoster` / `createWorld` | re-exported from `world/state.mjs` |
| `getRateMicroPerSecond` / `getResidentCapacity` / `getCompanionEligibility` / `getNextUpgradeCostMicro` | work for 1–10 residents and beds 0–8 |
| `isAffordable(state, upgradeId)` | `glowMicro >= getNextUpgradeCostMicro` |
| `resolveNearSelectedTarget(state, slimeId)` | eight points, radius 1.5, `k*π/4` with k=0 = local +Z; first `isValidFoodTarget` or `null` |
| `isValidFoodTarget` / `isFinitePoint` | thin re-exports; **layout.mjs is the authority** |

### 9.5 Cooldown alias (until P2-07)

`GameState.nextThrowAllowedAtMs` is a **non-enumerable getter/setter** for the same integer as enumerable `nextFeedAllowedAtMs`. FEED still writes `nextFeedAllowedAtMs = t + 4000`; the throw name follows. Do not keep two clocks. `THROW_COOLDOWN_MS` is 1000 and is unused until P2-07.

### 9.6 Save / UI incompatibilities this packet

- **`SCHEMA_VERSION` stays 1.** Do not bump it here (every current save would become FUTURE).
- **In-memory habitat remains `garden-prototype-v1` until P2-03 writes `farm-v2`.** `HABITAT_ID_V2` is exported and used as `FARM_LAYOUT.id` only. Prefer working v1 save/load over putting `farm-v2` on `createInitialState().habitatId`.
- **`world` is non-enumerable** on GameState so `serializeEnvelope` → `JSON.stringify(cloneState(...))` still matches frozen v1 fixtures. Property access `state.world` works this visit. Reloading a save **drops** world (validate reconstruct is still v1); `cloneState` after load synthesizes idle residents at homes.
- **`nextThrowAllowedAtMs` is likewise omitted from JSON** until P2-03.
- **P2-03 must freeze legacy validation independently** because `POPULATION_CAP` is now 10 and `UPGRADE_MAX_LEVEL.beds` is 8. Current `validate.mjs` would accept a claimed-v1 ten-slime / beds-8 envelope.
- **Scene still has six pads** (`scene/layout.mjs`). UI will show eight bed levels and ten names. Welcome can add past six into a six-pad scene until P2-10/P2-13.
- Live garden can still FEED / WELCOME in memory this visit (commands unchanged except the cap is 10). THROW_FOOD is not implemented.
- The playable farm is **not** done. No navigation A*, no camera HUD, no automatic arrivals.

## 10. P2-03 persistence dispatcher, migrateV1 seam, serialize world

Landed on `feat/slime` after P2-02. `SCHEMA_VERSION` in `balance.mjs` remains 1 (legacy identity). Current writes use `SCHEMA_VERSION_V2` / `BALANCE_VERSION_V2` / `HABITAT_ID_V2`. `main.mjs` is unchanged.

### 10.1 Dispatcher (`validateSave`)

Returns `{ ok:true, kind:'legacy-v1'|'current', save }` or `{ ok:false, reason }`. Parse JSON + `gameId` first.

| Combo | Result |
| --- | --- |
| schema 1 + balance 1 | Frozen v1 validate (`validate-legacy.mjs`). Cap 6, beds 0–4, habitat `garden-prototype-v1`, `nextFeedAllowedAtMs`, cooldown 4000, tutorial feed/berry/welcome/upgrade only, no `world`. Claimed 10 slimes or beds 8 → `INVALID_STATE`. |
| schema 2 + balance 2 | Strict v2 (world required, habitat `farm-v2`, `nextThrowAllowedAtMs`). |
| schema > 2, or schema ≥ 1 with balance > 2 | `FUTURE_VERSION` (`future-schema3.json`). |
| `schema-v2.json` (schema 2 + balance 2, junk body) | `INVALID_STATE`, not FUTURE. |
| Other combos | `INVALID_STATE`. |

Frozen P2-00 v1 fixtures parse as `kind: 'legacy-v1'`.

### 10.2 `createFreshEnvelope` / `serializeEnvelope`

Fresh/reset envelopes are schema 2, balance 2, habitat `farm-v2`. Constructor copies economic fields from `createInitialState()` (still `garden-prototype-v1` in memory), attaches/creates world, sets farm-v2. After `validateSave(serializeEnvelope(fresh))`, kind is `current`.

`serializeEnvelope` **explicitly** writes `world` and `nextThrowAllowedAtMs` for schema 2. It does not rely on `JSON.stringify` of non-enumerable `state.world`. V2 JSON omits `nextFeedAllowedAtMs`; reconstruct aliases it from `nextThrowAllowedAtMs` via `attachThrowCooldownAlias` so FEED still reads the clock. Schema 1 serialize still omits world (frozen v1 fixtures).

### 10.3 `migrateV1` / `reconcileAway` (no double-credit)

`migrateV1(legacy, nowWallMs)`: strict v1 → legacy `advance` absence to `nowWallMs` → convert (schema/balance 2, farm-v2, `nextThrowAllowedAtMs = simTimeMs + min(1000, remaining feed cooldown)`, `createWorld` idle at homes) → `applyPostMigrationProgression` (P2-03 **typed no-op identity**; P2-04 will call `resolveCompanionsNow` here; do not auto-welcome) → strict v2 validate. Returns `{ save, summary }` including away credit from the legacy reconcile.

`reconcileAway`:
- schema 1 → `migrateV1` (so main’s existing `reconcileAway(loaded.save, now)` migrates a browser v1 save once).
- schema 2 → existing economy `advance`; **freeze** world snapshot (time/carry/foods/paths unchanged). Remainder jump clamps `nextFeedAllowedAtMs` (same integer as throw).

`loadBest` stays pure (no `Date.now`, no auto-migrate). It returns the raw validated checkpoint (v1 or v2).

**Secondary tab leftover:** `enterBlocked` uses `loadBest` without `reconcileAway`, so a blocked tab can still show v1-shaped state. Acceptable until P2-13.

### 10.4 `loadBest` FUTURE primary

If **primary** is `FUTURE_VERSION`, return `FUTURE_VERSION` even when backup is a valid older save. Do not install/rotate older backup over newer-schema data. Corrupt (non-FUTURE) primary + valid backup still recovers backup.

Storage keys and lock name unchanged: `cozy-slime-mvp:primary:v1` / `cozy-slime-mvp:backup:v1` / existing writer lock. First v2 `writeCheckpoint` still `promotePrimaryToBackup` (original v1 raw becomes backup) then writes v2 primary.

### 10.5 P2-04 seam still pending

`applyPostMigrationProgression` does not join companions. A v1 save that is currently Welcome-ready will not gain a resident at migration NOW until P2-04. Native v2 `reconcileAway` likewise does not auto-join.

`createInitialState().habitatId` remains `garden-prototype-v1`. Scene still has six pads. FEED/WELCOME still live in main/UI.

