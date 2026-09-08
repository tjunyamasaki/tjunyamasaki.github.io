# Player experience and balance

## 1. Intended experience

A fenced, detailed farm is the dominant surface. Several mint slimes breathe, look around, walk to different parts of the farm, and react when the player pets them or throws berries. The player changes tools from a small belt rather than administering every action from a permanent side panel. The HUD explains resources and the next companion without obscuring the scene.

Loop: berries regenerate → throw berries onto grass → slimes notice, approach, eat and react → temporary production bonus → passive Glow → improve a farm object → meet care/Glow/space conditions → a newcomer automatically joins → care for a visibly growing colony.

There is still no failure state, starvation, collection clicking, combat, paid currency, or requirement to maintain every boost. A larger farm should feel inhabited even when the player is watching without clicking.

## 2. First session and returning players

Fresh state retains one resident, six berries, empty Glow wallet, and capacity two. The larger fence and scenery already exist. Start in Care mode with the berry tool selected. Show one hint: “Tap the grass to toss a berry.” The first resident starts at `(0, 2)` and the initial hint/target marker suggests a spot about 1.5 units in front of it. This should make the first food-to-mouth sequence visible within roughly six seconds without requiring a long walk.

After the first valid throw, show “Berries grow back on their own.” After the first actual meal, show the bonus on that resident and complete the legacy `feed` tutorial step. Explain “Glow grows while you watch.” When the second resident qualifies, it joins without input and completes the legacy `welcome` step. After an upgrade, complete `upgrade`. The existing `berry` step still completes on regeneration. New hint IDs are `throw`, `pet`, and `camera`; do not reuse old completed IDs for new behaviors.

An old save keeps its tutorial history and gets one dismissible “Your farm has grown: toss berries, pet slimes, and explore the camera” hint. It must not replay all onboarding or reset progress. The tutorial never blocks commands, arrivals, saving, or keyboard access.

## 3. Controls and interaction rules

| Input / mode | Action |
| --- | --- |
| Care + Berry tool + primary ground tap/click | Throw one berry at the validated world point |
| Care + Berry tool + slime tap/click | Select that slime; do not throw through its body |
| Care + Hand tool + slime tap/click | Select and pet it |
| Care + Hand tool + empty ground tap/click | Clear contextual object panel; selection may remain |
| Care + farm object click | Open its upgrade context; a second explicit purchase action spends Glow |
| Orbit + pointer drag | Rotate camera only; never issue gameplay actions |
| Orbit + two-finger pinch | Zoom only; lifting one finger cannot become a click |
| Desktop wheel over focused/engaged play frame | Zoom; never throw or select |
| Zoom + / − HUD buttons | Step distance by factor 1.15 / its inverse |
| Reset view | Farm overview, default yaw/pitch, leaves economic state unchanged |
| Focus selected | Camera target moves to selected resident's current position once |
| 1 / 2 while play frame focused | Berry / Hand tool |
| O while play frame focused | Toggle Care / Orbit |
| + / −, R while play frame focused | Zoom / Reset view |
| Escape | Close topmost sheet; otherwise cancel aim/orbit to Care |

Do not intercept shortcuts in input fields, import dialogs, or browser modifiers. Keyboard and no-WebGL controls use the same command routes. There is no drag-to-aim throw in this phase; tap-to-place is sufficient. The thrown berry still flies through a short arc, with a landing preview before mouse click where available.

## 4. Physical food

A valid throw costs one inventory berry immediately, starts the existing regeneration rule if inventory was full, creates one persistent food record, and emits `FOOD_THROWN`. It does not increase feed counters or grant boost. It uses the common global throw cooldown of **1,000 ms**, replacing the old four-second instant-feed cooldown. No hold-to-repeat automation. Rapid tapping cannot bypass the cooldown by changing tools, camera modes, or residents.

The berry takes **600 active-world milliseconds** to land. This is a fixed gameplay delay, so reduced motion hides the travel but does not make eating earlier. The renderer draws an arc; the core owns land time. A landed unclaimed berry is visible on the ground until eaten. All residents may detect all landed food; there is no hidden perception radius that strands distant berries.

