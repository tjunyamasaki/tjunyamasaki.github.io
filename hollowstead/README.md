# Hollowstead

**A little light. A long night.** An endless Halloween survival RPG for 1–4 friends. Explore a wide hollow by day, crack open loot caches, grow stronger, and keep the Heartfire burning through nights that get harder every day. Every night has a moon: most are new moons (a little over half), a dark night for foraging with no raid; waxing moons (about a quarter) bring raids on the fire; blood moons (about 10%) bring the Hollow King; and now and then a rare moon rises: the **Gilded Moon** or **Star Rain** (about 5% each). For a save you keep for as long as you like, play the [Vigil](#the-vigil).

Play at **[tjunyamasaki.github.io/hollowstead/](https://tjunyamasaki.github.io/hollowstead/)**.

Creating a weapon? Start with the focused [weapon authoring guide](WEAPON_AUTHORING.md).

## Enter the woods

Pick a wanderer and a name on the left of the title screen, then a card on the right.

- **Expedition**: **New expedition** starts alone at once, without a connection service. **Gather your friends** opens a waiting camp: share its invite link or five-character code, then select **Enter the woods**. Friends can join an expedition already underway. When this browser holds a save, the card is marked *Saved* and **Continue expedition** resumes it; tick **Bring my saved expedition** before gathering friends to resume it together.
- **Join a camp** takes a friend's five-character code (an invite link fills it in for you).
- **The Vigil** is one long save in its own slot, kept until you end it. See [The Vigil](#the-vigil).
- **Dungeons** is a crawl through floors carved fresh every time, alone or with up to three friends. See [Dungeons](#dungeons).
- **Arena** is combat only: a small round clearing, nothing in it but the swarm. See [Battle arena](#battle-arena).
- **Weapon lab** is the arena without rounds, for trying and balancing weapons. See [Weapon lab](#weapon-lab).
- **Classes** is a new way to grow: choose a class instead of collecting weapons, and spend a talent point every level. It opens **The Class Vigil** (a Vigil played by class, in its own save slots) and a **Test ground**. See [Classes](#classes).
- **Showcase** is a sandbox clearing for placing anything in the game.
- **The Vigil** builds and farms on the grid (soil, floors, walls and camp objects a cell at a time, from the Build menu, paid for in materials). **Homestead** (or `?homestead` in the address) is a calm sandbox for the same system: till soil, sow day and night crops, lay floors, run fences, palisades, stone walls and gates, close rooms with house walls and sleep through the night, cook blessing dishes, and test raids against your walls. Solo, free building by default, not saved. See `docs/HOMESTEAD.md`.

The icons at the top right open the field guide, fullscreen and sound.

The host keeps the shared save and must keep the game tab open. Switching away pauses the expedition for everyone. Returning to the title closes that camp. Reopen the saved expedition and share its new code to continue. A guest rejoining from the same browser tab keeps their equipment and supplies. A different tab joins as a new wanderer.

## Survive

1. Gather by hand. Tap a tree or rock to walk to it, or use the stick and hold **Gather**. A pine takes a few seconds; flint takes a little longer. Wood and flint land on the ground. Stay beside a pile and it comes to you; step onto it and it is picked up at once. Walk away and it stays where it fell, for 90 seconds: it blinks before it vanishes. (A fallen wanderer's spilled pack, or a broken chest's contents, lies a whole day and night.) A stack you just dropped will not jump back into your pack for a moment; someone else can take it. Grass, berries, pumpkins, and mushrooms go into your pack.
2. Place a workbench from **Build**. It does not need another station. Open the workbench to craft an axe and a pick, then tap **Equip**. Moon iron and haunted graves need a worn pick. Spare tools in your pack do nothing until worn. Choose cauldrons, soul lanterns, wards and hushing stones at the workbench, then walk anywhere to place them beside you. A **hushing stone** sings the woods to sleep: no creature rises or comes hunting within 18 paces of it, so you can build in peace (raids, the Hollow King, rare moons and omens still come; two stones at most). The workbench also makes **bags**, worn in the bag socket: a forager's satchel (fiber and wood, +6 pack slots) early on, a delver's haversack (fiber, bone, moonshard, embers: +12) later. A bag can come off only when the smaller pack still holds everything. Construction draws materials from your pack and unlocked chests or carts anywhere in the hollow. Repairs and item crafting still use nearby supplies.
3. Cook at a burning fire. Grow pumpkins in farm plots, make bandages at a workbench, and build a cauldron for stew. Eat from your pack: open it and tap Eat on the stack you want. The **Potion** button beside Attack shows all Vigor draughts in your pack; tap it or press **H** to drink one and restore 60 health and 20 courage.
4. Feed the Heartfire wood. Courage falls in darkness; when it runs low, darkness starts hurting. Hand lanterns have limited fuel; soul lanterns provide permanent light.
5. Fight with the weapon in your hand. Every weapon aims itself at the best foe in reach, so you can run one way and fight the other. Hold **Attack** to swing. Every weapon also has a **skill** (the ✦ button beside Attack): it drains your whole stamina bar, hits much harder than a swing, and recharges on its own timer. It needs at least 40 stamina, and a full bar makes it strongest. Keep up to three weapons on the **hotbar** and tap one to swap mid-fight. Every creature telegraphs its blow on the ground; **Dodge** out of it, or dodge at the last moment to pass through untouched. Dodge holds two charges. Each charge has its own cooldown, and the next one starts only after the previous charge returns. Repair walls, rearm traps, and use wards to help defend the camp.
   **Mastery.** Every kill with a weapon in hand teaches you that weapon: tougher foes teach more, elites twice as much. Enough kills rank it up (★1 to ★5, like the arena): each rank hits a little harder and makes its attack and skill flashier. Mastery belongs to you, not the item, so when a weapon breaks the next one of its kind keeps its rank. The hotbar shows each weapon's stars, a gold bar toward the next rank, and an orange bar for its condition.
   **Named weapons.** Every elder you fell with a weapon type is remembered (a Warden counts for three, the Hollow King five, a great boss ten). After 25 it earns a name of its own, like *Gravesong, Bane of Gravekeepers*, a gold rim on the hotbar, and a fourth modifier slot at the workbench.
   **Ascension.** Past ★5 mastery keeps counting: every 160 more readies an ascension (a violet bar on the hotbar). Ascend at the workbench's Refine panel with **Dread sigils** and ichor. Each ascension (✦1, ✦2...) adds a little less damage than the last, and there is always another. Dread sigils are torn from great foes: the Hollow King, Mother Briar, The Unblinking, and on a Vigil a bleeding altar's champion.
   **Mending.** Weapons wear with use. A weapon worn to nothing breaks but stays with you, useless until mended (other gear, like armour, tools and hand lanterns, crumbles away). Stand at the Heartfire with the weapon in hand and tap **Mend**: a soul ember gives back half its condition. You get a warning when a weapon drops to a quarter.
   **Refining.** Creatures drop **Dread ichor**, and nothing else does: now and then from a briarling, more often from wraiths, bonewalkers and boglings, two to four from every gravekeeper and golem, a hoard from the Hollow King (elders drop it more often). Stand at a workbench and tap **Refine**. Each weapon, and each body armour, holds up to three modifiers; a roll picks one at random and a rarity for it (common 46%, uncommon 28%, rare 16%, epic 8%, legendary 2%), and the rarity sets its strength. The first slot costs the gear's base price in ichor (3 for common to 8 for legendary), the second twice it, the third three times; rerolling any slot costs twice the base and may come back better or worse. Refinement belongs to you, like mastery: the next weapon of the same kind keeps it. Filled slots show as gems on the hotbar, and a weapon's tooltip lists them.
   - *Numbers, any weapon:* Keen (+5% to +30% critical chance; crits hit for 1.5×), Cruel (more critical damage), Honed (+damage), Swift (faster attacks), Fervent (faster skill recharge), Thirsting (damage heals you), Bane (more damage to elders, Wardens and great bosses), Tempered (less wear, weapons and armour). Long (more reach) on swung weapons; Split on weapons that shoot (epic or legendary only: one more arrow, bolt, star, firebolt, vial or needle at half damage, or one more wisp, crow, foxfire, sentry or lightning leap; two when legendary).
   - *Bows and staves (the recurve, longbow, crook and skull staff):* **Forking** (a shot that hits splits into two more), **Ricochet** (shots bounce on to 1 to 3 more foes), **Shrapnel** (shots burst into a ring of shards where they stop), **Returning** (shots fly back to you, striking everything on the way) and **Seeking** (shots curve after foes and hit harder). Forks, shards and bounces stack: a forking, bouncing, bursting bolt clears a crowd.
   - *Blades and other swung weapons:* **Crescent** (every swing looses a cutting wave that flies on through every foe), **Echoing** (each swing comes again as a phantom a beat later) and **Aftershock** (every third swing slams the ground round your mark and stuns).
   - *Any weapon:* **Arcing** (a chance that a hit leaps as lightning to two more foes), **Shattering** (critical hits burst onto foes around), **Relentless** (each hit in a row on one foe hits harder, up to five), **Culling** (foes left under a sliver of health are cut down; never Wardens or bosses), **Volatile** (foes you slay explode for part of their health, and the blasts can chain) and **Haunting** (each kill frees a spirit that hunts another foe).
   - *Body armour:* Vital (+max health), Bulwark (less damage taken), Fleet (faster feet), **Retribution** (when struck, loose a ring of bone shards), **Stormskin** (lightning strikes a foe near you every few seconds), **Slipstream** (dodging through foes cuts them), **Vengeful** (being struck makes your blows stronger for a moment) and **Second wind** (falling under a third of your health heals you, once a minute).
   Cruel and Shattering roll only beside Keen. **Modifier books** drop like any loot (caches, the rarity pools, now and then a creature, always the Hollow King): each carries one modifier at its own rarity, its cover saying what it fits (green-blue bows and staves, red blades, violet any weapon, iron armour). In the Refine panel, tap a book and then a slot: it writes that modifier there, over whatever was in it, for the book alone and no ichor. A book can write Cruel or Shattering without Keen.
   **Dismantling.** Select any piece of gear in your pack (or a worn socket) and tap **Dismantle**, then confirm: the button says what you get. Loot you found melts into Dread ichor by its rarity (common 1, uncommon 2, rare 3, epic 5, legendary 8); gear you can craft at the workbench gives back half its materials instead. Your mastery and refinement of that weapon type stay with you.
   **Daylight.** Creatures hunt you out in the wilds by day too, and twice as often at night. But by day the Heartfire's light burns any creature that comes inside it until it dies: small ones in seconds, the Hollow King only slowly. A creature the fire burnt more than you hurt it leaves nothing behind: no loot, no experience. The same light mends you by day: stand in it and, three seconds after your last wound, you heal 2.5 health a second, 1 more for each Heartfire level.
6. Hold **Revive** beside a fallen friend for about three seconds. Each wanderer has one last-chance charm. Fallen players return at dawn if the camp survives; their dropped supplies remain recoverable. Open **Build**, then **Maintain camp**, to repair a damaged structure or hold **Dismantle**. The Heartfire cannot be dismantled, and a chest someone else has open cannot either.
7. Awaken the Heartfire with soul embers (the same embers mend weapons, so choose). A blood moon brings the Hollow King, stronger each time; tap the moon by the clock to see tonight's moon and the next.

Losing the Heartfire ends the expedition. If everyone falls and has spent their charm, the expedition also ends. (Not on a Vigil: see below.)

## Explore and grow

The hollow is ringed by six regions. The Meadow around camp is safe; the Autumn woods and the Graveyard beyond it are riskier; the Hollow mire, Moonshard crags and Barrow fields at the edges are the most dangerous and the richest. Discovering a region grants XP. The map remembers where you have been.

- **Caches.** Weathered crates, iron-bound chests, moonlit coffers and hollow reliquaries are hidden around the map, the better ones farther out. Hold **Open** beside one. Loot spills onto the ground with a rarity colour: common, uncommon, rare, epic, legendary. Epic and legendary drops have a small purple or gold glow and stay for five minutes; spilled packs and broken chests keep their longer recovery timer. Caches refill after a few days. The best ones are guarded.
- **Mobs.** Region residents roam by day in packs and stay near home; hunters find wanderers anywhere outside the Heartfire's light, day or night. Every creature has a drop table; Elder (elite) creatures are larger, tougher and drop better loot. Each kind fights differently: briarlings swarm and surround you, bonewalkers back off and charge in a line, lantern wraiths keep their distance and throw orbs, boglings lob spores where you are heading, and gravekeepers, golems and the Hollow King wind up long, heavy blows. Creatures find their way round trees and walls.
- **Loot.** Gear you already hold (in a pack, a socket, a chest or on the ground) is redrawn when a cache or creature would roll it again, up to twice, so repeats are rare but still possible. Saves keep where the dice stand, so reloading never replays the same finds.
- **Levels.** Kills (shared with nearby friends), caches, gathering and discoveries grant XP. Each level adds health and damage and heals you fully. Heartstones raise max health for good.
- **Trinkets.** Twenty small relics, worn in the trinket sockets, each bending one rule: a frost trail behind every dodge, a ward that blocks a blow, a bell that tolls every thirteenth hit. The second socket opens at level 10, or for everyone standing when a Warden or the Hollow King falls. Some pairs **resonate** and do something neither does alone (Tinder pouch and Ember heart: Wildfire, burning foes spread their fire when they die); an item's tooltip names its partners, and the chips under your health join and name a live resonance. The Hollow mirror makes the other worn trinket 60% stronger. See `docs/TRINKETS.md` for every trinket, resonance and a few builds.
- **Weapons.** Twenty-four weapons in all. Craft spears, swords, bows, a broadsword and a crook at the workbench. Everything stronger is loot: twin daggers that rend, a soulchain that drags foes in, a reaper's scythe that heals, homing wisps, chain lightning, a falling star, carrion crows, a pumpkin sentry, a taunting Grave Knight, a freezing censer, and the five Gravecraft weapons. The Nine-Tail Lantern wakes a kitsune: its tails hang behind you while it is equipped (three, up to five at ★5; nine in its skill), their tips burn hotter as its volleys build from three foxfires to six to nine, and its colour (gold, red or violet) changes each time you equip it. Armour goes from bark to bonemail to moonshard plate. The everburning lantern never runs out. See `docs/WEAPONS.md` for every weapon and how they are balanced.
- **The curve.** Night 1 is a handful of briarlings. Each day adds many more creatures, a little more health and damage, new kinds and more elites: the nights get more crowded faster than any one creature gets tougher. The Heartfire mends by day and spits embers at whatever claws at it, but it will not hold alone for long.

- **Wild places.** Each hollow hides three places of its own, set by the seed. **Frostmere** is a frozen lake where you slide on the ice, with rime crystals to mine. The **Ashen Scar** is burnt ground and lava pools where vents erupt under your feet (they burn creatures too), with emberglass to mine. Rime and emberglass awaken the Heartfire to levels 4 and 5. **The Briar Throne** sits against the edge of the map behind a wall of bramble: step inside and **Mother Briar** wakes. She returns a few days after she falls.
- **The Sunken Stair.** Somewhere in the outer ring a stair leads down. The whole standing party gathers on it and holds **Descend**: five floors below with your own gear (weapons wear), deeper and harder, and on the last floor **The Unblinking** waits. While you are below, the hollow stands still: no day passes up there. Climb out at any floor's camp fire, or win and come up with experience for everyone.
- **Great bosses.** Mother Briar and The Unblinking are huge, three-phase fights: every attack is telegraphed on the ground, and each phase brings new patterns and minions. Each drops its own legendary weapon the first time it falls (and sometimes after): **Thornmother's Heart** and **The Eye of the Deep**. Each is stronger every time it returns.
- **Omens.** Rare, about one every day and a half, and hard won: a fallen star sealed until its guardians (led by an elder) are dead, a soul rift that pours out four waves before it seals (the last led by a great elder), a lonely chest (often a huge mimic), a witch's cauldron with one strange brew for each of you until the dawn after next, a golden pumpkin. Each is announced with a direction, marked on the map and lit by a beam you can see from afar. Completing one is an **Omen fulfilled**: a gold banner, a hoard (a star gives an epic and about a one-in-three legendary; a rift always a legendary; a pumpkin a heartstone and an epic), experience for everyone near, and a tally kept for the hollow.
- **Rare moons.** Under the **Gilded Moon** no raid comes: gilded creatures appear in the wilds and run from you, and each one you catch drops treasure. Under **Star Rain** smaller waves come while stars fall around everyone: dodge them, then pick up what they leave.

See `docs/GAMEPLAY_PLAN.md` for the full design and `docs/VIGIL.md` for the places, bosses, delve, omens and rare moons.

## The Vigil

**The Vigil** on the title screen is one long hollow kept in its own save slot, separate from expeditions: nothing overwrites it, and it is gone only when you tap **End this vigil…** (twice). **Keep it alone** plays it solo; **Keep it with friends** opens a camp for it.

- **Longer days and nights** (about seven minutes a day).
- **Dread, not days.** Creatures do not grow stronger as days pass. They grow with you: your highest level, the best gear you have held, and the bosses you have slain. The HUD shows the Dread beside the day.
- **No game over.** A destroyed Heartfire is rekindled, weaker by one level, and the raid leaves. A fallen party wakes by the fire; packs stay where they fell. The last-chance charm returns every dawn. Levels go to 60.
- **The ages of Dread.** Every 10 Dread the hollow enters a new age, for good, and the night sky reddens. **I, the Stirring:** roaming packs follow an elder and run larger. **II, the Bleeding:** bleeding altars join the omens: hold Wake and slay the Dread champion that rises for Dread sigils. **III, the Thorning:** Dread thorns grow over the trails; they slow and scratch whoever wades through (dodge through, or cut them, an axe helps). **IV, the Hunt:** dreadhounds, faster than any wanderer, run with the night and the roaming packs. **V, the Deep Dread:** two elders lead each pack, the thorns grow thick and the hounds hunt by day. The clock shows your age beside the Dread.

## Dungeons

**Dungeons** on the title screen (or `?dungeon` in the address, `?dungeon=crypt`, `caverns` or `ossuary` to pin one) goes down below the hollow. Choose **Descend alone**, or **Gather a party** to open a camp: friends join with its code like any camp, even mid-run. Runs are not saved.

- **Every floor is new.** Each is carved from a seed by one of the variations: the **Barrow Crypt** (stone chambers and straight passages, pillared halls), the **Rootwarren** (winding caves lit by glowcaps) and the **Moonlit Ossuary** (a lattice of great colonnaded halls). Pick one on the title screen or let each floor choose.
- **The camp.** Every floor starts at a camp: a fire that mends anyone resting by it and cooks, and a workbench to craft and refine. Everyone arrives with a briar spear, bark armour, a recurve, two bandages and a Vigor draught. There is no hunger or courage down here, and weapons never wear.
- **Chambers.** Creatures in a chamber wake as you come near and chase a little way past its door; a resting one has to see you first. Clear a chamber for experience. Ambush chambers pour two waves out of rifts around you. Caches wait in chambers (the best in dead ends), and treasure chambers are guarded by an elder. Loot, levels, weapon mastery and refinement all work as on an expedition, and deeper floors find better things.
- **Shrines.** Stand by a shrine's stone and it blesses the party once a floor: **Mending** (everyone mended, the fallen rise), **Fury** (harder blows until the next stairs) or **Fortune** (richer finds on this floor).
- **The Warden.** The stairs down are in the Warden's chamber, farthest from the camp. Walk in and the Warden rises with its escort; every fifth floor it is the Hollow King. Slay it and the stairs open, and anyone who fell rises beside a friend. The whole standing party stands in the stairs to go down: experience for the floor, a new floor, everyone mended.
- **Falling.** A fallen wanderer keeps their pack: a friend can hold Revive, or they rise when the Warden falls. Each wanderer has one last-chance charm per run. When everyone is down, the run ends.

The map and minimap show only what the party has walked near. The HUD badge under your health says what to do next. See `docs/DUNGEONS.md` for how floors are built, how to add a variation, and how dungeons can open from an expedition.

## Battle arena

**Arena** on the title screen (or `?arena` in the address) starts a solo run in a small walled clearing with nothing in it but creatures. It is not saved.

1. Pick one of three weapons. The prototype always offers the **Nine-Tail Lantern** first, alongside a close and a ranged choice. Its nine homing foxfires burn foes, and the ninth bursts in an area.
2. Survive the wave. Creatures pour in from the wall in packs; each wave brings more of them, a little stronger. Every fifth wave brings champions; every tenth, the Hollow King.
3. When the last one falls you heal a third of your health, and pick again from three weapons. A weapon you already carry ranks up instead (★, up to five). Each rank adds damage and more flourish to both the attack and the skill: ★1 is the plain move; by ★5 stars fall on comet tails braided with colour, blows throw sparks, light pillars and prismatic shockwaves, and the biggest moments shake the camera. With three weapons on the hotbar, a new one replaces one you choose, or you keep yours.
4. Kills give experience to everyone standing. Each level adds health and damage and heals you fully.

The arena keeps only health and level: no hunger, courage, weapon wear or loot. Attacks and dodges cost no stamina there; skills still drain it. **Auto-attack** (on by default, in the arena menu) swings whenever a foe is in reach. When you fall, the run ends; **Fight again** starts a new one.

## Weapon lab

**Weapon lab** on the title screen (or `?lab` in the address) opens the arena clearing with no rounds, for testing and balancing weapons. It is solo and never saved.

- **Arsenal** lists every weapon in the game. Pick a rank (★1–★5) and tap a weapon to put it in the hotbar slot you are holding; your level has its own stepper. The panel shows the weapon's skill and cooldown.
- **Foes** chooses what to spawn (a mix, or one kind), how many, how strong (the arena wave it is drawn from) and where: ahead of you, around you, or from the wall. **Spawn** (N) and **Clear** (X) work at any time.
- Switches: **Invulnerable**, **Foes stand still** (training dummies that never strike back), **Free skills** (no cooldown or stamina, for trying looks quickly) and **Auto-attack**.
- The meter shows damage per second (averaged over five seconds), total damage, the peak, kills and foes alive. It counts every point of health foes lose, whatever dealt it; **Reset meter** starts it over.

## Classes

**Classes** on the title screen grows a wanderer by class instead of by weapon, MMO style: you choose a **class**, its weapon is bound to you for good, and every level is a **talent point**.

- **The Class Vigil** is a Vigil played by class, alone or with friends, in three save slots of its own (never mixed with the Vigil's). Choose your class when it begins. The class weapon never wears out and stays in your hand; other weapons you find stay in your pack, to store or salvage. Keys 1–4 cast your skills there (E still works the nearest action).
- **Test ground** (or `?classes` in the address) is the arena's clearing and endless waves with test switches, to try any build. It is solo and never saved.

- **Talents** (T) opens the class's tree: three branches, five rows each. A branch's next row opens for every three points you spend in it, and some talents need the one above them. Tap a talent to read it, then **Learn**. **Reset points** takes every point back.
- Active skills you learn go on the **skill bar** (1–4) at the bottom; the class's ultimate is on the ✦ button (Q). Skills spend the class's resource and recharge on their own timers.
- **Tools** has the test switches: levels up and down (down refunds your points), spawn foes, clear them, call the next wave, fill the resource, **Invulnerable**, **Hold the waves** and **Free skills**.

The first class is the **Kagekiri Ronin**, built on Kagekiri, the shrine blade of Yomi. Your attack is its iai draw: three draws make a set, every cut hangs in the air, and the third draw sheathes the blade and snaps every hanging cut shut on whatever stands in it. Where two of your cuts cross, the snap bursts there too (a **Crux**). Draws that land and snaps build **Ki**; skills spend it.

| Branch | What it does | Skills | Capstone |
| --- | --- | --- | --- |
| **Iai** · the Draw | lays more cuts, longer and keener | **Crossing Cut** (an X of two cuts: a Crux of its own), **Swallow Return** (every cut near you strikes again and hangs anew) | **Endless Line**: cuts wait for the sheath |
| **Kage** · the Shadow | moves you, and drags them onto your lines | **Shadow Step** (dash through foes; the path hangs as a cut), **Shadow Lure** (drag every foe near onto your nearest cut and hold it), **Shadow Echo** (each draw lays a twin across it) | **Return from Darkness**: a great snap readies Shadow Step |
| **Sakura** · the Sheath | closes the lines | **Swift Sheath** (snap everything now, harder for the Ki you spend), **Falling Blossom** (six cuts close a ring round your mark: six corners, six Crux) | **Thousand Petals**: every closed cut looses a petal blade |

The ultimate, **Hundred-Line Draw**, wakes at level 6. A typical turn: lay a Crossing Cut or a Falling Blossom where the swarm is coming, Shadow Lure everything onto the lines, then Swift Sheath to close them all at once.

## Shared chests

Only one wanderer can open a chest at a time. The same panel shows your pack, worn gear, and the chest. The pack has twelve slots, more with a bag (eighteen or twenty-four). A chest has twenty-four. **Store all** moves what fits from your pack into the open chest. **Sort** orders the chest, or your pack, and stacks matching piles. Choose 1, Half, or All, then **Transfer**, or tap the slot you want the stack to land in. Food, materials, and equipment all move. Worn gear keeps its durability; putting a lit lantern into the chest switches it off. The panel says when it is waiting on the camp and does not move anything until the camp accepts it. Close the panel to release the chest. Other players cannot spend its supplies while you have it open.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | Left stick, or tap the ground | WASD / arrows |
| Context action | The amber pill above the right-hand buttons. Its name follows what you are standing at: Gather, Chop, Feed, Cook, Open, Place, and so on. With nothing nearby the row is empty. | E, hold when the action says to hold |
| More actions | The smaller pills to its left. The Heartfire can show Feed, Cook, Awaken, Mend, and Repair; when all five apply, a greyed-out one gives way. | 1–4 |
| Attack | Hold Attack, the big button in the corner. Aims itself. The expedition does not swing for you. In the battle arena, Auto-attack in the menu can. | Hold Space |
| Skill | The ✦ button left of Attack. Drains all stamina (needs 40). The outer purple ring shows cooldown remaining; the inner blue-green ring shows stamina available. | Q |
| Potion | The red button between Skill and Dodge drinks one carried Vigor draught; it answers even while you steer. The number shows how many remain, and it pulses when your health runs low. | H |
| Swap weapon | Tap a weapon on the hotbar | R or Tab cycles |
| Dodge | The blue button above Attack. Two charges. A quick dash, invulnerable for a moment. Each charge cools on its own, and the next cooldown starts when the previous charge returns. With the stick still, you leap away from the nearest foe. | Shift |
| Inventory / Build | Pack and Build beside the minimap | I / B |
| Eat, equip, drop | Open Inventory, select the stack, then Eat, Equip, or Drop | Arrows, Enter, Escape |
| Lantern | Light beside the minimap (dim until you carry a usable lantern) | F |
| Place or cancel | Place and Cancel replace the action pills while you are placing. Maintain camp uses the same pills. | E places, Escape cancels |
| Map | Minimap | M |
| Menu | Gear button in the Inventory header. Camp code, connection, save, invite, camera, sound, guide, and title live here. | Escape |

Opening Inventory, Build, or a station does not pause the expedition. The menu pauses the world only when you are playing alone. The in-game field guide explains crafting, farming, defenses, and the campaign. Portrait and landscape layouts are supported.

## Art

All sprites and animations are original vector art generated by `tools/art/build.py`; see `themes/FORMAT.md`. The first art set is kept in `legacy/` for reference.

## Connection notes

GitHub Pages stamps local scripts and styles with a unique version for each deployment. Hollowstead uses that same version for theme, sprite, icon, and audio requests, so updated files load automatically while files from the current release stay cached. A small update check runs on opening, on returning to the title screen, and when a visible title screen is resumed or left open. Updates reload the title screen; active expeditions, arenas, and multiplayer camps are not interrupted. Browser saves and preferences are preserved. Local development does not check for deployed updates.

Co-op uses the site's existing room service and a direct connection to the host. Some restrictive mobile, workplace or school networks do not permit direct connections; if a camp cannot connect, try another network. No account is required. Saves are kept on the host's browser, so clearing that browser's site data removes them.
