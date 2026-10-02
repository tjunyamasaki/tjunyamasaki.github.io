// The delve: a dungeon below the hollow, opened by the Sunken Stair (a landmark worldgen.mjs puts
// somewhere in the outer ring). The whole party goes down together; while they are below, the hollow
// holds its breath: its clock stops (content.mjs hollowTime), its camp, creatures and loose loot wait
// in `world.surface`, and nothing up there moves. The floors are dungeon floors (src/dungeon/run.mjs),
// carved fresh every delve, with your own gear and weapon wear. The last floor's warden is The
// Unblinking (bosses.mjs). Take its stairs and you climb back out under the same sky you left.
// A wiped party is thrown back up the stair; the camp fire below can take you up any time.
//
// world.surface   the hollow while the party is below (saved; guests get only {stair})
// world.delves    how many delves this world has seen (picks the next run's floors)

import {NODES, RULES} from './content.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';
import {maxHealth} from './progression.mjs?v=harvest-18';
import {setupDungeon} from './dungeon/run.mjs?v=harvest-18';
import {threatOf} from './vigil.mjs?v=harvest-18';

export const DELVE = Object.freeze({
  floors: 5,          // floors in a delve; the last one's warden is the finale
  finale: 'unblinking',
  gather: 6.5,        // everyone standing must be this close to the stair to go down
  wipe: 4,            // seconds of a wiped party before the deep spits it back out
  depthStep: 1.25,    // each floor adds this much to the threat the party brought down
  xp: 120,            // per wanderer for climbing out after the finale (times the threat, softened)
});

export const inDelve = world => !!(world?.dungeon && world.surface);

/** A wanderer held Descend at the Sunken Stair. */
export function tryDescend(world, node, p){
  if(world.dungeon || world.arena || world.showcase) return;
  const standing = world.players.filter(q => q.online && !q.down && !q.ghost);
  const near = standing.filter(q => Math.hypot(q.x-node.x, q.z-node.z) < DELVE.gather);
  if(near.length < standing.length){world.tell(p, `Gather everyone at the stair first · ${near.length}/${standing.length}`); return;}
  enterDelve(world, node);
}

/** Down the stair: the hollow is set aside and the first floor carved. */
export function enterDelve(world, node){
  const threat = Math.max(1, threatOf(world));
  for(const b of world.buildings) if(b.towedBy) b.towedBy = null;
  world.surface = {
    stair: {id: node.id, x: node.x, z: node.z},
    buildings: world.buildings, enemies: world.enemies.filter(e => !isMagicAlly(e)), drops: world.drops,
    explored: world.explored, radius: world.radius, zones: world.zones, beats: world.beats,
    nodeChanges: world.nodes.filter(n => n.ready || n.hits !== NODES[n.type]?.hits).map(n => ({id: n.id, hits: n.hits, ready: n.ready})),
    enteredAt: world.time,
  };
  world.delves = (world.delves || 0)+1;
  world.zones = []; world.beats = [];
  world.chestSessions?.clear?.();
  setupDungeon(world, {runSeed: (world.seed ^ Math.imul(world.delves, 0x9e3779b1)) >>> 0, depth: 1, wear: true, kit: false, floors: DELVE.floors});
  world.dungeon.base = threat; world.dungeon.finale = DELVE.finale; world.dungeon.delve = true;
  world.event('descend', 0, 0, '', {depth: 1});
  world.event('announce', 0, 0, 'Down the Sunken Stair. Above you, the hollow holds its breath.');
}

/** Back up the stair. `won`: the finale fell and the party took its stairs. */
export function exitDelve(world, won = false){
  const s = world.surface; if(!s) return;
  const depth = world.dungeon?.depth || 1;
  world.dungeon = null; world.surface = null;
  world.ambient = true; world.radius = RULES.radius;
  world.rebuildNodes(s.nodeChanges || []);
  world.buildings = s.buildings || [];
  world.enemies = [...(s.enemies || []), ...world.enemies.filter(e => isMagicAlly(e))];
  world.drops = s.drops || []; world.explored = s.explored || []; world.zones = s.zones || []; world.beats = s.beats || [];
  world.hostile = []; world.projectiles = []; world.allies = [];
  world.floorMemo = null; world.flowFields?.clear?.();
  let n = 0;
  for(const p of world.players){
    const a = n++*1.3;
    const spot = world.landNear(s.stair.x+Math.cos(a)*1.6, s.stair.z+1.4+Math.sin(a)*1.2, 6) || {x: s.stair.x, z: s.stair.z+1.5};
    p.x = spot.x; p.z = spot.z; p.goal = null; p.boon = 1; p.gvx = 0; p.gvz = 0;
    if(p.down || p.ghost){p.down = 0; p.ghost = false; p.revive = 0; p.hp = Math.round(maxHealth(p)/2);}
  }
  if(won){
    const threat = Math.max(1, threatOf(world));
    for(const p of world.players) if(p.online) world.awardXp(p, Math.round(DELVE.xp*Math.sqrt(threat)));
    world.event('announce', s.stair.x, s.stair.z, 'Out of the deep, under the same sky. The Unblinking is no more… for now.');
  }else world.event('announce', s.stair.x, s.stair.z, depth > 1 ? `The deep spits you back out of floor ${depth}.` : 'You climb back out of the deep.');
  world.event('ascend', s.stair.x, s.stair.z, '', {won});
}

/** Host, every tick of a delve (after the floor's own rules). */
export function stepDelve(world, dt){
  if(!inDelve(world)) return;
  world.below = (world.below || 0)+dt;
  if(world.dungeon.phase === 'complete'){exitDelve(world, true); return;}
}

/** The way up from a floor's camp fire (any time; the whole party climbs together). */
export function ascend(world, p){
  if(!inDelve(world)) return {ok: false, code: 'rejected'};
  world.event('announce', p.x, p.z, `${p.name} leads the party back up`);
  exitDelve(world, false);
  return {ok: true, code: 'ok'};
}

/** How hard a delve floor hits, as a "day": what the party brought down, plus each floor deeper. */
export function delveStep(world, depth){
  const d = world?.dungeon;
  return Math.max(1, (d?.base || 1)+(Math.max(1, depth)-1)*DELVE.depthStep);
}

/** What guests are sent of the surface (they never need the hollow's stash). */
export function surfaceForNetwork(world){return world.surface ? {stair: world.surface.stair} : null;}

/** Highest numbered id in a surface stash (so a restored save never reuses one). */
export function surfaceIds(surface, visit){
  if(!surface) return;
  for(const b of surface.buildings || []){visit(b.id); for(const st of b.store?.slots || []) if(st) visit(st.uid); for(const st of b.overflow?.slots || []) if(st) visit(st.uid);}
  for(const d of surface.drops || []){visit(d.id); if(d.stack) visit(d.stack.uid);}
  for(const e of surface.enemies || []) visit(e.id);
}

