// Contextual actions and HUD mode transitions.
// Emits intent descriptions for the local player. Never reads a guest-supplied
// actor id and never mutates the world. The host rechecks every command.

import {EQUIPMENT, ITEMS, label} from '../content.mjs?v=harvest-18';
import {magicItems} from '../magic/registry.mjs?v=harvest-18';
import {FRONTIER_LINES} from '../regions.mjs?v=harvest-18';
import {contextActionIds, dismantleRule} from '../interactions.mjs?v=harvest-18';
import {ARMOR_REDUCTION, rarityOf, weaponStyle} from '../progression.mjs?v=harvest-18';
import {TRINKET_TEXT} from '../trinkets.mjs?v=harvest-18';

const SPECS = Object.freeze({
  feed: {icon: '▥', label: 'Feed', activation: 'tap'},
  cook: {icon: '◕', label: 'Cook', activation: 'tap'},
  awaken: {icon: '✦', label: 'Awaken', activation: 'tap'},
  mend: {icon: '✺', label: 'Mend', activation: 'tap'},
  repair: {icon: '✚', label: 'Repair', activation: 'tap'},
  craft: {icon: '⚒', label: 'Craft', activation: 'tap'},
  build: {icon: '⌂', label: 'Build', activation: 'tap'},
  open: {icon: '▣', label: 'Open', activation: 'tap'},
  toggle: {icon: '⇄', label: 'Open', activation: 'tap'},
  rearm: {icon: '※', label: 'Rearm', activation: 'tap'},
  plant: {icon: '✿', label: 'Plant', activation: 'tap'},
  harvest: {icon: '◕', label: 'Harvest', activation: 'tap'},
  rest: {icon: '☾', label: 'Rest', activation: 'tap'},
  chop: {icon: '⚒', label: 'Chop', activation: 'hold'},
  mine: {icon: '⚒', label: 'Mine', activation: 'hold'},
  gather: {icon: '✦', label: 'Gather', activation: 'hold'},
  unlock: {icon: '✧', label: 'Open', activation: 'hold'},
  revive: {icon: '♥', label: 'Revive', activation: 'hold'},
  pickup: {icon: '↑', label: 'Pick up', activation: 'hold'},
  place: {icon: '✓', label: 'Place', activation: 'tap'},
  cancel: {icon: '✕', label: 'Cancel', activation: 'tap'},
  dismantle: {icon: '⌫', label: 'Dismantle', activation: 'hold'},
  pull: {icon: '⇢', label: 'Pull', activation: 'tap'},
  upgrade: {icon: '⇧', label: 'Upgrade', activation: 'tap'},
  refine: {icon: '◈', label: 'Refine', activation: 'tap'},
  descend: {icon: '⇩', label: 'Descend', activation: 'hold'},
  sip: {icon: '♨', label: 'Sip', activation: 'hold'},
  ascend: {icon: '⇧', label: 'Climb out', activation: 'tap'},
});

const HARVEST_IDS = new Set(['chop', 'mine', 'gather', 'unlock', 'descend', 'sip']);
/** Context buttons the action cluster can show at once (main.mjs CONTEXT_BUTTONS). */
const CONTEXT_SLOTS = 4;

function make(id, extra = {}) {
  const spec = SPECS[id];
  const enabled = extra.enabled !== false;
  return {
    id,
    icon: spec.icon,
    label: extra.label || spec.label,
    enabled,
    disabledReason: enabled ? '' : (extra.disabledReason || 'Not available'),
    activation: extra.activation || spec.activation,
    targetId: extra.targetId || '',
    command: extra.command || null,
    panel: extra.panel || null,
  };
}

function buildingCommand(id, targetId) {
  return {type: 'buildingAction', targetId, actionId: id};
}

/** Highest priority first. Panels other than inventory/catalog/chest still block the world. */
export function resolveMode({
  ended = false, disconnected = false, paused = false, down = false, ghost = false,
  panel = null, placement = false, maintenance = false,
} = {}) {
  if (ended) return 'end';
  if (disconnected) return 'disconnected';
  if (paused) return 'paused';
  if (down) return 'downed';
  if (ghost) return 'ghost';
  if (panel === 'inventory') return 'inventory';
  if (panel === 'catalog') return 'catalog';
  if (panel === 'chest') return 'chest';
  if (panel) return 'inventory';
  if (placement) return 'placement';
  if (maintenance) return 'maintenance';
  return 'normal';
}

export function allowsMovement(mode) {
  return mode === 'normal' || mode === 'placement' || mode === 'maintenance';
}

export function allowsCombat(mode) {
  return mode === 'normal';
}

