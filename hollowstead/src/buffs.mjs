// Blessings from homestead dishes (content.mjs ITEMS[id].buff): a few minutes of something better.
// p.buffs = {id: until} (world time). Several can run at once; eating the same dish again refreshes it.
// The effects are read where the rule lives: courage and hunger (engine tick), speed (World.speedFactor),
// stamina (engine tick), harm taken (World.hurt), blow strength (progression powerOf), max health (maxHealth).
export const BUFFS = Object.freeze({
  calm: Object.freeze({name: 'Calm', text: 'Courage holds in the dark', secs: 240, color: '#bfe8ff'}),
  fed: Object.freeze({name: 'Well fed', text: 'Hunger fades half as fast', secs: 300, color: '#f0c27e'}),
  fury: Object.freeze({name: 'Bloodrush', text: 'Blows land 25% harder', secs: 180, color: '#ff8a7e'}),
  swift: Object.freeze({name: 'Light step', text: '15% faster, breath returns sooner', secs: 180, color: '#9ff0ff'}),
  warded: Object.freeze({name: 'Gloomhide', text: 'Take 20% less harm', secs: 180, color: '#c9b2ef'}),
  haunted: Object.freeze({name: 'Ghostly vigor', text: '+30 max health', secs: 300, color: '#e9fdff'}),
  // A fox wedding's blessing (omens.mjs, the Shrine of Yomi): not a dish.
  foxwed: Object.freeze({name: 'Fox’s blessing', text: 'Blows 15% harder, 15% less harm', secs: 420, color: '#ffc98a'}),
});
export const BUFF = Object.freeze({fury: 1.25, swift: 1.15, swiftBreath: 1.5, warded: .8, haunted: 30, fed: .5, foxwed: 1.15, foxward: .85});

export const buffed = (p, id) => !!p?.buffs?.[id];

/** Start (or refresh) a blessing. Returns its definition. */
export function giveBuff(world, p, id){
  const def = BUFFS[id];if(!def || !p) return null;
  p.buffs = {...(p.buffs || {}), [id]: world.time + def.secs};
  world.event('buff', p.x, p.z, def.name, {player: p.id, buff: id});
  world.tell(p, `${def.name} · ${def.text}`);
  return def;
}

/** Host, every tick: blessings run out. Losing Ghostly vigor takes its health back with it. */
export function stepBuffs(world, maxHealth){
  for(const p of world.players){
    if(!p.buffs) continue;
    let changed = false;
    for(const [id, until] of Object.entries(p.buffs)) if(!(until > world.time) || !BUFFS[id]){delete p.buffs[id];changed = true;}
    if(changed){p.maxHp = maxHealth(p);p.hp = Math.min(p.hp, p.maxHp);if(!Object.keys(p.buffs).length) delete p.buffs;}
  }
}

/** [{id, name, text, color, left}] for the HUD, soonest to end first. */
export function buffList(world, p){
  return Object.entries(p?.buffs || {}).filter(([id]) => BUFFS[id]).map(([id, until]) => ({id, ...BUFFS[id], left: Math.max(0, until - world.time)})).sort((a, b) => a.left - b.left);
}
