# Reusing the cleric animation script

The final animation was made by `build.cjs`. It generates the frames, sprite sheet,
GIF, timing metadata, and self-contained HTML player. The included
`cleric-original.png` is the unmodified source. No image-generation service is
needed to rebuild the final animation.

## Run it

Install Node.js 20.9 or newer. Extract the toolkit ZIP, open a terminal in its
folder, and run:

```sh
npm install
npm run build
```

Open `generated/index.html` to see the result. Installing Sharp requires network
access the first time; rebuilding afterward works offline.

Optional source and destination arguments:

```sh
node build.cjs "cleric-original.png" "my-cast"
```

Use a separate output directory. The script overwrites its named generated files
when rerun; it does not modify the source image.

## How the pixel quality is preserved

1. **Recover the existing grid.** The input is 270 × 228 physical pixels, composed
   of uniform 6 × 6 blocks. Nearest-neighbor sampling recovers its 45 × 38 logical
   pixels. The script checks every source block instead of assuming it is uniform.
2. **Keep the source colors.** The palette is read directly from the source:
   13 opaque colors plus transparency. No interpolation, blur, or new shading
   colors are introduced in the PNG frames.
3. **Separate pixel groups.** Coordinate masks divide the sprite into body,
   shield, arm/staff, and feet. The feet remain anchored. The shield moves with
   the body; the arm and staff rotate together about a shared pivot.
4. **Transform on the logical grid.** Whole-pixel translations and inverse-mapped
   nearest-neighbor rotations create each pose. This avoids gaps from forward
   scattering rotated pixels. It can still alter a cluster's edge silhouette;
   it is not a guarantee that every rotated detail keeps its exact shape.
5. **Stage the cast.** Ready → brace → lift → charge → release → follow through →
   recover → settle. The small gold and cream spell uses existing colors and
   starts at the transformed staff head.
6. **Use uneven timing.** Anticipation, the charge hold, a quick release, and a
   longer rest make the action readable with only eight frames.
7. **Validate and export.** Every opaque output pixel must belong to the source
   palette. First and last poses must reconstruct the source exactly at offset
   (8, 8) on the 64 × 48 output canvas. PNG exports are authoritative; the GIF is
   a 6× nearest-neighbor preview.

An image-generation draft was used to explore the motion, but it changed the
shield and clothing details. Its pixels were not used in the final animation.

## Adjust the motion

Edit the `poses` array near the beginning of `build.cjs`:

- `ms`: frame duration in milliseconds.
- `a`: arm/staff rotation in degrees; positive values swing the staff forward.
- `dx`, `dy`: body, shield, and arm translation in logical pixels.
- `ay`: additional vertical arm/staff displacement.
- `fx`: selects a spell-effect stage. Omit it for no effect.
- `name`: frame label in the viewer and metadata.

The arm rotation pivot is (22, 23) in source logical coordinates. The `layers`
assignment determines which original pixels move together. The spell origin
uses a staff-head offset of (7, -16) from the pivot.

This is a **cleric-specific rig**, not an automatic animator for arbitrary sprites.
For another character, update the input dimensions and scale checks, layer masks,
pivot, spell origin, output margins, and exact-rest checks. The exporter and viewer
currently assume eight frames in four columns and two rows; changing the frame
count also requires changing those layout and playback constants.

Keep the first and last poses neutral unless you deliberately update the rest-pose
validation. Large movements need visual inspection for clipping: effect pixels
are bounds-checked, but the layer renderer samples only inside the output canvas.

## Further refinement

Layer-aware onion-skin editing in Aseprite or LibreSprite would help manually
refine elbow joins, sleeve contours, and staff edges after rotation. The current
script is deterministic and reproducible, but those edits could improve the
anatomy of individual poses without sacrificing the palette or pixel grid.
