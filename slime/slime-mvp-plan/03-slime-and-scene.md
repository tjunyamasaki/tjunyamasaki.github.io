# Approved slime, scene, and interaction implementation

## 1. Asset authority

The original handoff is the source of truth. Preserve its body silhouette, facial placement, toon ramp, mint material, dark outline, cheeks, highlights, idle deformation, blinking, and walking keyframes. This is procedural geometry, not an external GLTF or image asset. Do not regenerate it, replace it with a sphere, import a different cute slime, or simplify the face as flat sprites.

Create `reference/original-preview.html` by wrapping the original HTML fragment in a minimal UTF-8 HTML document. Retain its comparison camera, environment, and controls. Prefer local vendored imports in a second executable comparison copy, while keeping the source handoff unchanged and recording the import-only difference. This gives reviewers a stable reference when code extraction changes variable names and ownership.

## 2. Extracting the actor

`slime-actor.mjs` creates one resident's body, outline, face parts, and contact shadow. `slime-pose.mjs` contains the exact original `radius`, `samplePose`, and deformation math after converting module-global mutable variables into arguments or actor-local state.

The actor hierarchy should be:

```text
worldRoot                 world X/Z position and facing yaw
  actor                   vertical hop/lift and subtle local rotation
    body                  unique dynamic LatheGeometry
    outline               shares THIS actor's body geometry
    eyes/glints/cheeks     unique dynamic decal geometries
    mouth                 unique dynamic tube geometry
    painted highlights    unique dynamic decal geometries
  contactShadow           follows worldRoot, remains on ground
  selectionRing           ground-only, shown for selected resident
```

Keep world movement outside `actor`; otherwise applying vertical lift or turning changes the shadow or doubles translation. Remove the showcase's sinusoidal X travel and presentation turning **only in gameplay mode**. Retain them in comparison mode. World facing uses the fact that the face looks toward local +Z; a travel direction `(dx,dz)` gives yaw `atan2(dx,dz)`, smoothly approaching the shortest angular difference.

The source curve uses ten exact profile controls and `getPoints(64)`, then `LatheGeometry(profilePoints,80)`. That produces 65 profile samples and 81 radial columns, roughly 5,265 body vertices and 10,240 triangles before considering degenerate pole triangles. Body and outline both draw the mesh. Verify actual renderer counts during the performance spike; these numbers are planning estimates, not a benchmark.

Preserve:

- Body color `0x8fe6c9`, `MeshToonMaterial`, three-step ramp bytes `[80,80,80,255,170,170,170,255,255,255,255,255]`.
- Emissive `0x285e4e`, intensity `0.08`; outline `0x33655b`, BackSide, scale `(1.012,1.008,1.012)`.
- All original decal centers, radii, colors, depth offsets, segment count 48, and mouth tube construction.
- Eye and glint blink correction using the original body surface radius before common deformation.
- Body normal recomputation after updating positions; do not introduce stale lighting normals.
- 1.25-second walking cycle, original keyframe values, smoothstep interpolation, idle breathing, sway, ripple, and blink timings.

Every resident must own its **mutable** body geometry, face geometry, base-position arrays, pose time, blink phase, walk blend, and temporary vector. Sharing mutable geometry between residents makes updates overwrite each other. Within one actor, body and outline intentionally share geometry to remain synchronized.

Share immutable materials, the gradient texture, the contact-shadow texture, and static prop geometry where safe. The shadow's opacity changes per resident, so each actor needs its own shadow material even when it shares the same map. A material animated for one actor must be cloned before changing it. Initial actors all use the approved mint appearance; no recoloring as a shortcut to individuality.

Avoid frame allocations: create pose arrays/objects and reusable vectors once, do not construct geometries inside `update`, and mutate typed-array contents in place. Cache references to attributes. Mark updated position attributes as needing upload. Setting DynamicDrawUsage is a hint to evaluate, not a visual requirement.

