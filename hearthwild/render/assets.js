import { mixStream, hashSeed, createRng } from '../world/random.mjs';
import { cropProgress, cropStageId, littleScale } from '../data/crops.mjs';

export function cropLeafCount(id) {
  return 3 + (mixStream(hashSeed(String(id || 'crop')), 'crop-leaves-v1') % 3);
}

const CARROT = Object.freeze({
  orange: 0xe07030, dark: 0xc45a22, deep: 0xa84818, pale: 0xe8d4a0,
  leafA: 0x3e7a5c, leafB: 0x24503c, leafC: 0x5a8f6e,
});
const POTATO = Object.freeze({
  ochre: 0xc4a05a, dark: 0xa88848, soil: 0x8a7038, sprout: 0xd4c48a,
  leafA: 0x4f8a4a, leafB: 0x3e7a52, leafC: 0x24503c,
});
const EARTH = Object.freeze({ warm: 0x5c5348, deep: 0x3a2e28, clod: 0x4a4038 });

function addNarrowLeaf(mesh, geometries, registry, parent, x, y, z, yaw, height, width, color) {
  const leaf = mesh(geometries.cone, registry.meshMaterial(color), parent, x, y, z, width, height, width * 0.45);
  leaf.rotation.set(-0.55, yaw, 0.15);
  return leaf;
}

function addBroadLeaf(mesh, geometries, registry, parent, x, y, z, yaw, height, width, color) {
  const leaf = mesh(geometries.cone, registry.meshMaterial(color), parent, x, y, z, width, height, width * 0.7);
  leaf.rotation.set(-0.85, yaw, 0.05);
  return leaf;
}

export function addCarrotPlant(mesh, geometries, registry, parent, options = {}) {
  const stage = options.stage || 'mature';
  const leaves = options.leaves ?? 4;
  const mound = mesh(geometries.cylinder, registry.meshMaterial(EARTH.warm), parent, 0, 0.012, 0, 0.16, 0.022, 0.16);
  mound.castShadow = false;
  if (stage === 'seed') {
    mesh(geometries.cylinder, registry.meshMaterial(EARTH.deep), parent, 0, 0.018, 0, 0.07, 0.012, 0.07).castShadow = false;
    for (let i = 0; i < 3; i++) {
      mesh(
        geometries.stone,
        registry.meshMaterial(CARROT.pale),
        parent,
        Math.cos(i * 2.1) * 0.03,
        0.03,
        Math.sin(i * 2.1) * 0.03,
        0.018, 0.012, 0.014,
      );
    }
    return parent;
  }
  if (stage === 'depleted') {
    mesh(geometries.cylinder, registry.meshMaterial(EARTH.deep), parent, 0, 0.014, 0, 0.11, 0.01, 0.11).castShadow = false;
    for (let i = 0; i < 3; i++) {
      const stub = mesh(geometries.cone, registry.meshMaterial(CARROT.leafB), parent, Math.cos(i * 2.1) * 0.04, 0.04, Math.sin(i * 2.1) * 0.04, 0.018, 0.05, 0.018);
      stub.rotation.y = i;
    }
    mesh(geometries.stone, registry.meshMaterial(CARROT.deep), parent, 0.02, 0.02, -0.01, 0.04, 0.018, 0.03);
    return parent;
  }
  const little = stage === 'little';
  const lift = stage === 'lifted';
  if (!lift) {
    mesh(geometries.stone, registry.meshMaterial(EARTH.clod), parent, 0.05, 0.03, 0.03, 0.05, 0.03, 0.04).castShadow = false;
    mesh(geometries.stone, registry.meshMaterial(EARTH.deep), parent, -0.04, 0.025, -0.03, 0.04, 0.022, 0.035).castShadow = false;
  }
  const rootY = lift ? 0.16 : (little ? 0.05 : 0.09);
  const root = mesh(
    geometries.cone,
    registry.meshMaterial(CARROT.orange),
    parent, 0, rootY, 0,
    little ? 0.045 : 0.09,
    little ? 0.12 : 0.22,
    little ? 0.045 : 0.09,
  );
  root.rotation.x = Math.PI;
  mesh(
    geometries.stone,
    registry.meshMaterial(CARROT.dark),
    parent,
    0.02, lift ? 0.2 : (little ? 0.07 : 0.12), 0.01,
    little ? 0.03 : 0.055,
    little ? 0.04 : 0.07,
    little ? 0.025 : 0.04,
  );
  if (!little || lift) {
    mesh(geometries.stone, registry.meshMaterial(CARROT.deep), parent, -0.015, lift ? 0.14 : 0.07, -0.02, 0.04, 0.05, 0.03);
  }
  const leafH = little ? 0.16 : 0.28;
  const leafW = little ? 0.035 : 0.055;
  for (let i = 0; i < leaves; i++) {
    const yaw = i * 1.26 + 0.2;
    const color = [CARROT.leafA, CARROT.leafB, CARROT.leafC][i % 3];
    addNarrowLeaf(
      mesh, geometries, registry, parent,
      Math.cos(yaw) * 0.04, lift ? 0.28 : (little ? 0.12 : 0.2), Math.sin(yaw) * 0.04,
      yaw, leafH, leafW, color,
    );
  }
  return parent;
}

