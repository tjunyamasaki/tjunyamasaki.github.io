# Production workflow

## 1. Establish the cleric's actual pixel system

The cleric is a 270 × 228 RGBA PNG with uniform 6 × 6 blocks. Its true drawing
grid is 45 × 38. Its equipment reaches row 2; its feet end at row 35, leaving
two blank rows below. Those measurements, rather than the irregular apparent
pixels in the new references, define the export contract.

Use the same canvas dimensions, baseline, coarse detailing, and flat-color
cluster approach for the three new characters. Exact occupied pixel counts are
not forced to match: a shield, hat, or plume changes silhouette area.

## 2. Identify the character features to preserve

- **Paladin:** brown hair, exposed peach face, silver armor and boots, ivory
  tabard, gold trim, cross-marked ivory shield, and raised silver sword.
- **Wizard:** bent blue pointed hat, small gold star, blue cowl and robe, brown
  belt and boots, and wooden staff with a cyan orb and light center.
- **Knight:** open-face steel helmet, red plume, exposed face, plate armor,
  brown belt and boots, raised sword, and diagonal brown scabbard at the left.

The reference images inform identity and equipment. Their gradients, tiny
decorative pixels, edge halos, and irregular grid boundaries are not preserved.

## 3. Generate design drafts

Use the built-in image-generation tool once per character, with two references:
the cleric as the pixel-style/proportion reference and the corresponding user
image as the character-design reference. Request a neutral pose, transparent
background, a 45 × 38 logical grid, coarse blocks, and restrained colors.

The exact text of all three prompts is in `generation-prompts.json`. The actual
returned images are saved under `drafts/`. The draft generator did not enforce
the final grid or palette; these drafts are intermediate artwork, not final
game sprites. No fallback image API or API key was used.

## 4. Normalize drafts into editable logical grids

`import-drafts.cjs` performs the following operations:

1. Decode each RGBA draft and locate the bounding rectangle of pixels whose
   alpha is at least 128.
2. Map that rectangle to a defined logical footprint: 31 × 34 for paladin and
   knight, 29 × 34 for wizard. Place paladin/knight at (3, 2), wizard at (5, 2)
   within the shared 45 × 38 canvas. This deliberately normalizes proportions;
   it is not a claim that the draft's original grid was exact.
3. Partition the cropped image into logical cells. For every source pixel in
   each cell, choose the nearest allowed palette color using squared RGB
   distance, or transparency when alpha is below 128.
4. Select the most frequent color in each cell. This area-voting method avoids
   inventing blended colors during downsampling and reduces thin edge noise.
5. Save the resulting symbolic grids in `maps/imported/`.

Each character's allowed color subset is specified in the importer. All colors
are explicitly defined in `palette.json`. The shared opaque palette contains
21 colors; different characters use different subsets. A fixed palette does
not imply that every character must use every color.

## 5. Review at the cleric's scale and correct the maps

The normalized results were visually inspected together with the cleric.
The initial wizard and knight faces were too small after whole-image reduction.
The paladin's blade mapped too close to ivory, and some knight leather mapped
to plume red. Corrections are recorded in `refine-maps.cjs`:

- Paladin: keep clear two-pixel-tall eyes, simplify a small hair area, remap the
  sword from cloth/ivory colors to steel, and clarify the armored boot highlights.
- Wizard: shorten and redraw the hat on the exact grid, retain its hanging star,
  use the cleric's face geometry, join the cowl to the neck, clarify the cyan orb,
  and give the boots broad brown clusters.
- Knight: rebuild a compact helmet above a cleric-scale face, reconnect the red
  plume, clarify the face guard, keep red confined to the plume, and simplify
  scabbard and boot clusters.

For the wizard and knight, the face reconstruction samples the original cleric's
logical face area. It preserves its main skin, skin-shadow, and black-eye colors,
maps its two nearly identical peach variants to the main skin color, and uses
brown for surrounding non-skin pixels. The face is positioned one logical row
lower than in the cleric to meet the helmet/hat silhouette.

The reviewed symbolic maps are the authoritative finished artwork. Future manual
edits should normally go directly into those maps; rerunning the refinement
script intentionally restores the recorded version.

## 6. Export without resampling artifacts

`build.cjs` converts each map symbol directly into one RGBA pixel, producing the
native 45 × 38 PNG. It then enlarges exactly 6× with nearest-neighbor sampling.
Each logical cell therefore becomes a uniform 6 × 6 block in the 270 × 228 PNG.
There are no gradients, interpolation colors, or partially transparent edges.

The side-by-side comparison places the unmodified cleric and all three final
images on a flat slate background. Only this comparison has an opaque backdrop;
the individual character exports retain transparency.

## 7. Validate and retain the complete workflow

The exporter checks row counts, row lengths, palette symbols, drawing margins,
and feet baseline. It decodes every enlarged output and compares every RGBA
channel of every physical pixel with the expected logical source cell. Any
mismatch fails the build. Counts and bounds are saved in `validation.json`.

The final workflow was also rerun from the retained drafts, and the rebuilt
canonical maps and exported character PNGs were compared byte-for-byte with
the reviewed versions. The original reference files remain unchanged.

## Limitations and further editing

The importer's palette voting cannot replace art-direction review. A new draft
with different framing or pose can require new footprint dimensions and
different corrections. The recorded refinement coordinates are specific to
these three drafts. Reusing a prompt alone will not produce identical artwork.

For substantial future pose changes, split the final maps into clothing and
equipment layers before animation. Aseprite or LibreSprite can also edit the
native logical PNGs with a fixed palette and nearest-neighbor display. No such
external editor is needed to rebuild the included final bases.
