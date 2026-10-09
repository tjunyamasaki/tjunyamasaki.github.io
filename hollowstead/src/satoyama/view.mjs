// What both renderers draw of a Satoyama world: its ground, its standing decoration, its animals, and the
// Yomi look of its camp pieces. Presentation only; never THREE, never the DOM.

import {placeGround, placeProps} from './land.mjs?v=harvest-18';
import {animalSprite} from './animals.mjs?v=harvest-18';
import {builtAt} from '../homestead.mjs?v=harvest-18';

/** The Satoyama ground colours for the place the party is in (null anywhere else). */
export function satoyamaGround(world, palette){
  return world?.satoyama ? placeGround(world.seed, world.satoyama.place, palette) : null;
}
/** A key identifying the ground a renderer built (it rebuilds when this changes). */
export const groundKey = world => world?.satoyama ? `sato:${world.satoyama.place}` : '';

/**
 * Camp pieces drawn the Yomi way in Satoyama: theme sprites named `y-<type>` (a futon for the bedroll, an irori for the
 * fire...). The structure ids, costs and rules stay the same; only the look changes.
 */
export const YOMI_SKINS = Object.freeze({bench: 'y-bench', chest: 'y-chest', fire: 'y-fire', pot: 'y-pot', bed: 'y-bed'});
export function buildingKey(world, type, theme){
  const skin = world?.satoyama && YOMI_SKINS[type];
  return skin && theme?.sprites?.[skin] ? skin : type;
}

/** Standing decoration as renderer entries ({e, key, kind:'prop'}); anything built over hides what stood there. */
export function satoyamaProps(world, theme){
  if(!world?.satoyama) return [];
  const out = [];
  for(const p of placeProps(world.seed, world.satoyama.place)){
    if(!theme.sprites[p.key]) continue;
    if(world.tiles && builtAt(world, p.x, p.z)) continue;
    out.push({e: {id: p.id, x: p.x, z: p.z, scale: p.scale, glow: p.light > 0, light: p.light, tint: p.tint}, key: p.key, kind: 'prop'});
  }
  return out;
}

/** Animals as renderer entries: kind 'animal', clip from what it is doing (walk, peck, idle). */
export function animalEntries(world, theme){
  const out = [];
  for(const a of world?.animals || []){
    const key = animalSprite(a);
    out.push({e: a, key: theme.sprites[key] ? key : a.type, kind: 'animal'});
  }
  return out;
}
