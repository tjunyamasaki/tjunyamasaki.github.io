# How the process can be better

Practical changes that would have made this wizard cast faster, and the next character (paladin / knight) cheaper. Several are already in `wizard-cast/build.cjs`.

## Author a rig file with the base, not after it

For each character, keep a `rig.json` next to the color map:

- Layer rules or, better, a second 45×38 map whose symbols are `H` hat, `S` staff, `F` feet, `B` body, `*` charm
- Named pivots: `staff`, `hat`, `star`, `orb`
- Accent VFX colors, copied from that sprite’s palette keys
- Canvas size and origin

The color map stays the artwork. The layer map is the animator’s input. Re-running `refine-maps.cjs` should not be allowed to wipe layer maps.

## One kernel, many profiles

Split `build.cjs` into:

- a shared kernel: 6× grid proof, map↔PNG match, inverse+forward rotate, stamp line, palette check, rest check, sheet/GIF/HTML/manifest export
- a per-character profile: source paths, layer function, pivots, poses, VFX stages

The cleric script stays as the reference implementation, not the thing everyone forks.

## Dual mapping and connective stamps

Inverse mapping avoids holes in the destination. Forward mapping keeps every source pixel. For 2–3px shafts, also stamp a 1px line of an existing wood/steel color from grip to a point behind the head. Rest poses skip the stamp so frame 1 / 8 stay exact.

## Do not rotate the identity silhouette

Translate the hat with the body. Put overlap motion on a tiny attachment (the star) instead of the brim. If a cluster is the character’s outline, treat rotation as a last resort and inspect it at 1× and 6× before keeping it.

## Pose exploration is a storyboard, not an asset

Keep using image generation for the eight-beat (ready, brace, lift, charge, release, follow-through, recover, settle). Save the draft in an `exploration/` folder with a one-line note: pixels are not source. Never composite those pixels onto the logical grid.

If the orb is close to the hand, **increase angle and `ay`** until an occupancy dump shows the orb moving several pixels. Cleric angles on a short staff look like breathing.

## VFX from the character, aimed past the body

Pull burst colors from that sprite (wizard: `C` `Q` `L` `Y` `G`). Draw the projectile from the transformed orb, slightly above it if follow-through drops the staff, so the bolt reads as a shot and not as the shaft falling.

## Make inspection part of the build

Every build should write:

- `layers-debug.png` (false color)
- `contact-sheet.png`
- an occupancy dump or at least log layer counts
- onion-skin in the HTML viewer

Add two cheap semantic checks the current validator lacks:

- staff / weapon cluster remains 4-connected after rotation
- named markers (orb, star, buckle) still present in every frame unless a pose opts out

## Loosen only the constants that hurt

Keep 8 frames and uneven timing; they read well. Prefer a slightly larger staging canvas (for example 72×52) with the same origin contract, then crop, so hat lift and bolts do not hit `put()` throws. Keep PNG as authority; treat GIF timing as preview.

Optional last mile, already suggested in the cleric writeup: Aseprite / LibreSprite onion-skin on the logical PNG for wrist and sleeve cleanup, without adding colors.