export function showsLantern(mode) {
  return mode === 'normal' || mode === 'placement' || mode === 'maintenance';
}

/**
 * Escape closes the topmost temporary layer, then opens the menu.
 * Drop confirmation is part of item details.
 */
export function escapeStep({dragging = false, detailsOpen = false, panel = null, placing = false, maintaining = false} = {}) {
  if (dragging) return 'cancel-drag';
  if (detailsOpen) return 'close-details';
  if (panel) return 'close-panel';
  if (placing) return 'cancel-placement';
  if (maintaining) return 'cancel-maintenance';
  return 'open-menu';
}

/** R and Tab cycle weapons; H drinks a potion from the pack. */
export function keyboardAction(key) {
  const map = {
    i: 'inventory', b: 'build', m: 'map', f: 'lantern', e: 'primary',
    ' ': 'attack', q: 'skill', shift: 'dodge', enter: 'confirm', escape: 'escape',
    '1': 'action-1', '2': 'action-2', '3': 'action-3', '4': 'action-4',
    r: 'weapon-next', tab: 'weapon-next', h: 'potion',
  };
  return map[key] || null;
}

/** Potions stay in the pack; the hotbar uses the same revision-checked consume intent as inventory. */
export const POTIONS = Object.freeze(['elixir', 'greaterelixir']);
/**
 * Two draughts share the button: the plain one first, the greater one (cauldron, from a moonpetal)
 * when it is all you have or the wound is deep enough to want it.
 */
export function potionHotbar(player, {mode = 'normal', arena = false, pending = false} = {}) {
  const slots = player?.inventory?.slots || [];
  const of = id => slots.filter(stack => stack?.itemId === id && stack.quantity > 0);
  const plain = of('elixir'), greater = of('greaterelixir');
  const quantity = [...plain, ...greater].reduce((total, stack) => total + stack.quantity, 0);
  const missing = (player?.maxHp || 100) - (player?.hp ?? 100);
  const pick = greater.length && (!plain.length || missing > 90) ? greater : plain;
  const usable = quantity > 0 && !arena && !pending && !player?.down && !player?.ghost
    && ['normal', 'inventory', 'chest'].includes(mode);
  return {
    itemId: pick === greater && greater.length ? 'greaterelixir' : 'elixir', quantity,
    command: usable ? {type: 'consumeItem', uid: pick[0].uid, inventoryRevision: player.inventory.revision} : null,
  };
}

export function keyboardPrimary(actions, mode) {
  if (!actions?.length) return null;
  if (mode === 'placement') return actions.find(action => action.id === 'place') || null;
  if (mode === 'maintenance') {
    return actions.find(action => action.enabled && action.id === 'repair')
      || actions.find(action => action.enabled && action.id === 'cancel')
      || null;
  }
  return actions.find(action => action.id !== 'dismantle') || null;
}

export function isHarvestAction(id) {
  return HARVEST_IDS.has(id);
}

/** Usable fuel in the light socket or backpack. Chest contents are not consulted. */
export function usableLantern(player) {
  if (!player || player.down || player.ghost) return null;
  const light = player.equipment?.light;
  const lights = ['torch', 'everlantern', 'gravelight'];
  const equipped = lights.includes(light?.itemId) && light.durability > 0 ? light : null;
  let carried = null;
  for (const stack of player.inventory?.slots || []) {
    if (lights.includes(stack?.itemId) && stack.durability > 0) { carried = stack; break; }
  }
  if (!equipped && !carried) return null;
  const shown = equipped || carried;
  const max = EQUIPMENT[shown.itemId]?.durability || 1;
  return {
    equipped,
    carried,
    lit: !!(player.lantern && equipped),
    fuel: shown.durability / max,
  };
}

export function describePlacement({valid = false, pending = false, reason = ''} = {}) {
  return [
    make('place', {
      enabled: !!valid && !pending,
      disabledReason: reason || 'Cannot place that here',
    }),
    make('cancel', {enabled: !pending}),
  ];
}

export function describeMaintenance({building = null, locked = false, wood = 0, inRange = true} = {}) {
  const actions = [];
  if (building && inRange) {
    if (building.hp < building.maxHp) {
      actions.push(make('repair', {
        targetId: building.id,
        enabled: wood >= 1,
        disabledReason: 'Needs 1 wood',
        command: buildingCommand('repair', building.id),
      }));
    }
    if (dismantleRule(building.type, locked).ok) {
      actions.push(make('dismantle', {
        targetId: building.id,
        command: {type: 'dismantle', target: building.id, hold: true},
      }));
    }
  }
  actions.push(make('cancel'));
  return actions;
}

