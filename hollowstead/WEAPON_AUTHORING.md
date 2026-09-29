# Making a Hollowstead weapon

Paths are relative to `hollowstead/`. This guide is the whole briefing: read it, read the **two reference files** in §2, then touch only the files in §4. Don't tour the engine, renderer, UI, networking or world generation; use the symbol searches at the end when you need one fact.

## 1. The bar

Every new weapon must feel like a **new toy**, not a reskin. The two finished reworks set the bar:

- **Nine-Tail Lantern** (`kitsune-lantern`): the fox's tails hang behind you whenever it's equipped (its fantasy is visible before you attack); the auto attack has a rhythm (3 → 6 → 9 foxfires peel off the tail tips, the ninth bursts); its colour is rolled on equip (gold/red/violet); the skill is the auto attack's mechanic pushed to its limit (three rings of nine, then the spirit pounces).
- **Starfall Scepter** (`starfall`): a telegraphed mark, a falling star with a trail, a crater; the skill draws a constellation between foes, stars land on its points, then the heart star falls. Every rank adds a visible layer.

What made them good, and what yours needs:

1. **One fantasy, one verb.** Say it in a sentence ("a coffin on a chain you whirl around you"). Everything (mechanic, look, sound, skill) serves it.
2. **A mechanic nobody else has** (§3). Movement, timing, positioning or target choice should change because you hold this weapon.
3. **A rhythm or a build-up**: a combo count, a charge, momentum, stacks, a cycle. Something to read and play with.
4. **The skill pays off the auto attack's own mechanic**, bigger and stranger, with a clear climax.
5. **Anticipation → release → impact → linger** in the visuals, with painted shapes (ink outline, saturated fill, a small glow), not additive white washes.
6. **A rank ladder you can see**: ★1 the plain move, each rank adds a layer (§7), ★5 is a spectacle.
7. **A sound** for the cast and the big impact.

Keep it simple: one module for the rules, one for the look. No new systems, frameworks, build tools or config layers. No tests unless asked.

## 2. Read exactly these

| For | Read | Copy |
|---|---|---|
| Rules (host sim) | `src/magic/kitsune-lantern.mjs` (240 lines) | `magicPack`, `use()` guards, `step()` shape, target filter, `pendingHit` with `ownerId`, per-wielder state on the player |
| Look | `src/fx/kitsune.mjs` (400 lines) | the `KITSUNE_FX` entry at the bottom, `paintFoxTails` (a rig), `paintFoxBolt` (list painter), `FOX_EVENTS` |
| Skill script | the `kitsune-lantern` entry in `src/skill-book.mjs` and `SKILL_CALLS.foxring` | a `call` beat that runs your module's own mechanic |
| Brushes | the `Painter` class and `tier()` in `src/fx/kit.mjs` (skim signatures) | |

Only if your weapon needs it: Starfall (`src/fx/starfall.mjs`, `meteor` in `src/arsenal.mjs`) for a telegraphed ground strike; the Pallbearer's Flail (`src/magic/pallbearer.mjs`, `src/fx/pallbearer.mjs`) for per-wielder physics state and a skill run by its own module. Don't open other weapons' modules "for ideas": the table below is the idea inventory. Don't `cat` SVGs (big).

## 3. Don't repeat these patterns

Taken auto attacks (weapon: pattern):

| | |
|---|---|
| fist, spear, sword, broadsword, flamberge | melee swing arc with knockback |
| recurve, bonebow | arrows |
| crookstaff, skullstaff | bolt that bursts on impact |
| cinder-staff | firebolt that sets the first foe burning |
| tome | nova ring around you |
| fangs | three-hit dagger combo |
| soulchain | lash that pulls |
| scythe | reaping arc that heals you |
| wisplantern | homing wisps |
| stormrod | chain lightning between foes |
| starfall | meteor strike on the target |
| crowtotem | crows fly out and peck |
| jacklantern | planted pumpkin sentry |
| wighthorn | summoned Grave Knight |
| barrow-rattle | skeleton summons (up to four) |
| censer | freezing frost cloud |
| gloomgrasp | shadow pool with hands that crush and hold |
| plaguebeak | lobbed vial → lingering miasma cloud |
| kitsune-lantern | 3/6/9 homing foxfire volleys from idle tails |
| widows-needle | pinning dart (root) |
| spirit-fan | cone gust that shoves and breaks wind-ups |
| mourning-bell | delayed expanding ring |
| pallbearer | coffin on a chain with rope physics: heaves build momentum, damage scales with speed, a dodge whips it |

