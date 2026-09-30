// The skill of every weapon, as a script of timed beats (see skills.mjs for what each beat kind does).
// Tuning lives here: `cooldown` in seconds, and every damage figure is a multiple of the weapon's own
// hit (k.dmg(2) is two ordinary hits, after level, rank and the stamina the skill drained).
// `fx` names the look; src/fx draws it with more flourish at higher ranks. `reach` is how far the
// skill looks for a mark. `pose` is how long the wielder holds the skill stance.
import {ALLIES} from './progression.mjs?v=harvest-18';
import {mine, skyPath, summon} from './arsenal.mjs?v=harvest-18';
import {FOXFIRE} from './magic/kitsune-lantern.mjs?v=harvest-18';
import {ownedSkeletons, raiseSkeleton} from './magic/barrow-rattle.mjs?v=harvest-18';
import {RITE, beginRite} from './magic/pallbearer.mjs?v=harvest-18';
import {gripAll} from './magic/gloomgrasp.mjs?v=harvest-18';
import {finalChapter} from './grimoire.mjs?v=harvest-18';
import {deathMark, deathReap} from './reaper.mjs?v=harvest-18';
import {wildHunt} from './wightcaller.mjs?v=harvest-18';
import {isMagicAlly, ownerPower} from './magic/registry.mjs?v=harvest-18';

const TAU = Math.PI*2;
const round = n => Math.round(n*100)/100;

