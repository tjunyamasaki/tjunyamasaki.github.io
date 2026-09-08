# Simulation, food authority, automatic progression and saves

## 1. Ownership and dependency rules

Keep the existing economy; introduce a small pure world layer because position now affects who receives a berry. Neither Three.js geometry, a tween completion callback, audio, nor frame rate may decide when a food is consumed.

`main.mjs` remains the application owner. It supplies elapsed time and commands, installs complete transitions, handles persistence, and passes read-only state/events to scene and DOM. Pure modules operate on JSON-compatible values. Scene imports world data for rendering; world never imports scene or Three. Existing analytic income remains reusable.

New planned modules:

| Path under `slime-garden/src/` | Responsibility |
| --- | --- |
| `world/layout.mjs` | Shared pure farm geometry, slots, legal target zones, obstacle definitions |
| `world/state.mjs` | World creation, clone, membership synchronization, defaults |
| `world/navigation.mjs` | Path planning and swept clearance, deterministic path reservations |
| `world/behavior.mjs` | Wander/yield/seek state decisions and food allocation |
| `world/step.mjs` | One authoritative 50 ms world step and consumption intents |
| `core/progression.mjs` | Current-time automatic companion resolver |
| `core/active.mjs` | Active world/economy integration and atomic meal completion |
| `core/passive.mjs` | Economy plus exact automatic-arrival crossings, no world travel |
| `core/migrate.mjs` | Strict v1→v2 migration and legacy checkpoint policy |
| `input/pointer-router.mjs` | One gesture owner, semantic input intents, no resources |
| `scene/camera.mjs` | View state/math, no economic side effects |
| `scene/food.mjs` | Persistent food mesh reconciliation and transient effects |

Reuse existing modules where appropriate, but retain these ownership boundaries. `scene/motion.mjs` must stop being a second gameplay movement authority. Move reusable pure math to world or a neutral helper; preserve inspection-only motion. No ECS or generic plugin/engine registry is required.

## 2. Authoritative state

Envelope changes to `schemaVersion: 2`, `balanceVersion: 2`; `gameId` remains `cozy-slime-mvp`. Keep existing economic fields and settings. Replace `nextFeedAllowedAtMs` with `nextThrowAllowedAtMs`. Keep legacy tutorial IDs and add the new hint IDs. Set habitat ID to `farm-v2`; retain `visitor-v1` arrival presentation ID, now using the gate.

Add `world`, which contains:

- `timeMs`: completed active-world time, a nonnegative safe integer multiple of 50.
- `carryMs`: unstepped active time in 0–49 integer ms.
- `nextFoodSequence`: next positive integer, used for stable IDs `food-n`.
- `foods`: bounded array of at most 12 uneaten records, including flying, landed, claimed and eating states.
- `residents`: one spatial record per economic resident, in numeric resident-ID order.

A food record owns its valid target, creation/landing times on the active-world clock, stage, claim ID, and eating completion time if applicable. The resident record owns position, yaw, activity, current path/progress, activity timers, and deterministic behavior counter. Store small plain arrays, never Map, Set, vectors, meshes, functions, or DOM handles. Path reservations are reconstructed from saved paths on load and kept as derived data during stepping.

Persistent world positions are finite numbers in world units, not currency integers. Allow bounded floats, including path progress/yaw; validate with explicitly stated geometric tolerance `1e-6`. Currency/time/counters retain integer validation. Do not round all movement to integers or apply currency epsilon logic to geometry.

`cloneState` currently lists every field by hand. Extend it deliberately; no spread of an unvalidated imported object, and no shared nested path arrays after cloning. Unchanged references may be retained internally only if the immutable API contract is preserved.

## 3. World clock and gameplay clock

`simTimeMs` measures all credited/aged logical time, including absence. `world.timeMs + carryMs` measures active visible gameplay time only. They intentionally diverge while away. Food landing/eating and path progress use world time. Income, boosts, throw cooldown and resident creation timestamps use sim time. Never compare a world timestamp directly to `simTimeMs`.