Taken skills: leap slam + stun; line lunge + thorn roots; spinning crescents + wave; leap smash + ground split; fire cyclone on you; blink between foes; pull-then-push reaps; chain-bind + burst; fanned volleys + arrow rain; piercing lance; seeking salvo; drifting drain orb; triple fire rings; wisp swarm; lightning storm; constellation star shower; flock sweep; bomb barrage; horn push + knight charge; freeze + shatter; maw from shadow; miasma vials; foxfire rings + pounce; bone eruption + more summons; fireball rain; web pin + needle rain; cyclone → gale; triple toll; whirl-up, hurl, slam, and the chain yanks you in (pallbearer).

Fresh ground (pick one, or invent): a held tether or beam that drags or links foes, blades orbiting the wielder, a boomerang with a return path, ricochets off foes and walls, marks that stack and detonate, hold-to-charge and release, a trail on the ground that hurts or closes shapes, a gravity well, echoes that repeat your last attack, a decoy or mirror, swapping places with a projectile, reflecting enemy shots, stance switching, timing windows, grow-with-kills, foe-triggered traps, throwing one foe into others, spending health for power.

When you finish, **add your weapon to both lists above**.

## 4. Files to touch (and nothing else)

Write a 5-line design brief first (fantasy, auto verb, rhythm, skill climax, look/palette), then:

- [ ] `src/magic/<id>.mjs`: `magicPack`, `use(world, player)`, `step(world, dt)` (§5).
- [ ] `src/magic/load.mjs` → `SPECS`: add `'<id>.mjs'`.
- [ ] `src/engine.mjs` → `MAGIC_AIM`: `'<id>': {reach, range}` (+`speed` for straight shots that should lead). Without it auto-aim uses fist range.
- [ ] `src/skill-book.mjs` → `SKILL_BOOK['<id>']` and, for the weapon's own mechanic, a `SKILL_CALLS` function (§6).
- [ ] `src/fx/<id>.mjs` exporting `<NAME>_FX`, added to `WEAPON_FX` in `src/fx/index.mjs` (§7).
- [ ] `src/fx/kit.mjs` → `HUES['<id>']`: `H(core, main, glow, deep, alt)`; used by the generic flourishes (rank-up, damage flair).
- [ ] `src/magic/art.mjs`: `HELD_GEAR['<id>']` (reuse a motion: `staff`, `swing`, `thrust`, `bow`, `bell`, `fan`, `rattle`, `needle`, `tome`), or add the id to `UNHELD` when your rig draws the weapon itself.
- [ ] `assets/magic/<id>/item.svg` (+ square `icon.svg`): hand-written SVG, cartoon horror, thick `#2b2233` outlines, strong silhouette, 2 to 5 KB.
- [ ] `src/progression.mjs` → `ITEM_RARITY` and the matching `POOLS` list (expedition loot). `STARTERS` in `src/arena.mjs` only if asked.
- [ ] `src/audio.mjs` → `play()`: a synth branch for your cast/impact event types (copy the `foxfire` branch shape).

Imports use the suffix `?v=harvest-18` exactly like their neighbours (registries are singletons per URL). Don't bump it. Don't also add the id to `EQUIPMENT`, `EQUIPMENT_SLOT_ITEMS` or `WEAPON_STYLES`: the registry supplies inventory, equipment, arena offers and the lab.

## 5. Rules: the host sim contract

The host steps the world at 20 Hz; guests and renderers only draw snapshots. `World.attack()` auto-aims then calls your `use()`; `attackMagic()` around it charges stamina, default cooldown and wear, and stamps `player.magicCast` (you may set `player.cooldown`, `action`/`actionUntil` and call `world.wearEquipped(player, 'weapon', 1)` yourself, as the kitsune does).

