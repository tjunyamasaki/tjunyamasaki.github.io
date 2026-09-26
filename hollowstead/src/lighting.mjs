// Renderer-independent night illumination. Gameplay safety radii stay in
// content/STRUCTURES and contracts/RANGES. A theme may change colors and
// feathering; it cannot change who is safe.
// This module must not import Three.js or a renderer.

import {EQUIPMENT, RULES, STRUCTURES} from './content.mjs?v=harvest-16';
import {RANGES} from './contracts.mjs?v=harvest-16';
import {equippedLanternLit} from './inventory.mjs?v=harvest-16';

export const HEARTH_LEVEL_STEP = 1.5;
export const PLAYER_LIGHT_RADIUS = RANGES.lanternLight;
/** Last seconds of torch fuel. The safe disc and the visible pool share this shrink. */
export const LANTERN_FADE_SECONDS = 6;
export const LIGHT_FIELD_SIZE = 96;
export const LIGHT_FIELD_ORIGIN = -45;
export const LIGHT_FIELD_SPAN = 90;

const DEFAULT_LIGHTING = Object.freeze({
  ambientNight: 0.03,
  litBrightness: 0.92,
  transitionSeconds: 7,
  dawnSeconds: 4,
  readableFraction: 0.8,
  ambientFraction: 1.2,
  nightTint: '#191b2b',
  unlitTint: '#737b9f',
  sourceTint: '#fff0c8',
  dayTint: '#ffffff',
  localSilhouette: 0.14,
  emissiveCore: 0.42,
});

function clamp(value, min, max){return Math.min(max, Math.max(min, value));}

function numberOr(value, fallback, min, max){
  const n=Number(value);
  return Number.isFinite(n)?clamp(n, min, max):fallback;
}

