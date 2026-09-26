// Weapon balance harness: node tools/balance/duel.mjs [itemId ...]
// Measures time-to-kill in three fights for every weapon at wanderer level 5.
import {World} from '../../src/engine.mjs';
import {RULES, EQUIPMENT, RECIPES} from '../../src/content.mjs';
import {equipmentSlotFor} from '../../src/inventory.mjs';
import {loadMagicModules} from '../../src/magic/load.mjs?v=harvest-16';
import {magicItems} from '../../src/magic/registry.mjs?v=harvest-16';
import {maxHealth, rarityOf, WEAPON_STYLES} from '../../src/progression.mjs';

await loadMagicModules();
const DAY = +(process.env.DAY||5), LEVEL = +(process.env.LEVEL||5), CAP = 45;
const SCENES = {
  duel:  [['bonewalker', 6, 0]],
  pack:  [0, 1, 2, 3, 4].map(i => ['crawler', 7*Math.cos(-.8+i*.4), 7*Math.sin(-.8+i*.4)]),
  brute: [['brute', 5, 0]],
};
function equip(w, p, id){
  p.equipment.weapon = null;
  const def = EQUIPMENT[id] || magicItems[id];
  p.equipment.weapon = {uid: 'bal-'+id, itemId: id, quantity: 1, durability: def?.durability ?? 100};
}
function fight(id, scene){
  const w = new World(11); const p = w.addPlayer('host', 'Bal'); w.start();
  w.ambient = false; w.enemies = []; w.time = 20; p.level = LEVEL; p.maxHp = maxHealth(p); p.hp = p.maxHp;
  let taken = 0; const hurt = w.hurt.bind(w); w.hurt = (q, amount) => {taken += amount; hurt(q, amount); q.hp = q.maxHp; q.down = 0;};
  p.x = 40; p.z = 0; p.dx = 1; p.dz = 0;
  if(id !== 'fist') equip(w, p, id);
  w.time = RULES.cycle*(DAY-1) + 20;
  for(const [type, x, z] of SCENES[scene]) w.spawnEnemy(type, p.x+x, p.z+z, {elite: false});
  const total = w.enemies.reduce((s, e) => s+e.hp, 0);
  let t = 0;
  while(t < CAP && w.enemies.some(e => e.hp > 0 && !e.ally)){
    const foe = w.enemies.filter(e => e.hp > 0).sort((a, b) => Math.hypot(a.x-p.x, a.z-p.z)-Math.hypot(b.x-p.x, b.z-p.z))[0];
    if(foe){const d = Math.hypot(foe.x-p.x, foe.z-p.z)||1; p.dx = (foe.x-p.x)/d; p.dz = (foe.z-p.z)/d;}
    w.input(p.id, {x: 0, z: 0, attack: true}); w.tick(RULES.tick);
    p.x = 40; p.z = 0;
    if(p.equipment.weapon) p.equipment.weapon.durability = 999;
    t += RULES.tick;
  }
  return {t: +t.toFixed(1), dps: +(total/t).toFixed(1), taken: Math.round(taken)};
}
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : ['fist', ...Object.keys(WEAPON_STYLES).filter(k => k !== 'fist'), ...Object.keys(magicItems)];
const rows = [];
for(const id of [...new Set(ids)]){
  const r = {id, rarity: id === 'fist' ? '-' : rarityOf(id)};
  for(const scene of Object.keys(SCENES)){const f = fight(id, scene); r[scene] = f.t; r[scene+'Hit'] = f.taken;}
  rows.push(r);
}
// Power rating: geometric mean of speed-ups over bare fists in the three fights, times a
// safety bonus of up to +30% for weapons that keep the damage off you (range, control, allies).
// Targets rise with how hard a weapon is to get: crafted < looted, and by rarity.
export const TARGET = {fist: 1, common: 2.2, uncommon: 2.6, rare: 3.0, 'rare loot': 3.4, 'epic loot': 4.0, 'legendary loot': 4.8};
const base = rows.find(r => r.id === 'fist') || {duel: 12, pack: 30.2, brute: 21.1, duelHit: 114, packHit: 698, bruteHit: 219};
for(const r of rows){
  const speed = Math.cbrt(base.duel/r.duel * base.pack/r.pack * base.brute/r.brute);
  const hurt = Math.min(1, (r.duelHit+r.packHit+r.bruteHit)/(base.duelHit+base.packHit+base.bruteHit));
  r.rating = +(speed*(1+.3*(1-hurt))).toFixed(2);
  r.tier = r.id === 'fist' ? 'fist' : RECIPES[r.id] ? r.rarity : `${r.rarity} loot`;
  r.target = TARGET[r.tier] ?? TARGET[r.rarity];
}
const order = {'-':0, common:1, uncommon:2, rare:3, epic:4, legendary:5};
rows.sort((a, b) => order[a.rarity]-order[b.rarity] || a.rating-b.rating);
console.log('seconds to win (lower is stronger) and damage taken, level', LEVEL, 'day', DAY);
console.log('id'.padEnd(15), 'tier'.padEnd(15), 'duel'.padStart(6), 'hit'.padStart(5), 'pack'.padStart(6), 'hit'.padStart(5), 'brute'.padStart(6), 'hit'.padStart(5), 'rating'.padStart(7), 'target'.padStart(7), '  off');
for(const r of rows) console.log(r.id.padEnd(15), r.tier.padEnd(15), String(r.duel).padStart(6), String(r.duelHit).padStart(5), String(r.pack).padStart(6), String(r.packHit).padStart(5), String(r.brute).padStart(6), String(r.bruteHit).padStart(5), String(r.rating).padStart(7), String(r.target).padStart(7), `  ${r.rating/r.target>1.1?'STRONG':r.rating/r.target<.9?'weak':'ok'} ${Math.round((r.rating/r.target-1)*100)}%`);