- **`use`**: return `null` with no side effects for wrong/broken weapon, `down`/`ghost`/offline player, `cooldown > .05`, non-finite position. Normalise `dx/dz` (fallback `0, 1`). Capture `ownerPower(world, player)` at cast time. Return the created state (truthy).
- **`step(world, dt)`**: bail unless `dt > 0`. Touch only your `packId` entries; iterate backwards when splicing. Everything has a finite life; clean up on hit, miss, lost target and expiry. Sweep fast things (segment vs circle) so a big `dt` can't tunnel.
- **Targets**: `e.hp > 0`, finite position, `!isMagicAlly(e)`, not a player id.
- **Damage**: `(world.pendingHit ||= []).push({targetId, amount: Math.round(base*power), ownerId})`. Always `ownerId`: it gives kill credit, weapon mastery (rank on expeditions) and trinket effects. Never also subtract HP yourself. Hit each foe once per swing/shot, or with a per-target cooldown (`hitAt: {id: time}`) for continuous contact.
- **Other queues**: `pendingBurn {targetId, dps, remaining}`, `pendingRoot {targetId, remaining}`. `pendingKnock` is dropped for magic weapons (no knockback by design); pulls in skills (`push < 0`) still work.
- **State**: plain numbers/strings/arrays only. Per-wielder state (combo count, charge, a physics head, a rolled look) goes **on the player** as `p.<name>`: players replicate and save whole. Per-attack state goes in an existing snapshotted list: `magicBolts`, `magicPuffs`, `magicCasts`, `magicSweeps`, `magicDarts`, `magicPins`, `magicRoots`, `magicSummons`, `magicWaves`, as `{id: world.nextId('x'), packId, ownerId, x, z, age, life, ...}`. A new list needs `SNAP_LISTS` in `src/magic/registry.mjs`; avoid it.
- **Events** for sound and one-shot visuals: `world.event(type, x, z, '', {player: p.id, itemId: PACK, ...})`. One per cast or big impact, never per particle. Events carrying `player` or `itemId` get `rank` (and your `look`) filled in before your painter sees them.
- **Balance**: judge total damage per cast (all hits, bursts, burns) per second of cooldown against a neighbour of the same rarity, using the lab's damage meter. Uncommon (green) and rare (blue) weapons get half damage and longer cooldowns on purpose, so a showpiece weapon is usually epic or legendary.

## 6. The skill

`SKILL_BOOK['<id>'] = {name, blurb, cooldown (11–16), reach, pose (seconds), cast(k)}`. `cast` runs once on the host and schedules beats with `k.beat(delay, spec)`; `k.dmg(m)` is m ordinary hits (level, rank and stamina included), `k.target(range)` picks the mark `{x, z, enemy}`, `k.foes(range)` lists foes nearest first, `k.scatter`/`k.turn` place things, `k.strength` is the stamina factor. Generic beat kinds (`blast`, `arc`, `line`, `wave`, `pulse`, `dash`, `blink`, `shots`, `bolt`, `summon`, `heal`) are already used everywhere, so lean on them for supporting hits only. The unique part should be a **`{kind: 'call', fn: '<name>', fx: '<name>'}` beat** whose `SKILL_CALLS[name](world, b, owner, obstacles, {hit, hostiles, dist})` drives your module's own mechanic (spawn a supercharged version of your state, change your player field, etc.) and returns extra fields for its `fx:<name>` event. Beats with `fx` fire an `'fx'` event (`fx:<name>` in painters) when they land; lasting beats (`wave`, `pulse`) and pending ones can be drawn every frame from `world.beats` via your `beats` painters.

## 7. The look: `src/fx/<id>.mjs`

Both renderers (Three.js and Canvas) draw the same command lists; nothing is per-renderer. Register one object in `WEAPON_FX` (`src/fx/index.mjs`):

```js
export const MY_FX = {
  id: PACK,
  events: {'<event type>' | 'fx:<skill fx>': {life: ev => secs, paint(d, ev, age, seed){}, kick: ev => ({shake, flash, color})}},
  beats: {'<skill fx>': {pending(d, b, tt, clock){}, lasting(d, b, t, clock, lead){}}},   // skill beats before/while they fire
  look: owner => ({look: owner?.myLook}),                  // optional: merged into its events and beats
  lists: {magicBolts: (d, entry, owner, ctx) => {}},       // your entries in world lists; ctx {lead, clock, time, world, rig(ownerId)}
  skillCast: (d, cast, owner, age) => {},                  // replaces the generic skill-cast burst
  magicCast: false,                                        // or (d, p, cast, age): replaces the generic auto-attack flourish
  rig: (d, world, p, anchor, motion, clock, time) => ({origin, keep}),  // drawn on the wielder every frame while equipped
};
```

