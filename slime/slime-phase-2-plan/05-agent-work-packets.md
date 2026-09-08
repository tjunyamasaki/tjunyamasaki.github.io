# Ordered work packets for implementation agents

## Operating contract

The orchestrator owns architecture, interfaces, balance and acceptance. Implementation agents receive one packet, the relevant specs and exact allowed files. They do not receive an open-ended request to “finish the game.” Default execution is sequential. Independent work may be scheduled later only with disjoint files and already-frozen interfaces; no parallel editing of `main.mjs`, `state.mjs`, validation, HTML or CSS.

Before every packet: inspect working tree and branch; read applicable checkout instructions, START-HERE, document 00 and that packet's references; list exact intended files; confirm dependencies are present. The original pack is historical except for explicitly retained requirements. Preserve unrelated changes, the approved reference source, vendor bytes and other site routes. No automatic commit, PR, push, deploy or root refactor is requested by this planning pack.

The branch used for review must be recorded. If `feat/slime` has moved since `7ccfc7e8c08eab70b13ff2db182a8fe173a3fc0e`, inspect relevant differences before applying this plan. Do not replace newer code wholesale with this snapshot.

## Completion report required for every packet

Report behavior implemented; exact files and reasons; tests/commands and actual pass/fail results; reproducible test/setup steps; incomplete requirements and unverified device/browser claims; changes to public contracts, if any, reviewed by coordinator. Include screenshot/video for visual packets and plain state/event traces for pure packets. A build success alone is not acceptance of behavior.

Tests must validate observable contracts, not duplicate implementation loops. Add focused behavioral tests for food, navigation, timing, migration and gestures; do not add hundreds of snapshots of unchanged CSS. Existing historical tests should remain as legacy fixtures where appropriate. Change current-version assertions deliberately with explanation, never delete a failing regression to inflate a pass count.

## Dependency and merge order

| Packet | Goal | Depends on |
| --- | --- | --- |
| P2-00 | Baseline and integration map | None |
| P2-01 | Ten-actor feasibility | P2-00 |
| P2-02 | Contracts, balance, layout and state foundations | P2-00 |
| P2-03 | Strict v1 migration and v2 persistence validation | P2-02 |
| P2-04 | Automatic membership and passive time integration | P2-03 |
| P2-05 | Navigation math and reservations | P2-02 |
| P2-06 | Active world clock and lively movement | P2-04, P2-05 |
| P2-07 | Throw transaction and food allocation | P2-06 |
| P2-08 | Eating and durable economic settlement | P2-07, P2-03 |
| P2-09 | Camera and single gesture router | P2-02, P2-01 |
| P2-10 | Detailed farm/fence scene | P2-01, P2-05, P2-09 |
| P2-11 | HUD and contextual controls | P2-08, P2-09 |
| P2-12 | Food, pet and arrival presentation | P2-08, P2-10 |
| P2-13 | Application integration and accessible fallback | P2-03–12 |
| P2-14 | Real-module pacing and navigation evidence | P2-13 |
| P2-15 | Cross-feature QA and fixes | P2-14 |
| P2-16 | Documentation and release preparation | P2-15 |

Use an isolated development harness for modules before P2-13. State-contract changes can temporarily make the old main/UI incompatible; record this in the integration ledger rather than building two competing runtimes or claiming the product already works. The working product gate is P2-13. After that, no dependent packet may regress it.

## P2-00 — Establish baseline and exact edit map

**Read:** START-HERE, document 00, current README/QA, `.cursor/rules/project.mdc` and any locally available `docs/` instructions.

**Allowed files:** planning/integration log and new test-fixture copies under the game; no game behavior changes.

**Tasks:**

1. Record current branch/head and relevant uncommitted changes. Check differences from the inspected commit.
2. Run `node --test slime-garden/tests/*.test.mjs`; record baseline result, not an assumed 130 if branch advanced.
3. Save immutable test fixtures for fresh v1, progressed three-resident v1, six-resident beds-4 v1, cooldown-in-progress v1, and unsupported future envelope. Use test-only constructors; no player debug controls.
4. Locate controller command, active/passive clock, save, scene sync and lifecycle seams; confirm names still match document 00.
5. Check vendor/reference provenance. Preserve actual bytes and record the historical SHA mismatch.
6. Create an integration ledger listing every old FEED/WELCOME caller, six-cap assumption, single-effect variable, old camera listener and positional reset to replace.

