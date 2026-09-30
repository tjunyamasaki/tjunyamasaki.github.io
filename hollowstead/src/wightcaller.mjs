// The Wightcaller horn: you are the horn, he is the blade. The Grave Knight (an ally: he still taunts and
// takes the hits) no longer fights on his own; every blow of the horn is an order. He charges in a straight
// line from wherever he stands to your mark, trampling everything in between, and strikes. His strikes
// follow the horn's three notes: Thrust, Cleave, then Gravefall (a leaping slam that stuns and mends him).
// Between orders he holds where he struck for a while, so where you leave him decides what the next
// charge runs through.
// Wild Hunt (skill, SKILL_CALLS.wildhunt): the knight and four ghost riders charge through the mark from
// five sides and meet in one great Gravefall.
// Host only, the arsenal's `wight` style (WEAPON_STYLES.wighthorn). Orders live on the knight as `a.order`
// {note, sx, sz, tx, tz, targetId, phase, t, hits}, his place in the song as `a.note`. src/fx/wightcaller.mjs.
import {rankOf} from './progression.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';

export const HORN = Object.freeze({
  sight: 10, speed: 15, maxCharge: 10, trample: .3, strikeAt: .12, hold: .45, stay: 2.6,
  notes: Object.freeze([
    Object.freeze({name: 'thrust', stop: .9, r: 1.5, share: 1}),              // a lance thrust: the mark and what stands right behind it
    Object.freeze({name: 'cleave', stop: 1.2, r: 2.3, share: .7, arc: 240}),     // a wide cleave round the mark
    Object.freeze({name: 'gravefall', stop: 0, r: 2.7, share: 1.2, stun: .6, mend: .2}), // a leap onto the mark
  ]),
});

