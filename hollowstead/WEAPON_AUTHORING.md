# Adding a Hollowstead weapon

All paths below are relative to `hollowstead/`. This is a task guide, not a prerequisite tour of the game. Read one relevant reference, edit the listed integration points, and stop when the requested weapon is usable. Keep this guide current when those integration points change.

## Quick checklist: the usual magic weapon

- [ ] `src/magic/<id>.mjs`: metadata, successful `use` return, host-only `step`, bounded attack state.
- [ ] `src/magic/load.mjs` → `SPECS`: register the filename.
- [ ] `src/engine.mjs` → `MAGIC_AIM`: set usable reach.
- [ ] `assets/magic/<id>/` + pack `sprites`: item, optional icon, attack artwork.
- [ ] `src/magic/art.mjs` → `HELD_GEAR`: show and animate the held weapon.
- [ ] Sprite roles **or** `src/magic/effects.mjs`: visible attacks in both renderers.
- [ ] `src/progression.mjs` → `ITEM_RARITY`: classify the item.
- [ ] If requested, `src/arena.mjs` → `STARTERS`: guarantee the first pick; `POOLS`/`RECIPES` only for expedition access.

The sections below explain these steps. Read the alternative route only for a normal arsenal weapon.

## 1. Choose the smallest implementation

- **Distinct mechanic, projectile pattern, delayed attack, or summon:** use a module in `src/magic/`. Recommended for new themed weapons; registration supplies inventory, equipment, labels, showcase entries, and arena eligibility.
- **A variation on an existing sword, bow, or arsenal attack:** reuse `WEAPON_STYLES` and the normal equipment route described at the end. A new magic module is optional, not a requirement for every weapon.

Read just one reference:

- [mourning-bell.mjs](src/magic/mourning-bell.mjs): smallest delayed area attack; about 60 lines. Copy its lifecycle, replacing its Gravecraft art integration.
- [kitsune-lantern.mjs](src/magic/kitsune-lantern.mjs): homing volleys, swept collisions, target selection, burn, splash, and cleanup. Copy only the parts your mechanic needs.
- [barrow-rattle.mjs](src/magic/barrow-rattle.mjs): only when implementing an actual summoned actor with movement, attacks, and lifetime.

Decide the ID, attack pattern, damage per hit, cooldown, reach, one visual motif, and how the player obtains it. Infer ordinary choices from the request. Balance a volley by its **total damage per cast**, including repeat hits and damage over time.

## 2. Add and register the module

Create `src/magic/<id>.mjs` exporting **`magicPack`, `use(world, player)`, and `step(world, dt)`**. Use a unique kebab-case ID consistently for the item, `packId`, and sprite keys. Example metadata:

```js
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';
const PACK = 'your-weapon';
export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Your Weapon', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: 20, durability: 150, cooldown: .8, stamina: 8,
    blurb: 'One sentence explaining what the attack does.',
  },
  sprites: {
    item: {
      src: `assets/magic/${PACK}/item.svg`,
      icon: `assets/magic/${PACK}/icon.svg`, // Optional separate UI image.
      size: [1.4, 1.8], anchor: [.5, .42], columns: 1, rows: 1,
      clips: {idle: {frames: [0], fps: 1}},
    },
  },
};
// Implement use and step using the lifecycle below and your chosen reference.
```

Add `'<id>.mjs'` to **`SPECS` in [src/magic/load.mjs](src/magic/load.mjs)**. Missing `use` or `step` means the registry rejects the module; keep an empty `step` for an instant attack.

Copy the current import query suffix from neighboring modules (currently `?v=harvest-18`), especially for the mutable registry. Differently queried imports can create different registry instances. Do not bump versions across the project; deployment handles release stamping.

For this route, do **not** also add the item to `EQUIPMENT`, `EQUIPMENT_SLOT_ITEMS`, or `WEAPON_STYLES`. `magicItems` already supplies these contracts. `item.icon` is a **sprite key**; `sprites.item.icon` is an **image path**. Sprite paths beginning `assets/` resolve from the Hollowstead root.

## 3. Implement combat through the host

`World.attack()` auto-aims, calls `attackMagic()`, then `use()`. The host calls `step()` and consumes queued hits before removing dead enemies and awarding kills. Rendering never advances combat.

**In `use`:** reject wrong/broken gear, downed/ghost/offline players, cooldown, and invalid coordinates. Normalize `player.dx/dz` with a zero-length fallback. Capture `ownerPower(world, player)` **before wear or swapping**; it includes level, equipped arena rank, and temporary power. Create the attack state and return it; return `null` without side effects when rejected.

