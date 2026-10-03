// The refinement modifiers (src/refine.mjs rolls and applies them) and the modifier books that carry
// one each. Pure data with no imports, so content.mjs (names), contracts.mjs (item definitions),
// inventory.mjs (icons) and progression.mjs (rarities, loot) can all read it without a cycle.
//
// Each modifier is rolled with a rarity (the loot rarities; `weights` is the chance of each, common
// first) and the rarity picks its strength from `values`. `min` keeps it out of the lower rarities.
// `only` says what it goes on (default 'weapon'):
//   weapon  any weapon          shots   weapons that shoot (SHOTS in refine.mjs, magic ones too)
//   arrows  bows and staves     melee   swung weapons      armour  body armour      gear  both
// `needs` rolls it only beside another (Cruel beside Keen); a book can write it anywhere.
// `weight` favours a pick. `count` marks a whole number (Split) rather than a percentage.
// `book` names the book that carries it; `noun` is the [one, many] word {n} stands for in `text`.

export const REFINE = Object.freeze({
  slots: 3,
  weights: Object.freeze([46, 28, 16, 8, 2]),
  cost: Object.freeze({common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 8}),
  rerollCost: 2,
  crit: 1.5,        // a critical hit's multiplier before Cruel
  leechCap: 3,      // most health one hit can give back (Thirsting)
  splitShare: .5,   // damage of each extra whole shot (Split)
  mods: Object.freeze({
    // ---------------------------------------------------------------- numbers (any weapon)
    keen: {name: 'Keen', text: '+{v}% critical chance', values: [5, 8, 12, 18, 30], book: 'Book of Edges'},
    cruel: {name: 'Cruel', text: '+{v}% critical damage', values: [25, 35, 50, 70, 100], needs: 'keen', book: 'Book of Cruelty'},
    honed: {name: 'Honed', text: '+{v}% damage', values: [4, 6, 9, 13, 20], book: 'Book of the Whetstone'},
    swift: {name: 'Swift', text: '{v}% faster attacks', values: [4, 6, 9, 12, 18], book: 'Book of Haste'},
    fervent: {name: 'Fervent', text: 'Skill recharges {v}% faster', values: [6, 9, 12, 16, 24], book: 'Book of Fervour'},
    thirst: {name: 'Thirsting', text: '{v}% of damage dealt heals you', values: [1.5, 2, 3, 4, 6], book: 'Book of Thirst'},
    bane: {name: 'Bane', text: '+{v}% damage to elders, Wardens and great bosses', values: [10, 15, 25, 35, 50], book: 'Book of Bane'},
    tempered: {name: 'Tempered', text: '{v}% less wear', values: [15, 25, 35, 50, 70], only: 'gear', weight: .7, book: 'Book of Tempering'},
    reach: {name: 'Long', text: '+{v}% reach', values: [8, 12, 16, 22, 30], only: 'melee', book: 'Book of Reach'},
    split: {name: 'Split', text: '+{v} {shot}', values: [0, 0, 0, 1, 2], min: 3, only: 'shots', count: true, weight: 2, book: 'Book of Splitting'},
    // ---------------------------------------------------------------- shots that change (bows and staves)
    fork: {name: 'Forking', text: 'Shots fork on a hit: two more at {v}% damage', values: [35, 45, 55, 70, 90], min: 1, only: 'arrows', weight: 1.3, play: true, book: 'Book of Forking'},
    ricochet: {name: 'Ricochet', text: 'Shots bounce on to {v} more {n}', noun: ['foe', 'foes'], values: [1, 1, 2, 2, 3], only: 'arrows', count: true, weight: 1.3, play: true, book: 'Book of Ricochet'},
    shrapnel: {name: 'Shrapnel', text: 'Shots burst into {v} shards where they stop', values: [3, 4, 5, 6, 8], only: 'arrows', count: true, weight: 1.3, play: true, book: 'Book of Shrapnel'},
    returning: {name: 'Returning', text: 'Shots fly back to you, striking again at {v}% damage', values: [50, 60, 70, 85, 100], min: 1, only: 'arrows', weight: 1.3, play: true, book: 'Book of Returning'},
    seeking: {name: 'Seeking', text: 'Shots curve after foes and hit {v}% harder', values: [3, 5, 7, 10, 15], only: 'arrows', weight: 1.1, play: true, book: 'Book of Seeking'},
    // ---------------------------------------------------------------- swings that change (melee)
    crescent: {name: 'Crescent', text: 'Swings loose a cutting wave: {v}% damage to every foe it crosses', values: [30, 40, 50, 65, 85], only: 'melee', weight: 1.3, play: true, book: 'Book of the Crescent'},
    echo: {name: 'Echoing', text: 'Each swing comes again as a phantom: {v}% damage', values: [25, 35, 45, 60, 80], min: 1, only: 'melee', weight: 1.3, play: true, book: 'Book of Echoes'},
    quake: {name: 'Aftershock', text: 'Every third swing slams the ground: {v}% damage around your mark, and a stun', values: [60, 80, 100, 130, 180], only: 'melee', weight: 1.3, play: true, book: 'Book of Aftershocks'},
    // ---------------------------------------------------------------- hits and kills (any weapon)
    arc: {name: 'Arcing', text: '{v}% chance a hit leaps on as lightning to two more foes', values: [10, 14, 18, 24, 32], weight: 1.2, play: true, book: 'Book of Arcing'},
    shatter: {name: 'Shattering', text: 'Critical hits burst: {v}% of the hit to foes around', values: [25, 35, 50, 65, 90], needs: 'keen', weight: 1.2, play: true, book: 'Book of Shattering'},
    focus: {name: 'Relentless', text: 'Each hit in a row on one foe: +{v}% damage (up to 5)', values: [4, 6, 8, 10, 14], weight: 1.2, play: true, book: 'Book of the Relentless'},
    cull: {name: 'Culling', text: 'Foes left under {v}% health are cut down (elders: half)', values: [6, 8, 10, 12, 15], weight: 1.1, play: true, book: 'Book of Culling'},
    volatile: {name: 'Volatile', text: 'Foes you slay explode: {v}% of their health to foes near them', values: [15, 20, 25, 32, 45], weight: 1.2, play: true, book: 'Book of Embers'},
    haunt: {name: 'Haunting', text: 'Kills free a spirit that hunts another foe: {v}% weapon damage', values: [50, 70, 90, 120, 160], weight: 1.2, play: true, book: 'Book of Hauntings'},
    // ---------------------------------------------------------------- body armour
    vital: {name: 'Vital', text: '+{v} max health', values: [10, 15, 20, 30, 45], only: 'armour', count: true, book: 'Book of Vitality'},
    guard: {name: 'Bulwark', text: '{v}% less damage taken', values: [3, 5, 7, 10, 14], only: 'armour', book: 'Book of the Bulwark'},
    fleet: {name: 'Fleet', text: '{v}% faster on your feet', values: [3, 4, 6, 8, 12], only: 'armour', book: 'Book of Fleetness'},
    retort: {name: 'Retribution', text: 'When struck, loose a ring of {v} bone shards', values: [4, 5, 6, 8, 10], only: 'armour', count: true, weight: 1.3, play: true, book: 'Book of Retribution'},
    storm: {name: 'Stormskin', text: 'Lightning strikes a foe near you every {v} s', values: [6, 5, 4.5, 3.5, 2.5], only: 'armour', count: true, weight: 1.3, play: true, book: 'Book of Storms'},
    slip: {name: 'Slipstream', text: 'Dodging through foes cuts them: {v}% weapon damage', values: [100, 140, 180, 240, 320], only: 'armour', weight: 1.3, play: true, book: 'Book of the Slipstream'},
    wrath: {name: 'Vengeful', text: 'Being struck makes your blows {v}% stronger for 2.5 s', values: [20, 30, 40, 55, 75], only: 'armour', weight: 1.2, play: true, book: 'Book of Vengeance'},
    rally: {name: 'Second wind', text: 'Falling under a third of your health heals {v} (once a minute)', values: [15, 20, 30, 40, 60], only: 'armour', count: true, weight: 1.1, play: true, book: 'Book of Second Wind'},
  }),
});

