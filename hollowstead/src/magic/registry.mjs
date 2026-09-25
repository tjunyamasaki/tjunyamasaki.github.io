// Mutable registry for magic weapons. Modules register at startup.
// The engine stays the authority for damage, knockback, burns, and roots.
import {GRAVECRAFT, gravecraftSprite, skeletonSprite} from './art.mjs?v=harvest-15';

export const magicItems = Object.create(null);
export const magicModules = [];
const allyTypes = new Set();
const listNames = new Set([
  'bolts', 'projectiles', 'sweeps', 'darts', 'magic', 'summons', 'skeletons',
  'magicBolts', 'magicPuffs', 'magicCasts', 'magicSweeps', 'magicDarts', 'magicPins', 'magicRoots', 'magicSummons', 'magicWaves',
]);
const SNAP_LISTS = [
  'magicBolts', 'magicPuffs', 'magicCasts', 'magicSweeps', 'magicDarts', 'magicPins', 'magicRoots', 'magicSummons', 'magicWaves',
];

export function magicItemId(pack){
  const item = pack?.item;
  if(!item || typeof item !== 'object') return null;
  const id = item.id || item.itemId;
  return typeof id === 'string' && id ? id : null;
}

export function registerMagicModule(mod){
  if(!mod?.magicPack || typeof mod.use !== 'function' || typeof mod.step !== 'function') return false;
  const id = magicItemId(mod.magicPack);
  if(!id || Object.hasOwn(magicItems, id)) return false;
  const item = mod.magicPack.item;
  const pack = mod.magicPack;
  magicItems[id] = Object.freeze({
    id,
    name: typeof item.name === 'string' && item.name ? item.name : id,
    icon: typeof item.icon === 'string' && item.icon ? item.icon : id,
    durability: numberOr(item.durability ?? item.maxDurability, 80),
    damage: numberOr(item.damage, 0),
    cooldown: numberOr(pack.cooldown ?? item.cooldown, 0.55),
    stamina: numberOr(pack.stamina ?? item.stamina ?? pack.staminaCost, 0),
    durabilityCost: numberOr(pack.durabilityCost ?? item.durabilityCost, 1),
    blurb: typeof pack.blurb === 'string' ? pack.blurb : (typeof item.blurb === 'string' ? item.blurb : ''),
  });
  magicModules.push(mod);
  for(const skeleton of magicSkeletonList(mod)){
    const type = skeleton.type || skeleton.id;
    if(typeof type === 'string' && type) allyTypes.add(type);
  }
  for(const name of pack.worldLists || []) if(typeof name === 'string' && name) listNames.add(name);
  return true;
}

export function magicModuleFor(itemId){
  if(typeof itemId !== 'string' || !Object.hasOwn(magicItems, itemId)) return null;
  return magicModules.find(mod => magicItemId(mod.magicPack) === itemId) || null;
}

export function magicAttackProfile(itemId){
  return Object.hasOwn(magicItems, itemId) ? magicItems[itemId] : null;
}

export function isMagicAlly(enemy){
  if(!enemy || enemy.hostile === true) return false;
  if(enemy.ally || enemy.friendly || enemy.summon || enemy.summoned || enemy.summonedBy) return true;
  if(enemy.team === 'player' || enemy.team === 'ally') return true;
  return allyTypes.has(enemy.type);
}

function magicSkeletonList(mod){
  const pack = mod?.magicPack || {};
  const listed = [];
  const one = mod?.skeleton || pack.skeleton || pack.summon;
  if(one && typeof one === 'object') listed.push(one);
  if(Array.isArray(pack.mobs)) listed.push(...pack.mobs.filter(entry => entry && typeof entry === 'object'));
  return listed;
}

