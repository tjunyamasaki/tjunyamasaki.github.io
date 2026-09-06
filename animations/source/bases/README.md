# Cleric-style character bases

Three static bases: **paladin**, **wizard**, and **knight**. No animation is included.

Each final PNG has a transparent background, a **45 × 38 logical pixel grid**, and
an exact **6× enlargement to 270 × 228 pixels**, matching the supplied cleric.
The bottom occupied row is 35, matching the cleric's feet. All 1,710 logical cells
exist in every image; the number of opaque cells differs with the character's
silhouette and equipment.

## Files

- `paladin.png`, `wizard.png`, `knight.png`: final 270 × 228 images.
- `*-logical.png`: corresponding native 45 × 38 images for game assets/editing.
- `comparison.png`: cleric, paladin, wizard, knight, in that order at equal scale.
- `maps/*.json`: editable, authoritative pixel maps. One symbol = one logical pixel.
- `palette.json`: shared fixed palette, including transparent `.`.
- `build.cjs`: repeatable PNG export and validation.
- `import-drafts.cjs`: optional initial normalization of the retained AI drafts.
- `refine-maps.cjs`: exact recorded grid corrections used to make the final maps.
- `generation-prompts.json`: complete prompts used with the built-in image tool.
- `references/`: original user references, including the cleric, unchanged.
- `drafts/`: retained image-generation results before grid/palette normalization.
- `validation.json`: measured output dimensions, palette usage, and occupied bounds.
- `PROCESS.md`: full production workflow, assumptions, and limitations.

## Rebuild the finished images

Install Node.js 20.9 or newer. In this directory, run:

```sh
npm install
npm run build
```

The only dependency is Sharp, pinned to 0.35.4. Initial installation needs network
access. Building the supplied maps works offline and does not use an AI service.
The script writes the final images beside itself, replacing its named exports.

## Edit a sprite

Open `maps/paladin.json`, `maps/wizard.json`, or `maps/knight.json`. Keep exactly
38 rows of 45 characters. Replace individual symbols using `palette.json` as the
legend, then run `npm run build`. `.` is transparent. Keep feet on row 35 and at
least one blank border pixel. Coordinates in the scripts are zero-based.

The images share existing cleric skin, brown, gold, ivory, and blue-grey values.
The palette also has fixed steel, navy/blue, cyan, and red colors for equipment
that the cleric's palette cannot adequately represent. The final images are not
restricted to the cleric's original 13 colors; each has its own subset of the
shared palette. There is no antialiasing or partial transparency.

## Reproduce the draft-to-final processing

This is optional. It **replaces the canonical maps**, so save your own map edits
before running the refinement command:

```sh
node import-drafts.cjs
node refine-maps.cjs
node build.cjs
```

Importing alone writes `maps/imported/` and does not overwrite final maps.
Refinement uses the imported maps plus the original cleric's face pixels.
The supplied drafts make this entire processing sequence deterministic. Regenerating
new AI drafts from the same prompts is not expected to reproduce the same image.