At most **12** uneaten food records exist, counting in-flight and claimed records. A thirteenth throw rejects before spending. Show “Let them finish the berries on the grass.” This bound limits work and save size, not inventory capacity. Food does not expire or create litter. There is no recall/refund mechanic in this phase.

A resident reserves one food, navigates to an eating position, then spends **800 active-world ms** eating. The food remains committed to that resident during eating. At completion, the authoritative transition removes the food, increments that resident's feed count and `totalFeeds` once, applies the bonus, and emits `FED` with the consumed food ID. A second resident cannot receive the same berry. A pause, reload, rejected command, scene failure, or lost animation callback cannot duplicate it.

If every resident is already busy, the food waits. If a route is temporarily blocked, the claimant yields/replans under document 03; it does not eat remotely. No player-visible “hunger” gauge is introduced: selection panel uses “Cozy bonus” and activity such as “Heading to a berry.” Even a fully boosted resident can eat and count toward care milestones.

## 5. Target selection and player agency

Default allocation is oldest landed food first, then nearest available resident by valid route length; ties use lowest remaining boost, then numeric resident ID. The recipient keeps its reservation rather than switching every frame when another resident becomes slightly closer. No more than one reservation per resident or food. When eating completes, a 1,500 ms active-world rest before seeking again lets companions share attention; it does not prevent others from eating.

The user can influence the recipient by placing food nearby. For exact selection, the accessible “Offer near selected” command chooses a valid point near the resident but remains an ordinary unreserved throw; explain that another nearby slime may get there first. It must not secretly restore instant FEED. A deterministic candidate-point resolver tries eight positions around the selected resident and reports `NO_VALID_TARGET` without cost if none is valid.

In keyboard mode, nine labeled farm regions choose valid points through the same world-coordinate command. Additionally provide an adjustable ground reticle (arrow keys, 0.5-unit steps, Enter to throw) when the play frame is focused. Region presets are a convenience, not the only possible landing positions.

## 6. Petting and other life

Petting a resident immediately produces a selected ring, gentle body settle/turn, a small heart or sparkle feedback, and optional soft sound. Per-resident visual pet feedback cooldown: **2,000 ms**. No berry/Glow cost, no feed-count increase, no boost extension, no saved affinity, no requirement to pet a certain number of times.

Petting during eating does not cancel or restart the meal. During travel it adds a brief visual acknowledgment without changing the authoritative route. An idle resident may face the camera briefly. After feedback, it continues its existing activity. Respect the original mesh and face; no new smile rig or recolor.

Normal activity choices: rest with independent idle/blink timing, wander to a different farm point, stop to look around, face a nearby resident briefly, or react to a new arrival. These are presentation states with no extra rewards. Social looks do not block food seeking. Staggered activity and multiple walkers are required; every resident must not turn to face the camera continuously as the old implementation does.

## 7. Progression to ten

Absolute population cap: **10**. Starting capacity: **2**. `beds` levels 0–8 give capacities 2–10. Retain the first four prices and add four levels:

| Beds purchase / resulting level | Capacity | Price in Glow |
| --- | --- | --- |
| 1 | 3 | 40 |
| 2 | 4 | 140 |
| 3 | 5 | 400 |
| 4 | 6 | 1,000 |
| 5 | 7 | 1,800 |
| 6 | 8 | 3,000 |
| 7 | 9 | 5,000 |
| 8 | 10 | 8,000 |

All requirements below are cumulative. Care means actual completed meals, not throws. Glow uses lifetime earned, not wallet balance.

| New resident | Completed meals | Lifetime Glow | Required capacity |
| --- | --- | --- | --- |
| 2 | 6 | 12 | 2 |
| 3 | 24 | 90 | 3 |
| 4 | 60 | 300 | 4 |
| 5 | 120 | 900 | 5 |
| 6 | 200 | 2,200 | 6 |
| 7 | 260 | 4,000 | 7 |
| 8 | 330 | 7,000 | 8 |
| 9 | 410 | 11,000 | 9 |
| 10 | 500 | 16,000 | 10 |

