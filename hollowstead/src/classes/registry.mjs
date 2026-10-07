// Classes: the MMO-style way to grow a wanderer (the Classes mode, src/classes/mode.mjs). A class is a
// fixed weapon, a resource, a basic attack (the weapon's own) and a talent tree in three branches. Every
// level is a talent point; points buy ranks in passives and unlock active skills, which go on a skill bar
// (keys 1-4), and the class's ultimate sits on the skill button (Q). This module is the class-agnostic
// part: definitions, the tree's rules (tiers, prerequisites), points and the skill bar. Each class is one
// module that registers itself (src/classes/ronin.mjs) with its skills' rules.
//
// A class definition:
//   {id, name, role, blurb, weapon, resource: {id, name, max}, traits: [{name, text}],
//    trees: [{id, name, blurb}], nodes: {<id>: NODE}, ultimate: SKILL, skills: {<id>: SKILL},
//    sync(world, p), step(world, p, dt)}
// A NODE: {tree, tier, col, name, kind: 'skill' | 'passive' | 'capstone', max, req?: <node id>, text(rank)}
//   (a 'skill' node unlocks skills[<node id>] at rank 1 and its further ranks strengthen it).
// A SKILL: {name, glyph, cost, cooldown(p), text, cast(world, p, rank) => true | '<reason>'}
// Everything kept on the wanderer is plain data, so it replicates and would save like the rest of them:
//   p.classId, p.talents {nodeId: rank}, p.classBar [skill ids], p.classCd {skillId: seconds}, p.ki.

export const CLASS_RULES = Object.freeze({
  tierPoints: 3,      // points spent in a branch to open its next tier
  tiers: 5,
  barSlots: 8,        // skills on the bar (keys 1-8; the HUD shows the slots the player placed, src/ui/hud.mjs)
  gcd: .3,            // a short pause shared by every class skill
});

export const CLASSES = Object.create(null);
/** A class's own node or skill by id (never something inherited, like `toString`). */
const own = (table, id) => table && typeof id === 'string' && Object.hasOwn(table, id) ? table[id] : null;
export function registerClass(def){CLASSES[def.id] = def; return def;}
export const classOf = p => (p && CLASSES[p.classId]) || null;

/** Talent points a wanderer has earned: one per level. */
export const pointsEarned = p => Math.max(0, (p?.level || 1)|0);
export const talentRank = (p, id) => Math.max(0, (own(p?.talents, id) || 0)|0);
export function pointsSpent(p, tree = null){
  const def = classOf(p);
  if(!def) return 0;
  let n = 0;
  for(const [id, rank] of Object.entries(p.talents || {})) if(own(def.nodes, id) && (!tree || def.nodes[id].tree === tree)) n += rank|0;
  return n;
}
export const pointsFree = p => Math.max(0, pointsEarned(p)-pointsSpent(p));
/** Points a branch needs before tier `tier` opens. */
export const tierGate = tier => tier*CLASS_RULES.tierPoints;

/** Why a point cannot go into `id` right now ('' when it can). */
export function learnBlock(p, id){
  const def = classOf(p), node = own(def?.nodes, id);
  if(!node) return 'unknown';
  if(talentRank(p, id) >= node.max) return 'maxed';
  if(pointsFree(p) < 1) return 'points';
  if(pointsSpent(p, node.tree) < tierGate(node.tier)) return 'tier';
  if(node.req && talentRank(p, node.req) < 1) return 'req';
  return '';
}
export function learnReason(p, id){
  const def = classOf(p), node = own(def?.nodes, id), why = learnBlock(p, id);
  if(!why || !node) return '';
  if(why === 'maxed') return 'Fully learned';
  if(why === 'points') return 'No talent points left · level up to earn more';
  if(why === 'tier'){
    const tree = def.trees.find(t => t.id === node.tree);
    return `Spend ${tierGate(node.tier)} points in ${tree?.name || 'this branch'} first (${pointsSpent(p, node.tree)} so far)`;
  }
  if(why === 'req') return `Learn ${def.nodes[node.req]?.name || 'the talent above'} first`;
  return 'Not available';
}

