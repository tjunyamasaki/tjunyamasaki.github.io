# P2-00 baseline

Recorded 8 September 2026 on `feat/slime` while implementing packet P2-00. No game behavior was changed.

## Local checkout instructions

`.cursor/rules/project.mdc` still points at gitignored root `docs/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, and `docs/SETUP.md`.

In this checkout those files are **absent** (`/workspace/docs` does not exist). That is expected: the planning pack already notes that those handoff docs are local-only and not on GitHub. Absence is **not a blocker** for P2-00. No contents were invented.

Committed game notes that **were** read: `slime-garden/README.md`, `slime-garden/docs/qa-results.md`, `slime-garden/vendor/README.md`.

## Branch and head

| Item | Value |
| --- | --- |
| Branch | `feat/slime` (tracking `origin/feat/slime`) |
| Working tree at inspection | clean |
| Head | `afbf0398069b4a84a5029fea07d450b5e4b6ba68` — `Add slime farm phase 2 planning pack` |
| Inspected planning baseline | `7ccfc7e8c08eab70b13ff2db182a8fe173a3fc0e` — `Prepare slime garden site integration for release` |

```text
git log --oneline 7ccfc7e..HEAD
afbf039 Add slime farm phase 2 planning pack
```

Uncommitted diff at inspection: none. The planning pack commit is the only difference from `7ccfc7e`. `git diff --stat 7ccfc7e..HEAD` is twelve files under `slime/slime-phase-2-plan/` (2,257 insertions). No `slime-garden/src`, vendor, reference, or other site-route files changed.

This packet then adds the files listed at the bottom. Game source at `afbf039` is the protected implementation baseline.

## Node tests

Command:

```sh
node --test slime-garden/tests/*.test.mjs
```

Environment: Node v22.14.0.

**Result on `afbf039` before this packet’s files:** `# tests 130` / `# pass 130` / `# fail 0` / `# suites 48` / `# duration_ms 238.59024`.

**Result after adding the P2-00 fixture test:** `# tests 136` / `# pass 136` / `# fail 0` / `# suites 49` / `# duration_ms 247.37858` (130 historical + 6 new fixture proofs).

That matches the planning pass and `slime-garden/docs/qa-results.md` for the 130. It is a pure-module regression baseline, not device or GPU evidence. SwiftShader is not claimed as device evidence here.

## Controller seams (`slime-garden/src/main.mjs`)

Document 00 names still match. Actual functions, all in `slime-garden/src/main.mjs`:

| Document 00 name | Actual | File:line |
| --- | --- | --- |
| `dispatch` | `dispatch(command)` | `src/main.mjs:744` |
| `advanceBy` | `advanceBy(elapsedMs)` | `src/main.mjs:500` |
| `handleEvents` | `handleEvents(events, origin)` | `src/main.mjs:763` |
| `syncScene` | `syncScene(events, extra)` | `src/main.mjs:316` |
| `syncAfterReconcile` | `syncAfterReconcile(summary)` | `src/main.mjs:327` |
| `settleNow` | `settleNow(perfNow)` | `src/main.mjs:573` |
| `handleHidden` | `handleHidden()` | `src/main.mjs:674` |
| `handleVisible` | `handleVisible()` | `src/main.mjs:688` |
| `applyReconciled` | `applyReconciled(result)` | `src/main.mjs:552` |

Related helpers (not renamed; later packets must reuse or replace these rather than adding a second clock):

- Visible carry: `flushCarryAdvance` (`src/main.mjs:515`) using `absorbFrameDelta` / `flushWholeMs` from `src/core/clock-carry.mjs`.
- Render/economic loop: `onFrame` (`src/main.mjs:620`).
- Checkpoint write: `saveNow` (`src/main.mjs:475`), `touchMemoryCheckpoint` (`src/main.mjs:412`), `memoryEnvelope` (`src/main.mjs:399`).
- `advanceBy` only calls `handleEvents`; `dispatch` also `saveNow()`, `syncScene(result.events)`, and `cuePresentationAudio`. Autonomous later events need a shared commit path (P2-13).
- `syncAfterReconcile` currently passes `{ resetPositions: reset }` when `awayMs` or `creditedMs` exceeds `SLEEP_GAP_MS` (5_000). Unsafe once food coordinates are authoritative.

Player command wrappers that still speak v1 FEED / WELCOME:

- `feedSelected` (`src/main.mjs:804`) → `dispatch({ type: 'FEED', slimeId })`
- `welcomeCompanion` (`src/main.mjs:829`) → `dispatch({ type: 'WELCOME_COMPANION', expectedPopulation })`
- Bound from `bindDom` as `onFeed` / `onWelcome` (`src/main.mjs:148–152`)

## Vendor and reference provenance

SHA-256 of the committed bytes, computed this pass (not rewritten):

| File | SHA-256 | Matches `vendor/README.md`? |
| --- | --- | --- |
| `slime-garden/vendor/three/three.module.js` | `c8211c69345d2e9949dc7a8ac969380497aa0600a5a8ac6a459c8cd02dd9cb8a` | yes |
| `slime-garden/vendor/three/three.core.js` | `eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20` | yes |
| `slime-garden/vendor/three/LICENSE` | `bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601` | yes |
| `slime-garden/reference/anime-slime-handoff.md` | `87640e527a8f0b53997bd3752ac78b07870e137546e22346fa0b984db2b5d46c` | yes (actual) |

Historical SHA mismatch for the anime-slime handoff, preserved as documented:

- Actual SHA-256 (bytes in tree): `87640e527a8f0b53997bd3752ac78b07870e137546e22346fa0b984db2b5d46c`
- Claimed in original planning `START-HERE.md`: `11CA552EEE43B246BBE4405C7F68D38F5F8242BCF1CF5F5B40F85381E8D6D4B2`

`slime/slime-mvp-plan/anime-slime-handoff.md` has the same SHA-256 and the same git blob id `4d62b13e654e6023f2eb108e53a26f9647f6fe3c` as `slime-garden/reference/anime-slime-handoff.md`. Bytes were not rewritten to match the claimed hash.

## Frozen fixtures

Existing files kept:

- `slime-garden/tests/fixtures/valid-v1.json` — historical fresh-like v1 (revision 1)
- `slime-garden/tests/fixtures/schema-v2.json` — current `FUTURE_VERSION` sample (schema 2). Phase 2 will reuse schema 2 as the real save, so this file must stay the old “future” marker, not the new v2 production shape.

New immutable copies (pretty-printed `serializeEnvelope` output, or a schema-3 future envelope). Regenerated only with constructors; no debug UI:

| File | How it was built | Observable contract |
| --- | --- | --- |
| `v1-fresh.json` | `createInitialState` + `createFreshEnvelope({ nowWallMs: 1700000000000, revision: 0 })` | schema 1, one resident, 0 feeds |
| `v1-cooldown-in-progress.json` | `applyCommand(FEED slime-1)` at t=0, no `advance` | `nextFeedAllowedAtMs` 4000 > `simTimeMs` 0 |
| `v1-three-resident.json` | legal FEED / BUY_UPGRADE / WELCOME / `advance` until population 3 | 3 residents, beds 1, 32 feeds, slime-3 `createdAtMs` 327000 |
| `v1-six-resident-beds4.json` | same policy until population 6 | 6 residents, beds 4, 396 feeds, slime-6 `createdAtMs` 3435000 |
| `future-schema3.json` | object with `schemaVersion: 3` (not `createFreshEnvelope`) | `validateSave` → `FUTURE_VERSION` |

Play policy used for the progressed saves (deterministic, test-only): at each step buy every affordable upgrade in order beds → shrub → pantry → bloom, WELCOME when `getCompanionEligibility.ready`, otherwise FEED `slime-1` after waiting out cooldown and berry regen. Companions therefore have `feedCount` 0; all feeds landed on slime-1. That is legal v1 (milestones use `totalFeeds` and lifetime Glow, not per-slime feeds).

Proving test: `slime-garden/tests/phase2-baseline-fixtures.test.mjs`. It re-runs the constructors and deep-equals the frozen JSON, and it asserts current `validateSave` outcomes. Rebuild (does not belong in CI):

```sh
WRITE_P2_00_FIXTURES=1 node slime-garden/tests/phase2-baseline-fixtures.test.mjs
```

## What this packet did not do

- No edits under `slime-garden/src`, `index.html`, `styles.css`, `main.mjs`, `vendor/`, `reference/`, or other site routes.
- No phase-2 mechanics, balance changes, or save-key changes.
- No browser or GPU run. QA waivers in `slime-garden/docs/qa-results.md` remain unverified here.

## Files added by P2-00

- `slime/slime-phase-2-plan/baseline.md` (this file)
- `slime/slime-phase-2-plan/integration-ledger.md`
- `slime-garden/tests/phase2-baseline-fixtures.test.mjs`
- `slime-garden/tests/fixtures/v1-fresh.json`
- `slime-garden/tests/fixtures/v1-three-resident.json`
- `slime-garden/tests/fixtures/v1-six-resident-beds4.json`
- `slime-garden/tests/fixtures/v1-cooldown-in-progress.json`
- `slime-garden/tests/fixtures/future-schema3.json`
