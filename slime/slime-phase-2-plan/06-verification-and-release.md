# Verification, evidence and release gates

## 1. Evidence status

Completed in this planning pass: read original slime documentation pack and source handoff; inspected relevant production code/QA; ran current 130 Node tests successfully in the source snapshot; executed the new planning balance experiment. Additional planning checks on Node 24.19.0/Python verified 3.0-unit minimum home spacing, the 22,525 Glow total upgrade cost, balanced Markdown fences, and valid static eating-approach candidates for 5,736 sampled legal food targets on a 0.25-unit grid. The point sample is not proof of continuous-domain reachability or crowded dynamic navigation. No phase-2 game code was implemented. The tests below are required future acceptance checks, not claims of passing new behavior.

Run existing/current pure suites through `node --test slime-garden/tests/*.test.mjs`. Use injected time, stable seeds, immutable fixtures and fake storage where appropriate. Browser/device checks need actual runtime evidence. Do not wait real hours, modify the system clock, clear unrelated origin storage, or treat a screenshot as evidence of save arithmetic.

## 2. Requirement traceability

| Jun's request | Build packets | Mandatory evidence |
| --- | --- | --- |
| Zoom in/out and orbit | P2-09, P2-13 | Mouse, touch, keyboard/button demonstrations; no accidental throws |
| Ten slimes | P2-02–04, P2-15 | 1–10 state/scene count, eight bed levels, no eleventh, stress sample |
| Game-like HUD and actions | P2-11–13 | Viewport screenshots plus in-world throw/pet/object-upgrade flow |
| Bigger detailed fenced farm | P2-10 | Full enclosure and gate, increased area, valid paths, prop collision match |
| Lively movement and user interactions | P2-06, P2-12 | Concurrent routes, independent idles, pet response, no counter side effect |
| Food anywhere and slime tracking | P2-05–08, P2-12–13 | Continuous target coordinates, real approach/eating, exclusive claims |
| Automatic arrivals | P2-04, P2-13 | No Welcome UI; feed/Glow/space crossings, offline joins and reload correctness |

## 3. Independent numerical goldens

**Retained idle baseline:** fresh one resident with no commands, 15,000 ms passive → wallet/lifetime 1,500,000 micro, berries 7, next berry 30,000; no new resident because feeds=0. One hour → 360 Glow and full berries; eight hours → 2,880 Glow. Do not incorrectly auto-spawn from Glow alone.

**Ten residents:** Bloom0, none boosted → 1,000,000 micro/s. Bloom5, none boosted → 2,250,000. Bloom5, all boosted at the evaluated timestamp → 4,500,000. Maximum eight-hour numerator before millisecond division = 129,600,000,000,000; assert safe integer. A maximum-rate bound is not a claim that boosts last eight hours.

**Passive arrival crossing:** valid fixture with one unboosted resident, `totalFeeds=6`, its individual feedCount=6, lifetime=11,900,000, wallet=0, capacity2, simTime0. Advance passive 999 ms → one resident, lifetime11,999,900, wallet99,900. One more ms → lifetime12,000,000, wallet100,000, second resident created at1,000. Another1,000 ms → wallet300,000, lifetime12,200,000. A whole2,000 ms and partitions must match exactly.

**Arrival at bonus boundary:** same requirement with initial lifetime11,800,000 and resident boost until1,000. Income in first second is200,000; second resident joins exactly at1,000; original bonus expires at1,000. Following second earns200,000 from two unboosted residents. Do not retain old boost for the whole interval or grant newcomer boost.

**Native v2 offline automatic join:** use the unboosted11.9 lifetime fixture above and a one-hour absence. Original resident alone earns0.1 Glow in first second; both then earn0.2/s for3,599 seconds → **719.9 Glow** wallet increase. For ten-hour absence, credit first eight hours:0.1 +28,799×0.2 = **5,759.9 Glow**, while sim clock advances ten hours. Feed count stays6; no third resident.

**Legacy v1 migration uses old absence policy:** corresponding v1 fixture, one-hour absence →360 Glow under old one-resident rule; conversion then adds second resident at current sim time3,600,000, not at1,000. World clock starts0 and food array empty. Native-v2 and migrating-v1 behavior intentionally differ for the pre-upgrade interval.

