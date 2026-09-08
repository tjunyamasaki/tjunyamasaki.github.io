# Farm geometry, resident movement, camera and presentation

## 1. Character fidelity

Keep `reference/anime-slime-handoff.md` and `reference/original-preview.html` unchanged. The actor is the exact procedural bell profile, 64 profile subdivisions, 80 radial segments, mint `0x8fe6c9`, toon ramp, outline `0x33655b`, decals, cheeks, mouth, highlights, breathing, blink and 1.25-second gait. Do not scale down actors to fit ten, replace geometry, flatten faces, recolor residents, or introduce a shader rewrite as an incidental optimization.

Retain unique mutable geometry/arrays per actor and shared immutable resources where safe. Body and outline share only that actor's body geometry. Update body normals and decals coherently. Preserve comparison camera/light conditions independently of the wider gameplay farm.

World positions/yaw now come from authoritative snapshots. `actor.worldRoot` receives position and yaw, while local lift/deformation remains in `slime-pose.mjs`. Contact shadow and selected ring follow world position on the ground. New pet/eating reactions use the established restrained squash parameters, not replacement facial shapes.

## 2. Farm dimensions and layout

Use a fixed **24 × 20 world-unit** interior bounded by fence centerlines at `x=±12` and `z=±10`. The old circular boundary radius was 5.8, with a roughly 106 square-unit footprint; the proposed 480 square-unit rectangle provides about 4.5 times that enclosed area. These are design dimensions, not measured screenshots. Keep grass relatively open, with environmental detail concentrated around edges and paths.

Resident footprint radius remains 1.2; minimum center separation 2.4. Resident centers normally remain within `x=[-10.8,10.8]`, `z=[-8.8,8.8]`. Food target rectangle is `x=[-10.5,10.5]`, `z=[-8.5,8.5]`, excluding the protected entrance lane `abs(x)<1.8 && z<-6.8` and any explicitly listed solid prop footprint. Food coordinates are continuous, never snapped to navigation cells.

Ten ordered home slots, preserving identity by index rather than old physical coordinates:

| Slot | Resident | X | Z |
| --- | --- | --- | --- |
| 0 | slime-1 | 0 | 2 |
| 1 | slime-2 | -3 | 2 |
| 2 | slime-3 | 3 | 2 |
| 3 | slime-4 | -6 | 2 |
| 4 | slime-5 | 6 | 2 |
| 5 | slime-6 | -6 | -3 |
| 6 | slime-7 | -3 | -3 |
| 7 | slime-8 | 0 | -3 |
| 8 | slime-9 | 3 | -3 |
| 9 | slime-10 | 6 | -3 |

All pair distances are at least 3 units; rows are 5 units apart. Pads themselves are ground decoration, not navigation obstacles. Enable a pad visually when its capacity is purchased. Do not render eight giant locks over unavailable pads. Use small dormant ground markings or omit them.

Gate centered on north fence: opening spans x −1.8 to +1.8, z −10. Spawn staging point `(0,-12)`; inside waypoint `(0,-7)`. Ordinary wanderers never target the outside corridor. Width 3.6 provides 1.2-unit-radius clearance with margin. Treat the gate as permanently open for navigation, with posts and open leaves shown visually. No door-opening collision system is needed.

A valid active arrival can use the narrow outside corridor `x=[-0.6,0.6], z=[-12,-8.8]`, transitioning through the gate to the normal center domain. Only arriving residents may occupy it; food targeting rejects it. Include the outside staging point in camera overview bounds. There is one arrival staging slot; simultaneous additions beyond it appear at safe home/free points, not at identical gate coordinates.

## 3. Prop plan and visual priorities

| Family | Placement / purpose | Collision and interaction |
| --- | --- | --- |
| Fence/posts/gate | Full perimeter, low wooden rails, recognizable entrance | Center-domain boundary; posts outside traversable opening |
| Grass/flower patches | Sparse edge clusters, several hues, small scale | Decorative below 0.15 high; no individual blockers |
| Berry shrub | Rear-left service strip, near `(-10.8,-5.5)` | Outside center/food zone with declared footprint; opens shrub context |
| Basket/crate | Front-left service strip, near `(-10.8,5.5)` | Declared solid footprint; opens pantry context |
| Glow flowers | Right service strip, near `(10.8,-4.5)` | Declared solid footprint; opens Bloom context |
| Resting pads | The ten stable slots | Walkable; enabled capacity; capacity context on marker beside pad area |
| Dirt paths/pebbles | From gate toward middle, winding accents | Ground-level, no pathfinding penalty |
| Distant bushes/rocks | Outside fence, especially rear corners | Decorative skyline, never food targets |