**Acceptance:** baseline verified or existing failures accurately isolated; existing source protected; fixtures validate as real old saves. **Stop condition:** unexplained source differences or missing required local instructions that materially block the packet; report the concrete item, not a generic permission request.

## P2-01 — Ten exact actors and performance risk

**Read:** original scene/handoff, document 03 §§1,11, existing stress and quality modules.

**Allowed files:** `dev/stress.html`, `dev/stress.mjs`, `src/scene/quality.mjs` only for measured fixes, `docs/qa-phase2.md`. Actor changes require a documented measured reason and reference comparison.

**Tasks:**

1. Parameterize stress population 1/6/10; retain the six-actor comparison scenario.
2. Render ten independent approved actors at phase-2 spacing. No scale/geometry reduction.
3. Exercise all idle, all walking, mixed phases and max-stretch picking; detect shared mutable arrays.
4. Record 60-second warmed high/low samples, renderer calls/triangles and disposal cycles.
5. Prepare the later crowded-food/farm scenario controls in dev diagnostics only; do not fake completed food functionality.
6. Record actual hardware availability and a narrow optimization proposal if targets fail.

**Acceptance:** ten actors exist with independent deformation; no asset drift; diagnostic measurements reproducible. Real device performance can remain explicitly unmeasured at this spike if none is available, but P2-15 cannot inherit a false pass. **Forbidden shortcuts:** replacing the model, lowering cap, treating SwiftShader as phone evidence, claiming six-actor numbers apply to ten.

## P2-02 — Freeze data contracts, numbers and pure layout

**Read:** documents 01–03, contracts, current core/state/clone/selector code.

**Allowed files:** `src/core/{balance,state,selectors}.mjs`, `src/world/{layout,state}.mjs`, focused state/layout tests and fixtures; planning contract updates only after coordinator review.

**Tasks:**

1. Add cap 10, names/slots 1–10, eight bed levels/costs and nine milestones exactly as document 01.
2. Define world step, throw/flight/eating limits centrally, preserving money/time units.
3. Implement pure farm geometry and ten slots, static prop circles, gate corridor, legal-target predicate and home/free-position helper. Keep Three imports out.
4. Define v2 economic/world state and deep clone, retaining settings and tutorial history shape.
5. Default world: empty foods, sequence 1, zero clock/carry, one resident at slot zero with idle path state.
6. Add rate/affordability/eligibility selectors and finite coordinate validation helpers. Capacity upgrades still purchase room sequentially.
7. Publish exact exports consumed by later packets in the integration ledger.

**Acceptance:** ten-resident maximum rates 2.25/4.5 Glow/s at Bloom5; last beds price 8,000; cap selector exhausted; home slots ≥2.4 apart and valid; invalid food points rejected; clone independence for nested world/path arrays. **Forbidden:** silently changing first-six thresholds, granting all beds, keeping old six-value UI arrays as authority.

## P2-03 — Real migration and strict v2 saves

**Read:** document 02 §§8–9, old persistence rules and current validation/save-store modules.

**Allowed files:** `src/core/{validate,migrate}.mjs`, necessary legacy validation helper, `src/persistence/{save-store,reconcile}.mjs` migration routing, validation/persistence/migration tests/fixtures. `tab-lock` changes only for a demonstrated bug.

**Tasks:**

1. Freeze strict v1 validation independently of new balance constants; retain old counter/cap invariants.
2. Implement discriminated parse result for legacy/current/future; update tests that assumed schema2 always means future.
3. Implement v2 world structural/geometric invariants and bounded serialized size.
4. Implement legacy-absence-first migration policy, field preservation, cooldown clamp/rename, default world and habitat conversion. Invoke current-eligibility resolver when P2-04 is integrated; until then expose a clearly typed post-migration transition seam and mark that dependent check pending.
5. Keep existing storage keys/lock name; preserve complete checkpoints and higher-revision backup semantics.
6. Test corrupted primary, future primary with old backup, quota failures and import preview without mutation.
7. Ensure no-WebGL paths do not affect validation, migrations or export.