**Near throw at zero:** fresh state, one resident already in valid eating range of legal target `(1.1,2)`, no conflicting route, sim/world time0. Throw → berries6→5, no feeds, no boost, food flying, landAt600. At599 ms no meal. At600 first eligible world tick lands and starts eating; at1,399 not yet fed. At1,400 meal completes once, totalFeeds1, food removed, boostUntil121,400. With no other events, wallet at1,400 is140,000 micro; at2,600 it is380,000 (1.4s×0.1 +1.2s×0.2 Glow).

The in-range special case needs no positive-length route. Route planner may return a zero-length reachability result; do not construct an invalid `RouteState` or delay by a fake walking cycle merely to handle it.

**Throw cooldown:** accepted at0; another at999 rejects; at1,000 may succeed with inventory/space. Switching selected resident or tool does not bypass it. FEED no longer exists as an instant-reward production command.

**Inventory vs world food:** full12 berries with null regen at sim50,000; throw →11 inventory, one food, regen due65,000 base shrub. Waiting while full before throw produced no hidden reserve. Eating later removes food but does not charge a second berry or restart regen again.

**Consumption bonus extension:** manually constructed due meal completions at sim0,4,000,8,000 (using valid test world state) produce expiries120,000;240,000;308,000 respectively, retaining the old formula. Those are independent completion goldens, not a suggestion to bypass normal throw delay in gameplay.

**Beds extension:** capacity6/beds4 wallet exactly1,800 Glow buys level5→capacity7; one micro below fails. Later prices3,000/5,000/8,000 raise capacity8/9/10. Last purchase maxes beds; another rejects with no charge. Buying capacity while meal/Glow gate is unmet creates no resident.

**Cap and counters:** totalFeeds stays the sum of resident counters at 1e9 rule; IDs/food sequence never wrap. Rejected commands do not change food IDs or counters. Wallet and lifetime retain independent caps and `wallet≤lifetime` validation.

## 4. Food state machine matrix

| Scenario | Expected result |
| --- | --- |
| Two slimes equally close to one berry | Stable tie-break, one claim and one meal |
| Two berries, two available slimes | Distinct claims; neither resident holds both |
| Many berries beside one busy slime | Others may claim if feasible; oldest pending remains tracked |
| Food thrown into occupied grass | Allowed if static target valid; no immediate collision-based loss |
| Outside fence / solid prop / gate lane / NaN point | Reject with no inventory, sequence or cooldown change |
| Twelve flying/landed/claimed/eating foods | Thirteenth rejects; consuming one opens one slot |
| Food waiting while all residents busy | Remains visible and saved, no expiration |
| Claimant has temporarily blocked path | Bounded replan/yield or release; no remote feeding |
| Two completions in one tick | Each food consumed once; stable ordering and one coherent checkpoint |
| Save/reload mid-flight | Inventory remains spent; same food ID resumes remaining active delay |
| Save/reload while claimed/traveling | Same claim/path/position restored; no new berry or duplicate reward |
| Save/reload at799ms eating duration | Completion occurs once after remaining active time |
| Reload just after successful meal checkpoint | Food absent; counters/bonus unchanged except new elapsed time |
| Context lost while eating | Pure world still completes; restoration shows result, no replay |
| Hidden for an hour mid-flight/meal | Economic time advances; active food timer/position frozen |
| Reduced motion/pause/quality toggled | Same completion timestamps/recipient and money for same active input trace |
| Invalid imported reciprocal claim | Entire candidate rejected before replacing current save |

Add a food-conservation property over histories without import/reset: total accepted throws = total completed meals since trace start + current food count minus initial food count adjustment. Inventory/regeneration is tested separately; there are no food refunds or expiry terms in this version.

## 5. Navigation and world properties

Use recorded deterministic seeds, including the initial ten-slot layout and legal arbitrary edge targets. Freeze input state; stepping returns new state. Compare `advanceActive(s,a+b)` and sequential partitions (each call within5s) including world carry, paths, food, counters and sim time. Event arrays may differ in batching, but ordered economic events/timestamps must match after flattening.