function repairAction(facts) {
  if (!(facts.hp < facts.maxHp)) return null;
  return make('repair', {
    targetId: facts.id,
    enabled: facts.wood >= 1,
    disabledReason: 'Needs 1 wood',
    command: buildingCommand('repair', facts.id),
  });
}

/**
 * Direct controls for the current explicit or nearest target.
 * `facts` is a plain observation. Missing facts produce no buttons.
 */
export function describeContext(facts) {
  if (!facts?.id || !facts.kind) return [];
  if (facts.kind === 'node') {
    const id = contextActionIds(facts.type)[0];
    if (!id) return [];
    const enabled = !facts.required || !!facts.toolReady;
    return [make(id, {
      targetId: facts.id,
      enabled,
      disabledReason: facts.toolLabel ? `Needs a ${facts.toolLabel}` : 'Needs a tool',
    })];
  }
  if (facts.kind === 'crop') {
    // A ripe homestead crop in reach (homestead.mjs cropTargets).
    return [make('harvest', {targetId: facts.id, command: {type: 'tile', tool: 'harvest', cells: [[facts.i, facts.j]]}})];
  }
  if (facts.kind === 'drop') return [];
  if (facts.kind === 'revive') {
    return [make('revive', {targetId: facts.id})];
  }
  if (facts.kind !== 'building') return [];
  const id = facts.id;
  const repair = repairAction(facts);
  const list = [];
  if (facts.type === 'fire' && facts.delve) {
    // A delve's camp fire (delve.mjs): the way back up for the whole party.
    list.push(make('ascend', {targetId: id, command: buildingCommand('ascend', id)}));
  }
  if (facts.type === 'hearth' || facts.type === 'fire') {
    const fed = !(facts.fuel > 320);
    list.push(make('feed', {
      targetId: id,
      enabled: fed && facts.wood >= 1,
      disabledReason: fed ? 'Needs 1 wood' : 'The fire has plenty of fuel',
      command: buildingCommand('feed', id),
    }));
    list.push(make('cook', {
      targetId: id,
      command: buildingCommand('cook', id),
      panel: {tab: 'craft', stationType: facts.type, stationId: id},
    }));
    if (facts.type === 'hearth' && facts.level < (facts.maxLevel || 3)) {
      list.push(make('awaken', {
        targetId: id,
        enabled: !!facts.canAwaken,
        disabledReason: 'Needs more offerings',
        command: buildingCommand('awaken', id),
      }));
    }
    // Mend the weapon in hand with a soul ember (mastery.mjs mendPlan); shown only when it is worn.
    if (facts.type === 'hearth' && facts.mend?.itemId) {
      list.push(make('mend', {
        targetId: id,
        label: `Mend +${Math.max(1, Math.round((facts.mend.boost || 0) * 100))}%`,
        enabled: !!facts.mend.ok,
        disabledReason: facts.mend.reason || 'Needs 1 soul ember',
        command: buildingCommand('mend', id),
      }));
    }
  } else if (facts.type === 'bench') {
    list.push(make('craft', {
      targetId: id,
      command: buildingCommand('craft', id),
      panel: {tab: 'craft', stationType: 'bench', stationId: id},
    }));
    list.push(make('build', {
      targetId: id,
      command: buildingCommand('build', id),
      panel: {tab: 'build', stationType: 'bench', stationId: id},
    }));
    // Weapon refinement (src/refine.mjs): opens its own panel rather than the recipe catalog.
    list.push(make('refine', {
      targetId: id,
      command: buildingCommand('refine', id),
      panel: {sheet: 'refine', stationType: 'bench', stationId: id},
    }));
  } else if (facts.type === 'pot') {
    list.push(make('cook', {
      targetId: id,
      command: buildingCommand('cook', id),
      panel: {tab: 'craft', stationType: 'pot', stationId: id},
    }));
  } else if (facts.type === 'chest') {
    list.push(make('open', {
      targetId: id,
      enabled: !facts.busy,
      disabledReason: 'Chest in use',
    }));
  } else if (facts.type === 'cart') {
    // Hand cart (cart.mjs cartFacts): take or drop the handle, open it like a chest, upgrade beside a workbench.
    list.push(make('pull', {
      targetId: id,
      label: facts.towing ? 'Let go' : 'Pull',
      enabled: !!facts.towing || !facts.towedByOther,
      disabledReason: 'Someone else is pulling it',
      command: {type: 'cart', op: facts.towing ? 'release' : 'pull', cartId: id},
    }));
    list.push(make('open', {
      targetId: id,
      enabled: !facts.busy,
      disabledReason: 'Someone has it open',
    }));
    if (facts.level < facts.maxLevel) {
      list.push(make('upgrade', {
        targetId: id,
        enabled: !!facts.canUpgrade,
        disabledReason: facts.upgradeReason || 'Needs more materials',
        command: {type: 'cart', op: 'upgrade', cartId: id},
      }));
    }
  } else if (facts.type === 'gate') {
    list.push(make('toggle', {
      targetId: id,
      label: facts.open ? 'Close' : 'Open',
      command: buildingCommand('toggle', id),
    }));
  } else if (facts.type === 'trap') {
    if (facts.charges < 3) {
      list.push(make('rearm', {
        targetId: id,
        enabled: facts.stone >= 1,
        disabledReason: 'Needs 1 flint',
        command: buildingCommand('rearm', id),
      }));
    }
  } else if (facts.type === 'farm') {
    if (!facts.planted) {
      list.push(make('plant', {
        targetId: id,
        enabled: facts.seeds >= 1,
        disabledReason: 'Needs 1 pumpkin seed',
        command: buildingCommand('plant', id),
      }));
    } else if (facts.growth >= 100) {
      list.push(make('harvest', {targetId: id, command: buildingCommand('harvest', id)}));
    }
  } else if (facts.type === 'bed') {
    // After dark a bed inside a closed room sleeps the night away (sleep.mjs); in the open it is too dangerous.
    const dark = facts.phase && facts.phase !== 'day';
    const hungry = facts.hunger < 20;
    if (dark) list.push(make('rest', {
      targetId: id,
      label: facts.sleeping ? 'Get up' : 'Sleep',
      enabled: !!facts.sleeping || !!facts.inRoom,
      disabledReason: 'Build a room around the bed',
      command: buildingCommand('rest', id),
    }));
    else list.push(make('rest', {
      targetId: id,
      label: facts.resting ? 'Wake' : 'Rest',
      enabled: !!facts.resting || !hungry,
      disabledReason: 'Eat before resting',
      command: buildingCommand('rest', id),
    }));
  }
  if (repair) list.push(repair);
  // The cluster has four buttons: when a building offers more, greyed-out ones give way first.
  for (let i = 1; i < list.length && list.length > CONTEXT_SLOTS;) {
    if (list[i].enabled) i++;
    else list.splice(i, 1);
  }
  return list.slice(0, CONTEXT_SLOTS);
}

