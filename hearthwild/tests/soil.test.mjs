import test from 'node:test';
import assert from 'node:assert/strict';
import { cropOnSoil } from '../data/crops.mjs';
import {
  assertConvertedSoilGeometry, assertSoilAllocator, assertSoilPatches, canonicalSoilId, copySoilPatch,
  decorativeGrassCover, detachConvertedSoil, earthHidesGrassRoot, isLegacySoilPatchId, isSoilPatchId, legacySoilPatchId,
  linkedSoilIds, nextSoilIdValue, occupancyPieces, outlineFitsIsland, outlineFitsLegacyCell, outlineHitsAabb,
  outlineHitsSpawn, outlineRadii, outlineSignedArea, polygonsOverlap, quantizeSoilCoord, remapCropSoilIds,
  resolveCropSoilOwner, soilPatchesFromStructures, soilPatchCapReached, soilPatchIndex, soilPatchOutline,
  soilPatchShapeSeed, soilOutlineLocal, SOIL_SHAPE_VERSION, tillPreviewOutline, tillPreviewPatch,
  validateNewSoilPatch, withoutConvertedSoilStructures,
} from '../world/soil.mjs';
import { BUILD_CELL, footprintBounds } from '../data/buildings.mjs';
import {
  SOIL_CLIFF_MARGIN, SOIL_OUTLINE_RADIUS_MAX, SOIL_OUTLINE_RADIUS_MIN, SOIL_OUTLINE_VERTICES, SOIL_PATCH_CAP,
  SOIL_PATCH_SPACING, SOIL_SPAWN_RADIUS, STRUCTURE_CAP,
} from '../data/tuning.mjs';

test('legacy patch ids and shape seeds are deterministic from world seed plus old id', () => {
  assert.equal(legacySoilPatchId('s-4'), 'soil-legacy-s-4');
  assert.deepEqual(linkedSoilIds('s-4'), ['s-4', 'soil-legacy-s-4']);
  assert.deepEqual(linkedSoilIds('soil-legacy-s-4'), ['soil-legacy-s-4', 's-4']);
  const seed = soilPatchShapeSeed('hearthwild-review-a', 's-4');
  assert.equal(soilPatchShapeSeed('hearthwild-review-a', 's-4'), seed);
  assert.notEqual(soilPatchShapeSeed('hearthwild-review-a', 's-5'), seed);
  assert.equal(quantizeSoilCoord(1.006), 1.01);
});

test('every soil structure becomes a patch and crop links remap without dropping ids', () => {
  const structures = [
    { id: 's-1', kind: 'soil', gx: 0, gz: 1 },
    { id: 's-2', kind: 'soil', gx: 1, gz: 1 },
    { id: 's-3', kind: 'workbench', gx: 2, gz: 0 },
  ];
  const { patches, idMap } = soilPatchesFromStructures(structures, 'hearthwild-review-a');
  assert.equal(patches.length, 2);
  assert.equal(patches[0].id, 'soil-legacy-s-1');
  assert.equal(patches[0].x, 0);
  assert.equal(patches[0].z, 1);
  assert.equal(patches[0].shapeVersion, SOIL_SHAPE_VERSION);
  assert.equal(patches[1].id, 'soil-legacy-s-2');
  const crops = remapCropSoilIds(
    [
      { id: 'c-1', soilId: 's-1', species: 'carrot', remaining: 40 },
      { id: 'c-2', soilId: 's-2', species: 'potato', remaining: 10 },
    ],
    idMap,
  );
  assert.equal(crops[0].id, 'c-1');
  assert.equal(crops[0].soilId, 'soil-legacy-s-1');
  assert.equal(crops[1].soilId, 'soil-legacy-s-2');
  assert.equal(cropOnSoil(crops, 's-1').id, 'c-1');
  assert.equal(canonicalSoilId(patches, 's-2'), 'soil-legacy-s-2');
  assert.equal(copySoilPatch(patches[0]).shapeSeed, patches[0].shapeSeed);
  const detached = withoutConvertedSoilStructures(structures, idMap);
  assert.deepEqual(detached.map(item => item.id), ['s-3']);
});

