// Satoyama's animals: hens in a coop and cows in a barn (host simulation, no DOM).
//
// A house (STRUCTURES coop / barn, a grid camp object) keeps its animals, a trough of hay (b.hay, dry grass fed
// in at the house) and what they give (its store, taken with Collect). Building one brings its first animal.
// Every morning on the farm (mode.mjs runs morning() once for each dawn, catching up after a trip to the wilds)
// each grown animal whose house has hay eats one and gives its product; a happy one (hearts) sometimes gives two.
// Going hungry costs a heart. Petting once a day adds one. Young ones (a chick, a calf) grow up after two mornings.
// More animals: a coop hatches an egg; a barn raises a calf once a cow is happy.
//
// world.animals  [{id, type, home, x, z, tx, tz, face, action, hearts, age, petDay, fedDay}]  (saved, sent to guests)
// Pure simulation: import only content. Never engine.mjs, a renderer or the DOM.

import {ITEMS, STRUCTURES} from '../content.mjs?v=harvest-18';

export const ANIMALS = Object.freeze({
  hen: Object.freeze({name: 'Hen', young: 'Chick', house: 'coop', product: 'egg', max: 4, speed: 1.2, roam: 4.5, radius: .3}),
  cow: Object.freeze({name: 'Cow', young: 'Calf', house: 'barn', product: 'milk', max: 2, speed: .85, roam: 6, radius: .55}),
});
export const HOUSES = Object.freeze({coop: 'hen', barn: 'cow'});
/** Hay a trough holds, how many dry grass one Feed puts in, hearts at most, mornings to grow up. */
export const HUSBANDRY = Object.freeze({trough: 40, feed: 10, hearts: 5, grown: 2, happy: 3, calfCost: Object.freeze({fiber: 10}), hatchCost: Object.freeze({egg: 1})});
/** Slots in a house's store (eggs or milk waiting to be collected). */
export const HOUSE_SLOTS = 8;

export const isHouse = b => !!b && Object.hasOwn(HOUSES, b.type);
export const animalsOf = world => Array.isArray(world?.animals) ? world.animals : (world.animals = []);
export const residents = (world, house) => animalsOf(world).filter(a => a.home === house.id);
const grown = a => (a.age || 0) >= HUSBANDRY.grown;
export const animalName = a => (grown(a) ? ANIMALS[a.type]?.name : ANIMALS[a.type]?.young) || a.type;
/** The sprite an animal is drawn with: young ones have their own. */
export const animalSprite = a => grown(a) ? a.type : `${a.type}-young`;

function spawnAnimal(world, house, type, age){
  const a = world.mobRng() * Math.PI * 2;
  const animal = {id: world.nextId('a'), type, home: house.id, x: house.x + Math.cos(a) * 1.8, z: house.z + 1.6 + Math.sin(a) * .8, tx: house.x, tz: house.z, face: 1, action: 'idle', hearts: 1, age, petDay: 0, fedDay: 0, rest: 0};
  const land = world.landNear?.(animal.x, animal.z, 4);if(land){animal.x = land.x;animal.z = land.z;}
  animalsOf(world).push(animal);
  return animal;
}

/** A house was just built: its store grows slots, and its first animal moves in. */
export function houseBuilt(world, b){
  if(!isHouse(b)) return;
  b.hay = b.hay || 0;
  if(b.store && b.store.slots.length < HOUSE_SLOTS){while(b.store.slots.length < HOUSE_SLOTS) b.store.slots.push(null);b.store.revision++;}
  const type = HOUSES[b.type], animal = spawnAnimal(world, b, type, HUSBANDRY.grown);
  world.event('announce', b.x, b.z, `A ${ANIMALS[type].name.toLowerCase()} moves into the ${STRUCTURES[b.type].name.toLowerCase()}`);
  return animal;
}

/** A house came down: its animals find another house of the kind, or wait about the farm for one. */
export function houseGone(world, b){
  if(!isHouse(b)) return;
  for(const a of residents(world, b)){
    const other = world.buildings.find(q => q !== b && q.type === b.type && q.hp > 0 && residents(world, q).length < ANIMALS[a.type].max);
    a.home = other?.id || null;
  }
}

/** One dawn on the farm: hungry or fed, every animal; fed grown ones give what they give. */
export function morning(world, day){
  for(const a of animalsOf(world)){
    const house = world.buildings.find(b => b.id === a.home && b.hp > 0), spec = ANIMALS[a.type];
    if(!spec) continue;
    if(house && (house.hay || 0) >= 1){
      house.hay -= 1;a.fedDay = day;
      a.hearts = Math.min(HUSBANDRY.hearts, (a.hearts || 0) + .5);
      if(grown(a)){
        const twice = a.hearts >= HUSBANDRY.happy + 1 && (world.lootRng?.() ?? 0) < .5;
        world.stock(house.store, spec.product, twice ? 2 : 1);
      }
    }else a.hearts = Math.max(0, (a.hearts || 0) - 1);
    a.age = (a.age || 0) + 1;
  }
}