export function clusterFor(mode, {context = null, placement = null, maintenance = null} = {}) {
  if (mode === 'placement') return describePlacement(placement || {});
  if (mode === 'maintenance') return describeMaintenance(maintenance || {});
  if (mode !== 'normal') return [];
  return describeContext(context);
}

const STYLE_WORD = {melee: 'Melee', arrow: 'Arrows', bolt: 'Bursting bolts', nova: 'Fire nova'};

export function effectLine(itemId) {
  const rarity = rarityOf(itemId);
  const tag = rarity === 'common' ? '' : `${rarity[0].toUpperCase()}${rarity.slice(1)} · `;
  const magic = magicItems[itemId];
  if (magic) return tag + (magic.blurb || (magic.damage ? `${magic.damage} damage` : 'Magic weapon'));
  if (Object.hasOwn(FRONTIER_LINES, itemId)) return tag + FRONTIER_LINES[itemId];
  const gear = EQUIPMENT[itemId];
  if (gear) {
    const style = weaponStyle(itemId);
    if (TRINKET_TEXT[itemId]) return `${tag}${TRINKET_TEXT[itemId]}`;
    if (gear.damage && style?.blurb) return `${tag}${gear.damage} damage · ${style.blurb}`;
    if (gear.damage) return `${tag}${gear.damage} damage · ${STYLE_WORD[style?.style] || 'Melee'}${style?.arc ? ' · cleaves' : ''}${style?.pierce ? ' · pierces' : ''}`;
    if (ARMOR_REDUCTION[itemId]) return `${tag}Absorbs ${Math.round(ARMOR_REDUCTION[itemId] * 100)}% damage`;
    if (itemId === 'everlantern') return `${tag}Never runs out · wider light`;
    return tag.replace(/ · $/, '');
  }
  const item = ITEMS[itemId];
  if (!item) return '';
  if (item.boost === 'vigor') return `${tag}Use: +15 max health, forever`;
  const parts = [];
  if (item.food) parts.push(`Hunger +${item.food}`);
  if (item.heal) parts.push(`Health ${item.heal > 0 ? '+' : ''}${item.heal}`);
  if (item.courage) parts.push(`Courage ${item.courage > 0 ? '+' : ''}${item.courage}`);
  return tag + parts.join(' · ');
}

export function itemDisplayName(itemId) {
  return label(itemId);
}
