# Ordered work packets for implementation agents

## Operating rules

The coordinator owns architecture, balance, scope, and acceptance. Each implementation agent owns one bounded packet. Finish and review a packet before assigning its dependents. These instructions do not ask the current planning task to spawn agents or build the game.

At the start of every packet, read the repository's applicable `AGENTS.md` files if any, this pack's `START-HERE.md`, and the documents listed in that packet. Inspect the current working tree. Preserve unrelated changes, especially the pre-existing Hearthwild work. No global formatting, dependency upgrade, root framework migration, deployment, or automatic commit unless separately requested.

The coordinator may let the pure simulation and actor extraction proceed independently after setup, but must give each agent disjoint files. Do not have two agents edit `main.mjs` or `index.html` simultaneously. The default workflow is sequential because weaker agents benefit from stable interfaces.

Reference contracts are written in TypeScript notation for clarity. Runtime production code remains `.mjs` with JSDoc. Do not change file extensions, introduce compile tooling, or reinterpret money/time units without coordinator review.

## Required report from every agent

Return:

1. What behavior now works, in plain language.
2. Exact files changed and why each was needed.
3. Commands/checks executed and their actual results.
4. Any failing checks, incomplete requirements, or unverified claims.
5. How the coordinator can reproduce the result.
6. Any contract or design question discovered; do not silently resolve it by adding mechanics.

“Looks good” without a reproducible check is not completion. A failed network install, unavailable mobile device, or absent browser runner must be reported as unverified rather than described as passing.

## P00 — Isolated skeleton and reference preservation

**Read:** START-HERE; technical spec sections 1–2 and 11; original handoff.

**Goal:** establish a runnable isolated folder and a trustworthy asset reference.

**Allowed files:** `slime-garden/index.html`, `styles.css`, `README.md`, `vendor/`, `reference/`, and a minimal `src/main.mjs`. Do not edit home navigation or deploy workflow yet.

**Tasks:**

- Create the static entry page with UTF-8, viewport metadata, one game root, basic loading/error regions, and local stylesheet/module imports.
- Vendor Three.js r180's two required module files and license; record version, source, and hashes. Do not remove its license header.
- Copy the original handoff unchanged and verify its SHA-256 against this pack.
- Build a minimal executable wrapper around the original fragment; retain comparison controls and camera. If adjusting the import to the local vendor, make that the only source-level behavior change and record it.
- Explain local serve URL and test command in the game README. Respect existing root scripts.

**Checks:** static server serves the game and reference wrapper; both Three modules return successfully; no external runtime CDN is required by the game entry; reference slime renders without console errors.

**Review gate:** reference source matches the approved handoff; no existing site or game was changed. Subsequent packets may start.

## P01 — Extract one exact reusable slime

**Depends on:** P00.

**Read:** entire original handoff and `03-slime-and-scene.md` sections 1–3 and 10.

**Allowed files:** `src/scene/slime-actor.mjs`, `slime-pose.mjs`, `dev/inspection.html`, and minimal inspection wiring. Keep the reference immutable.

**Tasks:**

- Extract construction and pose evaluation without changing numbers or geometry.
- Pass actor-local pose data into deformation; remove shared mutable globals between instances.
- Expose deterministic inspection controls for idle time, walk phase, walk blend, and pause.
- Retain original inspection camera, source travel mode, lights, materials, and tone mapping.
- Implement resource ownership and disposal for the extracted actor.

**Checks:** visual comparison at specified timestamps/phases; eye/glint alignment during blink; no exploding vertices at max stretch; `dispose` works; one actor's pose update cannot change another actor's typed arrays.

**Review gate:** approve the exact match before environmental styling, new motion, or optimizations. If fidelity is uncertain, stop this packet at a concrete screenshot comparison instead of replacing the model.

## P02 — Six-actor rendering spike

**Depends on:** P01.

**Read:** scene spec sections 2, 4, 9, 10.

**Allowed files:** `dev/stress.html`, `src/scene/quality.mjs`, stress-only setup, and measured fixes within actor code.

**Tasks:**

- Render six independent actors at the intended home-slot spacing on the neutral approved floor.
- Give them different idle phases, then test walking and blinking together.
- Add a diagnostic display for actor count, renderer draw calls/triangles, frame times, viewport, DPR, and quality. Keep diagnostics out of the normal product interface.
- Evaluate high and low settings without reducing geometry or changing materials.
- Verify conservative bounds and click selection at deformed extremes.

**Checks:** at least 60 seconds after warmup at six actors; disposal stress; screenshot with all six visible; record hardware/browser rather than claiming generic mobile support.

**Review gate:** establish whether the proposed six-slime target is feasible on tested devices. If it fails, return measurements and the narrowest next optimization proposal. Do not silently lower the population cap.

## P03 — Pure state, balance, and selectors