export function addPotatoPlant(mesh, geometries, registry, parent, options = {}) {
  const stage = options.stage || 'mature';
  const leaves = options.leaves ?? 4;
  const mound = mesh(geometries.cylinder, registry.meshMaterial(EARTH.warm), parent, 0, 0.012, 0, 0.18, 0.02, 0.18);
  mound.castShadow = false;
  if (stage === 'seed') {
    mesh(geometries.stone, registry.meshMaterial(POTATO.ochre), parent, 0.01, 0.03, 0, 0.045, 0.028, 0.038);
    mesh(geometries.cone, registry.meshMaterial(POTATO.leafA), parent, 0.02, 0.055, 0.01, 0.02, 0.06, 0.02).rotation.z = 0.4;
    return parent;
  }
  if (stage === 'depleted') {
    mesh(geometries.cylinder, registry.meshMaterial(EARTH.deep), parent, 0, 0.014, 0, 0.12, 0.01, 0.12).castShadow = false;
    for (let i = 0; i < 3; i++) {
      mesh(geometries.cone, registry.meshMaterial(POTATO.leafC), parent, Math.cos(i * 2.2) * 0.05, 0.035, Math.sin(i * 2.2) * 0.05, 0.03, 0.05, 0.03);
    }
    mesh(geometries.stone, registry.meshMaterial(POTATO.soil), parent, 0.03, 0.02, -0.02, 0.035, 0.016, 0.03);
    return parent;
  }
  const little = stage === 'little';
  const lift = stage === 'lifted';
  if (!lift) {
    mesh(geometries.stone, registry.meshMaterial(EARTH.clod), parent, 0.06, 0.028, -0.02, 0.05, 0.025, 0.04).castShadow = false;
  }
  const tuberY = lift ? 0.12 : 0.045;
  const tuberScale = little ? 0.35 : 1;
  mesh(geometries.stone, registry.meshMaterial(POTATO.ochre), parent, -0.05 * tuberScale, tuberY, 0.02, 0.07 * tuberScale, 0.045 * tuberScale, 0.055 * tuberScale);
  mesh(geometries.stone, registry.meshMaterial(POTATO.dark), parent, 0.06 * tuberScale, tuberY - 0.005, -0.03, 0.06 * tuberScale, 0.04 * tuberScale, 0.05 * tuberScale);
  if (!little) {
    mesh(geometries.stone, registry.meshMaterial(POTATO.soil), parent, 0.01, tuberY + 0.01, 0.05, 0.045, 0.032, 0.04);
  }
  const stem = mesh(geometries.cylinder, registry.meshMaterial(POTATO.leafC), parent, 0, little ? 0.08 : 0.12, 0, 0.02, little ? 0.12 : 0.18, 0.02);
  stem.castShadow = false;
  const leafH = little ? 0.12 : 0.2;
  const leafW = little ? 0.07 : 0.11;
  for (let i = 0; i < Math.max(3, leaves); i++) {
    const yaw = i * 1.15;
    const color = [POTATO.leafA, POTATO.leafB, POTATO.leafC][i % 3];
    addBroadLeaf(
      mesh, geometries, registry, parent,
      Math.cos(yaw) * (little ? 0.05 : 0.08), lift ? 0.22 : (little ? 0.12 : 0.18), Math.sin(yaw) * (little ? 0.05 : 0.08),
      yaw, leafH, leafW, color,
    );
  }
  return parent;
}

