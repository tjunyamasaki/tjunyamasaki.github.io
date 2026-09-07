export const ITEM_IDS = Object.freeze([
  'wood', 'stone', 'fiber', 'copperOre', 'copperIngot', 'berry', 'carrot', 'carrotSeed',
  'potato', 'potatoSeed', 'moonflower', 'sapling',
]);

export const ITEM_META = Object.freeze({
  wood: { label: 'Wood', short: 'wood', category: 'materials' },
  stone: { label: 'Stone', short: 'stone', category: 'materials' },
  fiber: { label: 'Fiber', short: 'fiber', category: 'materials' },
  copperOre: { label: 'Copper ore', short: 'ore', category: 'materials' },
  copperIngot: { label: 'Copper ingot', short: 'ingot', category: 'materials' },
  berry: { label: 'Berries', short: 'berries', category: 'forage' },
  carrot: { label: 'Carrot', short: 'carrot', category: 'forage' },
  carrotSeed: { label: 'Carrot seeds', short: 'carrot seeds', category: 'plants' },
  potato: { label: 'Potato', short: 'potato', category: 'forage' },
  potatoSeed: { label: 'Potato seeds', short: 'potato seeds', category: 'plants' },
  moonflower: { label: 'Moonflower (legacy)', short: 'moonflower', category: 'forage' },
  sapling: { label: 'Saplings', short: 'saplings', category: 'plants' },
});

export const CATEGORIES = Object.freeze([
  { id: 'materials', label: 'Materials' },
  { id: 'forage', label: 'Forage' },
  { id: 'plants', label: 'Seeds & plants' },
  { id: 'tools', label: 'Tools' },
]);

export const TOOL_META = Object.freeze({
  stoneAxe: { label: 'Stone axe', role: 'axe', tier: 'stone' },
  copperAxe: { label: 'Copper axe', role: 'axe', tier: 'copper' },
  stonePick: { label: 'Stone pick', role: 'pick', tier: 'stone' },
  copperPick: { label: 'Copper pick', role: 'pick', tier: 'copper' },
  hoe: { label: 'Hoe', role: 'hoe', tier: 'basic' },
});

export const LEGACY_ITEM_MERGE = Object.freeze([
  Object.freeze(['turnip', 'carrot']),
  Object.freeze(['turnipSeed', 'carrotSeed']),
  Object.freeze(['moonflowerSeed', 'potatoSeed']),
]);

export function emptyInventory() {
  const bag = {};
  for (const id of ITEM_IDS) bag[id] = 0;
  return bag;
}

export function startingInventory() {
  return emptyInventory();
}

export function startingEquipment() {
  return {
    stoneAxe: true,
    stonePick: true,
    copperAxe: false,
    copperPick: false,
    hoe: false,
  };
}

export function formatYields(yields) {
  return Object.entries(yields || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${count} ${ITEM_META[id]?.short || id}`)
    .join(' + ');
}

export function formatLoot(yields) {
  return Object.entries(yields || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `+${count} ${ITEM_META[id]?.label || id}`)
    .join(', ');
}

export function formatActiveTime(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