**Acceptance:** old progress survives byte-independent round-trip with all intended fields; invalid claimed-v1 ten-slime data rejected; malformed world claims/paths rejected; future save untouched; storage failure cannot report Saved. **Integration note:** P2-04 closes and verifies the migration auto-join seam before this feature is accepted end to end.

## P2-04 — Automatic arrivals, including passive crossings

**Read:** document 01 §§7–9; document 02 §§6–8; current `advance`/`commands`/reconcile.

**Allowed files:** `src/core/{progression,passive,advance,commands}.mjs`, narrow migration/reconcile changes; arrival-time/advance/commands tests. No render-driven joins.

**Tasks:**

1. Extract/retain analytic economy primitive with v2 cloning.
2. Implement bounded `resolveCompanionsNow` with unique IDs and safe world placement.
3. Integrate exact lifetime threshold crossings and boost expiries in passive advancement; prevent zero-time infinite loops.
4. Invoke current-time resolution after bed purchases, at advance start/end and migration completion.
5. Remove normal WELCOME command handling from the new core; register old UI caller removal for P2-13.
6. Reconcile native v2 absence using passive automatic joins, preserving eight-hour cap and frozen world.
7. Aggregate away companions in summary and keep membership reward independent of animation.

**Acceptance:** exact 1,000 ms crossing case from verification; no retroactive rate; capacity blocks until purchase; multi-eligible checkpoint normalizes once; no eleventh; native v2 reload same-now idempotent; migrated v1 joins at now after legacy earning. **Forbidden:** controller polling with `setInterval` to spawn, random arrival rolls, automatic capacity buying or animated welcome callbacks.

## P2-05 — Static paths and collision-safe reservations

**Read:** document 03 §§2–5; world/layout contract; existing segment/gait math.

**Allowed files:** `src/world/navigation.mjs`, pure math helper if warranted, world/layout boundary corrections with coordinator review, `tests/navigation.test.mjs`. No scene/UI/persistence edits.

**Tasks:**

1. Build deterministic 0.75-unit grid plus explicit gate connectors, fixed tie-breaks, 1,024-node budget.
2. Try direct paths first; connect exact endpoints; A* and smooth only through swept-clear segments.
3. Inflate static prop footprints by 1.2; test full paths against static boundaries and gate permission.
4. Implement segment-to-segment swept corridor conflicts at 2.4 separation and stationary resident clearance.
5. Enforce at most three active route reservations; rebuild them from saved paths.
6. Return null for unavailable routes without spending food or looping; expose development blocker diagnostics.

**Acceptance:** direct route, prop detour, diagonal corner case, crossing routes, opposing routes, disjoint simultaneous paths, gate permissions and exhausted search tests pass. Route arrays remain bounded and start/end are exact. **Forbidden:** endpoint-only checks, generic physics/navmesh dependency, teleports to grid nodes.

## P2-06 — Deterministic active clock and lively movement

**Read:** document 02 §§2–3; document 03 §§5–6; navigation packet exports.

**Allowed files:** `src/world/{behavior,step,state}.mjs`, `src/core/active.mjs`, narrowly extracted neutral gait/hash helpers, world/active/movement tests. Existing scene motion remains historical until presentation wiring.

**Tasks:**

1. Implement persistent 50 ms carry, fixed-step active wrapper and economy/passive slices.
2. Implement authoritative route progress using exact 1,250 ms gait and 1.0-unit stride with continuous path length.
3. Add staggered idle decisions, 2.5–6-unit wander destinations and three-path concurrency.
4. Implement priority/retry/yield rules and deterministic behavior counters, bounded candidate attempts.
5. Synchronize new world membership; ensure safe placement when a home slot is occupied.
6. Provide headless state traces for a seeded ten-resident five-minute run.

**Acceptance:** active chunk equivalence and frame-partition independence; min separation across every step; no fence crossing; at least two simultaneous movers and three distinct completed walkers in 60s fixture; no ID starvation. **Forbidden:** reading performance.now/Date/Math.random in world, visual quality changing world dt, dropping economic elapsed time.

## P2-07 — Throwing and allocation of real food

**Read:** document 01 §§4–5; document 02 §§4–5; document 03 navigation/eating points.

**Allowed files:** `src/core/commands.mjs`, `src/world/{behavior,step}.mjs`, food selectors/helpers, food/command tests. No DOM controls yet.

**Tasks:**

