// Contextual actions and HUD mode transitions.
// Emits intent descriptions for the local player. Never reads a guest-supplied
// actor id and never mutates the world. The host rechecks every command.

import {EQUIPMENT, ITEMS, label} from '../content.mjs?v=harvest-7';
import {contextActionIds, dismantleRule} from '../interactions.mjs?v=harvest-7';

const SPECS = Object.freeze({
  feed: {icon: '▥', label: 'Feed', activation: 'tap'},
  cook: {icon: '◕', label: 'Cook', activation: 'tap'},
  awaken: {icon: '✦', label: 'Awaken', activation: 'tap'},
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
  revive: {icon: '♥', label: 'Revive', activation: 'hold'},
  pickup: {icon: '↑', label: 'Pick up', activation: 'hold'},
  place: {icon: '✓', label: 'Place', activation: 'tap'},
  cancel: {icon: '✕', label: 'Cancel', activation: 'tap'},
  dismantle: {icon: '⌫', label: 'Dismantle', activation: 'hold'},
});

const HARVEST_IDS = new Set(['chop', 'mine', 'gather']);

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

/** Keys that still exist. C, Q, and G are intentionally absent. */
export function keyboardAction(key) {
  const map = {
    i: 'inventory', b: 'build', m: 'map', f: 'lantern', e: 'primary',
    ' ': 'attack', shift: 'dodge', enter: 'confirm', escape: 'escape',
    '1': 'action-1', '2': 'action-2', '3': 'action-3', '4': 'action-4',
  };
  return map[key] || null;
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
  const equipped = light?.itemId === 'torch' && light.durability > 0 ? light : null;
  let carried = null;
  for (const stack of player.inventory?.slots || []) {
    if (stack?.itemId === 'torch' && stack.durability > 0) { carried = stack; break; }
  }
  if (!equipped && !carried) return null;
  const shown = equipped || carried;
  const max = EQUIPMENT.torch?.durability || 1;
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
  if (facts.kind === 'drop') {
    return [make('pickup', {targetId: facts.id, label: 'Pick up'})];
  }
  if (facts.kind === 'revive') {
    return [make('revive', {targetId: facts.id})];
  }
  if (facts.kind !== 'building') return [];
  const id = facts.id;
  const repair = repairAction(facts);
  const list = [];
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
    if (facts.type === 'hearth' && facts.level < 3) {
      list.push(make('awaken', {
        targetId: id,
        enabled: !!facts.canAwaken,
        disabledReason: 'Needs more offerings',
        command: buildingCommand('awaken', id),
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
    const night = facts.phase === 'night';
    const hungry = facts.hunger < 20;
    list.push(make('rest', {
      targetId: id,
      label: facts.resting ? 'Wake' : 'Rest',
      enabled: !!facts.resting || (!night && !hungry),
      disabledReason: night ? 'Too dangerous at night' : 'Eat before resting',
      command: buildingCommand('rest', id),
    }));
  }
  if (repair) list.push(repair);
  return list;
}

export function clusterFor(mode, {context = null, placement = null, maintenance = null} = {}) {
  if (mode === 'placement') return describePlacement(placement || {});
  if (mode === 'maintenance') return describeMaintenance(maintenance || {});
  if (mode !== 'normal') return [];
  return describeContext(context);
}

export function effectLine(itemId) {
  const item = ITEMS[itemId];
  if (!item) return '';
  const parts = [];
  if (item.food) parts.push(`Hunger +${item.food}`);
  if (item.heal) parts.push(`Health ${item.heal > 0 ? '+' : ''}${item.heal}`);
  if (item.courage) parts.push(`Courage ${item.courage > 0 ? '+' : ''}${item.courage}`);
  return parts.join(' · ');
}

export function itemDisplayName(itemId) {
  return label(itemId);
}