**Depends on:** P00. Independent of renderer code.

**Read:** game design sections 5–8; technical spec sections 3–4; contracts.

**Allowed files:** `src/core/balance.mjs`, `state.mjs`, `selectors.mjs`, `tests/state.test.mjs`.

**Tasks:**

- Centralize all constants, costs, level limits, and milestones.
- Implement fresh state and selectors for rates, capacities, next costs, and next companion requirements.
- Use integer micro-Glow and milliseconds everywhere in core; add JSDoc for public functions.
- Make cap behavior and exhausted upgrade selectors explicit (`null` next price).

**Checks:** fresh state matches the design; every legal upgrade combination produces the expected capacity/rate; six residents at Bloom 5 produce 1,350,000 micro/s unboosted and 2,700,000 micro/s boosted; lifetime gates survive a low current wallet.

**Review gate:** exported names and units match contracts. No DOM, Three, wall clock, storage, or randomness imports in core.

## P04 — Time integration

**Depends on:** P03.

**Read:** technical spec sections 5–7 and verification numerical cases.

**Allowed files:** `src/core/advance.mjs`, `tests/advance.test.mjs`, relevant core helper additions.

**Tasks:**

- Implement segmented income integration at bonus expiries with remainder carry.
- Implement closed-form berry growth and stop-at-cap semantics.
- Advance logical time and tutorial completion for the first regenerated berry.
- Produce aggregate earnings without emitting thousands of berry or currency events.
- Preserve input immutability and deterministic outputs.

**Checks:** exact expiry boundaries, zero time, integer arithmetic, chunk equivalence, cap handling, one/eight-hour golden values, and six residents with different expiry times. Assert safe integer intermediates at the highest supported rate.

**Review gate:** all arithmetic tests pass before this logic is connected to real clocks. The planning simulator is not accepted as the production test oracle.

## P05 — Economic commands

**Depends on:** P04.

**Read:** design sections 5–7; technical command ordering; contracts.

**Allowed files:** `src/core/commands.mjs`, `tests/commands.test.mjs`, narrowly necessary selectors.

**Tasks:**

- Implement feed cost/cooldown/bonus/counters and its event.
- Implement all upgrades with exact berry-timer rules and stale-level guard.
- Implement sequential welcome eligibility and stale-population guard.
- Update tutorial completion IDs when appropriate; emit only newly completed steps.
- Reject malformed commands and preserve state on rejection.

**Checks:** double feed rejected within cooldown; switching resident does not bypass global cooldown; exact price succeeds; one micro below price fails; spending does not reduce lifetime progress; purchase and welcome double-submit guards; no seventh resident; no charges on failed commands.

**Review gate:** show a command transcript from fresh state to second resident in a Node test. Do not add auto-feed, random rewards, or a spawn timer.

## P06 — Save validation, offline reconciliation, and tab ownership

**Depends on:** P05.

**Read:** technical spec sections 6–9; contracts; verification failure cases.

**Allowed files:** `src/core/validate.mjs`, `src/persistence/`, persistence and validation tests/fixtures.

**Tasks:**

- Validate and reconstruct versioned JSON envelopes, including cross-field constraints.
- Implement primary/backup load and write with injectable storage for tests.
- Implement capped absence reconciliation, full expiry aging, backward-clock handling, and summary data.
- Implement the exclusive Web Lock lifecycle and secondary-tab/session-only states.
- Expose controlled export/import/reset operations for the UI packet.

**Checks:** reload does not double-credit; ten-hour absence credits eight; bonus expires at actual boundary; corrupted primary uses valid backup; future version remains untouched; quota exception is visible; invalid import cannot replace state; two browser tabs cannot both write; back/forward-cache return reacquires.

**Review gate:** persistence tests pass and a real two-tab demonstration works. A storage failure remains a functioning unsaved session, not a reset.

## P07 — Functional DOM game and application controller

**Depends on:** P06. Can proceed before the habitat is ready.

**Read:** design interface/accessibility sections; technical spec sections 4, 6, 10.

**Allowed files:** `index.html`, `styles.css`, `src/main.mjs`, `src/ui/`. Coordinate sole ownership of these files.

**Tasks:**

- Wire initialization, lock/load/reconcile, state ownership, command dispatch, and visible/background clock transitions.
- Build berry/Glow/rate displays, resident selection, Feed, four upgrade rows, companion requirements, and Welcome.
- Implement nonmodal tutorial hints and quiet action feedback.
- Build settings, validated import preview/confirmation, export, reset confirmation, and persistence notices.
- Keep all gameplay usable with a simple scene placeholder or failed renderer.

**Checks:** keyboard-only new game → feed → upgrade → companion; 360 px layout; 200% zoom; visible disabled reasons; no duplicate click listeners after updates; tab hide/return and long sleep do not double-count; pausing animation does not stop currency.