`attackMagic()` handles stamina, default cooldown, default weapon wear, and the replicated `player.magicCast` stamp after a successful use. Prefer those defaults. Existing packs sometimes call `world.wearEquipped(player, 'weapon', 1)` and set cooldown/action themselves; the wrapper avoids charging unchanged values twice. Do not manually subtract stamina or stack durability. Arena stamina and wear are disabled centrally. For a longer pose, set `player.action = 'attack'` and `player.actionUntil = world.time + duration` together.

**In `step`:** accept only finite positive `dt`. Advance only entries with your `packId`. Use simulation seconds, finite lifetimes, and a backwards loop when splicing shared lists. A large `dt` must cross a delayed hit correctly before expiring it. Use swept segment collision for fast shots and stored hit IDs for attacks that should strike each foe only once.

Target living enemies with finite positions, excluding `isMagicAlly(enemy)` and IDs belonging to `world.players`. Send each hit through one authority path. Recommended for delayed magic:

```js
(world.pendingHit ||= []).push({
  targetId: enemy.id, amount: Math.round(baseDamage * cast.power),
  ownerId: cast.ownerId,
});
if (enemy.home && !enemy.aggro) enemy.aggro = true;
```

The engine applies damage, displays numbers, and assigns `lastHitBy` from `ownerId`. Optional queues:

- `pendingKnock`: `{targetId, dx, dz}`; a displacement, not velocity. Reduce boss displacement as the reference does.
- `pendingBurn`: `{targetId, dps, remaining}`; seconds, refreshed/replaced rather than stacked. The burn has no independent owner field; establish kill credit on the initial hit. Use the existing `arsenal.mjs` `applyDot` pattern if separate DoT ownership is essential.
- `pendingRoot`: `{targetId, remaining}`; seconds of immobilization.

Do not apply direct HP damage **and** enqueue the same hit, or write both `enemy.pendingHit` and `world.pendingHit`. `world.hurt`/`hurtQuiet` injure **players**. Older pack comments about absent enemy-damage helpers or unregistered durability are historical; use the current contracts above.

Use the existing snapshotted lists: `magicBolts`, `magicPuffs`, `magicCasts`, `magicSweeps`, `magicDarts`, `magicPins`, `magicRoots`, `magicSummons`, `magicWaves`. Entries should be plain serializable objects, usually `{id: world.nextId('prefix'), packId: PACK, ownerId, x, z, age: 0, life, ...}`. Store target IDs, arrays, and numbers, not object references, Sets, functions, or browser objects.

`magicPack.worldLists` adds visual enumeration/cleanup only: it does **not** add replication. A genuinely new list also needs `SNAP_LISTS` in `src/magic/registry.mjs`; prefer an existing list. Do not reuse `world.projectiles` unless intentionally using the engine's built-in projectile simulation. Clean up attacks and cosmetic entries on hit/expiry, including misses and lost targets.

## 4. Give it readable art and motion

Create transparent `assets/magic/<id>/item.svg` and, if useful, a simpler square `icon.svg`. Match the game: simple cartoon horror, thick dark outlines (around `#2b2233`), a strong silhouette, vibrant accents, large readable shapes. Keep collision sizes separate from artwork. Hand-authored SVG works directly; no full art regeneration or new dependency is needed. Avoid dumping existing SVGs into context: some contain large embedded metadata.

Register the held pose in **`HELD_GEAR` in [src/magic/art.mjs](src/magic/art.mjs)**, using the item sprite key:

```js
'your-weapon': {motion: 'staff', sprite: 'your-weapon', handY: 1.12},
```

Reuse `staff`, `swing`, `thrust`, `bow`, `bell`, `fan`, `rattle`, `needle`, or `tome` motion first. Add a motion branch to `heldWeaponPose` only for a distinct gesture. Prefer anticipation → release → settle, with a subtle idle bob. Do **not** add a new SVG weapon to `GRAVECRAFT`: that shortcut forces the existing Gravecraft PNG convention and skips the module's sprite definitions.

Choose one attack-visual route:

- **Sprites:** define `sprites.projectile`, `sprites.impact`, and/or `sprites.cast`. Registry keys become `<id>:projectile`, `<id>:impact`, and `<id>:cast`; the corresponding standard lists choose them automatically. `magicSweeps` uses `sprites.sweep` frame arrays. For a list without a built-in role, such as `magicWaves`, set `entry.sprite` to a registered key. Sprite metadata uses world-unit `size`, bottom-left-normalized `anchor`, and optional sheet `columns/rows/clips`.
- **Procedural effects:** add the pack to `usesMagicEffects()` and emit paths/orbs from `buildMagicEffects()` in [src/magic/effects.mjs](src/magic/effects.mjs). For elaborate effects, follow [kitsune-effects.mjs](src/magic/kitsune-effects.mjs) in a separate helper. These commands already render in both Canvas and Three.js; no per-renderer rewrite is needed. `path` points are **`[x, y, z]`**; the `orb` helper takes **`(x, z, y, radius, color, alpha)`**. Use convex fills or paired `'ribbon'` strips for mesh triangulation. Keep the shared entity budget, and exclude helper-handled entries from generic iteration so they are not counted again.

