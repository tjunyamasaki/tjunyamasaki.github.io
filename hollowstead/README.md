# Hollowstead

**A little light. A long night.** An endless Halloween survival RPG for 1–4 friends. Explore a wide hollow by day, crack open loot caches, grow stronger, and keep the Heartfire burning through nights that get harder every day. The Hollow King returns every fifth night.

Play at **[tjunyamasaki.github.io/hollowstead/](https://tjunyamasaki.github.io/hollowstead/)**.

## Enter the woods

- **Venture alone** starts immediately, without a connection service.
- **Gather your friends** opens a waiting camp. Share its invite link or five-character code, then select **Enter the woods**. Friends can join an expedition already underway.
- **Continue expedition** resumes the last save on this browser. Select **Host my saved expedition** before opening a camp to resume it with friends.

The host keeps the shared save and must keep the game tab open. Switching away pauses the expedition for everyone. Returning to the title closes that camp. Reopen the saved expedition and share its new code to continue. A guest rejoining from the same browser tab keeps their equipment and supplies. A different tab joins as a new wanderer.

## Survive

1. Gather by hand. Tap a tree or rock to walk to it, or use the stick and hold **Gather**. A pine takes a few seconds; flint takes a little longer. Wood and flint land on the ground. Stay beside a pile and it comes to you; step onto it and it is picked up at once. Walk away and it stays where it fell. A stack you just dropped will not jump back into your pack for a moment; someone else can take it. Grass, berries, pumpkins, and mushrooms go into your pack.
2. Place a workbench from **Build**. It does not need another station. Open the workbench to craft an axe and a pick, then tap **Equip**. Moon iron and haunted graves need a worn pick. Spare tools in your pack do nothing until worn. Cauldrons, soul lanterns, and wards are built from the workbench, not the field list.
3. Cook at a burning fire. Grow pumpkins in farm plots, make bandages at a workbench, and build a cauldron for stew. Eat from your pack: open it and tap Eat on the stack you want.
4. Feed the Heartfire wood. Courage falls in darkness; when it runs low, darkness starts hurting. Hand lanterns have limited fuel; soul lanterns provide permanent light.
5. Hold **Attack** to use the weapon you have equipped. Dodge the glowing enemy attack circles. Repair walls, rearm traps, and use wards to help defend the camp.
6. Hold **Revive** beside a fallen friend for about three seconds. Each wanderer has one last-chance charm. Fallen players return at dawn if the camp survives; their dropped supplies remain recoverable. Open **Build**, then **Maintain camp**, to repair a damaged structure or hold **Dismantle**. The Heartfire cannot be dismantled, and a chest someone else has open cannot either.
7. Awaken the Heartfire with soul embers. Every fifth night brings the Hollow King, stronger each time.

Losing the Heartfire ends the expedition. If everyone falls and has spent their charm, the expedition also ends.

## Explore and grow

The hollow is ringed by six regions. The Meadow around camp is safe; the Autumn woods and the Graveyard beyond it are riskier; the Hollow mire, Moonshard crags and Barrow fields at the edges are the most dangerous and the richest. Discovering a region grants XP. The map remembers where you have been.

- **Caches.** Weathered crates, iron-bound chests, moonlit coffers and hollow reliquaries are hidden around the map, the better ones farther out. Hold **Open** beside one. Loot spills onto the ground with a rarity colour: common, uncommon, rare, epic, legendary. Caches refill after a few days. The best ones are guarded.
- **Mobs.** Region residents roam by day and stay near home. Every creature has a drop table; Elder (elite) creatures are larger, tougher and drop better loot.
- **Levels.** Kills (shared with nearby friends), caches, gathering and discoveries grant XP. Each level adds health and damage and heals you fully. Heartstones raise max health for good.
- **Weapons.** Twenty-four weapons in all. Craft spears, swords, bows, a broadsword and a crook at the workbench. Everything stronger is loot: twin daggers that rend, a soulchain that drags foes in, a reaper's scythe that heals, homing wisps, chain lightning, a falling star, carrion crows, a pumpkin sentry, a taunting Grave Knight, a freezing censer, and the five Gravecraft weapons. Armour goes from bark to bonemail to moonshard plate. The everburning lantern never runs out. See `docs/WEAPONS.md` for every weapon and how they are balanced.
- **The curve.** Night 1 is a handful of briarlings. Each day adds more creatures, more health and damage, new kinds and more elites. The Heartfire mends by day and spits embers at whatever claws at it, but it will not hold alone for long.

See `docs/GAMEPLAY_PLAN.md` for the full design.

## Shared chests

Only one wanderer can open a chest at a time. The same panel shows your pack, worn gear, and the chest. The pack has twelve slots. A chest has twenty-four. **Store all** moves what fits from your pack into the open chest. **Sort** orders the chest, or your pack, and stacks matching piles. Choose 1, Half, or All, then **Transfer**, or tap the slot you want the stack to land in. Food, materials, and equipment all move. Worn gear keeps its durability; putting a lit lantern into the chest switches it off. The panel says when it is waiting on the camp and does not move anything until the camp accepts it. Close the panel to release the chest. Other players cannot spend its supplies while you have it open.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | Left stick, or tap the ground | WASD / arrows |
| Context action | The large circle. Its name follows what you are standing at: Gather, Chop, Feed, Cook, Open, Place, and so on. | E, hold when the action says to hold |
| More actions | The smaller circles beside it. A campfire can show Feed, Cook, Awaken, and Repair at once. | 1–4 |
| Attack | Hold Attack. Uses the weapon you have equipped. | Hold Space |
| Dodge | Dodge | Shift |
| Inventory / Build | Bottom bar | I / B |
| Eat, equip, drop | Open Inventory, select the stack, then Eat, Equip, or Drop | Arrows, Enter, Escape |
| Lantern | A light circle appears when you carry a usable lantern | F |
| Place or cancel | Place and Cancel replace the action circles while you are placing. Maintain camp uses the same circles. | E places, Escape cancels |
| Map | Minimap | M |
| Menu | Gear button in the Inventory header. Camp code, connection, save, invite, camera, sound, guide, and title live here. | Escape |

Opening Inventory, Build, or a station does not pause the expedition. The menu pauses the world only when you are playing alone. The in-game field guide explains crafting, farming, defenses, and the campaign. Portrait and landscape layouts are supported.

## Art

All sprites and animations are original vector art generated by `tools/art/build.py`; see `themes/FORMAT.md`. The first art set is kept in `legacy/` for reference.

## Connection notes

Co-op uses the site's existing room service and a direct connection to the host. Some restrictive mobile, workplace or school networks do not permit direct connections; if a camp cannot connect, try another network. No account is required. Saves are kept on the host's browser, so clearing that browser's site data removes them.