export function createLiftedProduce(T, kind, mesh, geometries, registry) {
  const group = new T.Group();
  const leaves = 4;
  if (kind === 'potato') addPotatoPlant(mesh, geometries, registry, group, { stage: 'lifted', leaves });
  else addCarrotPlant(mesh, geometries, registry, group, { stage: 'lifted', leaves });
  group.userData.kind = kind;
  return group;
}

export function setResourceVisual(group, phase) {
  group.userData.phase = phase;
  if (phase === 'removed') {
    group.visible = false;
    return;
  }
  group.visible = true;
  if (group.userData.mature) group.userData.mature.visible = phase === 'ready';
  if (group.userData.depleted) {
    group.userData.depleted.visible = phase === 'stump' || phase === 'depleted';
  }
  if (group.userData.seedling) group.userData.seedling.visible = phase === 'seedling';
  if (group.userData.young) group.userData.young.visible = phase === 'young';
}

export function createResourceGroup(T, node, mesh, geometries, registry) {
  const group = new T.Group();
  group.position.set(node.x, 0, node.z);
  group.rotation.y = node.rotation || 0;
  group.userData = { nodeId: node.id, kind: node.kind, variant: node.variant || null, phase: 'ready' };
  const scale = node.scale || 1;
  const mature = new T.Group();
  const depleted = new T.Group();
  depleted.visible = false;
  const react = new T.Group();
  react.add(mature);
  group.add(react);
  group.add(depleted);
  group.userData.mature = mature;
  group.userData.depleted = depleted;
  group.userData.react = react;
  group.userData.canopy = [];
  function foliage(object, color) {
    group.userData.canopy.push({ object, solid: object.material, faded: registry.meshMaterial(color, { transparent: true, opacity: 0.16, depthWrite: false }) });
    return object;
  }

  if (node.kind === 'tree' && node.variant === 'broadleaf') {
    group.scale.setScalar(scale);
    mesh(geometries.cylinder, registry.meshMaterial(0x6b4e32), mature, 0, 0.73, 0, 0.13, 1.46, 0.13);
    const crowns = [
      { x: 0, y: 1.35, z: 0, s: 0.72, c: 0x3d7358 },
      { x: 0.28, y: 1.18, z: -0.12, s: 0.5, c: 0x24503c },
      { x: -0.22, y: 1.12, z: 0.2, s: 0.46, c: 0x5a8f6e },
    ];
    for (const crown of crowns) {
      foliage(mesh(geometries.stone, registry.meshMaterial(crown.c), mature, crown.x, crown.y + 0.4, crown.z, crown.s, crown.s * 0.85, crown.s), crown.c);
    }
    mesh(geometries.cylinder, registry.meshMaterial(0x3a2e28), depleted, 0, 0.12, 0, 0.2, 0.24, 0.2);
    const seedling = new T.Group();
    seedling.visible = false;
    group.add(seedling);
    group.userData.seedling = seedling;
    mesh(geometries.cylinder, registry.meshMaterial(0x5a4634), seedling, 0, 0.12, 0, 0.04, 0.24, 0.04);
    foliage(mesh(geometries.cone, registry.meshMaterial(0x3d7358), seedling, 0, 0.32, 0, 0.16, 0.28, 0.16), 0x3d7358);
    const young = new T.Group();
    young.visible = false;
    group.add(young);
    group.userData.young = young;
    mesh(geometries.cylinder, registry.meshMaterial(0x6b4e32), young, 0, 0.38, 0, 0.08, 0.76, 0.08);
    foliage(mesh(geometries.stone, registry.meshMaterial(0x3d7358), young, 0.08, 0.78, -0.04, 0.32, 0.28, 0.32), 0x3d7358);
    foliage(mesh(geometries.stone, registry.meshMaterial(0x24503c), young, -0.1, 0.7, 0.06, 0.24, 0.22, 0.24), 0x24503c);
  } else if (node.kind === 'tree') {
    group.scale.setScalar(scale);
    mesh(geometries.cylinder, registry.meshMaterial(0x6b4e32), mature, 0, 0.82, 0, 0.14, 1.64, 0.14);
    const leafMats = [0x2a5c32, 0x3d7340, 0x4f8a4a].map(color => registry.meshMaterial(color));
    for (let j = 0; j < 3; j++) {
      // Expose the working height of the trunk so axe contact is visible.
      const leaves = mesh(geometries.cone, leafMats[j], mature, 0, 1.75 + j * 0.56, 0, 1.02 - j * 0.23, 1.5 - j * 0.15, 1.02 - j * 0.23);
      leaves.rotation.y = j * 0.6;
      foliage(leaves, [0x2a5c32, 0x3d7340, 0x4f8a4a][j]);
    }
    mesh(geometries.cylinder, registry.meshMaterial(0x3a2e28), depleted, 0, 0.12, 0, 0.18, 0.24, 0.18);
    const seedling = new T.Group();
    seedling.visible = false;
    group.add(seedling);
    group.userData.seedling = seedling;
    mesh(geometries.cylinder, registry.meshMaterial(0x5a4634), seedling, 0, 0.14, 0, 0.045, 0.28, 0.045);
    foliage(mesh(geometries.cone, registry.meshMaterial(0x3d7340), seedling, 0, 0.36, 0, 0.18, 0.32, 0.18), 0x3d7340);
    const young = new T.Group();
    young.visible = false;
    group.add(young);
    group.userData.young = young;
    mesh(geometries.cylinder, registry.meshMaterial(0x6b4e32), young, 0, 0.42, 0, 0.09, 0.84, 0.09);
    foliage(mesh(geometries.cone, registry.meshMaterial(0x2a5c32), young, 0, 1.05, 0, 0.46, 0.7, 0.46), 0x2a5c32);
    foliage(mesh(geometries.cone, registry.meshMaterial(0x4f8a4a), young, 0, 1.38, 0, 0.32, 0.48, 0.32), 0x4f8a4a);
  } else if (node.kind === 'stone') {
    const rock = mesh(
      geometries.stone,
      registry.meshMaterial(node.warm ? 0x8a8e92 : 0x7a7e82),
      mature, 0, 0.18, 0, node.sx || 0.5, node.sy || 0.42, node.sz || 0.48,
    );
    rock.rotation.set(node.rx || 0, node.ry || 0, node.rz || 0);
    mesh(geometries.cylinder, registry.meshMaterial(0x6a6e72), mature, 0, 0.02, 0, 0.42, 0.03, 0.42).castShadow = false;
    const low = mesh(
      geometries.stone,
      registry.meshMaterial(0x5c6064),
      depleted, 0, 0.08, 0, (node.sx || 0.5) * 0.72, (node.sy || 0.42) * 0.45, (node.sz || 0.48) * 0.72,
    );
    low.rotation.set(node.rx || 0, node.ry || 0, node.rz || 0);
    mesh(geometries.cylinder, registry.meshMaterial(0x6a6e72), depleted, 0, 0.015, 0, 0.3, 0.02, 0.3).castShadow = false;
  } else if (node.kind === 'copper') {
    const rock = mesh(
      geometries.stone,
      registry.meshMaterial(0x5c5348),
      mature, 0, 0.16, 0, node.sx || 0.48, node.sy || 0.38, node.sz || 0.46,
    );
    rock.rotation.set(node.rx || 0.2, node.ry || 0.4, node.rz || 0.1);
    for (let i = 0; i < 3; i++) {
      const seam = mesh(
        geometries.crystal,
        registry.meshMaterial(i ? 0xd3924a : 0xe8b86a, { emissive: 0xe8b86a, emissiveIntensity: 0.35 }),
        mature,
        Math.cos(i * 2.1) * 0.12,
        0.28 + i * 0.05,
        Math.sin(i * 2.1) * 0.1,
        0.12, 0.22, 0.12,
      );
      seam.rotation.set(0.4, i, 0.2);
    }
    mesh(geometries.cylinder, registry.meshMaterial(0xd3924a), mature, 0, 0.02, 0, 0.4, 0.03, 0.4).castShadow = false;
    const dim = mesh(
      geometries.stone,
      registry.meshMaterial(0x4a433c),
      depleted, 0, 0.08, 0, (node.sx || 0.48) * 0.7, (node.sy || 0.38) * 0.42, (node.sz || 0.46) * 0.7,
    );
    dim.rotation.set(node.rx || 0.2, node.ry || 0.4, node.rz || 0.1);
    mesh(geometries.cylinder, registry.meshMaterial(0x8a6a48), depleted, 0, 0.015, 0, 0.28, 0.02, 0.28).castShadow = false;
  } else if (node.kind === 'berry') {
    const leaf = registry.meshMaterial(0x2e5a40);
    for (let i = 0; i < 4; i++) {
      const tuft = mesh(geometries.cone, leaf, mature, Math.cos(i * 1.7) * 0.16, 0.22, Math.sin(i * 1.7) * 0.16, 0.22, 0.42, 0.22);
      tuft.rotation.y = i;
    }
    const fruit = registry.meshMaterial(0xa33d68);
    for (let i = 0; i < 5; i++) {
      mesh(geometries.stone, fruit, mature, Math.cos(i * 1.3) * 0.14, 0.28, Math.sin(i * 1.3) * 0.13, 0.055);
    }
    mesh(geometries.cylinder, registry.meshMaterial(0xa33d68), mature, 0, 0.02, 0, 0.32, 0.025, 0.32).castShadow = false;
    for (let i = 0; i < 4; i++) {
      const rest = mesh(geometries.cone, leaf, depleted, Math.cos(i * 1.7) * 0.16, 0.16, Math.sin(i * 1.7) * 0.16, 0.18, 0.28, 0.18);
      rest.rotation.y = i;
    }
    mesh(geometries.cylinder, registry.meshMaterial(0x3a4a38), depleted, 0, 0.015, 0, 0.24, 0.02, 0.24).castShadow = false;
  } else if (node.kind === 'carrot' || node.kind === 'potato') {
    const leaves = cropLeafCount(node.id);
    const addPlant = node.kind === 'potato' ? addPotatoPlant : addCarrotPlant;
    addPlant(mesh, geometries, registry, mature, { stage: 'mature', leaves });
    addPlant(mesh, geometries, registry, depleted, { stage: 'depleted', leaves });
  } else if (node.kind === 'twig') {
    const wood = registry.meshMaterial(0x6a5340);
    for (let i = 0; i < 4; i++) {
      const stick = mesh(geometries.cylinder, wood, mature, Math.cos(i * 1.4) * 0.12, 0.04, Math.sin(i * 1.4) * 0.1, 0.025, 0.28, 0.025);
      stick.rotation.z = 1.15;
      stick.rotation.y = i;
    }
    mesh(geometries.cylinder, registry.meshMaterial(0x8a6a48), mature, 0, 0.012, 0, 0.22, 0.016, 0.22).castShadow = false;
    const rest = mesh(geometries.cylinder, wood, depleted, 0.04, 0.03, 0, 0.02, 0.16, 0.02);
    rest.rotation.z = 1.1;
    mesh(geometries.cylinder, registry.meshMaterial(0x5a4634), depleted, 0, 0.01, 0, 0.14, 0.012, 0.14).castShadow = false;
  } else if (node.kind === 'pebble') {
    for (let i = 0; i < 5; i++) {
      mesh(
        geometries.stone,
        registry.meshMaterial(i % 2 ? 0x8a8e92 : 0x7a7e82),
        mature,
        Math.cos(i * 1.3) * 0.1,
        0.05,
        Math.sin(i * 1.3) * 0.1,
        0.08 + (i % 3) * 0.02,
        0.05,
        0.07,
      );
    }
    mesh(geometries.cylinder, registry.meshMaterial(0x6a6e72), mature, 0, 0.012, 0, 0.22, 0.016, 0.22).castShadow = false;
    mesh(geometries.stone, registry.meshMaterial(0x7a7e82), depleted, 0.02, 0.03, 0, 0.07, 0.04, 0.06);
    mesh(geometries.cylinder, registry.meshMaterial(0x5c6064), depleted, 0, 0.01, 0, 0.14, 0.012, 0.14).castShadow = false;
  }

  if (node.protected) {
    const mark = mesh(geometries.cylinder, registry.meshMaterial(0xffcb83, { transparent: true, opacity: 0.4 }), group, 0, 0.03, 0, 0.26, 0.02, 0.26);
    mark.castShadow = false;
  }
  return group;
}