Verify every50ms step: positions finite/legal, min resident separation2.4, no fence/prop crossing, at most three active routes, route polyline swept corridors disjoint, coherent reciprocal claims. At most1,024 A* expanded nodes and128 stored waypoints. Gate permission is exclusive to active arrivals.

Specific fixtures: straight clear route; near-prop detour; diagonal blocked corner; two crossing requests; two disjoint paths; opposing corridor paths; idle resident blocking the oldest berry; one arrival plus two wanderers; full colony clustered near a corner; nine pending foods in different regions; twelve berries near one region; all residents eventually getting a turn.

Run at least five simulated active minutes per crowd fixture. Require the named valid food placements to be consumed within60 active seconds; record actual max/p90 food age. If a berry cannot be reached under the declared layout, repair geometry/planning behavior. Do not delete it, grant remotely, or silently teleport it.

For no-input ten-resident60s sample: at least three different residents complete movement and at least two move simultaneously. Check long-run starvation with numeric ID order; passing only slime-1 movement is insufficient.

## 6. Camera and input matrix

| Test | Acceptance |
| --- | --- |
| Mouse/touch primary click in Care | Exactly one semantic action |
| Drag past6px then return to start | No click/throw on release |
| Orbit drag over ground/actor | Only camera movement; berries/counters unchanged |
| Pinch and pan, then lift one finger | Remaining release cannot select/throw |
| pointercancel / lostcapture / release outside | Candidate cleared |
| Mode switch or modal opening during gesture | Candidate canceled, no stale action |
| Right drag in Orbit | Pan, no context action or throw |
| Wheel line/page units | Normalized, bounded zoom |
| Ctrl/Meta wheel | Browser zoom not hijacked |
| Care touch vertical drag | Document scroll works; no berry spent |
| Click HUD over canvas | Only HUD action; event does not reach world |
| Slime body vs ground hit | Select/pet slime, never throw through body |
| Solid farm object vs ground | Context opens; no throw through object |
| Resource tick/capacity purchase | User camera angle/distance preserved |
| Resize after custom zoom | Preserve/clamp custom view; no repeated auto-reset |
| Reset at 360px portrait and extreme wide view | Fence/gate/ten actor bounds in overview usable area |
| Focus selected at farm edge | Resident is comfortably visible; no continuous forced follow |
| Full yaw / pitch extremes / min-max distance | Finite projection, no below-ground view, no clipping by insufficient far plane |
| Double mount/dispose | No duplicate gesture/camera listeners |

Use a frozen input trace replay to prove camera actions do not mutate economy/world state; permit only the first-time `camera` tutorial marker described in document 02 §11. A visual screen recording alone may miss one accidental extra throw; also assert inventory/food count before/after gestures.

## 7. Persistence and lifecycle matrix

Retain original corruption/backup/quota/clock/recovery tests. Add v1→v2 migration fixtures for fresh, three-resident, six-resident max-old-beds, future cooldown, full basket, active boost, nonzero remainder, full wallet/lifetime boundary and old tutorial history.

Validate all IDs, names, counters, settings, economic timestamps and ownership before/after migration. Export current v2 and reimport after a preview. Legacy absence must be calculated only once; reopening migration summary at same wall time does not pay again. Native v2 automatic joins at threshold must likewise be idempotent.

Future primary + valid older backup: show future-version recovery, preserve both raw values. Do not install/rotate an older backup over newer-schema data. Corrupt non-future primary + valid backup retains recovery fallback. Greater backup revision still wins under supported schemas. Simulated failed backup and failed primary preserve the best available complete checkpoint and accurate Saved state.

Force invalid world paths, duplicate food IDs, stage-field mismatch, nonexistent claimant, impossible route count, NaN/Infinity coordinates, oversized arrays and save text. Every invalid import leaves the current in-memory and persisted game unchanged. No repair may grant meals.

Two real tabs: first holds lock; second does not advance world or currency; after first closes, second reacquires/reloads and continues from latest food/meal checkpoint. Hidden first tab keeps ownership. BFCache round trip reacquires before world advances. Unsupported-lock session-only mode never writes but allows export. Settings/import/reset cannot bypass ownership.

Visible→hidden→visible during throw/eating/arrival, long device-sleep gap, backward clock, ten-hour cap, pause toggles, animation-frame fraction carry, pagehide and context restore all preserve one authoritative transition sequence. No renderer reset may change world claims or positions.

