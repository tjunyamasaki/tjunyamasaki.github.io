import { emptyInventory, ITEM_IDS, startingEquipment, startingInventory } from '../data/items.mjs';

export function createInventory(counts = {}) {
  const bag = emptyInventory();
  for (const id of ITEM_IDS) {
    const value = Number(counts[id]);
    bag[id] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return bag;
}

export function grantStartingKit() {
  return {
    inventory: startingInventory(),
    equipment: startingEquipment(),
  };
}

export function addItems(inventory, yields) {
  const added = {};
  for (const [id, raw] of Object.entries(yields || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_IDS.includes(id) || amount <= 0) continue;
    inventory[id] = (inventory[id] || 0) + amount;
    added[id] = amount;
  }
  return added;
}

export function canPay(inventory, cost) {
  for (const [id, raw] of Object.entries(cost || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_IDS.includes(id) || amount <= 0) continue;
    if ((inventory[id] || 0) < amount) return false;
  }
  return true;
}

export function missingCost(inventory, cost) {
  const missing = {};
  for (const [id, raw] of Object.entries(cost || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_IDS.includes(id) || amount <= 0) continue;
    const have = inventory[id] || 0;
    if (have < amount) missing[id] = amount - have;
  }
  return missing;
}

export function payCost(inventory, cost) {
  if (!canPay(inventory, cost)) return false;
  for (const [id, raw] of Object.entries(cost || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_IDS.includes(id) || amount <= 0) continue;
    inventory[id] -= amount;
  }
  return true;
}

export function refundCost(inventory, cost) {
  return addItems(inventory, cost);
}

export function scaleCost(cost, count) {
  const times = Math.floor(Number(count));
  const scaled = {};
  if (!Number.isInteger(times) || times <= 0) return scaled;
  for (const [id, raw] of Object.entries(cost || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_IDS.includes(id) || amount <= 0) continue;
    scaled[id] = amount * times;
  }
  return scaled;
}

export function ownedToolTier(equipment, role) {
  if (role === 'axe') {
    if (equipment?.copperAxe) return 'copper';
    if (equipment?.stoneAxe) return 'stone';
    return null;
  }
  if (role === 'pick') {
    if (equipment?.copperPick) return 'copper';
    if (equipment?.stonePick) return 'stone';
    return null;
  }
  return null;
}

export function cloneEquipment(equipment) {
  return {
    stoneAxe: Boolean(equipment?.stoneAxe),
    stonePick: Boolean(equipment?.stonePick),
    copperAxe: Boolean(equipment?.copperAxe),
    copperPick: Boolean(equipment?.copperPick),
    hoe: Boolean(equipment?.hoe),
  };
}
