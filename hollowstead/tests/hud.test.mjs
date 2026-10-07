import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_HUD, addTile, bottomReach, cellsOf, fitHud, hudGrid, moveTile, removeTile, resizeTile, tileBox} from '../src/ui/hud.mjs';

const overlaps = tiles => {const seen = new Set(); for(const t of tiles) for(const k of cellsOf(t)){if(seen.has(k)) return true; seen.add(k);} return false;};

test('the grid fills the bottom-right of a landscape phone and of a desktop', () => {
  const phone = hudGrid(844, 390), desk = hudGrid(1280, 760);
  assert.ok(phone.rows >= 3 && phone.cols >= 6, JSON.stringify(phone));
  assert.ok(phone.cell >= 48 && phone.cell <= 76);
  assert.equal(desk.cell, 76);
  assert.deepEqual(fitHud(DEFAULT_HUD, phone), DEFAULT_HUD.map(t => ({...t})), 'the default fits a phone as it is');
});

test('moving, swapping, resizing, adding and removing keep tiles inside and apart', () => {
  const grid = hudGrid(844, 390);
  let hud = fitHud(DEFAULT_HUD, grid);
  // Onto a free cell: it moves. Onto another one-cell button: they swap.
  hud = moveTile(hud, grid, 'skill4', 5, 0);
  assert.deepEqual([hud.find(t => t.id === 'skill4').c, hud.find(t => t.id === 'skill4').r], [5, 0]);
  hud = moveTile(hud, grid, 'heal', 0, 0);
  assert.deepEqual([hud.find(t => t.id === 'heal').c, hud.find(t => t.id === 'attack').c, hud.find(t => t.id === 'attack').r], [0, 1, 1]);
  // Big Attack takes 2x2 cells, up and to the left, or the nearest room.
  hud = resizeTile(hud, grid, 'attack', 'l');
  assert.equal(hud.find(t => t.id === 'attack').size, 'l');
  assert.ok(!overlaps(hud));
  assert.equal(tileBox(hud.find(t => t.id === 'attack'), grid).size, 2*grid.cell+grid.gap);
  // Small keeps its cell and draws smaller.
  hud = resizeTile(hud, grid, 'dodge', 's');
  assert.ok(tileBox(hud.find(t => t.id === 'dodge'), grid).size < grid.cell);
  // Attack cannot be removed; the rest can, and come back on a free cell.
  assert.equal(removeTile(hud, 'attack').length, hud.length);
  hud = removeTile(hud, 'heal');
  assert.ok(!hud.some(t => t.id === 'heal'));
  hud = addTile(hud, grid, 'skill7');
  assert.ok(hud.some(t => t.id === 'skill7'));
  assert.ok(!overlaps(hud));
  for(const t of hud) assert.ok(t.c >= 0 && t.r >= 0 && t.c < grid.cols && t.r < grid.rows);
});

test('a saved layout is made to fit a smaller screen, and junk is dropped', () => {
  const big = hudGrid(1600, 900), small = hudGrid(740, 360);
  let hud = fitHud(DEFAULT_HUD, big);
  hud = moveTile(hud, big, 'skill1', big.cols-1, big.rows-1);
  hud = [...hud, {id: 'nope', c: 0, r: 0}, {id: 'dodge', c: 9, r: 9, size: 'm'}, {id: '__proto__', c: 1, r: 1}];
  const fitted = fitHud(hud, small);
  assert.ok(!overlaps(fitted));
  assert.equal(new Set(fitted.map(t => t.id)).size, fitted.length);
  assert.ok(fitted.every(t => t.c < small.cols && t.r < small.rows));
  assert.ok(fitted.some(t => t.id === 'attack'));
  assert.deepEqual(fitHud([], small).map(t => t.id), ['attack'], 'Attack is always there');
  assert.ok(bottomReach(fitHud(DEFAULT_HUD, small), small, small.step) >= 4*small.cell);
});