test('new patches use soil-N and nextSoilId ignores legacy ids', () => {
  assert.equal(soilPatchIndex('soil-4'), 4);
  assert.equal(soilPatchIndex('soil-legacy-s-9'), 0);
  assert.equal(nextSoilIdValue([{ id: 'soil-legacy-s-1' }, { id: 'soil-legacy-s-2' }], 1), 1);
  assert.equal(nextSoilIdValue([{ id: 'soil-2' }, { id: 'soil-legacy-s-9' }], 1), 3);
  const pieces = occupancyPieces({
    structures: [{ id: 's-8', kind: 'floor', gx: 3, gz: 0, rotation: 0 }],
    soilPatches: [{ id: 'soil-legacy-s-1', x: 0, z: 1 }],
  });
  assert.equal(pieces.length, 2);
  assert.equal(pieces[1].kind, 'soil');
  assert.equal(pieces[1].gx, 0);
  assert.equal(pieces[1].gz, 1);
});

test('detachConvertedSoil removes matching structures only after geometry and links validate', () => {
  const worldSeed = 'hearthwild-review-a';
  const structures = [
    { id: 's-1', kind: 'soil', gx: 0, gz: 1 },
    { id: 's-2', kind: 'soil', gx: 1, gz: 1 },
    { id: 's-3', kind: 'workbench', gx: 2, gz: 0 },
  ];
  const { patches, idMap } = soilPatchesFromStructures(structures, worldSeed);
  assertConvertedSoilGeometry(structures, patches, worldSeed, idMap);
  const gameplay = {
    structures: structures.map(item => ({ ...item })),
    soilPatches: patches,
    crops: [{ id: 'c-1', soilId: 'soil-legacy-s-1', species: 'carrot', remaining: 10 }],
    nextSoilId: 1,
    nextStructureId: 4,
  };
  detachConvertedSoil(gameplay, worldSeed);
  assert.deepEqual(gameplay.structures.map(item => item.id), ['s-3']);
  assert.equal(gameplay.nextStructureId, 4);
  assert.equal(gameplay.nextSoilId, 1);
  assert.equal(gameplay.crops[0].soilId, 'soil-legacy-s-1');

  const freshBuild = {
    structures: [{ id: 's-4', kind: 'soil', gx: 0, gz: 2 }],
    soilPatches: patches,
    crops: [{ id: 'c-1', soilId: 'soil-legacy-s-1', species: 'carrot', remaining: 10 }],
    nextSoilId: 1,
  };
  detachConvertedSoil(freshBuild, worldSeed);
  assert.equal(freshBuild.structures[0].id, 's-4');
});

const TAU = Math.PI * 2;
const SPAWN = { x: 0, z: 0 };

function legacyPatch(id, x, z, seed = 1) {
  return { id: `soil-legacy-${id}`, x, z, shapeSeed: seed, shapeVersion: SOIL_SHAPE_VERSION };
}

test('legacy outlines are 16-gon, non-jittered, and stay inside the old 1x1 cell', () => {
  const patch = legacyPatch('s-1', 0, 1, 42);
  const outline = soilPatchOutline(patch);
  const again = soilPatchOutline(patch);
  assert.equal(outline.length, SOIL_OUTLINE_VERTICES);
  assert.deepEqual(outline, again);
  assert.ok(outlineSignedArea(outline) > 0);
  const radii = outlineRadii(outline, patch);
  for (const radius of radii) {
    assert.ok(radius >= SOIL_OUTLINE_RADIUS_MIN - 1e-9);
    assert.ok(radius <= SOIL_OUTLINE_RADIUS_MAX + 1e-9);
  }
  const local = soilOutlineLocal(patch);
  for (let i = 0; i < local.length; i++) {
    const expected = i * TAU / SOIL_OUTLINE_VERTICES;
    const angle = (Math.atan2(local[i].z, local[i].x) + TAU) % TAU;
    assert.ok(Math.abs(angle - expected) < 1e-9);
  }
  assert.equal(outlineFitsLegacyCell(outline, 0, 1), true);
  assert.equal(isLegacySoilPatchId(patch.id), true);
});