For each solid service prop, declare a circle of radius 0.5 around its listed center, inflate by slime footprint for movement tests, and exclude actual radius plus 0.15 for food target checks. Move art to fit these declared footprints, never derive collision from arbitrary mesh bounds after navigation is implemented. Recheck reachability across the legal food domain after introducing them.

Fence height target 0.7–0.9; near-side rails must not hide most of the actor. Use separate per-side rail materials for camera-dependent fade, to about opacity 0.25 when near-side occlusion is material. Posts can stay opaque if not obscuring faces. Fading is visual only; the boundary remains. Avoid broadly fading slime materials or making gameplay hits pass through solid props without a rule.

Share/instance repeated static grass, posts and stones. Keep six–eight prop families and a restrained palette. Do not put an expensive custom plant mesh at every square unit. Build a graybox first, verify movement and framing, then add details.

## 4. Pure navigation, bounded for this farm

Use a small deterministic grid-assisted route planner on the fixed farm. The grid only finds paths; actors and food retain continuous positions. Grid spacing **0.75 units**. Generate nodes inside the center domain, plus explicit gate/staging nodes. Exclude static obstacle circles inflated by 1.2. Connect eight neighbors only when their full swept segment is clear; no diagonal corner cutting through obstacles. Limit search to **1,024 expanded nodes**, and store ≤128 waypoints per route. A* with Euclidean heuristic and Euclidean edge costs is sufficient. Fixed tie-break: cost, then node index in row-major z/x order.

Connect exact start/end to clear nearby grid nodes rather than teleporting to cell centers. Prefer a clear direct segment before grid search. Smooth the resulting path by removing intermediate waypoints only when each resulting swept segment still passes all clearance checks. Reject a route cleanly if search exhausts; no unbounded retries.

Dynamic reservation scheme: at most **three moving residents** hold full swept polyline corridors at once. Before starting a route, its corridor must clear stationary resident centers by 2.4, every other reserved corridor by 2.4, and static inflated obstacles. Corridor-to-corridor clearance uses segment-to-segment distance, including crossing segments; endpoint-only or same-frame position checks are insufficient. Other current position checks still apply to resident endpoints.

This conservative reservation method deliberately avoids interpenetration without a physics engine. It allows simultaneous travel on disjoint routes. Food allocation may wait for a route rather than making all ten run through each other. Do not implement one global walker as a shortcut.

Priority order for new reservations: active gate entry when possible, oldest pending meal request, yielding blocker, ordinary wander. Existing reservations normally complete, except a wander route may stop safely at its current point when a food priority needs it. Clear/recheck that corridor atomically; never snap the interrupted resident to its destination.

## 5. Blockage, fairness and yielding

A blocked request retries at most once every **500 world ms**, not every render frame. After **2,000 world ms** of blockage, recompute its path including current stationary blockers. If an idle/resting resident is the blocker, give that resident a yield request to a nearby free point away from the requested corridor. Try up to eight deterministically ordered points on rings of radius 3 then 4.5 around that blocker, retaining only legal, unoccupied, reservable destinations. A yielding resident can temporarily use one of the three movement slots; pause issuing new wander reservations until the oldest food request gets a path.

At **5,000 world ms** without route progress, release the food claim and reassess available residents. Releasing a claim never deletes the food or grants a meal. Prefer a different feasible claimant when one exists. At most one yield decision and three path starts per tick. Numeric resident-ID tie-breaks plus the stored behavior counter prevent one resident from owning priority forever.

Never relocate food, teleport through a resident, or feed remotely to hide a stuck-path bug. Development diagnostics should show pending age and blocking reason. Acceptance requires the declared crowded/edge scenarios to clear; if a legal berry remains unserved for more than 60 active seconds in those fixtures, the packet fails and the coordinator revises navigation/layout. The timeout is a QA failure signal, not an in-game food expiry.

