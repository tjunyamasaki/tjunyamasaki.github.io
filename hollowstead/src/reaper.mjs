// The Reaper's scythe: Death stands behind you. Every foe your reaping arc cuts is marked for Doom (up to
// three marks). A marked foe whose health has fallen under its Doom threshold is not cut but REAPED by your
// next swing: executed, its soul ripped out to you. A reaped soul heals you and joins your souls (up to
// five), which sharpen every swing; the shade of Death behind you grows with them.
// Last Harvest (skill): Death steps out, dooms everything around you to the full three marks, then one
// great reap executes all that is under the threshold (raised by your souls, which it spends).
// Host only, the arsenal's `reap` style (WEAPON_STYLES.scythe). Doom lives on the foe as `e.doom`
// {by, n, at}; the wielder's souls as `p.reaper` {souls, fedAt}. Both replicate. src/fx/reaper.mjs draws them.
import {maxHealth, rankOf} from './progression.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';

const PACK = 'scythe';
export const DOOM = Object.freeze({
  max: 3, life: 7,                       // marks per foe; seconds a mark lasts after the last cut
  threshold: [0, .1, .16, .22],          // share of max health under which a foe with n marks can be reaped
  boss: .5, bossHit: 3,                  // bosses: half the threshold, and a reap is a heavy blow, not an execution
  heal: .04, healCap: 3,                 // max health healed per reaped soul, most souls counted per swing
  souls: 5, soulDamage: .06, fade: 8,    // souls kept, damage per soul, seconds before an unused soul fades
  soulReach: .04,                        // Last Harvest: each soul spent raises the threshold this much
});

const bossy = e => e.type === 'king' || e.type === 'golem';
const hostiles = w => (w.enemies || []).filter(e => e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
const facing = p => {const l = Math.hypot(p.dx || 0, p.dz || 0) || 1; return {x: (p.dx || 0)/l, z: (p.dz || 0)/l};};

/** Doom marks this wanderer has on a foe right now (0 when they lapsed or belong to someone else). */
export function doomOf(e, ownerId, time){
  const d = e?.doom;
  return d && d.by === ownerId && time-d.at < DOOM.life ? d.n : 0;
}
/** The health under which a foe with `n` marks is reaped (bosses have half). */
export function reapLine(e, n, extra = 0){
  if(!(n > 0)) return 0;
  return (e.maxHp || e.hp)*(Math.min(.6, DOOM.threshold[Math.min(DOOM.max, n)]+extra))*(bossy(e) ? DOOM.boss : 1);
}
export const reapable = (e, ownerId, time, extra = 0) => e.hp > 0 && e.hp <= reapLine(e, doomOf(e, ownerId, time), extra);

function soulsOf(p, time){
  const r = p.reaper || (p.reaper = {souls: 0, fedAt: time});
  // Unused souls drift away, one at a time.
  if(r.souls > 0 && time-r.fedAt > DOOM.fade){r.souls--; r.fedAt = time;}
  return r;
}

/** ARSENAL.reap: the reaping arc. Cuts and marks the living, reaps the doomed. */
export function reap(w, p, {style, damage}){
  const f = facing(p), r = soulsOf(p, w.time), cut = damage*(1+DOOM.soulDamage*r.souls);
  const reaped = [];
  let hits = 0;
  for(const e of hostiles(w)){
    const d = Math.hypot(e.x-p.x, e.z-p.z);
    if(d >= style.range) continue;
    const dot = d < .6 ? 1 : ((e.x-p.x)*f.x+(e.z-p.z)*f.z)/d;
    if(dot < Math.cos(style.arc*Math.PI/360)) continue;
    hits++;
    if(reapable(e, p.id, w.time)){harvest(w, p, e, damage); reaped.push(e); continue;}
    w.strike(p, e, cut, 0);
    if(e.hp > 0) e.doom = {by: p.id, n: Math.min(DOOM.max, doomOf(e, p.id, w.time)+1), at: Math.round(w.time*100)/100};
  }
  w.event('reaperswing', p.x, p.z, '', {dx: f.x, dz: f.z, arc: style.arc, range: style.range, rank: rankOf(p), itemId: PACK, player: p.id,
    souls: r.souls, reaped: reaped.length});
  gather(w, p, reaped.length);
  if(hits) w.wearEquipped(p, 'weapon', 1);
}

/** One foe reaped: executed (a boss takes a heavy blow instead), its soul flying to the wielder. */
function harvest(w, p, e, damage){
  const x = e.x, z = e.z;
  w.strike(p, e, bossy(e) ? damage*DOOM.bossHit : e.hp+1, 0);
  delete e.doom;
  w.event('soulreap', x, z, '', {player: p.id, itemId: PACK, tx: Math.round(p.x*100)/100, tz: Math.round(p.z*100)/100, boss: bossy(e) ? 1 : 0});
}

/** Reaped souls heal the wielder and join their souls. */
function gather(w, p, n){
  if(!n) return;
  const r = soulsOf(p, w.time);
  r.souls = Math.min(DOOM.souls, r.souls+n); r.fedAt = w.time;
  const heal = Math.round(Math.min(n, DOOM.healCap)*DOOM.heal*maxHealth(p)), before = p.hp;
  p.hp = Math.min(maxHealth(p), p.hp+heal);
  if(p.hp > before) w.event('heal', p.x, p.z, `+${Math.round(p.hp-before)}`, {player: p.id});
}

/** Last Harvest, first beat (SKILL_CALLS.deathmark): every foe in reach gets the full three marks. */
export function deathMark(w, p, b){
  const pts = [];
  for(const e of hostiles(w)){
    if(Math.hypot(e.x-p.x, e.z-p.z) > (b.r || 6)) continue;
    e.doom = {by: p.id, n: DOOM.max, at: Math.round(w.time*100)/100};
    pts.push([Math.round(e.x*100)/100, Math.round(e.z*100)/100]);
  }
  return {pts, hits: pts.length};
}

/** Last Harvest, the great reap (SKILL_CALLS.deathreap): executes the doomed, cuts the rest, spends the souls. */
export function deathReap(w, p, b, hit){
  const r = soulsOf(p, w.time), extra = r.souls*DOOM.soulReach, pts = [], cut = [];
  let reaped = 0;
  for(const e of hostiles(w)){
    if(Math.hypot(e.x-p.x, e.z-p.z) > (b.r || 6)) continue;
    if(reapable(e, p.id, w.time, extra)){pts.push([Math.round(e.x*100)/100, Math.round(e.z*100)/100]); harvest(w, p, e, b.dmg || 0); reaped++; continue;}
    hit(e);
    cut.push([Math.round(e.x*100)/100, Math.round(e.z*100)/100]);
  }
  const spent = r.souls;
  r.souls = 0;
  gather(w, p, reaped);
  return {pts, cut, spent, hits: pts.length+cut.length};
}