/** Host, every farm tick: wander about the house by day, gather to it at night. */
export function stepAnimals(world, dt, obstacles, phase){
  for(const a of animalsOf(world)){
    const spec = ANIMALS[a.type];if(!spec) continue;
    const house = world.buildings.find(b => b.id === a.home && b.hp > 0);
    const cx = house ? house.x : a.x, cz = house ? house.z + 1.4 : a.z;
    a.rest = (a.rest || 0) - dt;
    const night = phase === 'night';
    if(a.rest <= 0 && Math.hypot(a.tx - a.x, a.tz - a.z) < .25){
      // A new spot: near the house at night, anywhere about it by day; a pause before setting off.
      const r = night ? .9 : spec.roam * Math.sqrt(world.mobRng()), t = world.mobRng() * Math.PI * 2;
      const x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r * .8;
      if(world.walkable(x, z)){a.tx = x;a.tz = z;}
      a.rest = (night ? 6 : 1.5) + world.mobRng() * (night ? 6 : 4);
    }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if(d > .25 && a.rest <= 0){
      const speed = spec.speed * (grown(a) ? 1 : .8), before = [a.x, a.z];
      world.move(a, dx / d * speed, dz / d * speed, dt, obstacles);
      if(Math.abs(a.x - before[0]) + Math.abs(a.z - before[1]) < 1e-4){a.tx = a.x;a.tz = a.z;}
      a.face = dx < 0 ? -1 : 1;a.action = 'walk';
    }else a.action = night ? 'idle' : (a.rest > 2 && (world.time + a.x) % 5 < 1.6 ? 'peck' : 'idle');
  }
}

/** Animals a wanderer can reach, as World.target() candidates. */
export function animalTargets(world, p, reach){
  return animalsOf(world).filter(a => Math.hypot(a.x - p.x, a.z - p.z) < reach).map(a => ({kind: 'animal', entity: a, label: `Pet ${animalName(a).toLowerCase()}`}));
}

/** The number of a day (dayOf), so petting and feeding are once a day. */
function today(world){return world.satoyama?.day || 0;}

/** 'animal' commands: pet one. */
export function animalAction(world, p, cmd){
  const a = animalsOf(world).find(q => q.id === cmd?.id);
  if(!a || Math.hypot(a.x - p.x, a.z - p.z) > 3.2) return {ok: false, code: 'outOfRange'};
  if(cmd.op !== 'pet') return {ok: false, code: 'unsupported'};
  if(a.petDay === today(world)){world.tell(p, `The ${animalName(a).toLowerCase()} has had its fuss today`);return {ok: false, code: 'rejected'};}
  a.petDay = today(world);a.hearts = Math.min(HUSBANDRY.hearts, (a.hearts || 0) + .5);a.rest = 2;a.tx = a.x;a.tz = a.z;
  p.cooldown = .4;
  world.event('heal', a.x, a.z, '♥');
  return {ok: true, code: 'ok'};
}

/** House buttons (World.performBuildingAction): feed hay, collect, hatch an egg, raise a calf. */
export function houseAction(world, p, b, actionId){
  if(!isHouse(b)) return {ok: false, code: 'rejected'};
  const type = HOUSES[b.type], spec = ANIMALS[type];
  if(actionId === 'feed'){
    const room = HUSBANDRY.trough - (b.hay || 0), have = world.available(p, 'fiber'), n = Math.min(room, HUSBANDRY.feed, have);
    if(room <= 0){world.tell(p, 'The trough is full');return {ok: false, code: 'rejected'};}
    if(n <= 0){world.tell(p, 'Hay is dry grass: gather some first');return {ok: false, code: 'rejected'};}
    if(!world.pay(p, {fiber: n})) return {ok: false, code: 'rejected'};
    b.hay = (b.hay || 0) + n;p.cooldown = .4;
    world.event('craft', b.x, b.z, `+${n} hay`);world.assertItems?.();
    return {ok: true, code: 'ok'};
  }
  if(actionId === 'collect'){
    let got = 0;
    for(const stack of b.store.slots.slice()){if(stack) got += world.takeInto(p, b.store, stack, stack.quantity);}
    if(!got){world.tell(p, b.store.slots.some(Boolean) ? 'Pack full — store or drop some supplies' : 'Nothing to collect yet');return {ok: false, code: 'rejected'};}
    p.cooldown = .4;world.event('loot', b.x, b.z, `+${got} ${ITEMS[spec.product].name.toLowerCase()}`);world.assertItems?.();
    return {ok: true, code: 'ok'};
  }
  if(actionId === 'hatch' || actionId === 'raise'){
    if(residents(world, b).length >= spec.max){world.tell(p, `The ${STRUCTURES[b.type].name.toLowerCase()} is full`);return {ok: false, code: 'rejected'};}
    if(actionId === 'raise' && !residents(world, b).some(a => grown(a) && a.hearts >= HUSBANDRY.happy)){world.tell(p, 'A cow must be happy first: feed and pet her for a few days');return {ok: false, code: 'rejected'};}
    const cost = actionId === 'hatch' ? HUSBANDRY.hatchCost : HUSBANDRY.calfCost;
    if(!world.canPay(p, cost)){world.tell(p, actionId === 'hatch' ? 'Needs an egg' : 'Needs 10 dry grass');return {ok: false, code: 'rejected'};}
    if(!world.pay(p, cost)) return {ok: false, code: 'rejected'};
    const young = spawnAnimal(world, b, type, 0);p.cooldown = .5;
    world.event('announce', b.x, b.z, `A ${ANIMALS[type].young.toLowerCase()} is born`);world.event('heal', young.x, young.z, '♥');world.assertItems?.();
    return {ok: true, code: 'ok'};
  }
  return {ok: false, code: 'rejected'};
}

/** What the HUD shows of a house (main.mjs contextFacts). */
export function houseFacts(world, b){
  const list = residents(world, b), spec = ANIMALS[HOUSES[b.type]];
  return {hay: b.hay || 0, trough: HUSBANDRY.trough, animals: list.length, max: spec.max, waiting: b.store.slots.reduce((n, s) => n + (s?.quantity || 0), 0),
    happy: list.some(a => grown(a) && a.hearts >= HUSBANDRY.happy), product: spec.product};
}