export function parseHex(value){
  const match=/^#?([0-9a-f]{6})$/i.exec(String(value??''));
  if(!match)return null;
  const n=parseInt(match[1], 16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}

function hexOr(value, fallback){
  return parseHex(value)?String(value).toLowerCase():fallback;
}

/** Missing theme.lighting, or any missing field, uses these defaults so an older theme still loads. */
export function resolveLighting(theme){
  const raw=theme&&typeof theme.lighting==='object'&&theme.lighting?theme.lighting:{};
  const readable=numberOr(raw.readableFraction, DEFAULT_LIGHTING.readableFraction, 0.05, 1);
  let ambientFraction=numberOr(raw.ambientFraction, DEFAULT_LIGHTING.ambientFraction, 0.05, 3);
  if(ambientFraction<=readable)ambientFraction=Math.min(3, readable+0.05);
  const ambientNight=numberOr(raw.ambientNight, DEFAULT_LIGHTING.ambientNight, 0, 1);
  let litBrightness=numberOr(raw.litBrightness, DEFAULT_LIGHTING.litBrightness, 0, 1);
  if(litBrightness<ambientNight)litBrightness=ambientNight;
  return {
    ambientNight,
    litBrightness,
    transitionSeconds:numberOr(raw.transitionSeconds, DEFAULT_LIGHTING.transitionSeconds, 0, 120),
    dawnSeconds:numberOr(raw.dawnSeconds, DEFAULT_LIGHTING.dawnSeconds, 0, 60),
    readableFraction:readable,
    ambientFraction,
    nightTint:hexOr(raw.nightTint, DEFAULT_LIGHTING.nightTint),
    unlitTint:hexOr(raw.unlitTint, DEFAULT_LIGHTING.unlitTint),
    sourceTint:hexOr(raw.sourceTint, DEFAULT_LIGHTING.sourceTint),
    dayTint:hexOr(raw.dayTint, DEFAULT_LIGHTING.dayTint),
    localSilhouette:numberOr(raw.localSilhouette, DEFAULT_LIGHTING.localSilhouette, 0, 0.45),
    emissiveCore:numberOr(raw.emissiveCore, DEFAULT_LIGHTING.emissiveCore, 0, 1),
  };
}

export function smoothstep(t){
  const x=t<0?0:t>1?1:t;
  return x*x*(3-2*x);
}

/** Display-referred 0–1 brightness to a linear multiplier. 0.03 stays barely visible. */
export function linearFromDisplay(display){
  const c=clamp(display, 0, 1);
  return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
}

export function clockSchedule(rules=RULES){
  return {day:rules.day, dusk:rules.dusk, night:rules.night, cycle:rules.cycle};
}

/**
 * 0 during the day, rising across dusk and the first transitionSeconds of night,
 * holding through midnight, then falling across the first dawnSeconds of the next day.
 */
export function phaseDarkness(time, schedule=clockSchedule(), lighting=resolveLighting(null)){
  const cycle=schedule.cycle;
  if(!Number.isFinite(time)||!Number.isFinite(cycle)||cycle<=0)return 0;
  let t=time%cycle;
  if(t<0)t+=cycle;
  const dawn=lighting.dawnSeconds;
  const transition=lighting.transitionSeconds;
  const duskStart=schedule.day;
  const fullAt=schedule.day+schedule.dusk+transition;
  if(dawn>0&&t<dawn)return 1-smoothstep(t/dawn);
  if(t<duskStart)return 0;
  if(fullAt<=duskStart||t>=fullAt)return 1;
  return smoothstep((t-duskStart)/(fullAt-duskStart));
}

/** Gameplay radius. Soul lanterns need no fuel. Heartfire grows by HEARTH_LEVEL_STEP per level above 1. */
export function structureLightRadius(building){
  const base=STRUCTURES[building?.type]?.light||0;
  if(!(base>0))return 0;
  if(building.type!=='lantern'&&!(building.fuel>0))return 0;
  const bonus=building.type==='hearth'?Math.max(0, (Number(building.level)||1)-1)*HEARTH_LEVEL_STEP:0;
  return base+bonus;
}

/** Full radius until the last LANTERN_FADE_SECONDS, then a smoothstep down to nothing. */
export function playerLanternRadius(player){
  if(!equippedLanternLit(player))return 0;
  if(player.equipment.light.itemId==='everlantern')return PLAYER_LIGHT_RADIUS*1.45;
  const fuel=Number(player.equipment?.light?.durability);
  const fade=LANTERN_FADE_SECONDS;
  if(!(fuel>0)||!(fade>0))return 0;
  if(fuel>=fade)return PLAYER_LIGHT_RADIUS;
  return PLAYER_LIGHT_RADIUS*smoothstep(fuel/fade);
}

/** Active sources only: fueled fires, soul lanterns, and a living equipped lantern. */
export function collectLightSources(world){
  const sources=[];
  for(const building of world?.buildings||[]){
    const radius=structureLightRadius(building);
    if(radius>0)sources.push({x:building.x||0, z:building.z||0, radius, kind:building.type, id:building.id});
  }
  for(const player of world?.players||[]){
    const radius=playerLanternRadius(player);
    if(radius>0)sources.push({x:player.x||0, z:player.z||0, radius, kind:'player', id:player.id});
  }
  return sources;
}

/** Strict safety disc. The visual halo past this radius does not grant courage. */
export function inSafeLight(sources, x, z){
  for(const source of sources||[]){
    if(Math.hypot(x-source.x, z-source.z)<source.radius)return true;
  }
  return false;
}

/** 1 inside 0.8 of the safety radius, 0 by 1.2, smooth between. Clamped per source, not summed. */
export function lightStrength(distance, radius, lighting=resolveLighting(null)){
  if(!(radius>0)||!Number.isFinite(distance))return 0;
  const inner=radius*lighting.readableFraction;
  const outer=radius*lighting.ambientFraction;
  if(distance<=inner)return 1;
  if(distance>=outer)return 0;
  const span=outer-inner;
  if(!(span>0))return 0;
  return 1-smoothstep((distance-inner)/span);
}

export function combinedStrength(sources, x, z, lighting=resolveLighting(null)){
  let best=0;
  for(const source of sources||[]){
    const next=lightStrength(Math.hypot(x-source.x, z-source.z), source.radius, lighting);
    if(next>best)best=next;
    if(best>=1)break;
  }
  return best;
}

/** Day tint, or a mix from the cool unlit tint toward the warm lamp tint. */
export function spriteTint(lamp, darkness, lighting=resolveLighting(null)){
  const day=parseHex(lighting.dayTint)||{r:255,g:255,b:255};
  const unlit=parseHex(lighting.unlitTint)||day;
  const source=parseHex(lighting.sourceTint)||day;
  const cover=clamp(darkness,0,1);
  const warm=clamp(lamp,0,1);
  const mix=(a,b,t)=>({r:a.r+(b.r-a.r)*t, g:a.g+(b.g-a.g)*t, b:a.b+(b.b-a.b)*t});
  return mix(day, mix(unlit, source, warm), cover);
}

/** Display brightness: 1 by day, ambientNight in unlit midnight, litBrightness inside a lamp. */
export function brightnessAt(sources, x, z, darkness, lighting=resolveLighting(null)){
  const cover=clamp(darkness, 0, 1);
  const lamp=combinedStrength(sources, x, z, lighting);
  const night=lighting.ambientNight+(lighting.litBrightness-lighting.ambientNight)*lamp;
  return (1-cover)+cover*night;
}

export function frameLighting(world, theme){
  const lighting=resolveLighting(theme);
  const darkness=phaseDarkness(world?.time||0, clockSchedule(), lighting);
  const sources=collectLightSources(world);
  return {lighting, darkness, sources};
}

export function entityBrightness(frame, x, z, {local=false, emissive=false}={}){
  if(!frame)return 1;
  let value=brightnessAt(frame.sources, x, z, frame.darkness, frame.lighting);
  if(local)value=Math.max(value, frame.lighting.localSilhouette);
  if(emissive)value=Math.max(value, frame.lighting.ambientNight+(frame.lighting.emissiveCore-frame.lighting.ambientNight)*frame.darkness);
  return Math.min(1, value);
}

/** Nameplates, bars, floaters, and selection fade out before they can reveal a dark target. */
export function labelOpacity(brightness, darkness, lighting=resolveLighting(null)){
  if(!(darkness>0.15))return 1;
  const floor=lighting.ambientNight+0.025;
  const shown=lighting.ambientNight+0.28;
  if(brightness<=floor)return 0;
  if(brightness>=shown)return 1;
  return smoothstep((brightness-floor)/(shown-floor));
}

/** Daylight, a readable lamp, or immediate reach. A dark shape across the map is not a target. */
export function canInspect(frame, x, z, viewer, reach){
  if(!frame||frame.darkness<0.35)return true;
  if(viewer&&Number.isFinite(reach)&&Math.hypot((viewer.x||0)-x, (viewer.z||0)-z)<reach)return true;
  return brightnessAt(frame.sources, x, z, frame.darkness, frame.lighting)>=frame.lighting.ambientNight+0.2;
}

/** Attack telegraphs stay only where they meet the local player or a nearby lit patch. */
export function warningVisible(frame, x, z, radius, viewer){
  if(!frame||frame.darkness<0.35)return true;
  if(!viewer)return false;
  const distance=Math.hypot((viewer.x||0)-x, (viewer.z||0)-z);
  if(distance<=(radius||0)+1.2)return true;
  if(distance>16)return false;
  return brightnessAt(frame.sources, x, z, frame.darkness, frame.lighting)>=frame.lighting.ambientNight+0.22;
}

export function shadeHex(hex, displayBrightness, darkness, lighting=resolveLighting(null)){
  const base=parseHex(hex);
  if(!base)return hex;
  const tint=parseHex(lighting.nightTint);
  const cover=clamp(darkness, 0, 1);
  const mix=tint?cover*0.28:0;
  const scale=clamp(displayBrightness, 0, 1);
  const channel=(from, toward)=>Math.round((from+(toward-from)*mix)*scale);
  return `rgb(${channel(base.r, tint?tint.r:base.r)},${channel(base.g, tint?tint.g:base.g)},${channel(base.b, tint?tint.b:base.b)})`;
}

/** Byte field of lamp strength, row 0 at high z, for a CanvasTexture with flipY. */
export function writeLightField(data, size, origin, span, sources, lighting=resolveLighting(null)){
  const ox=typeof origin==='number'?origin:origin.x, oz=typeof origin==='number'?origin:origin.z;
  for(let row=0;row<size;row++){
    const z=oz+(1-(row+0.5)/size)*span;
    for(let col=0;col<size;col++){
      const x=ox+(col+0.5)/size*span;
      const byte=Math.round(clamp(combinedStrength(sources, x, z, lighting), 0, 1)*255);
      const i=(row*size+col)*4;
      data[i]=data[i+1]=data[i+2]=byte;
      data[i+3]=255;
    }
  }
}