The final four rows and prices are proposed tuning, not measured fun. The balance experiment is a feasibility estimate; the implementation must measure actual feeding/navigation throughput and short visits before finalizing pace. Preserve old six-resident thresholds initially so migration does not redefine completed milestones.

## 8. Automatic arrivals

The next eligible resident joins immediately in logical state. No button, fee, random roll, waiting timer, or claim panel. Run the resolver at the current timestamp before advancing, after a completed meal, after a relevant upgrade, and at the exact passive-income crossing of a lifetime requirement. Re-run until the next resident is ineligible or population is ten (at most nine additions from any state).

A joined resident gets stable sequential ID `slime-n`, home slot `n−1`, default name, zero individual meals, no boost, and `createdAtMs` at that transition. Income begins then. A gate-entry animation must never delay membership or production. The world chooses a safe gate path or a home appearance fallback; the render layer does not create state.

If goals are met but capacity is full, show “A new friend needs a resting pad.” It joins automatically on the purchase that opens space. Buying beds does not bypass unmet care/Glow gates. At ten, show “All ten friends are home.” Remain playable with no eleventh resident.

Offline: resolve automatic arrivals during the credited interval at their actual eligibility times; newly added residents contribute only after joining. No further earnings after eight hours. Pending food is not eaten while away, so absence cannot manufacture new care counts. Newcomers found on return are shown at home with one combined summary; do not replay a long gate-entry queue or require acknowledgement to earn.

## 9. Retained economy constants

| Item | Value / rule |
| --- | --- |
| Starting inventory / base maximum | 6 / 12 berries |
| Shrub prices | 15, 60, 180 Glow |
| Berry intervals at shrub 0–3 | 15,000 / 12,000 / 10,000 / 8,000 ms |
| Pantry prices | 30, 100 Glow |
| Pantry capacities | 12 / 18 / 24 |
| Bloom prices | 20, 70, 220, 650, 1,800 Glow |
| Base passive resident rate | 100,000 micro-Glow/s |
| Bloom multiplier | `1 + 0.25 * level`, levels 0–5 |
| Meal bonus | 2×; extend 120,000 ms, maximum remaining 300,000 ms |
| Offline earning cap | 28,800,000 ms |
| Wallet / lifetime ceiling | 9,000,000,000,000 micro-Glow each |
| Currency precision | 1 Glow = 1,000,000 micro-Glow |
| Feed counter ceiling | 1,000,000,000; sum of resident counters remains total |

At eating completion time `t`: `boostUntilMs = min(t + 300000, max(t, previousBoostUntilMs) + 120000)`. Inventory was already charged; do not charge it again. Shrub purchases reset the incomplete growth interval. Pantry purchases do not grant berries and preserve an ongoing timer, or start one if the old inventory was full. Inventory regeneration never includes berries lying on the ground in its capacity calculation.

At ten residents, base/no Bloom production is 1 Glow/s. Bloom 5 produces 2.25 Glow/s unboosted or 4.5 Glow/s fully boosted. Maximum boosted rate times eight-hour milliseconds is 129,600,000,000,000 before division by 1,000: still a safe integer. Fully boosted for eight hours is an arithmetic bound, not a possible unattended bonus duration.

## 10. Scope boundaries and product acceptance

Included: larger detailed fenced farm, ten-resident progression, real ground food and approach/eating, automatic membership, several concurrent walkers, petting/looks, constrained camera controls, contextual game HUD, accessible equivalents, migration and lifecycle robustness.

Deferred: food types, manual farming/crop harvesting, hunger/illness, affection levels, randomized personalities/species, new slime appearances, breed/split mechanics, decoration placement, day/night cycle, weather, inventory management grids, physics engine, navmesh library, cloud saves, multiplayer, service worker, and prestige. Implementing any of these is not necessary to satisfy this request.

Desired observable result: a first-time player tosses a berry within 20 seconds, sees a slime actually approach it, can zoom/orbit without accidental food loss, can pet a slime, understands a farm upgrade, and sees the second resident arrive without pressing Welcome. At ten residents the farm remains legible, active, and stable.