test('neighboring legacy cells 1.00 apart do not overlap and may touch spawn', () => {
  const a = legacyPatch('s-1', 0, 1, 11);
  const b = legacyPatch('s-2', 1, 1, 22);
  const left = soilPatchOutline(a);
  const right = soilPatchOutline(b);
  assert.equal(polygonsOverlap(left, right), false);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < SOIL_PATCH_SPACING);
  assert.equal(outlineHitsSpawn(left, SPAWN), true);
  assert.ok(assertSoilPatches([a, b], SPAWN).length === 2);
});

test('new till uses 1.02 spacing, cannot use legacy ids, and cannot enter spawn', () => {
  const existing = [legacyPatch('s-1', 0, 1, 11)];
  const inSpawn = validateNewSoilPatch({ id: 'soil-1', x: 0, z: 1, shapeSeed: 9 }, existing, SPAWN);
  assert.equal(inSpawn.ok, false);
  assert.equal(inSpawn.reason, 'spawn');
  const bypass = validateNewSoilPatch(
    { id: 'soil-1', x: 0, z: 1, shapeSeed: 9, allowSpawn: true, ignoreSpawn: true, bypass: true },
    existing,
    SPAWN,
  );
  assert.equal(bypass.ok, false);
  assert.equal(bypass.reason, 'spawn');
  const legacyId = validateNewSoilPatch({ id: 'soil-legacy-s-9', x: 0, z: 3, shapeSeed: 9 }, existing, SPAWN);
  assert.equal(legacyId.ok, false);
  assert.equal(legacyId.reason, 'bad-soil-id');
  const tight = validateNewSoilPatch({ id: 'soil-1', x: 0, z: 2.01, shapeSeed: 9 }, existing, SPAWN);
  assert.equal(tight.ok, false);
  assert.equal(tight.reason, 'spacing');
  const spaced = validateNewSoilPatch({ id: 'soil-1', x: 0, z: 2.02, shapeSeed: 9 }, existing, SPAWN);
  assert.equal(spaced.ok, true, spaced.reason);
  assert.equal(isLegacySoilPatchId(spaced.patch.id), false);
  const jittered = soilOutlineLocal(spaced.patch);
  const drifted = jittered.some((vertex, i) => {
    const expected = i * TAU / SOIL_OUTLINE_VERTICES;
    const angle = (Math.atan2(vertex.z, vertex.x) + TAU) % TAU;
    return Math.abs(angle - expected) > 1e-6;
  });
  assert.equal(drifted, true);
});

test('save validation keeps legacy spawn plots and rejects new patches in the exclusion', () => {
  const spawnPlot = legacyPatch('s-1', 0, 1, 3);
  assertSoilPatches([spawnPlot], SPAWN);
  assert.throws(() => assertSoilPatches([{ id: 'soil-1', x: 0, z: 1, shapeSeed: 3, shapeVersion: 1 }], SPAWN), {
    message: 'bad-soil',
  });
  assert.throws(() => assertSoilPatches([
    legacyPatch('s-1', 0, 1, 3),
    legacyPatch('s-2', 0, 1, 4),
  ], SPAWN), { message: 'bad-soil' });
  assert.ok(SOIL_SPAWN_RADIUS === 1);
});

function packedLegacyPatches(count) {
  const cols = 8;
  return Array.from({ length: count }, (_, i) => legacyPatch(
    `s-${i + 1}`,
    (i % cols) * 1.1,
    4 + Math.floor(i / cols) * 1.1,
    i + 1,
  ));
}