1. Add THROW_FOOD validation and exact reject ordering; remove new-core instant FEED route.
2. Charge inventory once, start regen correctly, allocate stable food ID and 600 ms landing deadline, enforce 1 s cooldown/12-food cap.
3. Add continuous legal target and near-selected candidate resolution shared with later UI.
4. Land food by world time; allocate oldest food then shortest feasible recipient path with stable tie-breaks.
5. Make claims reciprocal/exclusive, handle busy residents and replan/release rules.
6. Emit throw/land/claim events without feed rewards.

**Acceptance:** no boost/feed count on throw or landing; rejected throws cost zero; full basket timer restarts; arbitrary legal non-grid point retained; 13th food rejected; every food/resident has at most one claim; throwing through outside/solid/gate targets rejected. **Forbidden:** consuming on throw then delaying only the animation, silently clamping invalid click, expiring berries while away.

## P2-08 — Eating, rewards and restart-safe settlement

**Read:** document 02 §§3,5,10; state/save invariants; document 06 food scenarios.

**Allowed files:** `src/core/active.mjs`, `src/world/{step,behavior}.mjs`, internal feeding helper if needed, focused food/active/persistence tests. Controller integration is still P2-13.

**Tasks:**

1. Choose validated eating approach; enter 800 ms eating stage only when in range.
2. Produce internal completion intents and atomically remove food/apply feed boost/counters in active wrapper.
3. Trigger automatic membership after meals and add events in stable same-tick order.
4. Add 1.5 s post-meal rest, release claims/path safely, and keep failed consistency checks reward-free.
5. Round-trip checkpoints during flight, claim, travel, eating and just after completion; resume correct world carry.
6. Test render-free, reduced-motion-equivalent and hidden-time sequences as pure logic.

**Acceptance:** t=0 near throw consumes at t=1,400 in an already-in-range fixture; duplicate food cannot reward; two same-time meals reward distinct IDs once; reload consumes once; hidden interval preserves remaining world delays; wallet bonus starts at eating completion. **Forbidden:** public consume command, raycast distance as core truth, mesh callback to save/reward, refund plus consumed record.

## P2-09 — Zoom, orbit and gesture ownership

**Read:** document 03 §§8–9, document 04 §§3–6, old scene pointer code and handoff camera math.

**Allowed files:** `src/scene/camera.mjs`, `src/input/pointer-router.mjs`, camera/pointer tests, isolated `dev/phase2-camera.*`. Scene API edits only coordinated and logged for P2-13.

**Tasks:**

1. Extract camera state/math with fit bounds, yaw/pitch/distance/target limits, reset and focus.
2. Implement zoom wheel/buttons, Orbit drag, bounded pan and pinch; normalize wheel units.
3. Implement one click/drag classifier, 6px maximum-displacement threshold, pointer/multi-touch lifecycle.
4. Map to semantic intents; no resources or economic commands inside router/camera.
5. Preserve user view across ordinary sync/capacity updates and resize except valid clamping.
6. Honor touch scroll in Care and explicit touch ownership in Orbit; leave browser zoom accessible.

**Acceptance:** drag-return never clicks; pinch release never throws; cancellation/release outside/modal open clear candidates; camera remains finite/clamped at extreme aspect ratios; reset frames full farm; keyboard/buttons equivalent; no new runtime dependency. **Forbidden:** adding OrbitControls alongside old pointer listeners, global wheel preventDefault, toggling camera mode implicitly from every ground drag.

## P2-10 — Bigger farm, fence and scene composition

**Read:** document 03 §§1–3,7,11; shared layout and camera contracts.

**Allowed files:** `src/scene/{habitat,layout,scene}.mjs` under sole scene ownership, farm-only helpers, isolated farm preview and visual notes. Coordinate later P2-12 scene changes sequentially.

**Tasks:**

1. Render graybox farm from shared pure geometry; validate ten homes, gate corridor and prop footprints.
2. Build fence perimeter, visible opening/posts, floor paths, pads and service objects.
3. Add restrained edge grass/flowers/distant scenery with shared static resources.
4. Implement semantic interactable object IDs and occlusion-aware hit candidates.
5. Add near-side fence fade and gameplay fog/shadow extents appropriate to larger camera range.
6. Update capacity/shrub visual setters without rebuilding the whole world on resource ticks.