export const SKILL_BOOK = Object.freeze({
  // ------------------------------------------------------------------ bare hands and blades
  fist: {name: 'Earthshaker', cooldown: 8, reach: 3, pose: .6,
    blurb: 'Leap and slam the ground: a shockwave that stuns everything close.',
    cast(k){k.beat(.22, {kind: 'blast', fx: 'slam', follow: true, r: 2.8, dmg: k.dmg(3.5), push: 1.2, stun: .7, falloff: .3});}},

  spear: {name: 'Briar Lance', cooldown: 9, reach: 6, pose: .6,
    blurb: 'Lunge straight through a line of foes; thorns erupt along the path and hold them fast.',
    cast(k){
      k.beat(0, {kind: 'dash', fx: 'lance', len: 5.5, life: .18, w: 1.1, dmg: k.dmg(2.2), push: .6, pushDir: 'side'});
      k.beat(.38, {kind: 'line', fx: 'thorns', len: 6.5, w: 1.3, dmg: k.dmg(2.2), root: 1.3});
    }},

  sword: {name: 'Moonlit Flurry', cooldown: 9, reach: 5, pose: .75,
    blurb: 'Three spinning crescents cut all around you, then a moon-wave flies ahead through everything.',
    cast(k){
      for(let i = 0; i < 3; i++) k.beat(i*.14, {kind: 'arc', fx: 'spin', follow: true, r: 3.4, arc: 360, dmg: k.dmg(1.1), push: .25, spin: i});
      k.beat(.5, {kind: 'wave', fx: 'moonwave', follow: true, len: 10, v: 17, w: 1.5, dmg: k.dmg(2.6), push: .7, pushDir: 'along'});
    }},

  broadsword: {name: 'Earthsplitter', cooldown: 10, reach: 5, pose: .85,
    blurb: 'A leaping overhead smash stuns everything in front, then the ground splits open ahead.',
    cast(k){
      k.beat(.32, {kind: 'arc', fx: 'smash', follow: true, ahead: .8, r: 5, arc: 160, dmg: k.dmg(3.2), push: 1.3, stun: .8, falloff: .25});
      k.beat(.6, {kind: 'wave', fx: 'fissure', follow: true, len: 8.5, v: 14, w: 1.3, dmg: k.dmg(1.8), stun: .4, push: .5, pushDir: 'side'});
    }},

  flamberge: {name: 'Infernal Cyclone', cooldown: 11, reach: 4, pose: 1.7,
    blurb: 'Become a whirling storm of fire that scorches everything around you, then erupts.',
    cast(k){
      k.beat(0, {kind: 'pulse', fx: 'cyclone', follow: true, r: 3.3, every: .2, life: 1.6, dmg: k.dmg(.55), dot: {dps: k.dmg(.35), s: 2, kind: 'burn'},
        end: {kind: 'blast', fx: 'eruption', follow: true, r: 4.4, dmg: k.dmg(2.2), push: 1.2, falloff: .3}});
    }},

  fangs: {name: 'Thousand Cuts', cooldown: 10, reach: 7, pose: .9,
    blurb: 'Blink between up to seven foes, cutting each deep and leaving it bleeding.',
    cast(k){
      const marks = k.foes(7).slice(0, 7);
      if(!marks.length){k.beat(0, {kind: 'dash', fx: 'lance', len: 4, life: .14, w: 1, dmg: k.dmg(2.4)}); return;}
      k.beat(0, {kind: 'blink', fx: 'cut', ids: marks.map(e => e.id), every: .09, life: marks.length*.09+.05, dmg: k.dmg(2.4), dot: {dps: k.dmg(.5), s: 3, kind: 'bleed'}});
      k.beat(marks.length*.09+.16, {kind: 'blast', fx: 'xslash', follow: true, r: 2.6, dmg: k.dmg(1.6), push: .5});
    }},

  scythe: {name: 'Last Harvest', cooldown: 12, reach: 6, pose: 1.1,
    blurb: 'Death steps out behind you and dooms everything around to the full three marks; then one great reap executes all it can. Your souls reach deeper, and are spent.',
    cast(k){
      // The scythe's own Doom (src/reaper.mjs): mark everything, then reap it.
      k.beat(.1, {kind: 'call', fn: 'deathmark', fx: 'deathmark', follow: true, r: 6});
      k.beat(.75, {kind: 'call', fn: 'deathreap', fx: 'deathreap', follow: true, r: 6, dmg: k.dmg(2.2)});
    }},

  soulchain: {name: 'Soul Prison', cooldown: 11, reach: 7.5, pose: 1,
    blurb: 'Chains lash out to every foe near you, drag them together and bind them; then the soul-knot bursts.',
    cast(k){
      const t = k.target(4, 2.6), d = Math.hypot(t.x-k.x, t.z-k.z), s = d > 3.2 ? 3.2/d : 1;
      const x = round(k.x+(t.x-k.x)*s), z = round(k.z+(t.z-k.z)*s);
      k.tx = x; k.tz = z;
      k.beat(.12, {kind: 'call', fn: 'gather', fx: 'chains', x, z, r: 7.5, n: 10, dmg: k.dmg(1.2), root: 1.6});
      k.beat(.95, {kind: 'blast', fx: 'soulburst', x, z, r: 3, dmg: k.dmg(2.8), push: 1, falloff: .2});
    }},


  // ------------------------------------------------------------------ bows and staves
  recurve: {name: 'Arrow Storm', cooldown: 9, reach: 13, pose: .7,
    blurb: 'Two fanned volleys, then a rain of arrows on your mark.',
    cast(k){
      k.beat(0, {kind: 'shots', fx: 'volley', n: 7, spread: 70, proj: {kind: 'arrow', speed: 24, range: 13, pierce: 1}, dmg: k.dmg(1)});
      k.beat(.2, {kind: 'shots', fx: 'volley', n: 6, spread: 50, proj: {kind: 'arrow', speed: 24, range: 13, pierce: 1}, dmg: k.dmg(1)});
      const t = k.target(13, 7);
      for(let i = 0; i < 8; i++){const [x, z] = k.scatter(t.x, t.z, 3); k.beat(.55+i*.07, {kind: 'blast', fx: 'arrowrain', x, z, r: 1.3, dmg: k.dmg(.9), seq: i});}
    }},

  bonebow: {name: 'Wight Lance', cooldown: 10, reach: 16, pose: .8,
    blurb: 'Draw long and loose a spectral lance that pierces everything in its path; bones burst up behind it.',
    cast(k){
      k.beat(.36, {kind: 'wave', fx: 'lanceshot', follow: true, len: 18, v: 32, w: 1.1, dmg: k.dmg(3.6), push: .8, pushDir: 'along',
        end: {kind: 'line', fx: 'bonespikes', from: 'start', at: .12, w: 1.3, dmg: k.dmg(1.3), slow: 2}});
    }},

  crookstaff: {name: 'Moonshard Salvo', cooldown: 9, reach: 12, pose: .7,
    blurb: 'Six moonshard bolts that seek out separate foes and burst on them.',
    cast(k){for(let i = 0; i < 6; i++) k.beat(i*.08, {kind: 'shots', fx: 'salvo', n: 1, fan: i, spread: 0, proj: {kind: 'bolt', speed: 15, range: 13, splash: 1.7, homing: true, turn: 6}, dmg: k.dmg(1.3)});}},

  skullstaff: {name: 'Grave Orb', cooldown: 12, reach: 10, pose: .8,
    blurb: 'A great skull orb drifts forward, draining and slowing all around it, then bursts.',
    cast(k){
      k.beat(.2, {kind: 'pulse', fx: 'graveorb', snap: true, ahead: 1, v: 3.2, r: 2.3, every: .3, life: 2.4, dmg: k.dmg(.7), slow: 1.5,
        end: {kind: 'blast', fx: 'graveburst', r: 3.8, dmg: k.dmg(3.2), push: 1.2, falloff: .3}});
    }},

  tome: {name: 'Final Chapter', cooldown: 13, reach: 8, pose: 1.4,
    blurb: 'The book tears out every page: they ring your mark in a burning spell circle, collapse into it, and fly home to a full book.',
    cast(k){
      const t = k.target(8, 5), x = round(t.x), z = round(t.z);
      // The grimoire's own pages (src/grimoire.mjs) make the circle; the beats below are its fire.
      k.beat(0, {kind: 'call', fn: 'finalchapter', fx: 'ashcircle', x, z, r: 3.2, n: 12, hold: 1});
      k.beat(.4, {kind: 'pulse', fx: 'ashring', x, z, r: 3.2, every: .3, life: .95, dmg: k.dmg(.25), slow: 1, quiet: true});
      k.beat(1.55, {kind: 'blast', fx: 'ashcollapse', x, z, r: 3.5, dmg: k.dmg(2.2), push: -1.6, falloff: .2, dot: {dps: k.dmg(.08), s: 3, kind: 'burn'}});
    }},

  wisplantern: {name: 'Wisp Parade', cooldown: 10, reach: 14, pose: .8,
    blurb: 'Twelve wisps pour out of the lantern and hunt down every foe nearby.',
    cast(k){
      k.beat(0, {kind: 'shots', fx: 'wisps', n: 6, spread: 360, proj: {kind: 'wisp', speed: 10, range: 15, homing: true, turn: 7}, dmg: k.dmg(1.3)});
      k.beat(.3, {kind: 'shots', fx: 'wisps', n: 6, spread: 360, phase: .5, fan: 3, proj: {kind: 'wisp', speed: 10, range: 15, homing: true, turn: 7}, dmg: k.dmg(1.3)});
    }},

  stormrod: {name: 'Thunderhead', cooldown: 12, reach: 10, pose: 1.3,
    blurb: 'Call a storm: eight lightning strikes rain on nearby foes, each leaping on to one more.',
    cast(k){
      const foes = k.foes(10);
      const t = k.target(10, 5);
      for(let i = 0; i < 8; i++){
        const e = foes.length ? foes[i%foes.length] : null;
        const [x, z] = e ? [round(e.x), round(e.z)] : k.scatter(t.x, t.z, 3);
        k.beat(.2+i*.16, {kind: 'bolt', fx: 'skybolt', targetId: e?.id || null, x, z, r: 1.4, dmg: k.dmg(1.5), stun: .35, chain: {n: 1, jump: 4.5, dmg: k.dmg(.8)}, seq: i});
      }
    }},

  starfall: {name: 'Heavenfall', cooldown: 14, reach: 12, pose: 1.2,
    blurb: 'Trace a constellation over your foes: a shower of stars lands on its points, then its heart star falls.',
    cast(k){
      const t = k.target(12, 7), turn = k.rng()*TAU, pts = [];
      for(let i = 0; i < 8; i++){
        const a = turn+i/8*TAU+(k.rng()-.5)*.5, r = 1.8+k.rng()*2.3;
        const x = round(t.x+Math.cos(a)*r), z = round(t.z+Math.sin(a)*r), at = round(.3+i*.13);
        pts.push([x, z, at]);
        k.beat(at, {kind: 'blast', fx: 'meteor', x, z, r: 1.9, dmg: k.dmg(.6), push: .5, falloff: .3, seq: i, fall: .55, ...skyPath(k.rng, i, .85)});
      }
      // The heart star carries the constellation it completes, for src/fx to draw.
      k.beat(1.75, {kind: 'blast', fx: 'heartstar', x: round(t.x), z: round(t.z), track: t.enemy?.id || null, trackRate: 2, r: 4.8, dmg: k.dmg(2.2),
        push: 1.5, stun: 1, falloff: .35, fall: 1.1, pts, ...skyPath(k.rng, 1, 1.35)});
    }},

  crowtotem: {name: 'Murder of Crows', cooldown: 12, reach: 9, pose: .9,
    blurb: 'A shrieking flock sweeps across the field ahead, then three more crows stay to fight.',
    cast(k){
      [-24, 0, 24].forEach((deg, i) => {const [dx, dz] = k.turn(deg); k.beat(.1+i*.1, {kind: 'wave', fx: 'flock', follow: true, dx, dz, len: 10, v: 13, w: 1.5, dmg: k.dmg(3.2), seq: i});});
      k.beat(.5, {kind: 'summon', fx: 'murder', ally: 'crow', n: 3, cap: 9, dmg: k.dmg(1)});
    }},

  jacklantern: {name: 'Pumpkin Bombardment', cooldown: 12, reach: 9, pose: .9,
    blurb: 'Lob a barrage of burning pumpkin bombs at every foe in reach.',
    cast(k){
      const foes = k.foes(9), t = k.target(9, 5);
      for(let i = 0; i < 7; i++){
        const e = foes.length ? foes[i%foes.length] : null;
        const [x, z] = e ? k.scatter(e.x, e.z, .6) : k.scatter(t.x, t.z, 3);
        k.beat(.45+i*.09, {kind: 'blast', fx: 'pumpkin', x, z, r: 1.9, dmg: k.dmg(2.2), push: .7, dot: {dps: k.dmg(.25), s: 2.5, kind: 'burn'}, sx: round(k.x), sz: round(k.z), fly: .45, seq: i});
      }
    }},

  wighthorn: {name: 'Wild Hunt', cooldown: 14, reach: 10, pose: 1,
    blurb: 'The horn calls the Wild Hunt: four ghost riders and your Grave Knight charge through the mark from five sides and meet in one great Gravefall.',
    cast(k){
      const t = k.target(9, 5), x = round(t.x), z = round(t.z);
      // Your own knight (src/wightcaller.mjs) charges in and leaps; four ghost riders run through from the other sides.
      k.beat(0, {kind: 'call', fn: 'wildhunt', fx: 'wildhunt', x, z, power: round(k.strength)});
      const a0 = Math.atan2(z-k.z, x-k.x);
      for(let i = 1; i <= 4; i++){
        const a = a0+i*TAU/5, dx = -Math.cos(a), dz = -Math.sin(a);
        k.beat(.2+i*.06, {kind: 'wave', fx: 'ghostrider', x: round(x-dx*6.5), z: round(z-dz*6.5), dx: round(dx), dz: round(dz), len: 7.5, v: 16, w: 1.1, dmg: k.dmg(.6), seq: i});
      }
      k.beat(.95, {kind: 'blast', fx: 'huntfall', x, z, r: 3.2, dmg: k.dmg(1.8), stun: .8, falloff: .25});
    }},

  censer: {name: 'Absolute Zero', cooldown: 13, reach: 5, pose: 1,
    blurb: 'A freezing burst locks everything around you in ice; a moment later the ice shatters.',
    cast(k){
      const shatter = k.beat(2.3, {kind: 'call', fn: 'shatter', fx: 'shatter', x: round(k.x), z: round(k.z), r: 7, dmg: k.dmg(2.6), ids: []});
      k.beat(.28, {kind: 'blast', fx: 'frostnova', x: round(k.x), z: round(k.z), r: 5, dmg: k.dmg(1.2), freeze: 2.4, link: shatter?.id});
    }},

  // ------------------------------------------------------------------ the magic packs
  gloomgrasp: {name: 'Abyssal Grip', cooldown: 12, reach: 9, pose: 1.3,
    blurb: 'Hands rise under every foe near the mark, already squeezing; a colossal hand rises in the middle, and when it clenches every hand crushes at once.',
    cast(k){
      const t = k.target(9, 5), x = round(t.x), z = round(t.z);
      // The scepter's own hands (src/magic/gloomgrasp.mjs), set to crush the moment the colossus clenches.
      k.beat(0, {kind: 'call', fn: 'gloomhands', fx: 'gloomflood', x, z, r: 4.2, n: 8, crush: 1.15, mult: .5, power: round(k.strength)});
      k.beat(1.15, {kind: 'blast', fx: 'gloomfist', x, z, r: 4.2, dmg: k.dmg(1), push: -1.4, root: 1.2, falloff: .2});
    }},

  plaguebeak: {name: 'Pestilence', cooldown: 12, reach: 9, pose: .9,
    blurb: 'Five vials of miasma arc over the field and burst into clouds that keep gnawing.',
    cast(k){
      const t = k.target(9, 5);
      for(let i = 0; i < 5; i++){
        const [x, z] = i ? k.scatter(t.x, t.z, 3.2) : [round(t.x), round(t.z)];
        const at = .35+i*.08;
        k.beat(at, {kind: 'blast', fx: 'vial', x, z, r: 2.2, dmg: k.dmg(1.3), push: .3, sx: round(k.x), sz: round(k.z), fly: .35, seq: i});
        k.beat(at, {kind: 'pulse', fx: 'miasma', x, z, r: 2, every: .5, life: 3, dmg: k.dmg(.35), slow: .6, quiet: true, seq: i});
      }
    }},

  'kitsune-lantern': {name: 'Kitsune Parade', cooldown: 13, reach: 11, pose: 1.2,
    blurb: 'Three rings of nine foxfires pour out one after another; then the fox spirit itself pounces.',
    cast(k){
      for(let ring = 0; ring < 3; ring++) k.beat(ring*.42, {kind: 'call', fn: 'foxring', fx: 'foxring', ring, power: round(k.strength)});
      const t = k.target(11, 6);
      k.beat(1.7, {kind: 'blast', fx: 'foxspirit', x: round(t.x), z: round(t.z), track: t.enemy?.id || null, r: 3.4, dmg: k.dmg(6), push: 1.2, falloff: .3});
    }},

  'barrow-rattle': {name: 'Barrow Legion', cooldown: 16, reach: 4, pose: 1,
    blurb: 'Bones erupt all around you, three more skeletons claw out of the ground, and your legion is mended.',
    cast(k){
      k.beat(.15, {kind: 'blast', fx: 'boneburst', follow: true, r: 3.6, dmg: k.dmg(1.8), push: 1.1, falloff: .2});
      k.beat(.45, {kind: 'call', fn: 'legion', fx: 'legion', n: 3, cap: 7});
    }},

  'cinder-staff': {name: 'Cinderstorm', cooldown: 11, reach: 11, pose: 1,
    blurb: 'Fireballs rain down across your foes and set them ablaze.',
    cast(k){
      const t = k.target(11, 6), foes = k.foes(4, t);
      for(let i = 0; i < 10; i++){
        const e = i < 3 && foes[i] ? foes[i] : null;
        const [x, z] = e ? [round(e.x), round(e.z)] : k.scatter(t.x, t.z, 3.4);
        k.beat(.25+i*.11, {kind: 'blast', fx: 'fireball', x, z, r: 1.6, dmg: k.dmg(1.1), push: .4, dot: {dps: k.dmg(.18), s: 2.5, kind: 'burn'}, seq: i, fall: .45, ...skyPath(k.rng, i, .6)});
      }
    }},

  'widows-needle': {name: 'Widow’s Web', cooldown: 12, reach: 9, pose: .9,
    blurb: 'Fling a web over your foes: everything inside is pinned and bleeding, then needles rain on it.',
    cast(k){
      const t = k.target(9, 5), x = round(t.x), z = round(t.z);
      k.beat(.35, {kind: 'blast', fx: 'web', x, z, r: 3.4, dmg: k.dmg(1.4), root: 2.6, dot: {dps: k.dmg(.35), s: 3, kind: 'bleed'}, sx: round(k.x), sz: round(k.z), fly: .35});
      k.beat(.85, {kind: 'call', fn: 'needles', fx: 'needles', x, z, r: 3.8, n: 6, dmg: k.dmg(.9)});
    }},

  'spirit-fan': {name: 'Tempest', cooldown: 11, reach: 5, pose: 1.5,
    blurb: 'Spin up a cyclone that keeps foes at bay and breaks their wind-ups, then release it as a gale.',
    cast(k){
      k.beat(0, {kind: 'pulse', fx: 'tempest', follow: true, r: 3.6, every: .2, life: 1.4, dmg: k.dmg(.45), push: .45, stun: .15,
        end: {kind: 'blast', fx: 'gale', follow: true, r: 6.2, dmg: k.dmg(1.8), push: 2.2, falloff: .2}});
    }},

  'mourning-bell': {name: 'Funeral Toll', cooldown: 13, reach: 6, pose: 1.6,
    blurb: 'The bell tolls three times, each ring wider and heavier; the last one stuns.',
    cast(k){
      [[.3, 4, 1.3, .8, 0], [.85, 5.6, 1.3, 1, 0], [1.45, 7.2, 2, 1.6, .9]].forEach(([t, r, m, push, st], i) =>
        k.beat(t, {kind: 'blast', fx: 'toll', follow: true, r, dmg: k.dmg(m), push, stun: st, toll: i}));
    }},

  pallbearer: {name: 'Last Rites', cooldown: 13, reach: RITE.reach, pose: .7,
    blurb: 'Whirl the coffin to a scream and hurl it: it bursts open where it lands, stunning everything, and the chain drags you in after it.',
    cast(k){
      const t = k.target(RITE.reach, 5);
      k.beat(0, {kind: 'call', fn: 'lastrites', fx: 'lastrites', tx: round(t.x), tz: round(t.z),
        line: k.dmg(1.5), slam: k.dmg(4), drag: k.dmg(1.2), land: k.dmg(2)});
    }},
});

