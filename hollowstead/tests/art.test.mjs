import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {ITEMS, EQUIPMENT, NODES, STRUCTURES} from '../src/content.mjs';
import {TRINKET_IDS} from '../src/contracts.mjs';
import {itemSpriteKey} from '../src/inventory.mjs';

const ROOT = new URL('../themes/harvest/', import.meta.url);
const theme = JSON.parse(readFileSync(new URL('theme.json', ROOT), 'utf8'));
const S = theme.sprites;
const file = src => new URL(src.split('?')[0], ROOT);
function svgSize(src){
  const head = readFileSync(file(src), 'utf8').slice(0, 400);
  const w = Number(/width="([\d.]+)"/.exec(head)?.[1]), h = Number(/height="([\d.]+)"/.exec(head)?.[1]);
  return {w, h};
}

const GEAR = ['sporemask', 'gravelight', 'barrowcloak'];
const FINDS = ['glowbloom', 'wispdust'];
const MOONS = ['moon-waxing', 'moon-new', 'moon-blood'];
const NIGHT_NODES = ['glowsprout', 'gravewisp'];
const FRONTIER = [...FINDS, ...GEAR, ...TRINKET_IDS, ...NIGHT_NODES, 'cart', ...MOONS];

test('every frontier sprite has its own artwork, not a placeholder borrowed from another key', () => {
  for(const key of FRONTIER){
    const def = S[key];
    assert.ok(def, key);
    assert.match(def.src, /\?v=frontier\d+$/, key);
    assert.ok(existsSync(file(def.src)), `${key}: ${def.src}`);
    const own = MOONS.includes(key) ? `./sprites/${key}-icon.svg` : `./sprites/${key}.svg`;
    assert.equal(def.src.split('?')[0], own, key);
    if(def.icon){
      assert.ok(existsSync(file(def.icon)), `${key}: ${def.icon}`);
      assert.equal(def.icon.split('?')[0], `./sprites/${key}-icon.svg`, key);
    }
  }
});

test('frontier items, gear and trinkets resolve to a square inventory icon', () => {
  const keys = [...FINDS, ...GEAR, ...TRINKET_IDS];
  for(const id of keys){
    assert.ok(ITEMS[id] || EQUIPMENT[id], id);
    const key = itemSpriteKey(id);
    assert.equal(key, id);
    const {w, h} = svgSize(S[key].icon);
    assert.ok(w > 0 && w === h, `${id} icon ${w}x${h}`);
  }
  // the ten trinkets are told apart by their icons: all distinct files
  assert.equal(new Set(TRINKET_IDS.map(id => S[id].icon.split('?')[0])).size, TRINKET_IDS.length);
});

test('sheet cells keep the aspect of their world size, so nothing is stretched', () => {
  for(const key of FRONTIER){
    const def = S[key], {w, h} = svgSize(def.src);
    const cell = (w / def.columns) / (h / def.rows), world = def.size[0] / def.size[1];
    assert.ok(Math.abs(cell - world) < 0.01, `${key}: cell ${cell.toFixed(3)} vs size ${world.toFixed(3)}`);
  }
});

test('the hand cart sheet has a cell for every b.frame (basic and reinforced, empty to full) and a build icon', () => {
  const cart = S.cart;
  assert.ok(STRUCTURES.cart);
  assert.equal(cart.columns, 3);
  assert.equal(cart.rows, 2);
  assert.deepEqual(cart.size, [2.3, 2.3]);
  for(let level = 1; level <= 3; level++)
    for(let load = 0; load <= 2; load++){
      const frame = (level > 1 ? 3 : 0) + load;
      assert.ok(frame < cart.columns * cart.rows, `level ${level} load ${load}`);
    }
  assert.ok(existsSync(file(cart.icon)));
});

test('night-only nodes animate an idle loop and sit on the ground like the other nodes', () => {
  for(const key of NIGHT_NODES){
    assert.equal(NODES[key].night, true, key);
    const def = S[key];
    assert.deepEqual(def.size, [1.6, 2.4], key);
    assert.deepEqual(def.anchor, [0.5, 0.04], key);
    assert.ok(def.clips.idle.frames.length >= 2 && def.clips.idle.frames.length <= def.columns * def.rows, key);
  }
});

test('moon icons are square HUD icons', () => {
  for(const key of MOONS){
    const {w, h} = svgSize(S[key].icon);
    assert.ok(w > 0 && w === h, key);
  }
});