## 8. HUD, accessibility and presentation

Capture full UI at360×800,390×844,768×1024,1366×768, and a wide desktop, plus a short landscape phone. Verify true browser200% zoom (not only CSS zoom), text enlargement, focus visibility, scrolling and target sizes. Record browser/viewport differences, do not claim an emulator is a physical phone.

Keyboard-only route: new game → first food → meal → farm object upgrade → automatic second resident → select/focus/pet → Settings/export/import preview/cancel. Repeat with WebGL disabled; same world semantics must complete. Screen-reader check confirms concise announcements rather than constant counter chatter.

Dialogs/sheets restore focus. Ten roster items remain accessible without ten tiny circles. Click on upgrade object only inspects; explicit Upgrade spends once. Reset/export/recovery remain reachable under all layouts. Failed throw indicates reason without claiming successful toss. Milestone copy refers to meals, and no obsolete Welcome control remains in normal UI.

Character comparison uses original same-browser matched lights/camera/DPR and fixed idle0/1.0/blink4.775, walking phases0/.17/.29/.49/.68/.80. Check body silhouette, decals, outline, material/shadow and actor independence. Compare environment separately. New petting and eating must not change the approved base face.

Verify berry arc lands at selected point after camera rotation; ground food remains at that world coordinate; recipient walks visibly; mouth attachment stays correct through yaw/stretch; several simultaneous meals show correct local feedback. Gate entry never creates actor count greater than state population. Scene sync/render frequency cannot duplicate effects or produce a second reward.

## 9. Performance evidence form

Required report fields: commit; date; device model/CPU/GPU; OS/browser; actual vs emulated; viewport/DPR; requested/applied quality; warmup/sample duration; population/food/moving count; median/p90/p95 frame intervals; renderer calls/triangles; world step/pathfinding timings; notes on sustained stutter, context loss and memory cycles.

Scenarios: one resident baseline; ten idle; ten mixed with three paths; twelve foods and multiple meal effects; camera orbit while busiest; high/low/auto; repeated disposal/remount ten times. Sample after10s warmup for at least60s. Targets desktop p95≤20ms high, real phone p95≤40ms low. World step p95 target≤2ms desktop. Record limitations if targets miss; do not convert an unmeasured device into a pass.

Source MVP QA had75 draw calls and127,118 triangles for six actors in one stress sample, with very slow SwiftShader frames. Those are historical measurements in its QA file, not today's ten-actor benchmark and not a sizing guarantee. Use them only as an initial complexity warning.

## 10. Human playtest script

Ask three unfamiliar players: “Care for the slimes, explore the farm, and see whether more friends arrive.” Do not first explain the tool belt. Observe ten minutes, then a brief away/return. Record time to first throw and meal, whether they distinguish throw/eat, camera discovery, accidental throws, petting discovery, upgrading from a farm object, understanding auto-arrival requirements and whether the scene feels alive.

Ask: Did you feel you had to keep clicking? Did you think a slime would suffer while away? Was a berry ever lost or unexplained? Did camera mode feel obvious? Did arriving companions feel like progress? Which controls felt like game actions and which still felt like administration?

Do not invent responses if players are unavailable. Automated flows establish functionality, not pleasure or comprehension. Tune the smallest relevant constants/copy first; adding more currencies or mechanics is not the next response to confusion.

## 11. Definition of done

All seven user requests have passing traceable scenarios; exact slime appearance preserved; ten visible residents with capacity/membership cap; bigger fenced farm with safe entry; arbitrary valid ground throws and actual pursuit/eating; multiple walkers/petting; automatic milestone/offline joining; game HUD/camera gesture safety; strict old-save migration; render-independent simulation and accessibility; regression/new tests pass; performance/playtest evidence honestly recorded; no unrelated changes or unsolicited systems.

Critical correctness failures block acceptance: double spend/reward, lost/overwritten saves, unintended throws from orbit/scroll, permanently unreachable legal food in fixtures, population overflow, and different economic behavior from quality/accessibility settings. Missing real-device or human evidence is explicitly recorded for coordinator disposition; it is never silently passed.

Prepare reviewable changes and release notes. Publication is outside this planning deliverable.