// ------------------------------------------------------------------ special beats
export const SKILL_CALLS = Object.freeze({
  /** Soul Prison: strike every foe in reach, drag it toward the knot and bind it. */
  gather(world, b, owner, obstacles, {hit, hostiles, dist}){
    const foes = hostiles(world).filter(e => dist(e, owner) <= b.r).sort((a, c) => dist(a, owner)-dist(c, owner)).slice(0, b.n || 10);
    const pts = [];
    for(const e of foes){
      pts.push([round(e.x), round(e.z)]);
      hit(world, owner, e, {...b, push: 0}, b.x, b.z, obstacles);
      const d = Math.hypot(e.x-b.x, e.z-b.z), boss = e.type === 'king' || e.type === 'golem';
      const pull = Math.min((boss ? .35 : 1)*3.5, Math.max(0, d-.8));
      if(d > .01) for(let i = 0; i < 4; i++) world.move(e, (b.x-e.x)/d*pull/.2, (b.z-e.z)/d*pull/.2, .05, obstacles);
    }
    return {pts, hits: foes.length};
  },
  /** Absolute Zero: the ice on everything the nova froze shatters. */
  shatter(world, b, owner, obstacles, {hit, hostiles}){
    const ids = new Set(b.ids || []), pts = [];
    for(const e of hostiles(world)){
      if(!ids.has(e.id) || Math.hypot(e.x-b.x, e.z-b.z) > b.r) continue;
      pts.push([round(e.x), round(e.z)]);
      hit(world, owner, e, {...b, push: .6}, e.x, e.z, obstacles);
      if(e.frostUntil > world.time){e.stunned = 0; e.frostUntil = 0;}
    }
    return {pts, hits: pts.length};
  },
  /** Widow's Web: needles fall on whatever the web caught (pinned foes first). */
  needles(world, b, owner, obstacles, {hit, hostiles}){
    const caught = hostiles(world).filter(e => Math.hypot(e.x-b.x, e.z-b.z) <= b.r)
      .sort((a, c) => (c.magicRootRemaining > 0)-(a.magicRootRemaining > 0)).slice(0, b.n || 6);
    const pts = [];
    for(const e of caught){pts.push([round(e.x), round(e.z)]); hit(world, owner, e, b, e.x, e.z, obstacles);}
    return {pts, hits: pts.length};
  },
  /** Kitsune Parade: one more ring of nine foxfires, stepped by the lantern's own module. */
  foxring(world, b, owner){
    const power = ownerPower(world, owner)*(b.power || 1);
    const l = Math.hypot(owner.dx || 0, owner.dz || 0), dx = l > 1e-6 ? owner.dx/l : 0, dz = l > 1e-6 ? owner.dz/l : 1;
    const foes = (world.enemies || []).filter(e => e.hp > 0 && !isMagicAlly(e) && Math.hypot(e.x-owner.x, e.z-owner.z) <= FOXFIRE.range)
      .sort((a, c) => Math.hypot(a.x-owner.x, a.z-owner.z)-Math.hypot(c.x-owner.x, c.z-owner.z));
    (world.magicCasts ||= []).push({id: world.nextId('foxcast'), packId: 'kitsune-lantern', ownerId: owner.id, x: owner.x, z: owner.z, dx, dz, age: 0, life: FOXFIRE.castLife});
    for(let tail = 0; tail < FOXFIRE.tails; tail++){
      (world.magicBolts ||= []).push({id: world.nextId('foxfire'), packId: 'kitsune-lantern', ownerId: owner.id,
        x: owner.x, z: owner.z, orbitX: owner.x, orbitZ: owner.z, dx, dz, vx: dx*FOXFIRE.speed, vz: dz*FOXFIRE.speed, aim: Math.atan2(dz, dx),
        age: 0, life: FOXFIRE.life, delay: FOXFIRE.delay+tail*FOXFIRE.stagger*.7, tailIndex: tail, launched: false, traveled: 0, maxRange: FOXFIRE.range+1,
        power, damage: FOXFIRE.damage*power*(tail === 8 ? 2 : 1), targetId: foes.length ? foes[(tail+(b.ring || 0)*3)%foes.length].id : null});
    }
    world.event('foxfire', owner.x, owner.z, '', {player: owner.id});
    return {ring: b.ring || 0};
  },
  /** Barrow Legion: mend the legion, then raise up to three more beside the wielder. */
  legion(world, b, owner){
    const legion = ownedSkeletons(world, owner.id);
    for(const s of legion){s.hp = s.maxHp; s.age = 0;}
    const room = Math.max(0, (b.cap || 7)-legion.length), n = Math.min(b.n || 3, room), pts = [];
    for(let i = 0; i < n; i++){
      const a = Math.atan2(owner.dz ?? 1, owner.dx ?? 0)+(i-(n-1)/2)*1.1;
      let x = owner.x+Math.cos(a)*1.4, z = owner.z+Math.sin(a)*1.4;
      if(!world.walkable(x, z)){x = owner.x; z = owner.z;}
      if(raiseSkeleton(world, owner, x, z)) pts.push([round(x), round(z)]);
    }
    return {pts, hits: pts.length};
  },
  /** Murder of Crows: extra crows past the totem's usual flock. */
  summon(world, b, owner){
    const type = b.ally || 'crow';
    if(!ALLIES[type]) return null;
    const have = mine(world, owner, type).length, n = Math.min(b.n || 1, Math.max(0, (b.cap || 6)-have));
    for(let i = 0; i < n; i++){
      const a = i/Math.max(1, n)*TAU;
      summon(world, owner, type, owner.x+Math.cos(a)*.9, owner.z+Math.sin(a)*.9, b.dmg);
    }
    return null;
  },
  /** Last Rites: the flail's own module whirls, hurls, slams and yanks (src/magic/pallbearer.mjs). */
  lastrites(world, b, owner){return beginRite(world, owner, b);},
  /** Abyssal Grip: the scepter's own hands rise under every foe near the mark (src/magic/gloomgrasp.mjs). */
  gloomhands(world, b, owner){return gripAll(world, owner, b);},
  /** Final Chapter: the grimoire's pages ring the mark and hang there (src/grimoire.mjs). */
  finalchapter(world, b, owner){return finalChapter(world, owner, b);},
  /** Last Harvest: Death dooms everything in reach, then reaps it (src/reaper.mjs). */
  deathmark(world, b, owner){return deathMark(world, owner, b);},
  /** Wild Hunt: your Grave Knight charges the mark and ends in a Gravefall there (src/wightcaller.mjs). */
  wildhunt(world, b, owner){return wildHunt(world, owner, b, summon);},
  deathreap(world, b, owner, obstacles, {hit}){return deathReap(world, owner, b, e => hit(world, owner, e, b, owner.x, owner.z, obstacles));},
});
