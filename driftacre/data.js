// Driftacre — game data. Balance lives here so it is easy to tune.

export const DAY_LENGTH = 480; // seconds for a full day + night cycle

// time = seconds to ripen, verd = island-heart growth per harvest
export const CROPS = [
  { id: 'sunwheat', name: 'Sunwheat', lvl: 1, cost: 1, time: 15, sell: 3, xp: 1, verd: 1, color: '#f4c84a',
    desc: 'Golden stalks that drink the morning. Quick and cheerful.' },
  { id: 'cotton', name: 'Cloud Cotton', lvl: 2, cost: 4, time: 40, sell: 10, xp: 2, verd: 2, color: '#f4f6ff',
    desc: 'Fluffy puffs that grow from fallen cloud.' },
  { id: 'moonberry', name: 'Moonberry', lvl: 3, cost: 10, time: 75, sell: 24, xp: 4, verd: 3, color: '#5b74f0', night: 1.6,
    desc: 'Grows 60% faster at night.' },
  { id: 'gourd', name: 'Lantern Gourd', lvl: 4, cost: 22, time: 150, sell: 55, xp: 8, verd: 5, color: '#f28c28',
    desc: 'A pumpkin with a little star glowing inside.' },
  { id: 'pepper', name: 'Comet Pepper', lvl: 5, cost: 30, time: 100, sell: 62, xp: 7, verd: 4, color: '#e8434b',
    desc: 'So spicy it leaves a tail. Pricey seed, quick turn.' },
  { id: 'dreamcap', name: 'Dreamcap', lvl: 7, cost: 60, time: 300, sell: 150, xp: 15, verd: 8, color: '#a564e8', night: 2, day: 0.6,
    desc: 'Sleepy mushrooms. Twice as fast at night, slow by day.' },
  { id: 'tulip', name: 'Crystal Tulip', lvl: 9, cost: 120, time: 480, sell: 300, xp: 25, verd: 12, color: '#5fe3f2',
    desc: 'Petals of singing glass.' },
  { id: 'melon', name: 'Sky Melon', lvl: 11, cost: 250, time: 900, sell: 650, xp: 45, verd: 20, color: '#6ccf55',
    desc: 'So light it floats on its vine like a balloon.' },
  { id: 'wishflower', name: 'Wishflower', lvl: 13, cost: 400, time: 1500, sell: 900, xp: 70, verd: 30, color: '#fff7e0', wisp: 1,
    desc: 'Each puff carries a wish. Gives 1 wisp per harvest.' },
  { id: 'drakefruit', name: 'Drakefruit', lvl: 16, cost: 1200, time: 3600, sell: 3200, xp: 160, verd: 60, color: '#ff6a2a',
    desc: 'Warm as a sleeping dragon. Worth the wait.' },
];
export const CROP = Object.fromEntries(CROPS.map(c => [c.id, c]));