const dist = (a, b) => Math.hypot((a.x || 0)-(b.x || 0), (a.z || 0)-(b.z || 0));
const round = n => Math.round(n*100)/100;
const bodyOf = e => e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .9 : .5;
const hostiles = w => (w.enemies || []).filter(e => e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
const knightOf = (w, p) => (w.allies || []).find(a => a.owner === p.id && a.type === 'wight' && a.hp > 0) || null;

/** Send the knight: charge from where he stands to (tx, tz) and strike with `note`. */
export function order(w, p, knight, tx, tz, targetId, note, extra = {}){
  knight.order = {note, sx: round(knight.x), sz: round(knight.z), tx: round(tx), tz: round(tz), targetId: targetId ?? null,
    phase: 'charge', t: 0, hits: [], ...extra};
  knight.age = 0;
}

/** ARSENAL.wight: a blow of the horn. Raises the knight if he is gone, then orders the next note. */
export function horn(w, p, {style, damage, summon, aimTarget}){
  let knight = knightOf(w, p);
  const l = Math.hypot(p.dx || 0, p.dz || 0) || 1, fx = (p.dx || 0)/l, fz = (p.dz || 1)/l;
  if(!knight) knight = summon(w, p, 'wight', p.x-fx*.8+fz*.9, p.z-fz*.8-fx*.9, damage);
  if(!knight) return;
  knight.damage = damage;
  const target = aimTarget(w, p, style.sight || HORN.sight);
  const tx = target ? target.x : p.x+fx*5, tz = target ? target.z : p.z+fz*5;
  const note = knight.note = ((knight.note ?? -1)+1)%HORN.notes.length;
  order(w, p, knight, tx, tz, target?.id, note);
  w.event('hornblow', p.x, p.z, '', {player: p.id, itemId: 'wighthorn', note, rank: rankOf(p), kx: round(knight.x), kz: round(knight.z)});
  w.wearEquipped(p, 'weapon', 1);
}

/** Per tick, from stepArsenal (after the allies): knights with orders charge and strike; idle ones heel. */
export function stepKnights(w, dt, obstacles, move){
  if(!w.allies?.length) return;
  let foes = null;
  for(const a of w.allies){
    if(a.type !== 'wight' || !(a.hp > 0)) continue;
    const owner = w.player(a.owner);
    if(!owner) continue;
    foes ||= hostiles(w);
    const o = a.order;
    if(!o){heel(w, a, owner, dt, obstacles, move); continue;}
    o.t += dt;
    const note = HORN.notes[o.note] || HORN.notes[0];
    if(o.phase === 'charge'){
      const mark = o.targetId != null ? foes.find(e => e.id === o.targetId) : null;
      if(mark){o.tx = round(mark.x); o.tz = round(mark.z);}
      // Never further than maxCharge from where he set off.
      let gx = o.tx, gz = o.tz;
      const span = Math.hypot(gx-o.sx, gz-o.sz);
      if(span > HORN.maxCharge){gx = o.sx+(gx-o.sx)/span*HORN.maxCharge; gz = o.sz+(gz-o.sz)/span*HORN.maxCharge;}
      const d = Math.hypot(gx-a.x, gz-a.z), stop = note.stop+(mark ? bodyOf(mark)*.5 : 0);
      const x0 = a.x, z0 = a.z;
      if(d > stop+.05){
        const step = Math.min(HORN.speed*dt, d-stop), ux = (gx-a.x)/d, uz = (gz-a.z)/d;
        // The gravefall leaps: straight through the air, over trunks and foes alike.
        if(note.name === 'gravefall'){a.x += ux*step; a.z += uz*step;}
        else move(w, a, ux*step/dt, uz*step/dt, dt, obstacles);
        a.facing = ux < 0 ? -1 : 1; a.anim = 'walk';
        if(note.name !== 'gravefall') trample(w, a, owner, o, foes, x0, z0);
      }
      const moved = Math.hypot(a.x-x0, a.z-z0);
      if(d <= stop+.05 || o.t > 1.2 || (moved < HORN.speed*dt*.15 && o.t > .15)){o.phase = 'strike'; o.t = 0; o.dx = round((gx-a.x)/(d || 1)); o.dz = round((gz-a.z)/(d || 1));}
      continue;
    }
    if(o.phase === 'strike'){
      a.anim = 'attack'; a.swing = .35;
      if(!o.struck && o.t >= HORN.strikeAt){o.struck = true; strike(w, a, owner, o, note, foes);}
      if(o.t >= HORN.hold){a.order = null; a.restAt = round(w.time); a.anim = 'idle';}
    }
  }
}

/** Each foe the charge runs through is trampled once, and shoved aside. */
function trample(w, a, owner, o, foes, x0, z0){
  const sx = a.x-x0, sz = a.z-z0, l2 = sx*sx+sz*sz || 1e-9;
  for(const e of foes){
    if(!(e.hp > 0) || o.hits.includes(e.id) || e.id === o.targetId) continue;
    const t = Math.max(0, Math.min(1, ((e.x-x0)*sx+(e.z-z0)*sz)/l2)), gap = Math.hypot(e.x-(x0+sx*t), e.z-(z0+sz*t));
    if(gap > .7+bodyOf(e)*.5) continue;
    o.hits.push(e.id);
    w.strike(owner, e, (a.damage || 0)*HORN.trample*(o.power || 1), 0);
    const side = (e.x-a.x)*(-sz)+(e.z-a.z)*sx >= 0 ? 1 : -1, l = Math.sqrt(l2);
    if(e.type !== 'king' && e.type !== 'golem'){e.x += -sz/l*side*.35; e.z += sx/l*side*.35;}
  }
}

function strike(w, a, owner, o, note, foes){
  const fx = o.dx || (a.facing || 1), fz = o.dz || 0, amount = (a.damage || 0)*note.share*(o.power || 1);
  const cx = note.name === 'thrust' ? a.x+fx*note.r*.5 : a.x, cz = note.name === 'thrust' ? a.z+fz*note.r*.5 : a.z;
  for(const e of foes){
    if(!(e.hp > 0)) continue;
    const d = Math.hypot(e.x-a.x, e.z-a.z);
    if(note.name === 'thrust'){
      // A lance: along the facing, as far as r past the knight.
      const along = (e.x-a.x)*fx+(e.z-a.z)*fz, across = Math.abs((e.x-a.x)*fz-(e.z-a.z)*fx);
      if(along < -.3 || along > note.r+1 || across > .6+bodyOf(e)*.5) continue;
    }else if(d > note.r+bodyOf(e)*.5) continue;
    else if(note.arc && d > .6 && ((e.x-a.x)*fx+(e.z-a.z)*fz)/d < Math.cos(note.arc*Math.PI/360)) continue;
    w.strike(owner, e, amount, 0);
    if(note.stun){const s = e.type === 'king' || e.type === 'golem' ? note.stun*.5 : note.stun; e.stunned = Math.max(e.stunned || 0, s); e.windup = 0;}
  }
  if(note.mend){const heal = Math.round(a.maxHp*note.mend); a.hp = Math.min(a.maxHp, a.hp+heal); if(heal > 0) w.event('heal', a.x, a.z, `+${heal}`);}
  w.event('knightstrike', cx, cz, '', {player: owner.id, itemId: 'wighthorn', note: o.note, dx: round(fx), dz: round(fz), r: note.r, rank: rankOf(owner), hunt: o.hunt ? 1 : 0});
}

/** No orders: hold where he struck for a while, then walk back to your side. */
function heel(w, a, owner, dt, obstacles, move){
  if(a.restAt != null && w.time-a.restAt < HORN.stay){a.anim = a.swing > 0 ? 'attack' : 'idle'; return;}
  const l = Math.hypot(owner.dx || 0, owner.dz || 1) || 1, fx = (owner.dx || 0)/l, fz = (owner.dz || 1)/l;
  const gx = owner.x-fx*.8+fz*.9, gz = owner.z-fz*.8-fx*.9, d = Math.hypot(gx-a.x, gz-a.z);
  if(d < .3){a.anim = 'idle'; return;}
  const speed = d > 5 ? 6 : 3.7;
  move(w, a, (gx-a.x)/d*speed, (gz-a.z)/d*speed, dt, obstacles);
  a.facing = gx < a.x ? -1 : 1; a.anim = 'walk';
}

/** Wild Hunt (SKILL_CALLS.wildhunt): the knight charges through the mark and ends in a Gravefall there. */
export function wildHunt(w, p, b, summon){
  let knight = knightOf(w, p);
  if(!knight) knight = summon(w, p, 'wight', p.x, p.z, b.dmg || 30);
  if(!knight) return null;
  knight.hp = knight.maxHp;
  knight.note = HORN.notes.length-1;
  order(w, p, knight, b.x, b.z, null, knight.note, {hunt: 1, power: b.power || 1});
  return {kx: round(knight.x), kz: round(knight.z)};
}