export function magicMobEntries(){
  const rows = [];
  const seen = new Set();
  for(const mod of magicModules){
    for(const skeleton of magicSkeletonList(mod)){
      const id = skeleton.type || skeleton.id;
      if(typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      rows.push({id, name: skeleton.name || 'Raised skeleton', kind: 'mob', module: mod, skeleton});
    }
  }
  return rows;
}

export function magicMobById(id){
  return magicMobEntries().find(entry => entry.id === id) || null;
}

function numberOr(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function readPendingHit(enemy){
  const hit = enemy?.pendingHit;
  if(typeof hit === 'number') return hit;
  if(!hit || typeof hit !== 'object') return 0;
  return numberOr(hit.amount ?? hit.damage ?? hit.hp ?? hit.value, 0);
}

export function readPendingKnock(enemy){
  const knock = enemy?.pendingKnock;
  if(!knock || typeof knock !== 'object') return null;
  const dx = numberOr(knock.dx ?? knock.x, 0);
  const dz = numberOr(knock.dz ?? knock.z, 0);
  if(!dx && !dz) return null;
  return {dx, dz};
}

export function readPendingBurn(enemy){
  const burn = enemy?.pendingBurn;
  if(burn == null) return null;
  if(typeof burn === 'number') return {dps: 4, remaining: Math.max(0, burn)};
  if(typeof burn !== 'object') return null;
  const remaining = numberOr(burn.remaining ?? burn.seconds ?? burn.duration ?? burn.time, 0);
  let dps = numberOr(burn.dps ?? burn.damagePerSecond ?? burn.perSecond, NaN);
  if(!Number.isFinite(dps)){
    const total = numberOr(burn.damage ?? burn.amount, 0);
    dps = remaining > 0 ? total / remaining : 0;
  }
  if(!(remaining > 0) || !(dps > 0)) return null;
  return {dps, remaining};
}

const LIST_ROLE = {
  magicBolts: 'projectile', bolts: 'projectile', projectiles: 'projectile',
  magicPuffs: 'impact', magicCasts: 'cast', magicSweeps: 'sweep', sweeps: 'sweep',
  magicDarts: 'dart', darts: 'dart', magicPins: 'pin',
};

function packOf(entry){
  if(typeof entry?.packId === 'string') return entry.packId;
  if(typeof entry?.id === 'string' && entry.id.includes(':')) return entry.id.slice(0, entry.id.indexOf(':'));
  return '';
}

function roleKey(packId, role, frame){
  if(!packId) return role;
  if(role === 'sweep' && Number.isInteger(frame)) return `${packId}:sweep:${frame}`;
  return `${packId}:${role}`;
}

function presentMagic(entry, role){
  const copy = {...entry};
  const packId = packOf(entry);
  if((role === 'projectile' || role === 'dart') && (Number.isFinite(entry.vx) || Number.isFinite(entry.dx))){
    const vx = Number.isFinite(entry.vx) ? entry.vx : entry.dx;
    const vz = Number.isFinite(entry.vz) ? entry.vz : entry.dz;
    copy.aim = Math.atan2(vz || 0, vx || 0);
  }
  if(role === 'cast'){copy.action = 'attack'; if(Number.isFinite(entry.dx)) copy.aim = Math.atan2(entry.dz || 0, entry.dx || 0);}
  if(entry.facing === -1 || entry.facing === 1) copy.facing = entry.facing;
  if(role === 'sweep'){
    const frames = 4;
    const duration = entry.duration > 0 ? entry.duration : 0.35;
    const frame = Math.min(frames - 1, Math.max(0, Math.floor(((entry.age || 0) / duration) * frames)));
    copy.frame = frame;
    copy.aim = (Number.isFinite(entry.facing) ? entry.facing : 0) + Math.PI / 2;
    copy._key = roleKey(packId, 'sweep', frame);
    return copy;
  }
  if(role) copy._key = roleKey(packId, role);
  return copy;
}

function considerList(world, list, name, visit, seen){
  if(!Array.isArray(list)) return;
  const role = LIST_ROLE[name] || '';
  for(const entry of list){
    if(!entry || typeof entry !== 'object') continue;
    if(!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) continue;
    if(world.enemies?.includes(entry) || world.nodes?.includes(entry) || world.buildings?.includes(entry) || world.drops?.includes(entry) || world.players?.includes(entry)) continue;
    const shown = role ? presentMagic(entry, role) : entry;
    const id = entry.id || `${name}:${entry.x}:${entry.z}`;
    if(seen.has(id)) continue;
    seen.add(id);
    visit(shown, entry.type==='skeleton' ? 'gravecraft-skeleton' : shown._key || entry.sprite || entry.key || entry.type || name);
  }
}

export function forMagicLists(world, visit){
  if(!world) return;
  for(const name of listNames) if(Array.isArray(world[name])) visit(world[name], name);
  const bag = world.magic;
  if(bag && typeof bag === 'object' && !Array.isArray(bag)){
    for(const [name, value] of Object.entries(bag)){
      if(Array.isArray(value)) visit(value, name);
    }
  }
}

export function magicVisuals(world){
  const rows = [];
  const seen = new Set();
  const visit = (entry, key) => rows.push({entity: entry, key: typeof key === 'string' ? key : 'magic'});
  forMagicLists(world, (list, name) => considerList(world, list, name, visit, seen));
  for(const mod of magicModules){
    if(typeof mod.visuals !== 'function') continue;
    let extra = [];
    try{ extra = mod.visuals(world) || []; }catch{ extra = []; }
    for(const entry of extra){
      const entity = entry?.entity || entry;
      const key = entry?.sprite || entry?.key || entity?.sprite || entity?.type || 'magic';
      considerList(world, [entity], key, visit, seen);
    }
  }
  return rows;
}

export function deleteMagicEntity(world, entity){
  if(!world || !entity) return false;
  let removed = false;
  const drop = list => {
    if(!Array.isArray(list)) return;
    for(let i = list.length - 1; i >= 0; i--){
      const entry = list[i];
      if(entry === entity || (entity.id && entry?.id === entity.id)){list.splice(i, 1);removed = true;}
    }
  };
  forMagicLists(world, drop);
  return removed;
}

export function clearMagicLists(world){
  forMagicLists(world, list => { list.length = 0; });
}

export function magicClipName(entity, kind){
  if(kind === 'magic' || (kind === 'enemy' && isMagicAlly(entity))){
    if(entity?.action === 'attack' || entity?.anim === 'attack' || entity?.windup > 0) return 'attack';
    if(entity?.action === 'walk' || entity?.anim === 'walk') return 'walk';
    return 'idle';
  }
  return null;
}

export function equippedMagicKey(player){
  const id = player?.equipment?.weapon?.itemId;
  if(!Object.hasOwn(magicItems, id)) return null;
  return magicItems[id].icon;
}

function spriteHref(src, base){
  if(typeof src !== 'string' || !base) return src;
  if(src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) return src;
  const path = src.startsWith('assets/') ? `../../${src}` : src;
  return new URL(path, base).href;
}

function resolveSprite(def, base){
  const source = typeof def === 'string' ? {src: def} : def;
  const clips = source.clips && typeof source.clips === 'object' ? source.clips : {
    idle: {frames: [0], fps: 1},
    walk: {frames: source.walkFrames || [0], fps: 8},
    attack: {frames: source.attackFrames || [0], fps: 10},
  };
  return {
    src: spriteHref(source.src, base),
    size: Array.isArray(source.size) ? source.size : [1.6, 2.4],
    anchor: Array.isArray(source.anchor) ? source.anchor : [0.5, 0.08],
    columns: source.columns || 1,
    rows: source.rows || 1,
    clips,
  };
}

export function collectMagicSprites(){
  const out = [];
  const seen = new Set();
  const add = (key, def, base) => {
    const src = typeof def === 'string' ? def : def?.src;
    if(!key || seen.has(key) || typeof src !== 'string') return;
    seen.add(key);
    out.push([key, resolveSprite(def, base)]);
  };
  for(const mod of magicModules){
    const base = mod.moduleUrl;
    const pack = mod.magicPack || {};
    const itemId = magicItemId(pack);
    if(GRAVECRAFT[itemId]){
      add(itemId, gravecraftSprite(itemId), base);
      if(itemId==='barrow-rattle') add('gravecraft-skeleton', skeletonSprite, base);
      continue;
    }
    const groups = [pack.art, pack.sprites, mod.sprites, mod.art];
    for(const group of groups){
      if(!group || typeof group !== 'object') continue;
      if(typeof group.src === 'string' || typeof group === 'string'){
        add(itemId, group, base);
        continue;
      }
      for(const [key, def] of Object.entries(group)){
        if(key === 'item'){add(itemId, def, base);continue;}
        if(Array.isArray(def)){
          def.forEach((frame, index) => add(`${itemId}:${key}:${index}`, sweepFrame(frame), base));
          continue;
        }
        if(key !== itemId) add(key, key === 'use' ? stripOf(def) : def, base);
        add(`${itemId}:${key}`, key === 'use' ? stripOf(def) : def, base);
        if(typeof def === 'object' && !def.src && def.idle){
          for(const [clip, clipDef] of Object.entries(def)){
            if(clipDef && typeof clipDef === 'object' && clipDef.src) add(`${itemId}:${key}:${clip}`, clipDef, base);
          }
        }
      }
    }
    for(const mob of Array.isArray(pack.mobs) ? pack.mobs : []){
      const sprites = mob?.sprites;
      if(!sprites || typeof sprites !== 'object') continue;
      for(const src of Object.values(sprites)){
        if(typeof src !== 'string') continue;
        add(src, actorCell(src), base);
        const stem = src.replace(/\.png$/, '');
        for(let i = 0; i < 4; i++){
          const cell = `${stem}-${i}.png`;
          add(cell, actorCell(cell), base);
        }
      }
    }
  }
  return out;
}

function actorCell(src){
  return {src, columns: 1, rows: 1, size: [1.6, 2.4], anchor: [0.5, 0.08], clips: {idle: {frames: [0], fps: 1}, walk: {frames: [0], fps: 1}, attack: {frames: [0], fps: 1}}};
}

function stripOf(def){
  if(typeof def !== 'string') return def;
  return {src: def, columns: 4, rows: 1, size: [1.1, 1.65], anchor: [0.5, 0.04], clips: {idle: {frames: [0], fps: 1}, attack: {frames: [0, 1, 2, 3], fps: 12}}};
}

function sweepFrame(def){
  if(typeof def !== 'string') return def;
  return {src: def, columns: 1, rows: 1, size: [2.4, 5.5], anchor: [0.5, 0.02], clips: {idle: {frames: [0], fps: 1}}};
}

export function magicSnapshotFields(world){
  const extra = {};
  if(!world) return extra;
  for(const name of SNAP_LISTS){
    if(Array.isArray(world[name]) && world[name].length) extra[name] = world[name];
  }
  return extra;
}

export function restoreMagicFields(world, data){
  if(!world || !data) return;
  for(const name of SNAP_LISTS){
    if(Array.isArray(data[name])) world[name] = data[name];
  }
}

export function installMagicSprites(theme){
  if(!theme?.sprites) return;
  for(const [key, def] of collectMagicSprites()){
    if(!theme.sprites[key]) theme.sprites[key] = def;
  }
}