// kind: building (functional) or decor (adds coziness). scale = cost multiplier per copy owned.
export const BUILDINGS = [
  { id: 'hut', name: 'Sprout Hut', kind: 'building', lvl: 2, cost: 40, scale: 2.0, max: 8,
    desc: 'Home for one Sproutling. Sproutlings harvest, replant and tend crops for you — even while you are away.' },
  { id: 'drizzle', name: 'Drizzle Cloud', kind: 'building', lvl: 3, cost: 80, scale: 1.55, radius: 1,
    desc: 'Crops in the 8 tiles around it grow 40% faster.' },
  { id: 'hive', name: 'Beehive', kind: 'building', lvl: 4, cost: 150, scale: 1.6, radius: 1,
    desc: 'Crops in the 8 tiles around it have a 25% chance to give a double harvest.' },
  { id: 'windmill', name: 'Windmill', kind: 'building', lvl: 5, cost: 300, scale: 1.8,
    desc: 'All crops sell for 8% more (stacks).' },
  { id: 'well', name: 'Wishing Well', kind: 'building', lvl: 6, cost: 500, scale: 2.2,
    desc: 'Coins trickle in on their own. Bigger islands make richer wells.' },
  { id: 'lantern', name: 'Moon Lantern', kind: 'building', lvl: 7, cost: 600, scale: 1.7, radius: 2,
    desc: 'Crops within 2 tiles feel like it is always night.' },
  { id: 'shrine', name: 'Star Shrine', kind: 'building', lvl: 10, cost: 2000, scale: 2.5, wisps: 5,
    desc: '+10% XP and island-heart growth (stacks).' },
  { id: 'flowers', name: 'Flower Bed', kind: 'decor', lvl: 1, cost: 15, scale: 1.08, cozy: 1, desc: 'Cozy +1.' },
  { id: 'shrooms', name: 'Toadstool Ring', kind: 'decor', lvl: 2, cost: 30, scale: 1.08, cozy: 1, desc: 'Cozy +1.' },
  { id: 'pond', name: 'Lily Pond', kind: 'decor', lvl: 3, cost: 120, scale: 1.12, cozy: 3, flat: true, desc: 'Cozy +3.' },
  { id: 'stonelamp', name: 'Stone Lamp', kind: 'decor', lvl: 4, cost: 60, scale: 1.1, cozy: 2, desc: 'Cozy +2. Glows at night.' },
  { id: 'bench', name: 'Picnic Bench', kind: 'decor', lvl: 5, cost: 80, scale: 1.1, cozy: 2, desc: 'Cozy +2.' },
  { id: 'tree', name: 'Bloomwood Tree', kind: 'decor', lvl: 6, cost: 150, scale: 1.12, cozy: 3, desc: 'Cozy +3. Drops petals.' },
  { id: 'arch', name: 'Fairy Arch', kind: 'decor', lvl: 8, cost: 0, wisps: 8, scale: 1.25, cozy: 6, desc: 'Cozy +6. Strung with tiny lights.' },
  { id: 'fountain', name: 'Crystal Fountain', kind: 'decor', lvl: 12, cost: 0, wisps: 20, scale: 1.3, cozy: 10, desc: 'Cozy +10.' },
];
export const BUILDING = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

export const xpForLevel = lvl => Math.floor(10 * Math.pow(1.55, lvl - 1));
export const landNeed = n => Math.floor(6 + 5 * n + 0.9 * Math.pow(n, 1.65));

export const TRAVELERS = [
  'Pip the Cloudherd', 'Old Moss', 'Captain Nimbus', 'Wren of the Lantern Isles', 'Bramble & Bun',
  'Auntie Drizzle', 'Sir Puddlefoot', 'The Kite Courier', 'Marigold the Baker', 'Hush, a lost star',
  'Tumbleweed Twins', 'Professor Fernwhistle',
];
export const WISH_LINES = [
  'is baking for a festival', 'wants to fill a picnic basket', 'is restocking an airship galley',
  'promised a friend a present', 'is brewing something mysterious', 'needs supplies for a long flight',
  'is decorating a cloud cottage', 'is writing a cookbook',
];