**Review gate:** a complete minimal game is playable without Three.js. This is the vertical slice for the economy, not final art approval.

## P08 — Habitat and scene-state reconciliation

**Depends on:** P02 and P07.

**Read:** scene spec sections 3–5, 8–10; SceneController contracts.

**Allowed files:** `src/scene/{scene,habitat,layout,motion}.mjs`; narrow controller integration coordinated with P07 ownership.

**Tasks:**

- Implement the one provisional garden with approved lighting and bounded props.
- Construct/destruct actors by stable resident ID; reconcile levels and capacity pads.
- Implement camera fitting, resize, selection rings, raycasting, and accessible resident selection synchronization.
- Add bounded short wandering, reservation release, and safe facing.
- Handle hidden rendering, context loss/restoration, and disposal without touching economics.

**Checks:** 1/3/6 residents framed in landscape/portrait; no overlap at home slots; wandering segment clearance; no click on scroll cancellation; context restoration reproduces current state exactly once; no scene code writes Glow or save data.

**Review gate:** scene count always equals state count, including reload and import. Camera and environment retain the approved character's readable appearance.

## P09 — Feeding and arrival feedback

**Depends on:** P08.

**Read:** scene spec sections 6–7; game design arrival decision.

**Allowed files:** `src/scene/arrivals.mjs`, actor effect helpers, optional `src/audio/audio.mjs`; narrow event routing.

**Tasks:**

- Add pooled cosmetic berry arc and restrained reaction at the deformed mouth attachment point.
- Implement visitor entry with path-clearance checks and stationary reveal fallback.
- Make reduced motion and paused-animation paths communicate success without motion.
- Optionally add three quiet local synthesized sounds only if this does not delay core checks; sound remains off by default.

**Checks:** successful feed spends once even when presentation is interrupted; welcome adds once even if reload occurs halfway through; a failed command produces no success animation; blocked arrival path falls back safely; unsupported audio never throws through gameplay.

**Review gate:** original slime remains recognizable and feeding feels responsive. True mesh splitting, new face poses, color variants, and fancy particle systems are separate proposals.

## P10 — Robustness, performance, and small playtest pass

**Depends on:** P09.

**Read:** full verification document.

**Allowed files:** focused fixes, tests, `docs/qa-results.md`; no unrelated cleanup.

**Tasks:**

- Run all production tests, browser flows, save failure cases, and visual comparisons.
- Measure six-resident performance on named desktop and mobile devices if available; distinguish actual measurements from emulation.
- Exercise teardown, import, reset, resize, reduced motion, offline cap, and secondary tabs.
- Record three playtests; tune only centralized constants with coordinator agreement and rerun the planning lab if its values change.
- Document known limitations honestly.

**Review gate:** every mandatory release acceptance passes or is explicitly waived by the coordinator with a concrete reason. Do not label a skipped mobile test as passed.

## P11 — Site integration and release preparation

**Depends on:** P10 and user intent to integrate the completed game.

**Read:** technical deployment section; actual workflow and current home-page conventions.

**Allowed files:** game README, a minimal home-navigation entry, and the workflow's staging step.

**Tasks:**

- Add the game directory to staged Pages output without altering unrelated copies or Firebase generation.
- Add a discoverable site link using existing styling.
- Verify the staged folder contains entry HTML, CSS, all `.mjs` imports, both Three module files, and license.
- Prepare a concise release description covering behavior, checks, and remaining limitations.

**Checks:** local staged-site route works; relative asset paths work; no route-specific console/network errors; existing site entry points still load.

**Review gate:** this packet prepares a reviewable release. Actual push/publish follows the user's authorization at that time; this planning request itself does not authorize publishing.

## Copy-paste assignment template

```text
Implement packet P__ from the slime MVP planning pack at:
[paste absolute path to START-HERE.md]

Read START-HERE, the packet, its referenced specifications, contracts.d.ts,
and applicable repository instructions. The numerical design and approved
slime source are authoritative. Implement only this packet and its allowed
files; preserve unrelated work. Do not invent mechanics, change the asset,
introduce a framework, or publish the site.

Before editing, identify existing dependencies and the smallest file set.
Then complete the packet and run its specified checks. If a real contract
conflict appears, report it concretely instead of implementing around it.

Return behavior completed, files changed, commands and results, known gaps,
and reproduction steps. Never claim unrun tests or unmeasured performance.
```

## Coordinator review questions

Before accepting a packet, check whether it preserves the contract, whether a weaker agent could build the next packet from the current state, and whether it leaves a hidden dependency on unfinished work. Read the relevant tests for real behavior rather than counts of assertions.

The three most important gates are **asset fidelity after P01**, **deterministic progression and save correctness after P06**, and **responsive feeding/arrival behavior after P09**. Stop expanding scope if any of those fails.