Deformed geometry needs valid bounds. Give each body a conservative local bounding sphere large enough for the approved maximum squash/stretch/lean (start with center `(0,0.7,0)`, radius `1.8`, verify every sampled pose fits). Raycast against body meshes only, whose actual updated triangles remain authoritative. Disable frustum culling for the small face meshes or keep their conservative bounds valid. Do not accept missed selection or disappearing decals caused by stale bounds.

## 3. Camera, lights, and comparison mode

In the exact single-slime comparison, preserve the source setup:

- Perspective camera: FOV 35°, near 0.05, far 60.
- Background/fog `0xeaf0d6`; original fog range 12–30 in comparison mode.
- Hemisphere sky `0xf3ffff`, ground `0x719c78`, intensity 2.4.
- Main directional light `0xfff1ca`, intensity 3.1, position `(-3,6,4)`.
- Rim `0xbffff2`, intensity 1.3, position `(3,3,-4)`.
- ACES filmic tone mapping, exposure 1.22, SRGB output.
- Floor `0xe2eacc`, roughness 1; original contact-shadow texture.
- Initial camera yaw 0.23, pitch 0.31, distance 5.8, looking at `(0,0.65,0)`; include the source's actor presentation yaw.

The gameplay habitat requires wider framing. Keep the same slime material, tone mapping, and light colors/intensities, but fit the camera and shadow coverage to the larger floor. Move fog farther away in gameplay so the far residents do not wash out just because the camera moved back. This is a documented environment adaptation, not a new approved character design.

Gameplay camera starts at yaw 0, pitch about 0.65 radians, looking at `(0,0.65,0)`. Fit all enabled home slots plus a 1.4-unit margin using both horizontal and vertical field of view. Compute horizontal FOV from aspect ratio; do not simply multiply distance by screen width. Add 10% framing padding. Update on resize and population/capacity changes. Smooth camera changes only if reduced motion is disabled; never animate them repeatedly on resource updates.

Disable unrestricted orbit in normal play for the first integration. Use a fixed camera and a Reset view control only if zoom is introduced. The original orbit belongs to the inspection page. This avoids conflating click-to-select with drag-to-orbit and keeps faces legible. If gameplay orbit is later requested, constrain yaw and pitch and distinguish clicks with a 6 CSS-pixel drag threshold.

## 4. Provisional layout

Use world units in the approved slime's original scale. Do not scale each body down to make crowd rendering easier. Set a visible habitat boundary around radius 5.8 and a resident center walk radius of 4.5. Treat a slime as a conservative 1.2-unit footprint radius for movement planning.

Provide six ordered home slots:

```js
[
  { x:  0.0, z:  1.8 },
  { x: -2.8, z:  1.8 },
  { x:  2.8, z:  1.8 },
  { x: -2.8, z: -1.0 },
  { x:  0.0, z: -1.0 },
  { x:  2.8, z: -1.0 },
]
```

Entrance at `(0,-5.0)`, basket at `(0,4.8)`, shrub toward `(-4,-3.2)`. These prop positions are outside ordinary wander corridors. Never make the basket physically collect food; it represents the abstract inventory. The selected resident receives a cosmetic berry near its own face.

All positions live in `layout.mjs`. The habitat builder consumes that data. Economy code knows only capacity and stable home-slot indices, not garden objects or world coordinates. Validate that the six pads fit inside the camera and do not overlap each other's footprints.

At start, show the initial resident and two enabled resting positions. Additional capacity visibly enables more pads. Unavailable pads can be omitted rather than rendering four locked objects over the whole scene. Keep the main feeding area unobstructed by foreground props.

## 5. Resident behavior

Use a small presentation state machine: `idle`, `walking`, `feeding`, and `arriving`. Logical production is independent of all four. A per-resident deterministic visual seed derived from its ID offsets blink and idle phase; inspection mode forces phase zero. Cosmetic random decisions use their own seeded generator or stable schedule and must not affect the core.