// Visual styles. Colors here drive terrain, sky and UI; sprites are recolored through tints in sprites.js.
export const STYLES = [
  {
    id: 'peach', name: 'Peach Dawn', sub: 'Storybook pastel', font: "'Fredoka', system-ui, sans-serif",
    res: 4, pixel: 1, outline: { color: '#5a3b3e', w: 1.1 }, toon: 3,
    grass: ['#9ad66b', '#86c75e', '#b4e37f'], soil: ['#9b6a4e', '#7e533d', '#b98663'],
    dirt: '#b07a55', rock: '#7d5a6b', side: ['#c48a60', '#a06e4f'],
    sky: { dayTop: '#8fc6ff', dayHor: '#ffe1c9', nightTop: '#1c1d48', nightHor: '#6c4b82', duskHor: '#ff9e8a', duskTop: '#7c84d6' },
    cloud: '#fff6ef', cloudShade: '#f3c9c9', sun: '#fff1d8', hemiGround: '#d9a38b',
    ui: { panel: 'rgba(255,248,240,.92)', ink: '#5a3b3e', soft: '#9b7676', accent: '#ff8a7a', accent2: '#7cc8a0', line: 'rgba(90,59,62,.14)', glass: 'rgba(255,248,240,.72)' },
    ambient: 'petals', overlay: 'bloom',
  },
  {
    id: 'bitmoss', name: 'Bitmoss', sub: 'Crunchy 16-bit pixels', font: "'Pixelify Sans', monospace",
    res: 1, pixel: 3, outline: { color: '#181425', w: 1 }, toon: 2,
    grass: ['#63c74d', '#3e8948', '#8fd65e'], soil: ['#733e39', '#3e2731', '#b86f50'],
    dirt: '#b86f50', rock: '#3a4466', side: ['#b86f50', '#733e39'],
    sky: { dayTop: '#0099db', dayHor: '#2ce8f5', nightTop: '#181425', nightHor: '#262b44', duskHor: '#f77622', duskTop: '#68386c' },
    cloud: '#ffffff', cloudShade: '#c0cbdc', sun: '#fee761', hemiGround: '#733e39',
    ui: { panel: 'rgba(38,43,68,.95)', ink: '#ffffff', soft: '#8b9bb4', accent: '#feae34', accent2: '#63c74d', line: 'rgba(255,255,255,.14)', glass: 'rgba(24,20,37,.7)' },
    ambient: 'pixels', overlay: 'scan',
  },
  {
    id: 'moonpetal', name: 'Moonpetal', sub: 'Glowing twilight garden', font: "'Comfortaa', system-ui, sans-serif",
    res: 4, pixel: 1, outline: { color: '#120f2e', w: 1.1 }, toon: 3, glowy: true,
    grass: ['#3f7d7a', '#346a6e', '#4f9488'], soil: ['#4a3557', '#382744', '#5e4670'],
    dirt: '#4b3a6a', rock: '#211c46', side: ['#55407a', '#3a2c5c'],
    sky: { dayTop: '#3a3f9e', dayHor: '#c88fd6', nightTop: '#090a24', nightHor: '#2d2363', duskHor: '#ff8fb8', duskTop: '#4b3a8f' },
    cloud: '#b7a6e8', cloudShade: '#6e5aa8', sun: '#ffd6f2', hemiGround: '#3a2c5c',
    ui: { panel: 'rgba(24,20,56,.9)', ink: '#f2e9ff', soft: '#a99ad6', accent: '#ff9ed1', accent2: '#7ff0d6', line: 'rgba(242,233,255,.14)', glass: 'rgba(24,20,56,.66)' },
    ambient: 'fireflies', overlay: 'vignette',
  },
  {
    id: 'inkwash', name: 'Inkwash', sub: 'Paper, ink & a dab of red', font: "'Shippori Mincho', Georgia, serif",
    res: 4, pixel: 1, outline: { color: '#1d1a17', w: 1.7 }, toon: 2,
    grass: ['#b9c29a', '#a3ad86', '#cdd3b0'], soil: ['#8f7f6c', '#76685a', '#a89683'],
    dirt: '#b5a58e', rock: '#5d5850', side: ['#c2b49c', '#9d8f7a'],
    sky: { dayTop: '#e4dccb', dayHor: '#f4eee0', nightTop: '#3b3a3f', nightHor: '#8a8478', duskHor: '#e8b9a0', duskTop: '#bdb3a2' },
    cloud: '#f7f2e6', cloudShade: '#b6ad9c', sun: '#d9483b', hemiGround: '#9d8f7a',
    ui: { panel: 'rgba(246,240,226,.95)', ink: '#1d1a17', soft: '#7b7367', accent: '#c8392b', accent2: '#4d6b4a', line: 'rgba(29,26,23,.18)', glass: 'rgba(246,240,226,.75)' },
    ambient: 'ink', overlay: 'paper',
  },
];
export const STYLE = Object.fromEntries(STYLES.map(s => [s.id, s]));