World step is **50 ms (20 Hz)**, independent of renderer quality. Use persistent integer carry so a sequence of 16/17 ms advances behaves like a single combined advance. Camera and interpolated visual poses may update every render frame. Use the approved 1,250 ms gait cycle; 50 ms divides it exactly.

For `advanceActive(state, elapsedMs)` (0–5,000 integer ms):

1. Resolve any currently eligible companions at current sim time and reconcile their world membership.
2. Take the next slice equal to `min(remaining, 50 - world.carryMs)`.
3. Use `advancePassive` to integrate economic time for that slice, including precise arrival crossings. It leaves world time/carry/travel unchanged except newly joined residents being placed safely at home.
4. Add the slice to world carry. If carry reaches 50, subtract 50, advance world time by 50, then execute exactly one world step.
5. In that step: finish completed travel segments; land due food; finish meals due from previous steps; release stale claims; allocate oldest landed food; reserve/start paths; advance movement; start eating when in range. Starting eating sets a future completion time; it cannot complete in the same tick.
6. For each meal completion, in ascending food sequence, atomically remove that food and apply one feed bonus/counter event at the CURRENT sim timestamp, then resolve current-time companions. Reconcile new world residents safely.
7. Append events in chronological order; return one final state and aggregate summary.

This is one transaction from the caller's perspective. The implementation can use a private working clone within the function, but never mutate its input. Any intermediate state must respect invariant checks in tests. Maximum 100 world steps per call. Longer visible gaps already route through absence reconciliation in `settleNow`; do not drop elapsed economic time to keep a visual frame budget.

`advanceActive(s, 0)` may normalize ready companions, but must not advance movement or complete meals. Specify and test that normalization explicitly; it supersedes the old assumption that all zero-time calls have no events.

During document visibility hidden or device suspension, use `advancePassive` and capped absence reconciliation. Do not run 576,000 fixed steps for eight hours. World food/positions/timers freeze, so a berry with 300 ms of flight left has 300 active ms left after return. World carry is preserved. Throw cooldown and boosts age normally on sim time. No expiry/refund/conversion of pending food while away.

When the OS motion preference, low quality, pause animations, WebGL failure, or context loss changes, the active world and economy continue identically. Hidden DOCUMENT state suspends world time; a hidden settings sheet or lost renderer does not. Tests compare equal commands/active durations with rendering absent, paused, and low quality.

## 4. Throw transaction

`THROW_FOOD { target: {x,z} }` is handled synchronously against settled state.

Validate in this order: command shape/finite point → valid ground and static route reachability → queue below 12 → berries ≥1 → sim time at/after throw cooldown → sequence can increment safely. Reject with a distinct reason and original state/no success event. Keep a stable ordering so UI copy/tests are predictable.

Valid target means grass in the legal food rectangle, outside fixed solid zones and protected gate lane, with at least one static reachable eating approach point. Temporary residents do not invalidate throwing; otherwise a player could not feed near a slime. Do not silently clamp an outside click to the fence edge. UI preview and core use the same predicate.

On success, clone; subtract one berry; restart regen only if previously full; set `nextThrowAllowedAtMs=t+1000`; allocate `food-n`; increment sequence; set `createdWorldMs = world.timeMs + carryMs`, `landAtWorldMs = createdWorldMs + 600`. Stage is `flying`, claim is null, eating completion is null. Land on the first world step at or after land time. Persist immediately and emit `FOOD_THROWN`. That event supplies target and food ID; cosmetic launch origin comes from the current camera/tool presentation and never changes landing correctness.

There is no remaining production `FEED` handler that directly grants boosts. The keyboard “Offer near selected” adapter computes a target and issues THROW_FOOD. Old UI callers must be removed together in integration. Legacy imported saves have no pending FEED command queue to translate.

## 5. Claims and eating

Only pure behavior code assigns claims. For every unclaimed landed food, oldest sequence first:

1. Consider residents not arriving, already claimed, eating, or still in post-meal rest.
2. Find a static valid approach path, treating other current positions and reserved corridors as blockers for the concrete travel reservation. A busy corridor can delay starting a claim; food remains available.
3. Choose shortest feasible route; then lowest remaining boost; then numeric ID.
4. Set food claim and resident target together. A claim with no usable path is released on the bounded replan rule, not retained forever.

An eating approach point is at distance 1.0–1.25 from food, with line of sight and a valid slime center. Generate 16 equally spaced points around the food (angle 0 toward +X), plus the resident's current point if already in range. Choose shortest route, stable index tie-break. A berry can lie close to the fence because its approach is on the inside. Food range uses radius 1.25 and tolerance; the renderer does not require center-over-berry.

At arrival in range, stop path and face food. Set stage `eating`, resident activity `eating`, and `eatUntilWorldMs=world.timeMs+800`. Food's claim remains exclusive. Completion checks food still exists, stage/claim match, resident exists, completion is due, and resident is in range with unobstructed segment. If a consistency precondition fails, release/replan without reward; do not delete/charge again. Valid state construction should make these exceptional.

At completion: remove food, clear claim/path, set resident post-meal rest deadline, apply bonus using sim time and the existing max-counter rule. Emit one `FED {foodId, slimeId, atMs, boostUntilMs}`. Save after the controller commits the batch, before the next externally handled input. One checkpoint for several same-tick meals is enough; do not write localStorage per animation frame.

No public `CONSUME_FOOD` command is exposed to DOM or scene. `finishMeal` is internal and callable only from pure active stepping. Renderer callbacks are unnecessary for correctness.

## 6. Automatic progression and exact passive time

`resolveCompanionsNow(state)` loops while `getCompanionEligibility(state).ready`, adds one sequential resident each iteration, emits one event per ID, and returns. Every iteration increases population, bounding the loop at nine. At capacity ten, selector reports no next target and resolver is a no-op. There is no welcome command to double-submit.

`advanceEconomy` is the old analytic `advance` functionality, with complete v2 cloning and preserved integer arithmetic. It advances time, currencies, berry growth and expiry without spatial steps or membership changes. Keep its tests as the regression oracle for those retained rules.

`advancePassive` wraps that primitive and automatic progression:

1. Normalize current eligibility at start.
2. Determine end timestamp and next bonus-expiry boundary.
3. If the next resident already meets feeds and capacity, calculate when lifetime income reaches its required micro-Glow within the current constant-rate interval.
4. For positive rate `r`, current lifetime `L`, requirement `G`, and remainder `q`, crossing delay in integer ms is `max(0, ceil(((G-L)*1000 - q)/r))`. Use a safe-integer bound; requirements here are tiny relative to the logical/resource limits. If lifetime is capped, resolve any already-met gate normally.
5. Advance economy to the earliest of crossing, expiry, or end. Process income/berries through that timestamp, then resolve all current companions. Update rate for the next interval. Crossing exactly at end adds the resident at end with no retroactive income.
6. Ensure a zero-delay loop either adds a resident or advances to a strictly later boundary. Bound additions by nine; do not scan every millisecond or second.

The difference between a six-resident wallet and lifetime requirements remains intact. Spending cannot erase eligibility. A bed purchase invokes current-time resolution inside the command transition. A meal invokes it immediately after counters change. No additional UI polling loop creates residents.

Membership and arrival travel are separate but coherent. Pure progression inserts the economic resident and a world resident at its unique home point; this is always valid in initial/migrated/offline state. In ACTIVE mode only, an arrival planner may move that newly created world record to the gate and reserve a safe gate-to-home path in the same transition. If a home pad is occupied, first select a nearby free valid position; the stable `homeSlot` stays unchanged. If gate or route is unavailable, retain the home/free-point appearance. The active wrapper calls `planActiveArrival` for newly added IDs at the first world boundary after the event (at most 50 active ms later); their economic creation timestamp remains exact. This is a one-time transition, never retriggered from repeated scene sync. See document 03 for batch and blockage rules. Renderer never relocates authoritative positions to start an animation.