For v1, only one resident traverses a path at a time. Others breathe, blink, sway, and can turn gently. This keeps navigation bounded for weaker agents and prevents a crowd-simulation task from taking over the MVP.

Every 5–12 visual seconds, a resident may request a short straight-line destination within 0.8 units of its home slot. Reject destinations beyond the walk boundary or whose full swept segment approaches another resident closer than 2.4 units. Use point-to-segment distance against the other stationary residents, not only endpoint distance. Try at most eight candidate destinations; if all fail, remain idle. No infinite retry loop, physics push-apart, or navmesh is needed.

Reserve a valid path before walking. Convert its distance into `ceil(distance / 0.65)` gait cycles. Distribute travel within each cycle primarily during phase 0.29–0.68 using smoothstep normalized to that interval; hold horizontal position outside that part. Reuse the original body pose function. This avoids sliding a squashed slime continuously across the floor. Release the reservation on completion, feeding interruption, resize teardown, or disposal.

Feeding interrupts ordinary walking: stop safely at current position, release the path, face toward the camera using a short turn if motion is allowed, and play feeding feedback. Resume idle afterward. Feeding during arrival also commits immediately; the presenter may finish or skip the arrival and prioritize the reaction. A successful command must never wait for an animation state transition.

Large time jumps reset transient movement to valid home slots. Reload does not need to restore exact positions. There are no gameplay consequences attached to where a resident stands in this MVP, so serializing trajectories would add fragility without value.

## 6. Feeding presentation

Duration target: approximately 1.1 seconds, followed by ordinary idle. Keep this a visual composition around the approved actor, not a new facial rig.

Suggested sequence:

1. 0–0.35 s: a small berry mesh follows a quadratic arc from a nearby point in front of the selected slime toward the mouth region.
2. 0.35–0.65 s: berry scales down and disappears just in front of the surface; reuse a restrained segment of the existing compression/settling pose, with no replacement of the smile or eyes.
3. 0.65–1.1 s: a few small soft particles rise and fade; the slime settles to its standard idle.

Use the same actor-local deformation transform for the mouth attachment point before mapping it to world coordinates. A fixed global target would miss when the resident moves, turns, or stretches. Do not actually open a hole in the mesh or alter the original mouth geometry in this version.

Pool at most one berry and about eight particles per active reaction; a global feed cooldown prevents effect floods. After a successful feed, UI feedback should appear within one update even if the animation cannot run. On reduced motion or animation pause, show a still berry/brief text confirmation without travel or squash. In a hidden tab, skip presentation entirely.

## 7. Arrival presentation

Core state creates the new resident first. `scene.sync` creates its actor at the home slot, and a same-turn `COMPANION_ADDED` event may reposition it for presentation. During an arrival, suspend new wander requests.

Subsequent `sync` calls update resident membership and relevant visual flags, not the world positions of existing actors. Reset positions only on initial construction, an explicit scene rebuild/import, or a large-time-jump reset. Otherwise each UI tick would cancel arrival and wandering movement.

Use the entrance-to-home straight path only if its swept corridor clears the other residents. If blocked, reveal the newcomer directly at its pad with a short stationary effect. That fallback is preferable to clipping through another slime or building a pathfinding engine. Reduced motion always uses an immediate pad appearance.

Arrival duration target is about 2.5 seconds. It may use two walking cycles for a short path, but match world distance to gait travel rather than forcing an implausibly fast fixed speed across the whole habitat. For a long entrance path, extend the animation up to 5 seconds or choose the stationary reveal; do not alter the approved gait frequency to race across the map.

Reloading midway through arrival simply shows the existing resident at its home slot. The renderer must not emit another welcome command. New residents accrue income from the command timestamp, including while arriving.

## 8. Picking and DOM access