**Acceptance:** clear larger fenced farm, gate is a real traversable opening, no clipped homes, all ten legible in overview and individually focusable; art matches collision footprints; original actor comparison unchanged. **Forbidden:** scaling slimes down, terrain that only looks walkable, every flower as a pick target, world geometry copied into core and scene separately.

## P2-11 — Game HUD and contextual controls

**Read:** document 04 in full, document 01 controls/economy, current HTML/CSS/UI/settings.

**Allowed files:** `slime-garden/index.html`, `styles.css`, `src/ui/{dom,format,settings}.mjs`, optional narrow HUD/toolbar module, UI interaction/copy tests. Sole ownership of HTML/CSS.

**Tasks:**

1. Replace permanent management layout with resource HUD, population entry, tool belt, camera controls and contextual panel.
2. Keep one UI mode/tool/selection state; use declarative callback contracts for integration.
3. Add resident panel, contextual four upgrades, compact milestone strip and ten-resident completion copy.
4. Remove Welcome button and feed-quota button as the primary interaction; include accessible equivalent tools.
5. Add mobile sheet/reflow/safe-area behavior, real buttons/focus states, keyboard shortcuts help and clear disabled reasons.
6. Preserve all save notices, import preview/reset confirmation and export/recovery controls.
7. Format shortfall/regen/bonus text from selectors; no per-frame DOM rebuild or duplicated prices.

**Acceptance:** 360px and 200% zoom reflow; complete keyboard panel path with mocked callbacks; mode indicator visible; controls do not obscure most of farm; Settings focus behavior retained. **Forbidden:** drawing all HUD into canvas, saving resource values in DOM, deleting recovery UI to simplify layout.

## P2-12 — Food, petting and arrivals feel physical

**Read:** document 03 §§1,6–7,10; document 04 §§7–9; food/world contracts.

**Allowed files:** `src/scene/{scene,food,arrivals,slime-actor}.mjs`, narrowly needed actor pose adapter, `src/audio/audio.mjs`, effects tests/dev preview. Preserve reference source and original keyframes.

**Tasks:**

1. Reconcile one mesh per current food ID; animate new throws to real landing coordinates.
2. Bind actor world position and gait phase to authoritative path snapshots; remove old independent gameplay motion ownership.
3. Render ground-to-mouth eating from actual deformed mouth attachment and world eating duration.
4. Replace single feed/arrival effect slots with bounded per-ID pools and aggregate sound limiter.
5. Add pet reaction and idle/social looks without changing economic state or interrupting eating.
6. Present core-planned gate arrivals/fallbacks, multiple same-tick companions and restored snapshots correctly.
7. Handle reduced motion, pause, hidden state and context recreation without replaying rewards/effects.

**Acceptance:** target berry really remains on grass until approached; actual eater gets feedback; orbit/focus does not misplace mouth attachment; multiple meals render independently; pet leaves every economic/world field unchanged; all actor fidelity poses still match. **Forbidden:** a second world FSM inside Three, auto-facing every actor to the camera, claiming arrival by animation completion.

## P2-13 — Integrate the application and fallback

**Read:** all contracts, document 02 §§3,7–10, document 04, integration ledger from P2-00.

**Allowed files:** `src/main.mjs` sole owner; narrowly necessary module adapter fixes coordinated with owners; application/browser tests. No general architecture rewrite.

**Tasks:**

1. Replace `advanceBy` with active wrapper for visible time, passive for absence; retain fractional clock carry/sleep safeguards.
2. Install a shared commit/events path for user actions, meals, purchases and automatic joins, with immediate meaningful saves.
3. Wire single pointer router to scene picks/camera and controller tools; remove old competing scene listeners.
4. Wire new HUD callbacks, explicit failed-command copy, presets/reticle/near-selected target helper, pet cooldown and pure tutorial-only `completeHint` completion.
5. Route migration/current validation results correctly through load/import/recovery; preserve single writer ownership.
6. Remove obsolete FEED/WELCOME UI/callers, single-walker world, single-FX assumptions and time-jump positional resets recorded in ledger.
7. Ensure no-WebGL UI runs the same headless world logic and supports food/upgrade/arrival/export.
8. Rebuild scene on context restore from latest state without duplicate loops; handle BFCache reacquire and current save reload.

