# Gravecraft weapon collection

The magic set now shares the Hollow Harvest ink style used by every theme sprite:
plum ink outlines (`#2b2233`), flat fills with one crescent shadow, and tapered
brush highlights. Blackthorn wood, ivory bone, burgundy cloth, bronze and pale
mint ghostfire carry over from the first collection.

The PNGs are drawn by `tools/art/magic.py` and written by `python3 tools/art/build.py`.
They are RGBA, 512 x 512 for the five weapons. The allied skeleton is the approved
chibi skeleton, animated in `skeleton.png`. The previous generated images and their
prompts are kept in `legacy/assets/magic/`.

| Asset | Use |
| --- | --- |
| cinder-staff.png | Inventory, showcase, dropped item, held crooked staff with ghostfire |
| barrow-rattle.png | Inventory, showcase, dropped item, held skull rattle |
| widows-needle.png | Inventory, showcase, dropped item, held bone needle with silk |
| spirit-fan.png | Inventory, showcase, dropped item, held open fan |
| mourning-bell.png | Inventory, showcase, dropped item, held bronze bell |
| skeleton.png | One 4-column x 3-row atlas: idle, walk, attack; 4 cells per row |

## Replacement contract

`src/magic/art.mjs` is the default manifest: world size, grip anchor, atlas clips and
held poses. Theme `sprites` entries with the same item IDs or `gravecraft-skeleton`
take precedence. Weapon assets are square including transparent padding; preserve that
canvas or update size/anchor together. The skeleton atlas has 360 × 430 pixel cells, the
same proportion as its 1.8 × 2.15 world size.

`src/magic/effects.mjs` builds world-coordinate strokes, motes, silk bindings and
arcs. `effects-three.mjs` consumes them in one reusable geometry buffer; the Canvas
renderer consumes the same commands. No sprite panel contains a second weapon or
player. The four pack directories remain source history (redrawn in the new style);
their effects and per-frame skeleton PNGs are not preloaded by the active collection.

Override `theme.magic.palette` keys `ink`, `spirit`, `core`, `shade`, `ember`, `bronze`,
`silk`, `cloth`. Defaults live in `art.mjs`; `maxEffects` defaults to 48 active
effects. `theme.magic.motion.castSeconds` controls presentation recovery only.
`theme.magic.weapons[itemId]` can override motion, handX, handY and heldScale.
Skeleton frame selection uses the theme's clip definitions. Combat constants are independent. The bell's wave dimensions are read from its
combat module so the visible front agrees with its damage radius.

Held motion is driven by the host's `player.magicCast` timestamp and bounded local
interpolation. Summon frames use their own age/swing time, never a shared global
frame index. Cinder and needle travel interpolate between snapshots; rings remain
on the ground plane. Magic effects emit light visually, without granting lantern
safety or changing darkness survival rules.

## Weapon behavior

- **Barrow Rattle:** rattling grip, summoning seal, rising bones, walking/attacking
  atlas, spectral claw swipe and end-of-life fade. Existing four-summon cap remains.
- **Cinder Staff:** recoil, mint flame core, trailing embers and a dissipating
  impact burst. Existing 8 damage plus burn remains.
- **Widow's Needle:** forward thrust, pointed dart and trailing grave-silk; threads
  rise around the target for the existing 2.5-second root.
- **Spirit Fan:** broad wrist sweep, three curved gust ribbons and drifting leaves
  spanning the existing 110-degree cone. Existing damage/push remains.
- **Mourning Bell:** swinging bell, a contracting charge seal, then a five-unit
  expanding spirit ring. 0.28-second windup, 0.65-second travel, 9 damage and 1.2-unit
  push per hostile once, 2.4-second cooldown, 65 durability. Echoes deal no damage.
  Ring age and hit IDs replicate/save; players and allies are excluded. Its sound
  has a short synthesized metallic decay, overridable with `theme.audio.bell`.
