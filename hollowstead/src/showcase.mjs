// Solo showcase sandbox. The spawn list is built from the live content tables.
import { ENEMIES, EQUIPMENT, ITEMS, NODES, RULES, STRUCTURES, label } from './content.mjs?v=harvest-14';
import { clearMagicLists, deleteMagicEntity, magicItems, magicMobById, magicMobEntries } from './magic/registry.mjs?v=harvest-14';

const PLACE_RANGE = 5.5;

export function showcaseCategories(){
  const materials = [];
  const food = [];
  const gear = [];
  for(const [id, item] of Object.entries(ITEMS)){
    const row = {id, name: item.name, kind: 'item'};
    if(item.food) food.push(row);
    else if(item.heal) gear.push(row);
    else materials.push(row);
  }
  for(const [id, item] of Object.entries(EQUIPMENT)){
    if(Object.hasOwn(magicItems, id)) continue;
    gear.push({id, name: item.name, kind: 'item'});
  }
  const magic = Object.values(magicItems).map(item => ({id: item.id, name: item.name, kind: 'item'}));
  const buildings = Object.entries(STRUCTURES).map(([id, spec]) => ({id, name: spec.name, kind: 'building'}));
  const nature = Object.entries(NODES).map(([id, spec]) => ({id, name: spec.name, kind: 'node'}));
  const mobs = Object.entries(ENEMIES).map(([id, spec]) => ({id, name: spec.name, kind: 'mob'}));
  for(const entry of magicMobEntries()){
    if(!mobs.some(mob => mob.id === entry.id)) mobs.push({id: entry.id, name: entry.name, kind: 'mob'});
  }
  return [
    {id: 'materials', label: 'Materials', entries: materials},
    {id: 'food', label: 'Food', entries: food},
    {id: 'gear', label: 'Gear', entries: gear},
    {id: 'magic', label: 'Magic', entries: magic},
    {id: 'buildings', label: 'Buildings', entries: buildings},
    {id: 'nature', label: 'Nature', entries: nature},
    {id: 'mobs', label: 'Mobs', entries: mobs},
  ];
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

export function showcaseMarkup({active = 'materials', tool = '', icon = () => ''} = {}){
  const categories = showcaseCategories();
  const current = categories.find(category => category.id === active) || categories[0];
  const chips = categories.map(category => `<button type="button" class="chip ${category.id === current.id ? 'active' : ''}" data-showcase-cat="${category.id}">${escapeHtml(category.label)}</button>`).join('');
  const rows = current.entries.length
    ? current.entries.map(entry => `<button type="button" data-showcase-spawn="${escapeHtml(entry.kind)}:${escapeHtml(entry.id)}">${current.id==='magic'?icon(entry.id):''}<span>${escapeHtml(entry.name)}</span></button>`).join('')
    : '<p class="muted small">Nothing in this list yet.</p>';
  const removing = tool === 'remove';
  return `<div class="showcase-head"><button type="button" data-showcase-tool="remove" aria-pressed="${removing ? 'true' : 'false'}">${removing ? 'Remove armed' : 'Remove'}</button><button type="button" data-showcase-tool="clear">Clear</button></div><div class="showcase-cats">${chips}</div><div class="showcase-list" role="list">${rows}</div><p class="muted small showcase-note">${removing ? 'Tap an object or creature to delete it.' : 'Items go into the pack. Tap the ground to place an armed object.'}</p>`;
}

function separation(kind, type){
  if(kind === 'node') return Math.max(0.45, NODES[type]?.radius || 0);
  if(kind === 'building') return Math.max(0.6, STRUCTURES[type]?.radius || 0);
  return 0.4;
}

export function showcasePlaceReason(world, player, kind, type, x, z){
  if(!world?.showcase || !player) return 'Showcase is closed';
  if(!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > RULES.radius - 2 || Math.abs(z) > RULES.radius - 2) return 'Outside the clearing';
  if(Math.hypot(x - player.x, z - player.z) > PLACE_RANGE) return 'Move closer to this spot';
  if(kind === 'mob') return ENEMIES[type] || magicMobById(type) ? '' : 'Unknown creature';
  if(kind === 'node' && !NODES[type]) return 'Unknown object';
  if(kind === 'building' && !STRUCTURES[type]) return 'Unknown structure';
  if(kind !== 'node' && kind !== 'building') return 'Unknown object';
  if(kind === 'building' && type === 'hearth' && world.buildings.some(building => building.type === 'hearth' && building.hp > 0)) return 'The Heartfire is already here';
  const radius = separation(kind, type);
  if(world.players.some(other => other.online && !other.ghost && Math.hypot(other.x - x, other.z - z) < radius + 0.4)) return 'A wanderer is standing here';
  if(world.buildings.some(building => Math.hypot(building.x - x, building.z - z) < Math.max(0.65, STRUCTURES[building.type]?.radius || 0) + radius + 0.1)) return 'Too close to another structure';
  if(world.nodes.some(node => !node.ready && Math.hypot(node.x - x, node.z - z) < separation('node', node.type) + radius)) return 'Too close to another object';
  return '';
}

export function placeShowcase(world, player, kind, type, x, z){
  const reason = showcasePlaceReason(world, player, kind, type, x, z);
  if(reason) return {ok: false, reason};
  if(kind === 'node'){
    const node = {id: world.nextId('n'), type, x, z, hits: NODES[type].hits, ready: 0, spawned: true};
    world.nodes.push(node);
    return {ok: true, entity: node};
  }
  if(kind === 'building'){
    const building = world.structure(type, x, z);
    building.spawned = true;
    world.buildings.push(building);
    return {ok: true, entity: building};
  }
  const magic = magicMobById(type);
  if(magic){
    const spawned = spawnMagicMob(world, magic, x, z, player);
    if(spawned) return {ok: true, entity: spawned};
  }
  if(!ENEMIES[type]) return {ok: false, reason: 'Unknown creature'};
  const count = world.enemies.length;
  world.spawnEnemy(type, x, z);
  const enemy = world.enemies[count] || null;
  if(enemy) enemy.spawned = true;
  return {ok: true, entity: enemy};
}

function spawnMagicMob(world, magic, x, z, player){
  const mod = magic.module;
  const before = world.enemies.length;
  const summonsBefore = Array.isArray(world.magicSummons) ? world.magicSummons.length : 0;
  if(typeof mod.spawn === 'function'){
    const made = mod.spawn(world, x, z, player);
    if(made && typeof made === 'object'){
      made.ally = made.ally !== false;
      made.spawned = true;
      if(Array.isArray(world.magicSummons) && world.magicSummons.includes(made)) return made;
      if(!world.enemies.includes(made)) world.enemies.push(made);
      return made;
    }
  }
  if(Array.isArray(world.magicSummons) && world.magicSummons.length > summonsBefore){
    const made = world.magicSummons[world.magicSummons.length - 1];
    made.ally = true;
    made.spawned = true;
    return made;
  }
  if(world.enemies.length > before){
    const made = world.enemies[world.enemies.length - 1];
    made.ally = true;
    made.spawned = true;
    return made;
  }
  const spec = magic.skeleton || {};
  const hp = Number(spec.hp) > 0 ? Number(spec.hp) : 36;
  const idle = spec.sprites && typeof spec.sprites.idle === 'string' ? spec.sprites.idle.replace(/\.png$/, '-0.png') : '';
  const summon = {
    id: world.nextId('sk'),
    ownerId: player?.id ?? null,
    type: magic.id,
    name: spec.name || magic.name,
    x, z, hp, maxHp: hp, age: 0,
    facing: 1, anim: 'idle', sprite: idle, action: 'idle',
    damage: Number(spec.damage) > 0 ? Number(spec.damage) : 6,
    range: 0.8, swinging: false, swingT: 0, didHit: false, nextSwing: 0,
    ally: true, spawned: true,
  };
  if(!Array.isArray(world.magicSummons)) world.magicSummons = [];
  world.magicSummons.push(summon);
  return summon;
}

export function grantShowcaseItem(world, player, itemId){
  const drops = world.drops.length;
  const accepted = world.give(player, itemId, 1);
  return {ok: accepted > 0 || world.drops.length > drops, accepted, dropped: world.drops.length > drops};
}

export function removeShowcaseTarget(world, entity){
  if(!world?.showcase || !entity || world.players?.includes(entity)) return false;
  let removed = false;
  const keep = list => {
    const next = list.filter(entry => entry !== entity && entry.id !== entity.id);
    if(next.length !== list.length) removed = true;
    return next;
  };
  world.nodes = keep(world.nodes);
  world.buildings = keep(world.buildings);
  world.enemies = keep(world.enemies);
  world.drops = keep(world.drops);
  if(deleteMagicEntity(world, entity)) removed = true;
  return removed;
}

export function clearShowcaseWorld(world){
  if(!world?.showcase) return;
  world.nodes = [];
  world.buildings = [];
  world.enemies = [];
  world.drops = [];
  world.harvestWork?.clear?.();
  world.reviveWork?.clear?.();
  world.dismantleHolds?.clear?.();
  world.chestSessions?.clear?.();
  clearMagicLists(world);
  for(const player of world.players||[]) delete player.magicCast;
}

export function showcaseSpawnName(kind, id){
  if(kind === 'item') return label(id);
  if(kind === 'node') return NODES[id]?.name || id;
  if(kind === 'building') return STRUCTURES[id]?.name || id;
  if(kind === 'mob') return ENEMIES[id]?.name || magicMobById(id)?.name || id;
  return id;
}