// ------------------------------------------------------------------ modifier books
// One book per modifier and rarity: `book-<mod>-<tier>` (tier 0 common .. 4 legendary). A book writes
// its modifier, at its own rarity, into a refine slot at a workbench (refine.mjs) and is used up.
// The cover tells what it fits: blue-green for bows and staves, red for blades, violet for any
// weapon, iron for armour.
const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const COVER = {arrows: 'book-arrows', shots: 'book-arrows', melee: 'book-blade', armour: 'book-ward', gear: 'book-ward', weapon: 'book-arcane'};
export const bookId = (mod, tier) => `book-${mod}-${tier}`;
export const BOOKS = Object.freeze(Object.fromEntries(Object.entries(REFINE.mods).flatMap(([mod, spec]) =>
  RARITY_NAMES.map((rarity, tier) => tier < (spec.min || 0) ? null
    : [bookId(mod, tier), Object.freeze({mod, tier, rarity, name: spec.book || `Book of ${spec.name}`, icon: COVER[spec.only || 'weapon']})])
    .filter(Boolean))));
export const isBook = itemId => typeof itemId === 'string' && Object.hasOwn(BOOKS, itemId);
/** {mod, tier, rarity, name, icon} for a book, or null. */
export const bookOf = itemId => isBook(itemId) ? BOOKS[itemId] : null;
/** Book ids that exist at rarity `tier`, for the loot rolls. */
export const booksAt = tier => Object.keys(BOOKS).filter(id => BOOKS[id].tier === tier);
