// Presentation only. Gameplay modules never read this file. A theme can replace
// any sprite or override magic.palette / magic.motion without changing combat.
export const GRAVECRAFT = Object.freeze({
  'barrow-rattle': {size: [1.85, 1.85], anchor: [.5, .2], motion: 'rattle'},
  'cinder-staff': {size: [2.8, 2.8], anchor: [.5, .3], motion: 'staff'},
  'widows-needle': {size: [2.25, 2.25], anchor: [.5, .22], motion: 'needle'},
  'spirit-fan': {size: [2.15, 2.15], anchor: [.5, .17], motion: 'fan'},
  'mourning-bell': {size: [1.55, 1.55], anchor: [.5, .62], motion: 'bell'},
});

/** Held poses for the Long Night weapons. Sprites come from the theme under the item id. */
export const HELD_GEAR = Object.freeze({
  broadsword: {motion: 'swing', sprite: 'held-broadsword'}, flamberge: {motion: 'swing', sprite: 'held-flamberge'},
  recurve: {motion: 'bow', handY: 1.0, sprite: 'held-recurve'}, bonebow: {motion: 'bow', handY: 1.0, sprite: 'held-bonebow'},
  crookstaff: {motion: 'staff', sprite: 'held-crookstaff'}, skullstaff: {motion: 'staff', sprite: 'held-skullstaff'},
  tome: {motion: 'tome', handY: 1.25, handX: .55, sprite: 'held-tome'},
  fangs: {motion: 'thrust', sprite: 'held-fangs'}, soulchain: {motion: 'swing', sprite: 'held-soulchain'},
  scythe: {motion: 'swing', sprite: 'held-scythe'}, wisplantern: {motion: 'bell', handY: 1.0, sprite: 'held-wisplantern'},
  stormrod: {motion: 'staff', sprite: 'held-stormrod'}, starfall: {motion: 'staff', sprite: 'held-starfall'},
  crowtotem: {motion: 'rattle', sprite: 'held-crowtotem'}, jacklantern: {motion: 'bell', handY: 1.0, sprite: 'held-jacklantern'},
  wighthorn: {motion: 'tome', handY: 1.2, sprite: 'held-wighthorn'}, censer: {motion: 'bell', handY: 1.0, sprite: 'held-censer'},
});

export const MAGIC_PALETTE = Object.freeze({
  ink: '#2b2233', spirit: '#7fd6c4', core: '#d4fff5', shade: '#45a394',
  ember: '#e8b04a', bronze: '#b98d54', silk: '#d2bbdf', cloth: '#8f3a3f',
});

export function gravecraftSprite(id){
  const art = GRAVECRAFT[id];
  if(!art) return null;
  return {src: `assets/magic/gravecraft/${id}.png`, size: art.size, anchor: art.anchor,
    columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}, held: true};
}

export const skeletonSprite = {
  src: 'assets/magic/gravecraft/skeleton.png', size: [1.8, 2.15], anchor: [.5, .025],
  columns: 4, rows: 3,
  clips: {idle: {frames: [0, 1, 2, 3], fps: 4}, walk: {frames: [4, 5, 6, 7], fps: 9}, attack: {frames: [8, 9, 10, 11], fps: 9}},
};

const clamp = (n, lo=0, hi=1) => Math.max(lo, Math.min(hi, n));
const ease = n => 1-(1-clamp(n))**3;

// Bounded extrapolation between host snapshots; never advances the simulation.
export class MagicClock {
  constructor(){this.reset();}
  reset(){this.worldTime = null; this.observed = 0; this.seed = null;}
  sample(world, clock){
    if(world.time !== this.worldTime || world.seed !== this.seed){
      this.worldTime = world.time; this.observed = clock; this.seed = world.seed;
    }
    return {time: world.time + clamp(clock-this.observed, 0, .1), lead: clamp(clock-this.observed, 0, .1)};
  }
}

export function heldWeaponPose(player, time, theme={}){
  const id = player.equipment?.weapon?.itemId;
  if(!GRAVECRAFT[id] && !HELD_GEAR[id]) return null;
  const spec = {...(GRAVECRAFT[id] || HELD_GEAR[id]), ...theme.magic?.weapons?.[id]};
  const side = player.dx < -.1 ? -1 : 1;
  const cast = player.magicCast;
  const age = cast?.itemId === id ? time-cast.at : Infinity;
  const duration = theme.magic?.motion?.castSeconds || .6;
  const t = clamp(age / duration);
  const active = age >= 0 && age < duration;
  let rotation = -.10*side, reach = 0, scale = 1;
  if(active){
    const fade = 1-t;
    if(spec.motion === 'rattle') rotation += Math.sin(t*28)*.48*fade;
    if(spec.motion === 'staff') rotation += side*(-.65*Math.exp(-t*10)+.55*Math.sin(t*Math.PI)*fade);
    if(spec.motion === 'needle'){reach = Math.sin(Math.min(1,t*2.2)*Math.PI)*.8; rotation += side*.9*Math.sin(t*Math.PI);}
    if(spec.motion === 'fan'){rotation += side*Math.sin(t*Math.PI)*1.4; scale = .75+.25*Math.sin(t*Math.PI);}
    if(spec.motion === 'bell') rotation += Math.sin(t*21)*.8*fade;
    if(spec.motion === 'swing') rotation += side*(1.1-2.6*ease(t))*fade;
    if(spec.motion === 'thrust'){reach = Math.sin(Math.min(1,t*2)*Math.PI)*.9; rotation += side*.7;}
    if(spec.motion === 'bow'){rotation += side*.25*fade; reach = -.15*Math.sin(t*Math.PI);}
    if(spec.motion === 'tome'){scale = 1+.25*Math.sin(t*Math.PI); rotation += Math.sin(t*14)*.2*fade;}
  }
  const length = Math.hypot(player.dx||0,player.dz||0)||1;
  return {key: spec.sprite || id, x: side*(spec.handX??.48)+(player.dx||0)/length*reach, z: .04+(player.dz||0)/length*reach,
    y: (spec.handY??1.12)+Math.sin(time*2.4)*.025+(active?Math.sin(t*Math.PI)*.12:0),
    rotation, side, scale: scale*(spec.heldScale??1), active};
}

export function skeletonFrame(entity, lead=0, def=skeletonSprite){
  const anim=entity.anim==='attack'?'attack':entity.anim==='walk'?'walk':'idle';
  const clip=def.clips?.[anim]||def.clips?.idle||skeletonSprite.clips[anim];
  if(anim==='attack') return clip.frames[Math.min(clip.frames.length-1,Math.floor(((entity.swingT||0)+lead)/.44*clip.frames.length))];
  return clip.frames[Math.floor(((entity.age||0)+lead)*(clip.fps||4))%clip.frames.length];
}
