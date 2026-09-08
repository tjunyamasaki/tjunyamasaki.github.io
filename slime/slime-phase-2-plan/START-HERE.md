# Slime farm — phase 2 implementation blueprint

Prepared 8 September 2026 for Jun. Planning and orchestration only; no game implementation or publication is included.

This pack extends the completed base on `tjunyamasaki/tjunyamasaki.github.io`, branch `feat/slime`, inspected at commit `7ccfc7e8c08eab70b13ff2db182a8fe173a3fc0e`. The original plan is in `slime/slime-mvp-plan/`; production code is in `slime-garden/`. This pack lives at `slime/slime-phase-2-plan/`.

The next version makes the farm itself the interface: choose berries from a small tool belt, toss them onto the grass, watch several slimes approach and eat, pet a resident, inspect farm objects to improve them, and watch eligible newcomers enter through a gate. The camera supports zoom and an explicit orbit mode. The larger fenced farm accommodates up to ten residents without changing the approved slime model.

**Give implementation agents one packet at a time.** This is an executable specification in the sense of concrete instructions and acceptance criteria, not runnable production code. Types are reference notation for `.mjs` and JSDoc. The coordinating agent owns interface changes and review gates.

## Read order

1. `00-baseline-and-decisions.md`: inspected facts, source inventory, changes to old rules, risks.
2. `01-game-design-and-balance.md`: complete player behavior, controls, numbers, progression.
3. `02-simulation-and-persistence.md`: authoritative world state, consumption, automatic arrivals, migration.
4. `03-farm-camera-and-presentation.md`: layout, movement, camera, effects, performance.
5. `04-hud-and-accessibility.md`: HUD, tools, object interactions, mobile and fallback behavior.
6. `contracts.d.ts`: new state/API shape reference, to use alongside retained v1 types.
7. `05-agent-work-packets.md`: ordered bounded assignments and copyable handoffs.
8. `06-verification-and-release.md`: numerical, interaction, migration, visual, and playtest gates.
9. `07-balance-experiment.md`, `balance-lab.mjs`, `balance-results.json`: reproducible planning estimate and its limits.

## Authority

The user's current request overrides conflicting MVP recommendations: ten is the new maximum; orbit is included; the setting is a larger fenced farm; arrivals are automatic; feeding is spatial. Preserve the original approved anime slime source and its inspection comparison. Other v1 safeguards remain applicable unless explicitly superseded here.

Within this pack, gameplay numbers come from document 01; state/API shapes from `contracts.d.ts`; time, settlement, and migration from document 02; geometry and controls from documents 03–04. A packet does not override these contracts. If a substantive conflict is discovered, the coordinator resolves the specific contradiction before assigning dependents. Agents must not invent fallback economics.

## Chosen defaults, clearly identified

These resolve ambiguity so agents can proceed. They are recommendations for this phase, not preferences previously expressed by Jun:

- Ten is the final capacity, unlocked through the existing resting-pad upgrade track. Start with one resident and capacity two.
- Automatic means milestone-qualified residents join without a Welcome button. Care, lifetime Glow, and available space still govern eligibility. This is not an uncontrolled timed spawn system.
- Food can land at arbitrary valid grass coordinates inside the fence. Solid props, the gate corridor, and outside ground reject the throw before it spends a berry.
- Consume a berry from inventory when thrown; count a feed and apply its production bonus only when a slime eats it.
- Petting is a free affectionate interaction. It does not add another currency, permanent affection statistic, or progression gate.
- World feeding and movement run while the game is active. Food remains available while away; offline earnings continue and eligible arrivals are resolved automatically on return. No offline food farming.
- Keep the current vanilla modules, local Three.js r180, micro-Glow arithmetic, eight-hour earnings cap, save recovery, and writer lock.

## Delivery order

Protect the baseline and establish a ten-actor performance sample first. Next lock data contracts and migration, then automatic progression, world navigation and food consumption, then camera/input and farm presentation, then HUD and integration. Final acceptance combines them. Full dependency and ownership rules are in document 05.

Do not ask an agent to implement “phase 2” in one prompt. In particular, do not let different agents independently add food timers, a second movement clock, new save keys, or camera input listeners.

## What this planning pass verified

All ten files under `slime/slime-mvp-plan/` were read, including the source handoff, contracts, balance script, and results. The production README, vendor notes, QA log, and relevant simulation, persistence, scene, controller, and UI source were inspected. All 130 existing Node tests passed in a local source snapshot. That confirms a useful regression baseline; it does not verify the proposed features or a browser rendering benchmark.

Repository tree enumeration at the inspected commit was complete and contained no committed `AGENTS.md`. `.cursor/rules/project.mdc` points to local-only `docs/` instructions, which are not available through GitHub. Future coding agents must read those files in their actual checkout if present. Do not pretend their contents were reviewed here.

The existing QA log explicitly leaves real desktop/mobile GPU performance, recruited playtests, complete BFCache coverage, and live GPU context restoration unverified. Those waivers do not automatically carry into this larger, more interactive release.

## Coordinator operating note (Jun, 8 September 2026)

Implementation is sequential, one packet at a time. After each packet lands on `feat/slime`, stop for Jun to test and approve before the next packet starts. Do not batch packets. Push completed packet work directly to `feat/slime`; do not open a parallel game-implementation branch unless Jun asks for one.

The original planning pack said review gates were coordinator-only. That is overridden here: Jun tests each packet.