test('more than 64 legacy patches are kept; new till waits until the count is below 64', () => {
  const over = packedLegacyPatches(SOIL_PATCH_CAP + 6);
  assert.equal(over.length, 70);
  assert.ok(assertSoilPatches(over, SPAWN).length === 70);
  assert.equal(soilPatchCapReached(over), true);
  const blocked = validateNewSoilPatch({ id: 'soil-1', x: 30, z: 30, shapeSeed: 9 }, over, SPAWN);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'soil-cap');
  const under = packedLegacyPatches(SOIL_PATCH_CAP - 1);
  assert.equal(soilPatchCapReached(under), false);
  const allowed = validateNewSoilPatch({ id: 'soil-1', x: 30, z: 30, shapeSeed: 9 }, under, SPAWN);
  assert.equal(allowed.ok, true, allowed.reason);
  const atCap = packedLegacyPatches(SOIL_PATCH_CAP);
  const full = validateNewSoilPatch({ id: 'soil-1', x: 30, z: 30, shapeSeed: 9 }, atCap, SPAWN);
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'soil-cap');
});

test('soil patches do not consume the construction-piece allowance', () => {
  const pieces = occupancyPieces({
    structures: Array.from({ length: STRUCTURE_CAP - 1 }, (_, i) => ({
      id: `s-${i + 1}`,
      kind: 'floor',
      gx: 20,
      gz: i,
      rotation: 0,
    })),
    soilPatches: packedLegacyPatches(70),
  });
  assert.equal(pieces.filter(item => item.kind === 'floor').length, STRUCTURE_CAP - 1);
  assert.equal(pieces.filter(item => item.kind === 'soil').length, 70);
});

const BOX = [
  { x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 },
];

test('patch ids, crop owners, next ids, bounds and occupancy stay strict', () => {
  assert.equal(isSoilPatchId('soil-1'), true);
  assert.equal(isSoilPatchId('soil-legacy-s-4'), true);
  assert.equal(isSoilPatchId('soil-legacy-'), false);
  assert.equal(isSoilPatchId('plot-1'), false);
  assert.equal(isSoilPatchId('soil-0'), false);

  const patch = legacyPatch('s-1', 0, 1, 11);
  const outline = soilPatchOutline(patch);
  assert.equal(outlineHitsAabb(outline, footprintBounds('floor', 0, 1, 0)), true);
  assert.equal(outlineHitsAabb(outline, footprintBounds('floor', 0, 2, 0)), false);
  assert.equal(outlineFitsIsland(soilPatchOutline({ id: 'soil-1', x: 0, z: 0, shapeSeed: 3, shapeVersion: 1 }), BOX), true);
  assert.equal(outlineFitsIsland(soilPatchOutline({ id: 'soil-1', x: 7.7, z: 0, shapeSeed: 3, shapeVersion: 1 }), BOX), false);
  assert.ok(SOIL_CLIFF_MARGIN === 0.25);

  const patches = [patch];
  assert.equal(resolveCropSoilOwner({ soilId: 'soil-legacy-s-1' }, patches, new Set()), 'soil-legacy-s-1');
  assert.equal(resolveCropSoilOwner({ soilId: 's-1' }, patches, new Set()), 'soil-legacy-s-1');
  assert.equal(resolveCropSoilOwner({ soilId: 's-9' }, patches, new Set(['s-9'])), 's-9');
  assert.equal(resolveCropSoilOwner({ soilId: 'missing' }, patches, new Set()), null);

  assertSoilAllocator(patches, 1);
  assert.throws(() => assertSoilAllocator([{ id: 'soil-3' }], 3), { message: 'bad-soil-id' });
  assert.throws(() => assertSoilAllocator(patches, 0), { message: 'bad-soil-id' });

  const bench = { id: 's-2', kind: 'workbench', gx: 0, gz: 3, rotation: 0 };
  const occupied = validateNewSoilPatch(
    { id: 'soil-1', x: 0, z: 3, shapeSeed: 9 },
    [],
    SPAWN,
    { boundary: BOX, structures: [bench] },
  );
  assert.equal(occupied.ok, false);
  assert.equal(occupied.reason, 'occupied');
  const cliff = validateNewSoilPatch(
    { id: 'soil-1', x: 7.7, z: 0, shapeSeed: 9 },
    [],
    SPAWN,
    { boundary: BOX },
  );
  assert.equal(cliff.ok, false);
  assert.equal(cliff.reason, 'off-island');
  const clear = validateNewSoilPatch(
    { id: 'soil-1', x: 0, z: 3, shapeSeed: 9 },
    [],
    SPAWN,
    { boundary: BOX, structures: [] },
  );
  assert.equal(clear.ok, true, clear.reason);

  assert.throws(() => assertSoilPatches([
    { id: 'soil-1', x: 0, z: 3, shapeSeed: 9, shapeVersion: 1 },
  ], SPAWN, { structures: [bench] }), { message: 'bad-soil' });
});