## 7. Absence and cap semantics

Retain current primary/backup and wall/monotonic clock ownership. For native v2 saves, reconcile `creditedMs=min(max(0,now-savedWallMs),8h)` using `advancePassive`. Add arrivals during this interval at exact crossing times. World food and movement remain frozen. New offline residents have no path and are placed safely at home/free-point locations. Safe placement excludes both current resident footprints and all frozen reserved corridors; adding a resident cannot invalidate another saved route. Scan a bounded ordered free-point list if the assigned home is occupied; retain homeSlot as identity. If reserved corridors alone exclude all candidates, atomically stop those routes at their current valid positions, retain any food claims as seeking requests, clear their route reservations, and retry the ordered free-point scan. Resume path planning on active ticks. This cannot reward food, teleport an existing resident, or postpone economic membership; test the ten-resident placement bound on the declared layout. Aggregate `companionsAdded` in the summary rather than storing arrival events for replay.

After the credited interval, advance logical clock through the uncredited remainder without granting resources; bonuses/cooldowns are expired and berries full by eight hours. There are no food world-clock changes. Re-evaluate only already-met current eligibility; no further earned Glow means no new lifetime crossing after cap. Keep current horizon checks; do not overflow 1e12 logical ms.

Write the reconciled checkpoint before showing the summary, with no Claim button. Reload at the same wall time yields no earnings or duplicate IDs. Failed writes remain an explicitly unsaved session; do not claim durability across a failed checkpoint.

## 8. Save schema and migration protocol

Keep existing keys `cozy-slime-mvp:primary:v1` and `cozy-slime-mvp:backup:v1`. The suffix becomes a historical storage-location name; envelope schema is authoritative. Keeping the keys avoids forked v1/v2 progress and uses the old game's future-version protection. Keep the same writer-lock name. Do not clear all origin storage or rename keys in a way that silently starts fresh.

Version dispatcher:

- Parse bounded JSON and game identity first.
- Schema 1 + balance 1: validate with STRICT LEGACY constants and invariants before migration. Do not allow ten residents or beds 8 in a claimed v1 save.
- Schema 2 + balance 2: validate complete current state.
- Greater schema or unsupported future balance: return FUTURE_VERSION and preserve raw data. Never downgrade a future primary by falling back to an older backup automatically.
- Other combinations: INVALID_STATE with recovery/import handling.

Freeze legacy validation rules independently of current global balance constants. The old test fixture `schema-v2.json` is intentionally not a valid phase-2 save; replace the future-version fixture with schema 3 while retaining invalid-v2 coverage.

Migration occurs only after writer ownership and after selecting one valid checkpoint by the established revision rule. Before the first v2 write, preserve original v1 raw checkpoint as the backup according to the existing write protocol. It is not a permanent migration archive; normal backup rotation continues. Export remains available.

Steps for v1 checkpoint at wall time `now`:

1. Strictly validate v1 and select its complete envelope.
2. Reconcile its elapsed absence under LEGACY rules first (no automatic companions, no world food). This avoids retroactively applying new mechanics to the time before upgrade. Use the existing analytic economy with legacy state adaptation; preserve old cap/expiry rules.
3. Preserve wallet, lifetime, remainder, berries/timer, boosts, counters, upgrades, resident IDs/names/slots, settings, tutorial history, and logical time resulting from step 2.
4. Convert cooldown to `nextThrowAllowedAtMs = simTimeMs + min(1000, max(0, oldNextFeedAllowedAtMs-simTimeMs))`. Rename rather than preserving the old 4s bound.
5. Set schema/balance 2, habitat farm-v2; world clock/carry zero, food sequence 1, foods empty, all existing residents placed at safe assigned slots with idle state and deterministic initial delays.
6. Resolve current eligibility under phase 2 at NOW, adding any ready residents once. Never charge migration fees or refund historical upgrades. Set the new hint defaults without clearing old tutorial steps.
7. Strictly validate the result, persist with a new revision and current wall checkpoint, then show one combined migration/away notice.

