# Gaps in the inherited process

These are holes in the Codex animation system, found while turning the wizard base into a cast. They are not failures of the wizard PNG itself.

## Authoring

1. **No layer maps.** `outputs/bases/PROCESS.md` says to split clothing and equipment before animation. The canonical maps are color-only. Every character still needs a hand-authored occupancy rule.
2. **No pivots, attachments, or effect origins in the base.** Cleric (22, 23) and staff-head (7, −16) live only inside `build.cjs`. The wizard grip, orb, and star had to be rediscovered from the grid.
3. **The cleric rectangle mask is not portable.** `(x >= 24 && y < 22) || (x >= 22 && y >= 22)` plus a shield box. On the wizard, a flood from the orb with `x >= 22` ate the right robe. The working cut was `x >= 26`.
4. **Thin props are underspecified.** The wizard shaft is a 2–3px `OBO` column. Inverse nearest-neighbor rotation drops pixels. The cleric notes this for elbows; it is worse on a staff that is not glued to a thick arm cluster.
5. **Secondary pieces are unnamed.** The hanging star is 9 pixels and is the wizard’s left-side identity. Nothing in the base marks it as a pendulum.
6. **Hat vs head is a seam, not a joint.** Rotating the hat around the cowl punches holes. The process has no rule for “do not rotate identity silhouettes.”
7. **One VFX language.** Cleric gold/cream is hardcoded. Reusing it on the wizard would paint holy sparks onto an ice/arcane orb. Accent colors have to come from that sprite’s palette.
8. **Cast and attack are the same document.** The workflow only describes a staff-cast. There is no melee / thrust / projectile contract for knight or paladin.
9. **Enhanced cleric was never re-rigged.** `cleric-enhanced/README.md` already says the old frames’ masks would be wrong. The handoff ships two bases and one animation.

## Tooling

10. **Validator is mechanical only.** It cannot see a disconnected shaft, a missing star, or a bolt that never leaves the body. An already-cropped clip can pass. GIF pixel identity is not checked. No browser test.
11. **Exporter constants.** Eight frames, 4×2 sheet, 64×48, origin (8, 8) are baked into build and viewer. Extra frames or a taller hat motion need coordinated edits.
12. **Tight canvas.** Origin (8, 8) on 45×38 inside 64×48 leaves 8px above the sprite and 2px below the logical canvas (5px below the feet). Hat lift and low staff follow-through have little room before `put()` throws.
13. **Rest-pose law vs acting.** Frames 1 and 8 must be exact copies of the source. That forbids a settle that is still slightly off-balance, and forbids idle breathing on the loop point.
14. **Three sources of truth.** Map JSON, logical PNG, and 6× PNG. The cleric builder trusts the PNG. The base builder trusts the map. They can drift.
15. **Image generation does not keep the contract.** Drafts change beard, hat size, and staff. Useful for staging, harmful if treated as pixels. The process says this, but there is no automated “draft vs source identity” check.
16. **`work/build.cjs` is not portable.** It hardcodes a Windows Sharp path and a path into this GitHub repo’s `temp/pixel` cleric file. Rebuilding the original cleric from the work folder is not a documented, copy-paste step.
17. **No debug occupancy view.** Without a layer-colored PNG, mask leaks are easy to miss until a sleeve rotates away.
18. **No onion-skin in the original viewer.** Join gaps at the wrist are obvious in onion-skin and easy to miss in a looping GIF.

## Production

19. **AI draft pixels are tempting.** The generated wizard sheet looked like a finished animation and was off-model. The process relies on discipline, not a gate.
20. **Sharp is required** for PNG/GIF. First install needs network. The HTML player does not.
21. **No per-character animation profile.** Next character (paladin, knight, slime) still means forking a script and re-deriving masks.