Yielding and all ordinary routes must honor fence/prop boundaries and min separation. Reservations reconstructed after load must match stored path/progress. A paused visual scene cannot release a real claim; only world logic does.

## 6. Locomotion and lively behavior

World movement follows the supplied 1.25-second gait, with travel concentrated in phase 0.29–0.68. Proposed gameplay stride is **1.0 world unit per complete cycle**, replacing the old 0.65 travel scale while retaining every body keyframe. For path length L, choose `cycles=ceil(L/1.0)` and spread exact distance over those cycles. Along-path progress uses completed cycle count plus smoothstep of the active travel phase. Evaluate cumulative arc length to cross waypoints without skipping collision boundaries. Path start world time, cycle count and completed progress are authoritative.

The actor's visual walking phase must be supplied from that route clock. Do not leave the body animating on its old independent random phase while horizontal movement follows a different gait. Blink/idle offsets remain independent by resident ID; walking blends should transition over roughly 150–250 ms. At pauses, do not show feet/body sliding along a path outside the travel portion of the gait.

Idle chooses its next action after **2–5 active seconds**, deterministic by resident ID and stored decision counter. Wander destination is **2.5–6 units** away, within the farm and away from protected gate/props, and may be in another region. Try eight candidates; if none can reserve safely, rest and retry after a staggered 1–2 seconds. No random choice in rendering affects gameplay. Prefer keyed hash-derived choices over a mutable global random generator.

Resident modes: `idle`, `wandering`, `seekingFood`, `eating`, `arriving`, `yielding`. A brief look-around/social turn is renderer presentation when authoritative mode is idle. Social looks last 0.8–1.5 s and happen no more often than once every 8–15 s per resident; do not move two residents into contact for this phase. Independent pauses and paths should make activity varied without frantic constant motion.

At ten residents and no input over a 60-second active sample, require at least three distinct residents to complete a wander and observe at least two moving simultaneously. These are minimum test indicators, not a guarantee that three always move. Every idle resident should eventually get a turn; inspect numeric-ID starvation over a five-minute seeded simulation.

## 7. Arrival presentation coherent with the world

On an active `COMPANION_ADDED`, try one safe gate route to the new resident's assigned home or nearby free destination. Place its authoritative position at the gate only if that route is successfully reserved and the gate is unoccupied. Otherwise place it safely at home/free position and use a small still greeting. Income begins at membership creation in either case. An arriving resident does not claim food until its travel ends.

Multiple simultaneous additions: one may enter through the gate; the others appear at separate valid home/free points, with one aggregated announcement. There is no persistent animation queue. Never delay economic membership to protect a single `arrivalFx` variable. Existing slimes keep wandering unless their route conflicts; no global suspension for every arrival.

On cold reload or away return, keep saved existing route state frozen at its last active time, and place OFFLINE newcomers at home/free positions. Show “2 new friends joined while you were away” once. Do not replay old COMPANION_ADDED events. Context restoration creates meshes for the already-existing IDs.

## 8. Camera defaults and limits

Use the existing custom spherical camera approach with `PerspectiveCamera` FOV 35 degrees; no OrbitControls dependency is necessary. Separate `yaw`, `pitch`, `distance`, `target`, and their desired values from economic state. Initial yaw 0, pitch **0.72 rad**, target `(0,0.65,0)`; default distance is calculated to fit the whole fence, gate staging, and maximum actor height with 10% margin in the unobstructed scene rectangle.

Yaw wraps continuously through 360 degrees; pitch constrained **0.35–1.15 rad** (about 20–66 degrees above ground). Distance minimum **5.8**, maximum **max(60, 1.5 × current overview-fit distance)**; recompute max on resize to support very narrow aspect ratios. Do not change actor scale. Near plane 0.05; far plane and fog must expand to contain farm/scenery at maximum allowed distance. Use the old fitting basis math for 3D bounds, including both horizontal and vertical FOV; do not multiply distance by screen width alone.

A zoomed-in central target cannot reach all farm edges comfortably. Include a pan in Orbit: right mouse drag / two-finger centroid drag, bounded target x/z to the resident center rectangle. One touch or left mouse drag rotates. Focus selected centers on a chosen resident once, leaves an explicit focus mode indicator, and does not automatically follow every subsequent motion. Reset returns to farm overview. Full yaw reveals backs correctly; do not rotate the slimes to face the camera on every camera move.

