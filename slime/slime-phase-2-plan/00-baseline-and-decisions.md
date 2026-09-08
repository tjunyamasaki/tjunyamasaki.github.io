# Inspected baseline and design decisions

## 1. Evidence and repository scope

Source anchor: [inspected commit](https://github.com/tjunyamasaki/tjunyamasaki.github.io/commit/7ccfc7e8c08eab70b13ff2db182a8fe173a3fc0e). All source links below use that commit so later branch work cannot silently change this assessment.

Original documentation inventory, all read:

| File under `slime/slime-mvp-plan/` | Role in this plan |
| --- | --- |
| START-HERE.md | Original scope, authority, delegation conventions |
| 01-game-design.md | Economy, six residents, manual welcome and feed interaction |
| 02-technical-spec.md | Pure simulation, logical clock, save/backup/lock contracts |
| 03-slime-and-scene.md | Exact model, single-walker limitation, fixed camera, motion rules |
| contracts.d.ts | Existing public state and commands |
| 04-agent-work-packets.md | Required depth and bounded-agent workflow |
| 05-verification-and-release.md | Regression goldens and unresolved acceptance gates |
| anime-slime-handoff.md | Approved geometry, face, materials, pose and showcase controls |
| balance-lab.mjs | Original one-second demonstration policy |
| balance-results.json | Original estimated progression, not player measurements |

Also reviewed `slime-garden/README.md`, `docs/qa-results.md`, `vendor/README.md` and implementation seams described below. The copied asset handoff in `slime-garden/reference/` has the same Git blob ID as the planning copy. QA/vendor notes report an actual SHA-256 different from the first plan's printed hash. Preserve the bytes; correct provenance documentation when appropriate, never modify an asset to match a claimed hash.

The implementation baseline has 130 passing tests (run during this planning pass). Source download excluded the large vendored renderer binaries because the current task is planning and pure-module verification; no new browser test or GPU measurement is claimed.

## 2. Existing implementation and changes required

| Current file / behavior | Required phase 2 change |
| --- | --- |
| `src/core/balance.mjs`: cap 6, beds 0–4, five milestones, 4 s feed cooldown | Cap 10, beds 0–8, nine milestones; new throw cooldown and world constants |
| `src/core/state.mjs`: economy/residents only, explicit field-by-field clone | Add bounded persistent world state; extend clone for every new nested field |
| `src/core/commands.mjs`: FEED charges and rewards immediately | THROW_FOOD charges now, world consumption rewards later; remove normal instant-feed route |
| `src/core/commands.mjs`: WELCOME_COMPANION is player-commanded | Move membership creation into automatic progression resolver |
| `src/core/advance.mjs`: analytic economy over boost expiry boundaries | Retain as economy primitive; wrap with event-aware passive arrivals and active world stepping |
| `src/core/validate.mjs`: schema 1 / balance 1 only | Strict v1 validator, actual v1→v2 migration, strict v2 validator; protect future saves |
| `src/persistence/reconcile.mjs`: no automatic joins while away | Process eligibility crossings during credited absence; preserve frozen world food |
| `src/scene/motion.mjs`: one `walkerId`, home-local wandering, visual-only positions | Gameplay positions move to pure world modules; keep/extract reusable geometry/gait math |
| `src/scene/layout.mjs`: circular radius 5.8, walk radius 4.5, six pads | Shared pure farm layout, ten slots, rectangular fence/gate and walkable interior |
| `src/scene/scene.mjs`: fixed camera, single `feedFx` / `arrivalFx`, resets after time jumps | Camera controller, semantic picking, world snapshot presentation, bounded multi-effect pools |
| `src/scene/arrivals.mjs`: cosmetic feed arc to selected slime, entry fallback | Reuse interpolation/effect utilities; do not reuse immediate reward semantics |
| `src/main.mjs`: independent render clock and economic advancement | Own active/passive advancement, single input router, events from commands AND autonomous steps |
| `index.html`, `styles.css`, `src/ui/dom.mjs`: page-style panel with buttons | Farm viewport plus HUD/tool belt, contextual upgrades, accessible companion controls |
| `src/scene/quality.mjs`, `dev/stress.*` | Exercise ten actors plus food/farm; keep reference six-actor sample for comparison |

Useful current seams are `dispatch`, `advanceBy`, `handleEvents`, `syncScene`, `syncAfterReconcile`, `settleNow`, `handleHidden`, `handleVisible`, and `applyReconciled` in `main.mjs`. `syncAfterReconcile` currently asks the renderer to reset positions; that is unsafe once food has meaningful coordinates. `advanceBy` currently only calls `handleEvents`, while `dispatch` additionally saves and plays scene/audio events. Autonomous food and arrival events must use a shared commit/presentation path or they will update state invisibly and save too late.

## 3. Explicit replacement of old requirements

| MVP statement | Phase 2 replacement |
| --- | --- |
| Maximum six, colony complete at six | Maximum ten; completion only at ten |
| Four bed purchases | Eight purchases, first four retained |
| User intentionally presses Welcome | Automatic deterministic joining; no welcome confirmation |
| Feed selected slime from external panel | Equip berries, throw onto valid ground; nearest eligible claimant seeks it |
| Reward happens before cosmetic arc | Inventory spent at throw; care/bonus applied on authoritative consumption |
| World positions are cosmetic and reset freely | Positions and pending food are saved and authoritative |
| No normal gameplay orbit | Explicit Orbit mode, zoom, reset and focus controls |
| Only one walking resident | Up to three concurrently reserved travel paths; all ten independently decide and react |
| Wander within 0.8 of own pad every 5–12 s | Travel among multiple farm activity points, shorter varied rests |
| Setting/arrival fiction provisional | This phase uses Jun's farm request and automatic visitor entry through a gate |
| Pausing visuals can reset actors home | Visual settings cannot change world state, food recipients, or earning times |
| `advance` has no automatic membership changes | Economy primitive stays narrow; passive/active wrappers resolve automatic progression |

Three concurrent travel paths is a chosen bounded starting implementation, not a new population cap. More can be considered after evidence; do not quietly keep the single-walker restriction or allow only one food target in the whole farm.

## 4. Things retained

Keep exact character source, immutable shared materials and actor-local mutable geometry; `.mjs` and JSDoc; local vendored Three r180; synchronous state transactions; currency precision/caps and remainder; lifetime-vs-wallet distinction; no hunger/death; optional sound; export/import/reset; primary/backup recovery; single writer ownership; DOM accessibility; no backend and no root framework migration.

Glow remains automatically collected. Farm upgrades stay the four existing tracks. The fence and larger floor appear immediately, without charging players for moving their old save to the new layout. Beds increase resident capacity rather than enlarging the fence in incremental geometry stages.

## 5. Main technical risks and assigned gate

| Risk | Prevention / evidence | Gate |
| --- | --- | --- |
| Ten CPU-deformed actors plus props are slow | Ten-actor stress before environment polish; keep approved geometry | P2-01, P2-15 |
| Throw charges and eating reward duplicate | Unique food IDs, atomic consumption, persistent pending food | P2-07, P2-08 |
| Save migration loses progress or overwrites future versions | Strict version routing and canonical v2 migration write | P2-03 |
| Two walkers cross; stationary slime blocks food | Swept-disc path checks, deterministic priorities and yielding | P2-06 |
| Orbit drags throw food accidentally | One pointer owner, explicit mode, movement threshold, multi-touch cancellation | P2-09 |
| Automatic arrivals gain income too early while away | Exact crossing-time integration, cap retained, no button/renderer spawn | P2-04 |
| Mobile scene becomes tiny under HUD | Flexible play frame, full-farm overview plus resident focus, compact sheets | P2-11–13 |
| Weak agents produce incompatible interfaces | Contract packet first, sole integration owner, one packet per agent | All |

## 6. Decision log to carry into implementation

D01: Keep progression to ten; do not instantly spawn ten or grant all beds. D02: Preserve old milestones through six and use the proposed extension for seven–ten. D03: Automatic joining happens at eligibility, including income crossings during credited offline time. D04: Physical feeding has delayed economic effect. D05: Food does not expire, spoil, or lose value while away. D06: Petting is expressive, with no economic benefit. D07: Navigation is a bounded small-system solution on a fixed open farm. D08: Use constrained custom orbit math already present in the handoff; no new controls dependency is necessary. D09: Do not change the approved model to meet performance targets. D10: Implement and verify before considering publication.

These decisions should be recorded in a local ADR if the checkout's instructions require one. The unavailable local architecture documents may add repository conventions; they do not supply evidence that a backend, networking layer, or different engine is needed for this solo game.
