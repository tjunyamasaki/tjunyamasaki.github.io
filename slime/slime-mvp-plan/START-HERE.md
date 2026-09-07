# Slime MVP — implementation blueprint

Prepared 7 September 2026. This is a build specification and delegation pack, not an implemented game.

## The proposed game

A small, peaceful habitat starts with your approved mint anime slime. You feed it regenerating berries, enjoy its reaction, and collect Glow automatically. Glow buys better berry growth, more production, and room for companions. Feeding and lifetime production unlock new slimes. You deliberately welcome each companion and watch it join the scene. Leaving the game earns up to eight hours of progress; nobody suffers from your absence.

The MVP has **one habitat, one approved slime appearance, six residents, one food, one spendable currency, four upgrade tracks, local saves, and offline earnings**. Its purpose is to prove that caring for this particular slime and watching a small colony grow feels good.

The setting and arrival fiction remain **unapproved creative decisions**. The provisional implementation uses a tiny garden and visitors entering from a sheltered edge. These are reversible defaults, not decisions attributed to the user. The simulation uses neutral habitat and companion terminology. A future budding animation can replace entry without changing unlock rules or saves.

## Read in this order

1. [Game design](01-game-design.md) — experience, full MVP scope, economy, pacing, screens, and creative decisions.
2. [Technical specification](02-technical-spec.md) — architecture, module ownership, deterministic time, commands, storage, and hosting.
3. [Slime and scene](03-slime-and-scene.md) — exact asset preservation, renderer extraction, movement, feeding, and performance.
4. [Reference contracts](contracts.d.ts) — types and public module signatures. Port these contracts to JSDoc; this file is not a build-system requirement.
5. [Agent work packets](04-agent-work-packets.md) — ordered assignments with prerequisites, allowed files, tests, and review gates.
6. [Verification and release](05-verification-and-release.md) — test cases, failure handling, playtests, and release checklist.
7. [Original handoff](anime-slime-handoff.md) — unchanged copy of the user's authoritative asset source.
8. [Balance experiment](balance-lab.mjs) and [results](balance-results.json) — runnable planning experiment and measured estimates.

If two documents disagree: asset appearance follows the original handoff; numerical tuning follows the game-design constants; state/API shapes follow `contracts.d.ts`; time/persistence semantics follow the technical spec. Escalate a real contradiction before implementing around it. The balance lab is illustrative and must never overrule the production specification.

## What is fixed, provisional, or excluded

**Fixed from the request:** use the supplied slime; make an idle incremental cozy game; allow feeding; show additional slimes together in the scene; write an MVP detailed enough for implementation agents.

**Recommended MVP decisions:** browser delivery, existing repository conventions, six-slime cap, manual feeding, automatic currency collection, deterministic unlocks, no hunger penalty, no backend, and bounded offline earnings. These are concrete defaults for building, subject to the user's revisions.

**Open creative choices:** garden versus terrarium or another setting; visitor entry versus budding or magical emergence; final title; names and flavor text; final environmental art and sound palette. Build only one temporary setting and one arrival presentation. Do not spend MVP time implementing a selector for alternatives.

**Excluded:** combat, death, breeding genetics, random rarity, paid currencies, multiplayer, cloud accounts, trading, prestige, infinite numbers, procedural worlds, a physics engine, a generic entity-component system, a shader rewrite, and a full decoration editor. Auto-feeding is a candidate for a later version after the manual interaction has been tested.

## The first deliverable from implementation agents

Do not start by building the whole game. First extract the exact slime into a reusable actor, retain the original comparison preview, and demonstrate six independently animated copies. Next build the deterministic economy with a minimal DOM interface. Only then join the two and build the habitat.

This order protects the approved asset and surfaces the two largest risks early: appearance drift and simulation/save bugs.

## Repository fit

Inspection found a vanilla ES module website, a root npm file without a bundler, and a GitHub Pages workflow that stages named subdirectories. The recommendation is an isolated `slime-garden/` directory, ES modules with JSDoc types, Three.js pinned to 0.180.0, Node's built-in test runner, and ordinary HTML/CSS UI. No root framework migration is needed.

`slime-garden` is a technical folder name, not a final game title. Existing unrelated modifications were present in `.gitignore`, `.cursor/rules/hearthwild.mdc`, and `hearthwild/` during inspection. They must be left alone by the game implementation.

No site files, existing game files, or deployment settings were changed while preparing this plan.

## Planning evidence and limits

The one-second planning model was executed with Node 24.19.0. Under its specified attentive policy, companions appear at 1:00, 4:24, 11:47, 22:07, and 36:39. Under 60-second visits every 30 minutes, all six appear by 6:30:41. A player who never interacts earns 2,880 Glow in eight hours and retains the original slime, demonstrating that food is not required for passive income.

These are policy-dependent estimates, not human playtests, performance measurements, or proof of correctness of a future implementation. `balance-results.json` contains the purchase history and exact assumptions. The production simulation needs its own boundary tests.

## How to direct a weaker implementation agent

Give it this pack plus **one work packet at a time**. Require it to read the relevant documents, list the files it will change, implement only that packet, run its checks, and report remaining risks. Do not ask it to infer the economy, invent new mechanics, simplify the approved model, or reorganize the whole repository.

A review gate is an engineering checkpoint for the coordinating agent. It does not mean the user needs to approve each reversible implementation step. Ask the user only for unresolved creative choices or changes to scope. Publishing is a separate later action, not part of this planning request.

## Asset provenance

Original source path:

`C:\Users\tjuny\.codex\visualizations\2026\09\07\01a07d05-55bc-7d11-87c1-3efba0e77ddb\anime-slime-handoff.md`

The copy in this pack has SHA-256:

`11CA552EEE43B246BBE4405C7F68D38F5F8242BCF1CF5F5B40F85381E8D6D4B2`

Adjacent experiments are not approved replacements. In particular, filenames referring to split or spirit animations do not authorize adopting those effects.