An existing beds-4 colony keeps capacity six and can buy levels five–eight. Six existing residents are not removed because current feed/Glow totals differ from new future thresholds. Validation of existing membership uses structural consistency, not a requirement to re-prove historical unlock conditions.

Import follows the same v1/v2 dispatch and reconciliation after preview/confirmation. Validate and preview without overwriting current state; only confirmation installs the candidate. Migration failure preserves raw keys and permits export/recovery. Reset creates a fresh v2 save and replaces only these game's keys.

## 9. World validation invariants

Keep the whole UTF-8 save below 64 KiB; measure the ten-resident/twelve-food/maximum-path fixture. The validator must count actual serialized size consistently with its input limit, not assume arbitrarily large paths fit.

- Population 1–10 and ≤ capacity; beds 0–8; sequential unique slime IDs and slots 0–9.
- One world resident per economic resident; no extra/missing records.
- World time and timer bounds are safe integers ≤ logical horizon; carry is 0–49.
- Food sequence positive, unique IDs smaller than next sequence; maximum 12.
- Food coordinates legal, stages and nullable fields consistent; flight land time after creation; eating completion only for eating records.
- Claims reference real residents; reciprocal targets agree; at most one food per resident; claimed/eating states own a claim.
- Positions are finite, valid inside the center domain or the specifically permitted active gate corridor; no static obstacle intersections.
- Paths ≤128 waypoints, finite/legal coordinates, bounded progress, valid static swept segments; modes requiring a path have one. At most three active travel reservations.
- Resident center separation ≥2.4 minus geometry tolerance; preserve special same-actor exclusion only. Food has no collision footprint for slimes.
- Behavior counters nonnegative safe integers; string lengths bounded; reconstruct only known fields.

Reject corrupted spatial state on import rather than silently granting food or rewards while repairing it. Known v1 migration is the only planned schema repair. An unsupported future layout needs a future explicit migration, not arbitrary clamping.

## 10. Controller event/commit path

Create one narrow helper in main (or extracted `app/commit.mjs` if warranted) for complete transitions: install state → update checkpoint → derive UI/scene → save if economically significant → emit current visible feedback. Events generated by active steps and passive arrivals must reach it, not only user-command events.

Immediate persistence required for THROW_FOOD, completed meal, upgrade, automatic resident addition, import/reset/settings, and away reconciliation. Pure walking/rotation checkpoints remain periodic (10 s), on hide/pagehide, or export. Reload can rewind a few unsaved cosmetic steps, but a spent berry and completed meal have immediate checkpoints. Do not report a step as durably saved before write success.

Scene sync consumes world snapshots keyed by ID; it cannot snap residents home because sim time jumped. On restore or import, discard obsolete visual event buffers and reconstruct actors and food from CURRENT state exactly once. Repeated sync never creates extra event rewards. Save/export/UI listeners never mount a second renderer.

Keep single-writer/session-only behavior. Secondary tabs cannot advance world, consume food, buy, pet as a gameplay command, or create companions; camera inspection may remain available. Unsupported Web Locks retains the already-defined session-only mode with export, no writes. Complete BFCache and live context-loss tests remain required.

## 11. Tutorial-only controller acknowledgements

`throw` completes on accepted THROW_FOOD, `feed` on first completed meal, `berry` on regeneration, `upgrade` on successful purchase and `welcome` on automatic membership. For `pet` and `camera`, a narrow pure `completeHint(state, step)` helper accepts only those two IDs and returns a transition adding the previously incomplete hint once. The controller calls it after a real accepted user interaction, saves the updated tutorial list, and never changes money, food, bonuses, positions or membership. Camera/pet state-invariance tests may allow this one-time tutorial marker; the scene methods themselves remain entirely side-effect-free with respect to GameState.