On pointer-up, convert client coordinates relative to the actual canvas bounding rect into normalized device coordinates, raycast only the body meshes, and select the closest valid hit. Store each body's resident ID in a stable metadata field. Restrict to primary input, handle pointer cancellation, and do not feed directly from the raycast callback.

HTML resident buttons always offer equivalent selection. Selection highlights both the button and ground ring. Clicking the floor can leave selection unchanged. A resident's face, outlines, particles, or floor shadow must not intercept selection as an unrelated object.

On mobile, allow page scrolling around the scene. With no gameplay orbit, do not inherit the showcase's unconditional `touch-action:none`; choose a policy such as `pan-y` and avoid canceling ordinary scroll gestures. A canceled pointer sequence must not select or feed.

## 9. Performance budget and fallback order

Targets to validate, not promises: stable 60 FPS on an ordinary contemporary desktop at six residents; at least 30 FPS on the selected mobile test device. Record exact browser, device, viewport, DPR, frame-time percentiles, and quality mode. A desktop CPU throttle does not substitute for a real mobile test.

High quality starts with DPR capped at 1.5 for the habitat, full approved geometry, 60 Hz pose updates, and the approved directional shadow style with a 1024 map covering the actual habitat. Keep source DPR 2 in comparison mode. Low quality keeps the same geometry/material and uses DPR 1, 30 Hz pose/render updates, and contact shadows without dynamic directional shadows. Document the shadow difference as a quality tradeoff.

In auto mode, start high. After warmup, sample actual frame intervals over five seconds. If the 90th percentile exceeds 25 ms for two consecutive windows, drop to low and show the setting in diagnostics. Do not oscillate modes; automatic promotion can wait until reload or explicit quality change.

Optimization order: eliminate allocations and duplicate loops → stop hidden work → lower DPR → reduce update cadence → disable dynamic shadows in low mode. A GPU deformation rewrite, merging face decals, reducing radial segments, or instancing deforming residents requires a separate appearance review and is outside the first MVP implementation.

Body, outline, eight decal meshes, mouth, and contact shadow are roughly twelve visible draw calls per resident before shadows and selection. Budget roughly 72 resident calls plus props; measure the real result with `renderer.info`. Keep props simple and avoid adding many individual decorative meshes. If six residents exceed the target even in low mode, report the device evidence and revise the scope with the coordinator; do not silently replace the asset.

When poses are updated at 30 Hz, update body positions, normals, decals, and shadow together. Rendering between pose samples may retain the latest pose. Do not update faces on a different schedule from the body.

Turning on reduced motion or animation pause clears transient berries/particles and resolves active travel to a valid resting position. It does not queue those effects to replay on resume. Switching either setting has no economic effect.

## 10. Cleanup and visual validation

`dispose()` removes event listeners, disconnects ResizeObserver, stops the app-owned animation loop, disposes per-actor geometries/materials and owned textures, removes the canvas, and disposes the renderer. Shared resources are disposed once by their owner after actors are gone. Three resources require explicit cleanup; see [BufferGeometry.dispose](https://threejs.org/docs/pages/BufferGeometry.html) and the [Three.js cleanup guide](https://threejs.org/manual/en/cleanup.html).

Tests must mount/unmount repeatedly without growing canvas count, live observers, timers, or GPU resource counts monotonically. Renderer memory may include internal reusable caches; compare stabilized repeated cycles rather than expecting every internal counter to be zero.

Capture side-by-side original and extracted actors under identical camera, lights, viewport, DPR, and pose times. Use idle times 0, 1.0, and the blink midpoint 4.775 seconds; walking phases 0, 0.17, 0.29, 0.49, 0.68, and 0.80 with walk blend explicitly fixed to 1. Check silhouette, shadow, highlights, eye attachment, mouth, and outline. Use same-browser screenshots; cross-GPU pixel equality is not a valid universal acceptance threshold.

After the match, check the gameplay camera separately at one, three, and six residents. A wider habitat screenshot is not a substitute for the exact single-actor comparison.
