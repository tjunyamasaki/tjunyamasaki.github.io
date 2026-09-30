// How dropped items look on the ground, shared by both renderers.
//
// A drop is drawn from the item's inventory icon (the same picture the player learns in the bag), about
// one world unit across, as a "sticker": a rim in the item's rarity colour (cream for common loot) with a
// thin ink edge outside it, so it reads on any ground colour at phone size. Epic and legendary loot also
// get a beacon: a column of light in the rarity colour, a ring that ripples out on the ground and motes
// rising up the beam, strong enough to spot in daylight from across the screen.
import {RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-18';
import {loadImage} from './assets.mjs?v=harvest-18';

export const DROP_ART = 0.95;          // world units: the longest side of the item art
export const DROP_RIM = 0.075;         // world units: the coloured rim
export const DROP_EDGE = 0.04;         // world units: the ink edge outside the rim
const RES = 110;                       // sticker pixels per world unit (sharp at dpr 1.6 and full zoom)
const INK = '#2b2233';
const COMMON_RIM = '#f3ead2';

const VALUABLE = new Set(['epic', 'legendary']);

/** Rim colour for a dropped item: its rarity colour, or cream for common loot. */
export function dropRim(itemId){
  const rarity = rarityOf(itemId);
  return rarity === 'common' ? COMMON_RIM : RARITY_COLORS[rarity] || COMMON_RIM;
}

/** Beacon for valuable loot, or null. Sizes in world units. */
export function lootBeacon(itemId){
  const rarity = rarityOf(itemId);
  if(!VALUABLE.has(rarity)) return null;
  const legendary = rarity === 'legendary';
  return {
    rarity, color: RARITY_COLORS[rarity],
    height: legendary ? 4.8 : 3.9, width: legendary ? 1.15 : .95,
    ring: legendary ? 1.7 : 1.45, motes: legendary ? 6 : 4, period: legendary ? 1.35 : 1.7,
  };
}

/**
 * Beacon strength for this moment: daylight still gets a clearly visible beam, night a brighter one.
 * `blink` is the expiry blink (fx dropBlink).
 */
export function beaconStrength(darkness = 0, clock = 0, seed = 0, blink = 1){
  const pulse = .88 + .12 * Math.sin(clock * 3.1 + seed);
  return Math.min(1, (.8 + .3 * darkness) * pulse) * blink;
}

/** Phase 0..1 of the ground ripple, and the motes' heights (0..1 of the beam) at `clock`. */
export function beaconPhase(beacon, clock = 0, seed = 0){
  const ripple = ((clock + seed * .37) / beacon.period) % 1;
  const motes = [];
  for(let i = 0; i < beacon.motes; i++){
    const t = (clock * .42 + i / beacon.motes + seed * .13) % 1;
    motes.push({t, x: Math.sin(clock * 1.7 + i * 2.3 + seed) * beacon.width * .32, alpha: Math.sin(Math.PI * t)});
  }
  return {ripple, motes};
}

// ---------------------------------------------------------------- stickers (browser only)
const sources = new Map();   // sprite key -> {image, sx, sy, sw, sh} | 'loading' | 'missing'
const stickers = new Map();  // key|colour -> sticker

function canvas(w, h){
  if(typeof document !== 'undefined'){const c = document.createElement('canvas'); c.width = w; c.height = h; return c;}
  if(typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  return null;
}

function sourceFor(theme, key){
  const known = sources.get(key);
  if(known && typeof known === 'object') return known;
  if(known) return null;
  const def = theme?.sprites?.[key];
  if(!def){sources.set(key, 'missing'); return null;}
  const icon = typeof def.icon === 'string' ? def.icon : null;
  sources.set(key, 'loading');
  loadImage(icon || def.src).then(image => {
    const cols = icon ? 1 : def.columns || 1, rows = icon ? 1 : def.rows || 1;
    const sw = (image.naturalWidth || image.width) / cols, sh = (image.naturalHeight || image.height) / rows;
    sources.set(key, {image, sx: 0, sy: 0, sw, sh});
  }).catch(() => sources.set(key, 'missing'));
  return null;
}

/** Start decoding the art for every sprite that has an inventory icon, so drops appear at once. */
export function preloadDropArt(theme){
  const keys = Object.entries(theme?.sprites || {}).filter(([, def]) => typeof def?.icon === 'string').map(([key]) => key);
  for(const key of keys) sourceFor(theme, key);
}

function tinted(art, color){
  const c = canvas(art.width, art.height), g = c.getContext('2d');
  g.drawImage(art, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function stamp(g, sil, x, y, radius){
  // Several rings so thin shapes (a sword's blade) dilate without gaps.
  for(const k of [1, .66, .33]){
    const r = radius * k, n = Math.max(12, Math.round(r * .9));
    for(let i = 0; i < n; i++){
      const a = i / n * Math.PI * 2;
      g.drawImage(sil, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }
}

function buildSticker(src, color){
  // 1. Draw the cell and find the art's bounding box.
  const longest = 256, k0 = longest / Math.max(src.sw, src.sh);
  const tw = Math.max(1, Math.round(src.sw * k0)), th = Math.max(1, Math.round(src.sh * k0));
  const tmp = canvas(tw, th);
  if(!tmp) return null;
  const t = tmp.getContext('2d', {willReadFrequently: true});
  t.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, 0, 0, tw, th);
  const data = t.getImageData(0, 0, tw, th).data;
  let x0 = tw, y0 = th, x1 = -1, y1 = -1;
  for(let y = 0; y < th; y++) for(let x = 0; x < tw; x++) if(data[(y * tw + x) * 4 + 3] > 24){
    if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
  }
  if(x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // 2. Scale the trimmed art so its longest side is DROP_ART.
  const k = DROP_ART * RES / Math.max(bw, bh);
  const aw = Math.max(1, Math.round(bw * k)), ah = Math.max(1, Math.round(bh * k));
  const art = canvas(aw, ah);
  art.getContext('2d').drawImage(tmp, x0, y0, bw, bh, 0, 0, aw, ah);
  // 3. Ink edge, rim, art.
  const rim = DROP_RIM * RES, edge = (DROP_RIM + DROP_EDGE) * RES, pad = Math.ceil(edge) + 2;
  const out = canvas(aw + pad * 2, ah + pad * 2), g = out.getContext('2d');
  stamp(g, tinted(art, INK), pad, pad, edge);
  stamp(g, tinted(art, color), pad, pad, rim);
  g.drawImage(art, pad, pad);
  return {canvas: out, width: out.width / RES, height: out.height / RES, anchor: [.5, pad / out.height], color};
}

/**
 * The sticker for a dropped item: {canvas, width, height, anchor, color}, sizes in world units and the
 * anchor at the bottom of the art (the ground contact). Null for a frame or two while the icon decodes.
 */
export function dropSticker(theme, key, itemId){
  const color = dropRim(itemId), id = `${key}|${color}`;
  if(stickers.has(id)) return stickers.get(id);
  const src = sourceFor(theme, key);
  if(!src) return null;
  const sticker = buildSticker(src, color);
  stickers.set(id, sticker);
  return sticker;
}

// ---------------------------------------------------------------- beacon textures (browser only)
let beaconWhite = null;
const beaconTints = new Map();

function paint(w, h, alphaAt){
  const c = canvas(w, h);
  if(!c) return null;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const i = (y * w + x) * 4, a = Math.max(0, Math.min(1, alphaAt((x + .5) / w, (y + .5) / h)));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * White beacon textures, tinted by the caller (WebGL: material colour; canvas: `beaconArt(color)`).
 * beam: a soft column, brightest at its foot and along its core, fading out upward (anchor bottom centre).
 * ring: a soft ring for the ground ripple. mote: a soft dot.
 */
export function beaconArt(color = null){
  beaconWhite ||= {
    beam: paint(48, 192, (u, v) => {
      const across = Math.max(0, 1 - Math.abs(u - .5) * 2), up = 1 - v;   // v = 0 top, 1 foot
      const fade = Math.pow(1 - up, 1.35), foot = Math.max(0, 1 - up * 7) * .35;
      return 1.3 * (Math.pow(across, 1.25) * (fade * .8 + foot) + Math.pow(across, 6) * fade * .6);
    }),
    ring: paint(128, 128, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return Math.exp(-Math.pow((r - .82) / .09, 2));
    }),
    mote: paint(32, 32, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return Math.exp(-r * r * 5);
    }),
    pool: paint(96, 96, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return Math.max(0, 1 - r) ** 1.6 * .8;
    }),
  };
  if(!color || !beaconWhite.beam) return beaconWhite;
  if(!beaconTints.has(color)){
    const out = {};
    for(const [name, art] of Object.entries(beaconWhite)) out[name] = tinted(art, color);
    beaconTints.set(color, out);
  }
  return beaconTints.get(color);
}

export function resetDropArt(){
  sources.clear();
  stickers.clear();
  beaconTints.clear();
}