**Acceptance:** fresh game throw→approach→eat→upgrade→automatic friend works through real UI; old save loads; keyboard-only and no-WebGL paths complete; secondary tab never mutates; pause/reduced-motion world sequence unchanged; every immediate reward/cost checkpoint is durable when storage succeeds. **Forbidden:** resolving integration by bypassing pure checks or adding legacy instant-feed controls back.

## P2-14 — Tune from real-module evidence

**Read:** document 07, document 06 numerical/pacing cases.

**Allowed files:** dev/test balance harness, `docs/qa-phase2.md`, approved centralized tuning changes with corresponding docs/tests. No new economy features.

**Tasks:**

1. Implement the three spatial placement policies using actual pure commands/advance functions.
2. Exercise attentive, relaxed and short-visit schedules; log accepted/rejected throws, pending age, path waiting, meals, arrivals and upgrades.
3. Compare against planning estimates; identify navigation delays vs economy waiting separately.
4. Run ten-resident seeded crowd/edge-food scenarios; detect monopolized meals and starvation.
5. If tuning is justified, propose the smallest constant changes to the coordinator; update all affected documentation/fixtures together.

**Acceptance:** reproducible evidence, no legal-berry permanent blockage in acceptance scenarios, no currency/count invariant failure, pacing explained honestly. **Forbidden:** pretending planning experiment proves spatial behavior, inventing human playtest feedback, adding auto-feeding to compensate for a bug.

## P2-15 — Combined QA and real-device review

**Read:** document 06 in full and original fidelity verification poses.

**Allowed files:** focused bug fixes/tests and `docs/qa-phase2.md`; no feature expansion or unrelated cleanup.

**Tasks:** run full current suite and retained legacy fixtures; verify all user requirements in browser; run camera/gesture matrix at named viewports; lifecycle/save/failure matrix; render/food/actor fidelity; ten-resident stress and teardown; real desktop/phone samples when available; three unfamiliar-player playtests when available.

**Acceptance:** every mandatory row passes or is explicitly marked blocked/unverified with actual evidence and coordinator disposition. No blanket carryover of MVP waivers. Critical correctness gates (duplicate food, lost saves, unintended spending, cap overflow) cannot be waived as polish. An unavailable physical device is recorded as unavailable; do not certify mobile performance.

## P2-16 — Documentation and release preparation

**Read:** final QA, actual repository hosting workflow and current player README.

**Allowed files:** game player-facing README, QA/changelog, a narrowly necessary game-hub copy update if already in scope; staging verification notes. Do not alter hosting just because old plan mentions it.

**Tasks:** describe new controls and automatic arrival rules; update six-slime/click-feed/welcome copy; document v1 migration and remaining limitations in engineering notes; verify staged assets include new modules and no import uses a runtime CDN; prepare a concise release description and reviewer reproduction steps. Confirm the old reference preview still works.

**Acceptance:** concrete reviewable release handoff with feature evidence and known gaps. Publishing/pushing is a separate action based on user authorization at that time; preparing this plan does not perform it.

## Copyable assignment template

```text
Implement only packet P2-__ from slime/slime-phase-2-plan/.
Read START-HERE, 00-baseline-and-decisions, the packet's referenced specs,
contracts.d.ts, and applicable instructions in the actual checkout.
Compare current source to the inspected baseline; preserve unrelated changes.

Before editing, list exact files and dependencies. Use only the packet's scope.
Keep the approved slime source and vanilla .mjs architecture. Do not invent
mechanics, alter money/time units, publish, or bypass save/food invariants.

Complete the specified behavior and focused checks. If an interface conflicts,
report the precise conflicting signatures/rules to the orchestrator before
building dependents. Never replace a missing feature with a silent shortcut.

Return behavior, file list, actual commands/results, reproduction steps,
remaining gaps, and visual/state-trace evidence appropriate to the packet.
```

## Coordinator gates

After P2-02, freeze signatures before migrations/navigation/UI are assigned. After P2-04, review exact-time arithmetic and legacy migration manually. After P2-08, require a state trace that proves inventory charge and meal reward happen once on different timestamps. After P2-09, review gesture cancellation tests. After P2-13, play the complete loop with keyboard and pointer. After P2-15, read evidence rather than counting green tests.

For every packet ask: could the next agent work from this output without inventing a missing rule? If not, close that gap before moving forward.
