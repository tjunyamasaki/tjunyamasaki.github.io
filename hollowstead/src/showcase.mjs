// Showcase: a gallery of every object in the game, laid out on an empty floor in rows by kind, all visible at
// once so their art can be compared, fixed or replaced. Weapons and gear stand on display stands; materials, food
// and books lie on the floor. Walk among them; the nearest (or a tapped) one is inspected: its name, id, sprite
// key, world size and frames.
//
// The layout is presentation only (world.gallery, built from the live content tables and the theme): nothing in
// it collides, moves, fights or can be picked up. Solo, never saved.
import {CHARACTERS, ENEMIES, EQUIPMENT, ITEMS, NODES, STRUCTURES, label} from './content.mjs?v=harvest-18';
import {clearMagicLists, magicItems, magicMobEntries} from './magic/registry.mjs?v=harvest-18';
import {BOOKS} from './refine-mods.mjs?v=harvest-18';
import {CROPS} from './homestead.mjs?v=harvest-18';
import {itemSpriteKey} from './inventory.mjs?v=harvest-18';
import {ANIMALS} from './satoyama/animals.mjs?v=harvest-18';

/** How the floor is laid: rows this wide, this much air between things, and between kinds. */
export const GALLERY = Object.freeze({slot: 2.1, width: 64, x0: -32, z0: -46, gap: .7, rowGap: 1.6, catGap: 3.4, reach: 3.2, stand: 'showstand', lift: .62});

/** The kinds of things, in the order they are laid out. */
export const GALLERY_CATEGORIES = Object.freeze([
  {id: 'wanderers', label: 'Wanderers'},
  {id: 'creatures', label: 'Creatures'},
  {id: 'animals', label: 'Animals'},
  {id: 'nature', label: 'Trees, rocks & finds'},
  {id: 'crops', label: 'Crops'},
  {id: 'buildings', label: 'Buildings'},
  {id: 'decoration', label: 'Decoration'},
  {id: 'gear', label: 'Weapons & gear'},
  {id: 'items', label: 'Materials & food'},
  {id: 'books', label: 'Books'},
]);
/** Standing decoration the places use (worldgen.mjs areaProps, satoyama/land.mjs) that is no node or structure. */
const DECORATION = ['torii', 'jizo', 'gorinto', 'sotoba', 'ema', 'bonsho', 'yomi-grass', 'yomi-shrub', 'yomi-lilies', 'sakura', 'matsu', 'yanagi', 'bamboo', 'bamboo-b', 'plaza-prop'];
/** The camp as Satoyama draws it (satoyama/view.mjs YOMI_SKINS). */
const SKINS = ['y-bench', 'y-chest', 'y-fire', 'y-pot', 'y-bed'];

/** Every thing to show, by category: [{cat, id, key, name, frame?, stand?}], only what the theme can draw. */
export function galleryEntries(theme){
  const has = key => !!key && !!theme?.sprites?.[key];
  const out = [], seen = new Set();
  const add = (cat, id, key, name, extra = {}) => {
    const tag = `${cat}:${key}:${extra.frame ?? ''}`;
    if(!has(key) || seen.has(tag)) return;
    seen.add(tag);out.push({cat, id, key, name, ...extra});
  };
  for(const c of CHARACTERS) if(c.look || c.fixed) add('wanderers', c.id, c.id, c.look ? `${c.name} · ${c.look}` : c.name);
  for(const [id, e] of Object.entries(ENEMIES)) add('creatures', id, id, e.name);
  for(const entry of magicMobEntries()) add('creatures', entry.id, entry.id, entry.name);
  for(const [type, a] of Object.entries(ANIMALS)){add('animals', type, type, a.name);add('animals', `${type}-young`, `${type}-young`, a.young);}
  for(const [type, n] of Object.entries(NODES)){
    const variants = theme?.sprites?.[type]?.variants;
    for(const key of variants?.length ? [...new Set(variants)] : [type]) add('nature', type, key, key === type ? n.name : `${n.name} · ${key}`);
  }
  for(const [id, crop] of Object.entries(CROPS)) for(let f = 0; f < 4; f++) add('crops', id, `crop-${id}`, `${crop.name} · ${['sprout', 'young', 'growing', 'ripe'][f]}`, {frame: f});
  for(const [id, s] of Object.entries(STRUCTURES)) add('buildings', id, id, s.name);
  for(const key of SKINS) add('buildings', key.slice(2), key, `${STRUCTURES[key.slice(2)]?.name || key} · Satoyama`);
  for(const key of DECORATION) add('decoration', key, key, key);
  for(const id of [...Object.keys(EQUIPMENT), ...Object.keys(magicItems)]) add('gear', id, itemSpriteKey(id), label(id), {stand: true});
  for(const id of Object.keys(ITEMS)) add('items', id, itemSpriteKey(id), label(id));
  for(const id of Object.keys(BOOKS)) add('books', id, itemSpriteKey(id), label(id));
  return out;
}

/**
 * The gallery's floor plan: {entries:[{id, cat, item, key, name, x, z, w, h, frame?, lift?}], headers:[{cat, label, x, z}], start:{x, z}}.
 * Things stand in rows left to right, as wide as their art; a row is as deep as its tallest piece.
 */