- **Rig** = anything that hangs on the wielder while equipped (tails, a chain, an orbiting thing). It gets its own mesh sorted at `origin` (default: just behind the body; return `{x, y: 0, z}` of the object to sort it in front of or behind the body correctly). `anchor` is the rendered body position (smooth), `motion` its smoothed `{vx, vz}`. Whatever you return as `keep` reaches your list painters as `ctx.rig(ownerId)` (the kitsune launches foxfires from its tail tips this way). Clock-driven idle motion (sway, bob, breathing) is what makes the weapon feel alive.
- **Painter** (`d`), world units, y up: `orb(x,z,y,r,color,a,{glow,soft,ground})`, `path(points[[x,y,z]], width, color, a, {glow, soft, fill: true|'ribbon', taper})`, `bloom`, `pool`, `stain`, `ring`, `mark` (ink+colour+halo ring), `shock`, `star`, `twinkle`, `beam`, `rays`, `groundRays`, `sparks(x,z,y,n,t,…)`, `motes`, `debris`, `lightning`, `crescent`, `sigil`, `streak`, `light(x,z,r)` (lights the night). Helpers: `at(x,z,y,u,v)` (billboard offset: u right, v up on screen), `rnd(seed,i)`, `easeOut`, `bump`, `fade`, `tier(rank)`, `INK`.
- **Rank ladder** via `tier(rank)`: ★1 plain shape; ★2 `glow` + trails; ★3 sparks, rays, a second ring; ★4 sigils, pillars, debris, camera `shake`; ★5 prismatic `alt` colour, most particles, screen `flash` on the climax. Rank comes from `rankOf(owner, PACK)` (`src/progression.mjs`) in list painters; events and beats already carry `rank`.
- **Motion**: draw from replicated state only (`age`, positions, `ctx.lead` to extrapolate `x + vx*lead` between 20 Hz snapshots, `clock` for idle loops). No `Math.random()` (use `rnd(seed, i)`), no `Date.now()`, never mutate the world.

Lessons from the two reworks (each cost an iteration):

- Painted beats additive. Saturated fill over an ink outline reads on the pale ground; additive layers wash to white. Use `glow` only for halos and hot cores.
- Anything whose points all sit at `y ≤ .16` is routed to the ground lists (drawn under sprites). Keep an outline and its fill in the same list: lift both above `.16` or keep both on the ground.
- Flames and wisps **shrink** as they die; don't fade a translucent fill over ink (it turns brown).
- Smooth curves need about 20+ points; build ribbons with `fill: 'ribbon'` and widths that taper with `sin(π·t)`.
- A bright body needs 3 to 4 nested layers (ink grow, main, alt at .6, core at .3), plus a glow halo from ★2.
- Physics on the host: substeps, and keep speed through constraints (a naive projection bleeds energy every step). Draw it in the rig from replicated state, extrapolated with `lead` (the flail extrapolates its angle round the wielder and smooths only the radius).
- Melee-range weapons: foes crowd to 0.5–1.4 from the wielder. Make sure that band gets hit, and film with `--dist 2`.
- Budget: at ★5 with 20 foes, keep fx under about 0.6 ms per frame and 10k vertices (the kitsune measures 0.52 ms / 9.4k). Cull with `d.near(x, z)`, cap particles by tier.

## 8. Verify (fast)

Serve the repo root (`python3 -m http.server 8765` from the folder containing `hollowstead/`), open `http://localhost:8765/hollowstead/?lab`: any weapon, any rank, foes on demand, damage meter, **Free skills**.

Film it instead of screenshotting by hand (one tiled PNG, deterministic frames):

```sh
node hollowstead/tools/fx-film.mjs --weapon <id> --ranks 1,3,5 --perf
node hollowstead/tools/fx-film.mjs --weapon <id> --ranks 5 --skill --times .2,.6,1.1,1.8
# also: --dist 2 (pull foes close: melee), --move (walk right), --formation around|wall, --foes 12, --zoom 1.2, --size 460x380, --canvas (fallback renderer)
```

Look at the PNG, fix, re-film. Check: it hits (lab meter climbs), nothing lingers after foes die, no console errors (the tool prints them), ★1 vs ★5 clearly differ. Focused tests when asked: `node --test hollowstead/tests/magic.test.mjs` (known pre-existing failure: "all five items and the skeleton atlas").

## 9. Deliver

Report the id, how to get it (rarity/pool, or the lab), and what you verified. Follow the session's delivery rule (the user tests, commits and pushes; write files into their folder when asked). Add the weapon to §3.

## Symbol searches

```sh
rg -n 'MAGIC_AIM' hollowstead/src/engine.mjs
rg -n 'ITEM_RARITY|const POOLS' hollowstead/src/progression.mjs
rg -n 'HELD_GEAR|UNHELD' hollowstead/src/magic/art.mjs
rg -n "'kitsune-lantern'|SKILL_CALLS|foxring" hollowstead/src/skill-book.mjs
rg -n "type==='foxfire'" hollowstead/src/audio.mjs
```

Normal arsenal weapons (sword, bows, starfall...) use `WEAPON_STYLES` + `ARSENAL` (`src/arsenal.mjs`); new weapons should be magic modules unless they're a variant of an existing style.