/** Put a point into a talent. A skill node's first rank puts its skill on the bar if there is room. */
export function learn(p, id){
  const why = learnBlock(p, id);
  if(why) return {ok: false, code: why === 'points' ? 'noPoints' : 'rejected'};
  const def = classOf(p), node = def.nodes[id];
  (p.talents ||= {})[id] = talentRank(p, id)+1;
  if(node.kind === 'skill' && p.talents[id] === 1){
    p.classBar = Array.isArray(p.classBar) ? p.classBar.filter(Boolean) : [];
    if(!p.classBar.includes(id) && p.classBar.length < CLASS_RULES.barSlots) p.classBar.push(id);
  }
  return {ok: true, code: 'ok'};
}
/** Take every point back (the Classes mode lets you respec freely: it is a test ground). */
export function respec(p){
  p.talents = {}; p.classBar = []; p.classCd = {};
  return {ok: true, code: 'ok'};
}
/** Skills learned but not on the bar can be swapped in: put skill `id` in bar slot `slot`. */
export function slotSkill(p, id, slot){
  const def = classOf(p);
  if(!own(def?.skills, id) || talentRank(p, id) < 1 || !(Number.isInteger(slot) && slot >= 0 && slot < CLASS_RULES.barSlots)) return {ok: false, code: 'rejected'};
  const bar = Array.from({length: CLASS_RULES.barSlots}, (_, i) => p.classBar?.[i] || null);
  const from = bar.indexOf(id);
  if(from >= 0) bar[from] = bar[slot];
  bar[slot] = id;
  p.classBar = bar.filter(Boolean);
  return {ok: true, code: 'ok'};
}

/** Seconds left on a class skill. */
export const skillCooldown = (p, id) => Math.max(0, Number(p?.classCd?.[id]) || 0);
/** What a skill-bar button shows: its skill, rank, cost, cooldown and whether it can be cast now. */
export function barView(world, p){
  const def = classOf(p);
  if(!def) return [];
  return Array.from({length: CLASS_RULES.barSlots}, (_, i) => {
    const id = p.classBar?.[i] || null, skill = id ? def.skills[id] : null;
    if(!skill) return {slot: i, id: null};
    return {slot: i, id, skill, rank: talentRank(p, id), cd: skillCooldown(p, id), max: skill.cooldown(p), block: castBlock(world, p, id)};
  });
}
export function ultimateView(world, p){
  const def = classOf(p), skill = def?.ultimate;
  if(!skill) return null;
  return {id: 'ultimate', skill, cd: skillCooldown(p, 'ultimate'), max: skill.cooldown(p), block: castBlock(world, p, 'ultimate')};
}

/** Why skill `id` cannot be cast right now ('' when it can). */
export function castBlock(world, p, id){
  const def = classOf(p);
  if(!def || !p || p.down || p.ghost || p.online === false) return 'unavailable';
  const skill = id === 'ultimate' ? def.ultimate : own(def.skills, id);
  if(!skill) return 'unknown';
  if(id === 'ultimate' ? (p.level || 1) < (skill.level || 1) : talentRank(p, id) < 1) return 'locked';
  const free = !!world?.arena?.freeSkills;
  if(!free && skillCooldown(p, id) > 0) return 'cooldown';
  if(!free && (p.ki || 0) < (skill.cost || 0)) return 'resource';
  if((p.classGcd || 0) > 0) return 'gcd';
  return def.busy?.(world, p) ? 'busy' : '';
}

/** Cast class skill `id` (a bar skill or 'ultimate'). Host only. */
export function castSkill(world, p, id){
  const def = classOf(p);
  const why = castBlock(world, p, id);
  const skill = def && (id === 'ultimate' ? def.ultimate : own(def.skills, id));
  if(why){
    if(why === 'cooldown') world.tell(p, `${skill.name} is recharging`);
    else if(why === 'resource') world.tell(p, `Not enough ${def.resource.name} (${skill.cost})`);
    else if(why === 'locked') world.tell(p, id === 'ultimate' ? `${skill.name} awakens at level ${skill.level}` : `Learn ${skill.name} first`);
    return {ok: false, code: why === 'gcd' || why === 'busy' ? 'cooldown' : why};
  }
  const free = !!world.arena?.freeSkills;
  const result = skill.cast(world, p, id === 'ultimate' ? 1 : talentRank(p, id));
  if(result !== true){if(typeof result === 'string') world.tell(p, result); return {ok: false, code: 'rejected'};}
  if(!free){
    p.ki = skill.spendAll ? 0 : Math.max(0, (p.ki || 0)-(skill.cost || 0));
    (p.classCd ||= {})[id] = Math.round(skill.cooldown(p)*100)/100;
  }
  p.classGcd = CLASS_RULES.gcd;
  world.event('classcast', p.x, p.z, skill.name, {player: p.id, itemId: def.weapon, skill: id});
  return {ok: true, code: 'ok'};
}

/** Every class skill cools down; called each tick. */
export function coolSkills(p, dt){
  if(p.classGcd > 0) p.classGcd = Math.max(0, p.classGcd-dt);
  for(const id of Object.keys(p.classCd || {})){
    const left = (p.classCd[id] || 0)-dt;
    if(left > 0) p.classCd[id] = Math.round(left*1000)/1000; else delete p.classCd[id];
  }
}