Pinch distance ratio changes desired distance; centroid delta pans; one pointer becoming two cancels any click candidate. Camera controls never submit gameplay intents. Wheel zoom is exponential `distance *= exp(clampedDeltaY * 0.001)` after normalizing wheel deltaMode. Use a bounded delta to avoid giant jumps. Keyboard and button zoom steps share the same clamp logic.

Use smooth damped user-requested motion only when reduced motion is off. Reduced motion applies user-requested camera changes directly, no inertia or automatic sweep. Pause animations freezes autonomous scene effects but still permits deliberate camera adjustment. Camera state is session UI state, reset on reload/import; a save should not fail because a camera property is unsupported.

## 9. Camera ownership and refits

Resize updates aspect/projection and distance limits. If the user is in untouched Overview, refit to show the entire farm in the usable rectangle. If the user has zoomed, orbited, panned or focused, preserve the view and only clamp genuinely invalid values. Population growth, berry growth, HUD counter updates, and pad purchases must not reset their chosen angle or zoom.

A contextual sheet changes unobstructed bounds; avoid uncontrolled camera jumps when it opens. Desktop sheet can overlay a narrow edge while focus labels are screen-clamped; on mobile put the sheet below/above the protected tool belt and allow collapse. A Reset button explicitly fits whatever region is currently unobstructed.

Picking always uses actual canvas client bounds and the CURRENT camera matrices. Reject zero-size hosts; resize handling must not create NaN camera coordinates. Camera disposer removes all observers/listeners it owns; the pointer router, not both camera and scene, owns pointer events.

## 10. Rendering food and feedback

Create one scene-food entry per saved food ID. World stage decides whether it is airborne, landed or eating. Use pooled/shared small berry geometry, leaf accent and a soft landing shadow. Arc height can be 1.5–2.5 units based on camera-friendly projection, but target and duration come from world state. A new FOOD_THROWN event captures a camera-relative foreground origin for animation; reconstructing an existing flying food after load may show it still at target until land rather than inventing a new throw event.

As eating begins, bring the berry from its ground target to the actor's actual deformed mouth over the eating duration. Query `getMouthWorldPosition`, never a fixed global mouth coordinate. Consumption has already been scheduled by pure state; hide/remove by food ID when state removes it. No mesh callback grants bonus.

Support several meals completing together. Replace single `feedFx` with a pool for at most ten brief reactions, and cap total celebration particles at **40**. Reuse the existing `FED` sound cue with a short aggregate limiter (at most one cue per 150 ms) to avoid a burst of ten overlapping sounds. A small bonus ring/label on the actual eater matters more than particles.

For reduced motion use still mouth/ground symbols and textual status; no arcs, pulsing camera or squash bursts. For animation pause freeze visual poses/travel while preserving current roster/food membership and HUD status; on resume sync to current authoritative positions without replaying missed effects. Explicit input uses world targets and resident IDs, never stale rendered position for economic checks. Explain pause as “Pause scene motion; farm activity continues.”

## 11. Performance and disposal gates

Before detailed art, stress ten exact actors. Then benchmark actual final farm with ten residents, twelve food objects, three simultaneous paths, several meal effects, and camera movement. Record device, GPU, browser, viewport/DPR, mode, sample duration, median/p90/p95 intervals, renderer calls/triangles, and world-step cost separately.

Targets remain desktop p95 frame interval ≤20 ms high and named real phone p95 ≤40 ms low, after 10 s warmup and ≥60 s sampling. Pure world step p95 target ≤2 ms on measured desktop, with bounded searches; record slower devices honestly. These targets are requirements to measure, not promises about untested devices.

Retain high DPR cap 1.5, low DPR 1 and 30 Hz render/pose cadence; same mesh fidelity. Auto downgrade retains existing policy. World simulation remains 20 Hz in every quality mode. Optimize allocations, repeated bounds work, unnecessary shadow casters, decorative draw calls and hidden rendering before considering new asset work. Share/instance static props and food geometry. Do not reduce population or geometry to turn a failing benchmark green.

Mount/dispose ten times, switch quality, import/reset, context restore, resize/orbit, and verify stable canvas/listener/observer/resource counts. Dispose materials only by their owner; shared food/fence resources once, per-actor geometry per actor. Keep renderer diagnostics in dev pages, not normal HUD.
