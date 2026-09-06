# Process

This folder is a working copy. Nothing in `C:\Users\tjuny\Documents\Codex\2026-09-05\your\` was modified.

## 1. Read the inherited system

The Codex export is a cleric animation plus static character bases, not a general animator.

- `outputs/ANIMATION-WORKFLOW.md` and `outputs/build.cjs` define the quality bar: recover the 45×38 grid from a uniform 6× PNG, keep the source palette, inverse-map nearest-neighbor transforms, eight uneven frames, exact rest reconstruction on frames 1 and 8, PNG authoritative, GIF as 6× preview.
- The cleric rig is explicit about being character-specific: rectangle masks, pivot (22, 23), staff-head offset (7, −16), gold/cream VFX, 64×48 canvas with origin (8, 8).
- `outputs/bases/` holds the wizard as a static 45×38 map (`maps/wizard.json`) plus 6× `wizard.png`. `PROCESS.md` already warned that future pose work should split clothing and equipment into layers. That split was never authored.
- `outputs/animation-handoff/tools/validate-animation.cjs` checks grid, binary alpha, palette, rest frames, sheet layout, and GIF timing. It does not judge anatomy, grip, or motion.
- An image-generation draft was used on the cleric only to explore posing. Its pixels were discarded because they changed equipment.

Copies of the files needed for that pipeline, the wizard base, the validator, and the cleric example live under `source/`.

## 2. Measure the wizard instead of reusing cleric masks

The wizard map is 510 opaque pixels, 13 colors, bounds (5, 2)–(33, 35), feet on row 35.

Flood-filling from the cyan orb with a loose `x >= 22` cut leaked 35 robe pixels into the “staff” (the right cowl wall at x=21–25). The first clean cut is **x ≥ 26 and y ≥ 15**: hat max X is 25, and the wooden grip (`OSSO` / `OPPO`) begins at x=26. That yields 60 staff pixels, 106 hat, 9 star, 20 feet, 315 body.

Pivots taken from the grid:

- Staff grip (27, 25)
- Orb center (30, 18), offset (3, −7) from the grip — much shorter than the cleric staff head
- Star center (7, 7)
- Hat/cowl seam (15, 11), implemented but not used for rotation in the final pass

There is no shield. Accent magic colors are orb cyan `C` / `Q`, plus cream `L` and gold `Y`/`G` from the hanging star.

## 3. Explore motion without using generated pixels

A built-in image-generation pass was used the same way the cleric workflow describes: pose language only. The returned sheet invented a beard, resized the hat, and redrew the staff. None of those pixels are in the animation.

Useful staging from that pass, which already matches the cleric eight-beat:

Ready → Brace (crouch, staff back) → Lift (orb up) → Charge (held glow) → Release (thrust + burst) → Follow-through (bolt travels right) → Recover (motes) → Settle.

Because the wizard orb sits only 3px right of the hand, the cleric’s small angles read as idle breathing. Final poses use larger staff angles and a dedicated lift (`ay`) so the orb actually climbs.

## 4. Rig and export

`wizard-cast/build.cjs` does the following:

1. Decode `wizard.png`, prove every 6×6 block is uniform, and byte-match it to `maps/wizard.json`.
2. Split layers with the occupancy rules above. Feet never move.
3. Inverse-map rotations (cleric convention: positive angle swings the orb forward) and **also forward-stamp** source pixels so a 3px shaft cannot vanish.
4. After a rotated staff pose, stamp existing wood color from the wrist column (25, 25) to the grip, then from the grip to just below the orb, so the shaft stays connected.
5. Draw cyan/cream/gold VFX from the transformed orb, using only colors already in the sprite.
6. Swing the 9-pixel hat star as a pendulum. Hat rotation was tried and removed; even ±6° punched holes in the flopped brim, which is the wizard’s silhouette.
7. Validate palette membership and exact rest reconstruction, then write frames, 4×2 sheet, contact sheet, GIF, `animation.json`, handoff `manifest.json`, `layers-debug.png`, and the self-contained HTML player.

Uneven timing is 1520ms total: long ready, held charge (230ms), snappy release (80ms).

## 5. Check

`npm run validate` passed with no warnings. ASCII occupancy dumps of all eight frames were used to confirm the orb actually rises on lift/charge, the bolt leaves the body on follow-through, and frames 1 and 8 match. There is no browser automation in this environment; the page was generated and served locally, and its HTML/controls were checked over HTTP.