test('decorative grass hides by root-in-outline and restores when earth is gone', () => {
  const patch = { id: 'soil-1', x: 3, z: 4, shapeSeed: 9, shapeVersion: 1 };
  const outline = soilPatchOutline(patch);
  const maxR = Math.max(...outlineRadii(outline, patch));
  const grasses = [
    { x: 3, z: 4, tilt: 0.1, height: 0.4 },
    { x: 3 + maxR + 0.08, z: 4, tilt: 0.2, height: 0.36 },
  ];
  assert.equal(earthHidesGrassRoot(3, 4, [patch]), true);
  assert.equal(earthHidesGrassRoot(3 + maxR + 0.08, 4, [patch]), false);
  const pieces = occupancyPieces({ structures: [{ id: 's-1', kind: 'floor', gx: 3, gz: 4, rotation: 0 }], soilPatches: [patch] });
  assert.equal(earthHidesGrassRoot(3, 4, pieces), true);
  assert.equal(earthHidesGrassRoot(3, 4, pieces.filter(item => item.kind === 'floor')), false);
  assert.equal(earthHidesGrassRoot(3, 4, [{ id: 'n-1', kind: 'tree', x: 3, z: 4, radius: 0.4 }]), false);
  assert.equal(earthHidesGrassRoot(3, 4, [{ id: 'n-2', kind: 'carrot', x: 3, z: 4, radius: 0.38 }]), false);
  const covered = decorativeGrassCover(grasses, [patch]);
  assert.equal(covered[0].hidden, true);
  assert.equal(covered[1].hidden, false);
  assert.equal(grasses[0].x, 3);
  assert.equal(grasses[0].z, 4);
  const restored = decorativeGrassCover(grasses, []);
  assert.equal(restored.every(item => item.hidden === false), true);
  assert.equal(earthHidesGrassRoot(2, 5, [{ kind: 'soil', gx: 2, gz: 5, rotation: 0 }]), true);
  assert.equal(earthHidesGrassRoot(2.6, 5, [{ kind: 'soil', gx: 2, gz: 5, rotation: 0 }]), false);
});

test('till preview outline uses the shared helper and is not snapped to BUILD_CELL', () => {
  const x = 4.37;
  const z = 6.21;
  const patch = tillPreviewPatch(x, z, 'hearthwild-review-a', 3);
  assert.equal(patch.id, 'soil-3');
  assert.equal(patch.x, 4.37);
  assert.equal(patch.z, 6.21);
  assert.equal(patch.shapeVersion, SOIL_SHAPE_VERSION);
  const outline = tillPreviewOutline(x, z, 'hearthwild-review-a', 3);
  assert.equal(outline.length, SOIL_OUTLINE_VERTICES);
  assert.deepEqual(outline, soilPatchOutline(patch));
  assert.deepEqual(tillPreviewOutline(4.371, 6.209, 'hearthwild-review-a', 3), outline);
  assert.notDeepEqual(tillPreviewOutline(4, 6, 'hearthwild-review-a', 3), outline);
  assert.notEqual(patch.x, Math.round(x / BUILD_CELL) * BUILD_CELL);
  assert.notEqual(patch.z, Math.round(z / BUILD_CELL) * BUILD_CELL);
});