export function galleryLayout(theme){
  const G = GALLERY, list = galleryEntries(theme), entries = [], headers = [];
  let z = G.z0, n = 0;
  for(const cat of GALLERY_CATEGORIES){
    const mine = list.filter(e => e.cat === cat.id);
    if(!mine.length) continue;
    // The kind's name floats over its first row, just above the tallest piece in it (y: world height).
    const head = {cat: cat.id, label: cat.label, x: G.x0, z, y: 0};headers.push(head);
    let x = G.x0, rowH = 0, tall = 0;const row = [];
    const flush = () => {
      const rz = +(z + rowH * .55).toFixed(2);
      for(const e of row)e.z = rz;
      if(!head.y){head.z = rz;head.y = +(tall + .5).toFixed(2);}
      z += rowH * .55 + G.rowGap;row.length = 0;x = G.x0;rowH = 0;tall = 0;
    };
    for(const e of mine){
      const def = theme.sprites[e.key], stand = e.stand ? theme.sprites[G.stand] : null;
      // Small pieces still get room for their name underneath.
      const w = Math.max(G.slot, Math.max(def.size[0], stand ? stand.size[0] : 0) * .82), h = Math.max(1.4, def.size[1] * .75 + (stand ? G.lift : 0));
      if(x > G.x0 && x + w > G.x0 + G.width) flush();
      const placed = {id: `g${n++}`, cat: e.cat, item: e.id, key: e.key, name: e.name, x: +(x + w / 2).toFixed(2), z: 0, w: +w.toFixed(2), h: +h.toFixed(2)};
      if(e.frame != null) placed.frame = e.frame;
      if(stand) placed.lift = G.lift;
      entries.push(placed);row.push(placed);
      x += w + G.gap;rowH = Math.max(rowH, h);tall = Math.max(tall, def.size[1] * .8 + (stand ? G.lift : 0));
    }
    flush();z += G.catGap;
  }
  return {entries, headers, start: {x: G.x0 + 2, z: G.z0 - 1.5}};
}

/** Renderer entries ({e, key, kind:'prop'}) for a gallery: each thing, and a stand under each piece of gear. */
export function galleryProps(world, theme){
  const g = world?.gallery;if(!g) return [];
  const out = [];
  for(const e of g.entries){
    if(e.lift && theme.sprites[GALLERY.stand]) out.push({e: {id: `${e.id}s`, x: e.x, z: e.z - .02}, key: GALLERY.stand, kind: 'prop'});
    out.push({e: {id: e.id, x: e.x, z: e.z, frame: e.frame, lift: e.lift}, key: e.key, kind: 'prop'});
  }
  return out;
}

/** The gallery piece nearest a point within `reach`, or null. */
export function galleryNear(world, x, z, reach = GALLERY.reach){
  let best = null, bd = reach;
  for(const e of world?.gallery?.entries || []){const d = Math.hypot(e.x - x, e.z - z);if(d < bd){bd = d;best = e;}}
  return best;
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

/** What the inspector says of a piece: its name, ids and art. */
export function inspectLines(entry, theme){
  if(!entry) return null;
  const def = theme?.sprites?.[entry.key] || {};
  const frames = (def.columns || 1) * (def.rows || 1), clips = Object.keys(def.clips || {}).join(', ');
  return {
    name: entry.name, item: entry.item, key: entry.key, cat: GALLERY_CATEGORIES.find(c => c.id === entry.cat)?.label || entry.cat,
    size: def.size ? `${def.size[0]} × ${def.size[1]}` : '', sheet: `${def.columns || 1} × ${def.rows || 1}${frames > 1 ? ` · ${frames} frames` : ''}`,
    clips, frame: entry.frame, src: String(def.src || '').split('/').pop().split('?')[0], icon: def.icon ? String(def.icon).split('/').pop().split('?')[0] : '',
  };
}

/**
 * The showcase panel: a strip of the kinds (tap one to walk to its rows), a labels switch, and the inspector.
 * `inspect` from inspectLines; `icon(key)` for a small picture.
 */
export function showcaseMarkup({inspect = null, labels = true, icon = () => ''} = {}){
  const chips = GALLERY_CATEGORIES.map(c => `<button type="button" class="chip" data-showcase-go="${c.id}">${escapeHtml(c.label)}</button>`).join('');
  const bar = `<div class="showcase-bar"><div class="showcase-cats" role="group" aria-label="Go to">${chips}</div><button type="button" data-showcase-tool="labels" aria-pressed="${labels ? 'true' : 'false'}">Labels</button></div>`;
  if(!inspect) return `${bar}<div class="showcase-inspect muted small">Walk up to anything, or tap it, to inspect it.</div>`;
  const rows = [['Kind', inspect.cat], ['Id', inspect.item], ['Sprite', inspect.key], ['Size', inspect.size], ['Sheet', inspect.sheet], ['Clips', inspect.clips], ['Frame', inspect.frame ?? ''], ['File', inspect.src], ['Icon', inspect.icon]]
    .filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<div><span>${k}</span><b>${escapeHtml(v)}</b></div>`).join('');
  return `${bar}<div class="showcase-inspect" role="status"><header>${icon(inspect.item)}<b>${escapeHtml(inspect.name)}</b></header><div class="showcase-facts">${rows}</div></div>`;
}

/** Empty a showcase world of everything that moves or was dropped (the gallery itself stays). */
export function clearShowcaseWorld(world){
  if(!world?.showcase) return;
  world.nodes = [];world.buildings = [];world.enemies = [];world.drops = [];world.hostile = [];world.projectiles = [];
  world.harvestWork?.clear?.();world.reviveWork?.clear?.();world.dismantleHolds?.clear?.();world.chestSessions?.clear?.();
  clearMagicLists(world);
  for(const player of world.players || []) delete player.magicCast;
}