Only suppress fallback sprites with `usesMagicEffects` once a procedural drawing path exists. Draw from replicated `age`, `frame.time`, and bounded `frame.lead`; do not mutate the world, run collisions, or use `Date.now()`/randomness to drive attacks. Keep per-cast particles bounded and give the impact its own brief recovery/fade.

Optional sound: emit one meaningful `world.event(type, x, z)` per cast or major impact and handle the type in `src/audio.mjs`. Avoid one audio event per particle. The existing `swing` event is automatic.

## 5. Make it aim and become obtainable

1. **Auto-aim:** add `'<id>': {reach: RANGE, range: RANGE}` to `MAGIC_AIM` in `src/engine.mjs`. Add `speed` for straight shots that need target leading; homing shots usually do not need it. Otherwise a new magic weapon falls back to fist range and arena auto-attack feels broken.
2. **Rarity:** add the ID to `ITEM_RARITY` in `src/progression.mjs`. This controls the card and later arena offer weights. Magic registration already includes it in `arenaWeapons()` and rank-up offers; no separate hotbar or arena-card registration is required. The item's `blurb` supplies the card text.
3. **First arena card, when requested:** in `src/arena.mjs`, make `STARTERS[0]` the singleton `['<id>']`, preserving exactly three groups total. Putting it in a larger group makes it random. `?arena` opens this mode.
4. **Expedition access, only when requested:** add to the appropriate `POOLS` array in `src/progression.mjs`, or add a recipe in `src/content.mjs` using an existing recipe/station pattern. Rarity alone does not add loot. An arena prototype needs neither.

## 6. Finish without expanding the task

Honor requested validation. If the user says to skip tests/browser runs, do so and report that honestly. Otherwise use a short arena pass: pick → attack → see damage/effects → miss/expire → swap → rank up. For new combat logic, focus checks on ally exclusion, one intended hit per target, cooldown/costs, cleanup, and level/rank scaling; include snapshot/restore only when adding persistent attack state.

Existing focused tests, run from the repository root when relevant:

```sh
node --test hollowstead/tests/magic.test.mjs
node --test hollowstead/tests/battle.test.mjs
```

Use the first for magic contracts, the second for arena/aim/arsenal changes. They do not automatically verify a new mechanic; add focused behavioral cases when needed, not copied assertions for every constant. Avoid full-suite runs, balance simulations, new build tools, or UI redesigns for a small prototype. Report the weapon ID, how to obtain it, and validation performed. Follow the session's commit/push instructions.

Known test maintenance: `magic.test.mjs` currently hardcodes five packs, six sprites, and PNG-only assets. Those assertions predate the Nine-Tail Lantern and its SVGs. A failure there needs updated asset expectations when test work is in scope, not a new weapon-registration workaround. Do not claim the suite passed without running it.

## Alternative: reuse the normal arsenal

For an existing attack style, add metadata to `EQUIPMENT` in `src/content.mjs`, weapon membership to `EQUIPMENT_SLOT_ITEMS.weapon` in `src/contracts.mjs`, and stats/style to `WEAPON_STYLES` in `src/progression.mjs`. Match an existing entry so its required fields are present. Add item/held sprites to `themes/harvest/theme.json` and `HELD_GEAR`, then rarity and the desired acquisition path above. `arenaWeapons()` includes registered styles automatically.

`World.attack()` in `src/engine.mjs` already implements melee, arrow, bolt, and nova. Other styles dispatch through `ARSENAL` in `src/arsenal.mjs`; use `world.strike(player, enemy, damage, push)` for immediate standard-weapon hits. Only extend `ARSENAL`/`stepArsenal` when adding a behavior that cannot reuse an existing style. New projectile kinds also need presentation mapping; reusing an existing kind avoids that work. Do not register the same ID as both a magic module and normal equipment.

## Find only what you need

Use symbol searches instead of reading whole engine/renderer files:

```sh
rg -n -A 24 'MAGIC_AIM|attackMagic\(|consumeMagicQueues\(' hollowstead/src/engine.mjs
rg -n 'ITEM_RARITY|POOLS|WEAPON_STYLES' hollowstead/src/progression.mjs
rg -n 'HELD_GEAR|heldWeaponPose' hollowstead/src/magic/art.mjs
```

Skip `legacy/`, world generation, networking internals, UI catalogs, and the full implementation plan unless the mechanic actually touches them. Keep new authoring notes here: the repository's `.gitignore` excludes `docs/` directories.