function soilFanGeometry(T, localVerts, y, scale = 1) {
  const positions = [0, y, 0];
  const indices = [];
  for (const vertex of localVerts) {
    positions.push(vertex.x * scale, y, vertex.z * scale);
  }
  for (let i = 0; i < localVerts.length; i++) {
    indices.push(0, i + 1, i + 1 === localVerts.length ? 1 : i + 2);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addNaturalSoilBed(T, group, structure, mesh, geometries, registry) {
  const cx = Number.isFinite(structure.x) ? structure.x : 0;
  const cz = Number.isFinite(structure.z) ? structure.z : 0;
  const local = structure.outline.map(vertex => ({ x: vertex.x - cx, z: vertex.z - cz }));
  const shades = [0x5c5348, 0x4a4038, 0x3a2e28];
  const under = soilFanGeometry(T, local, 0.006, 1);
  const top = soilFanGeometry(T, local, 0.012, 0.78);
  const disposables = group.userData.disposables || [];
  disposables.push(under, top);
  group.userData.disposables = disposables;
  const bed = new T.Mesh(under, registry.meshMaterial(shades[0], { roughness: 1 }));
  bed.castShadow = false;
  bed.receiveShadow = true;
  group.add(bed);
  const inner = new T.Mesh(top, registry.meshMaterial(shades[2], { roughness: 1 }));
  inner.castShadow = false;
  inner.receiveShadow = true;
  group.add(inner);
  const rng = createRng(mixStream(Number(structure.shapeSeed) >>> 0, 'soil-clods-v1'));
  const clodCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < clodCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 0.12 + rng() * 0.16;
    const clod = mesh(
      geometries.stone,
      registry.meshMaterial(shades[1 + (i % 2)]),
      group,
      Math.cos(angle) * dist,
      0.028,
      Math.sin(angle) * dist,
      0.05 + rng() * 0.02,
      0.022 + rng() * 0.02,
      0.04 + rng() * 0.02,
    );
    clod.castShadow = false;
  }
}

export function createStructureGroup(T, structure, mesh, geometries, registry) {
  const group = new T.Group();
  group.userData = { structureId: structure.id, kind: structure.kind, disposables: [] };
  if (structure.kind === 'floor') {
    const board = mesh(geometries.cube, registry.meshMaterial(0x8a6a48), group, 0, 0.04, 0, 0.94, 0.055, 0.94);
    board.castShadow = false;
    mesh(geometries.cube, registry.meshMaterial(0x6a5340), group, 0, 0.07, 0, 0.22, 0.02, 0.9).castShadow = false;
    mesh(geometries.cube, registry.meshMaterial(0x6a5340), group, 0.28, 0.07, 0, 0.18, 0.02, 0.9).castShadow = false;
    mesh(geometries.cube, registry.meshMaterial(0x6a5340), group, -0.28, 0.07, 0, 0.18, 0.02, 0.9).castShadow = false;
  } else if (structure.kind === 'path') {
    const slab = mesh(geometries.cube, registry.meshMaterial(0x8a7048), group, 0, 0.025, 0, 0.82, 0.04, 0.82);
    slab.castShadow = false;
    mesh(geometries.stone, registry.meshMaterial(0x7a7e82), group, 0.16, 0.05, -0.12, 0.22, 0.05, 0.18).castShadow = false;
    mesh(geometries.stone, registry.meshMaterial(0x6a6e72), group, -0.18, 0.045, 0.14, 0.2, 0.045, 0.16).castShadow = false;
  } else if (structure.kind === 'soil') {
    if (structure.outline?.length) addNaturalSoilBed(T, group, structure, mesh, geometries, registry);
    else {
      const bed = mesh(geometries.cube, registry.meshMaterial(0x5c5348), group, 0, 0.03, 0, 0.9, 0.05, 0.9);
      bed.castShadow = false;
      mesh(geometries.cube, registry.meshMaterial(0x3a2e28), group, 0, 0.055, 0, 0.72, 0.02, 0.72).castShadow = false;
    }
    const crops = new T.Group();
    group.add(crops);
    group.userData.crops = crops;
    const bySpecies = {};
    for (const species of ['carrot', 'potato']) {
      const addPlant = species === 'potato' ? addPotatoPlant : addCarrotPlant;
      const parts = { seed: new T.Group(), little: new T.Group(), mature: new T.Group(), ready: new T.Group() };
      for (const [stage, part] of Object.entries(parts)) {
        part.visible = false;
        crops.add(part);
        if (stage === 'ready') {
          if (species === 'carrot') {
            mesh(geometries.cone, registry.meshMaterial(CARROT.orange), part, 0, 0.72, 0, 0.04, 0.08, 0.04).rotation.x = Math.PI;
          } else {
            mesh(geometries.stone, registry.meshMaterial(POTATO.ochre), part, 0, 0.7, 0, 0.05, 0.035, 0.04);
          }
        } else {
          addPlant(mesh, geometries, registry, part, { stage, leaves: 4 });
        }
      }
      bySpecies[species] = parts;
    }
    group.userData.cropParts = bySpecies;
  } else if (structure.kind === 'workbench') {
    mesh(geometries.cube, registry.meshMaterial(0x8a6a48), group, 0, 0.52, 0, 1.72, 0.1, 0.78);
    mesh(geometries.cube, registry.meshMaterial(0x6a5340), group, 0, 0.62, -0.28, 1.6, 0.16, 0.12);
    for (const side of [-1, 1]) {
      for (const depth of [-1, 1]) {
        mesh(geometries.cube, registry.meshMaterial(0x6b4e32), group, side * 0.72, 0.24, depth * 0.28, 0.1, 0.48, 0.1);
      }
    }
    mesh(geometries.cube, registry.meshMaterial(0x7a7e82), group, 0.42, 0.62, 0.12, 0.28, 0.08, 0.22);
    mesh(geometries.cylinder, registry.meshMaterial(0x715849), group, -0.48, 0.6, 0.18, 0.05, 0.12, 0.05);
  } else if (structure.kind === 'furnace') {
    mesh(geometries.cube, registry.meshMaterial(0x7a7e82), group, 0, 0.28, 0, 1.68, 0.56, 0.78);
    mesh(geometries.cube, registry.meshMaterial(0x6a6e72), group, 0, 0.58, 0, 1.52, 0.16, 0.7);
    mesh(geometries.cube, registry.meshMaterial(0x5c6064), group, -0.55, 0.92, 0, 0.38, 0.72, 0.38);
    mesh(geometries.cube, registry.meshMaterial(0x5c5348), group, -0.55, 1.32, 0, 0.28, 0.12, 0.28);
    const mouth = mesh(
      geometries.cube,
      registry.meshMaterial(0x3a2e28),
      group, 0.38, 0.32, 0.32, 0.55, 0.32, 0.18,
    );
    mouth.castShadow = false;
    const ember = mesh(
      geometries.crystal,
      registry.meshMaterial(0xe8b86a, { emissive: 0xffcb83, emissiveIntensity: 0.45 }),
      group, 0.38, 0.32, 0.22, 0.16, 0.18, 0.12,
    );
    ember.rotation.z = 0.4;
    group.userData.hearth = ember;
    const glow = mesh(
      geometries.cylinder,
      registry.meshMaterial(0xffcb83, { transparent: true, opacity: 0.28 }),
      group, 0.38, 0.18, 0.12, 0.22, 0.04, 0.22,
    );
    glow.castShadow = false;
    group.userData.hearthGlow = glow;
  }
  return group;
}

export function setSoilCrop(group, crop, reduced = false) {
  const bySpecies = group.userData.cropParts || {};
  for (const parts of Object.values(bySpecies)) {
    for (const part of Object.values(parts)) part.visible = false;
    if (parts.little) parts.little.scale.setScalar(1);
  }
  if (!crop) return;
  const parts = bySpecies[crop.species];
  if (!parts) return;
  const stage = cropStageId(crop);
  if (stage === 'seed' && parts.seed) parts.seed.visible = true;
  else if (stage === 'little' && parts.little) {
    parts.little.visible = true;
    const scale = reduced ? 0.48 : littleScale(cropProgress(crop));
    parts.little.scale.setScalar(scale);
  } else if (parts.mature) {
    parts.mature.visible = true;
    if (parts.ready) parts.ready.visible = true;
  }
}
