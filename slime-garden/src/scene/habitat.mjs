/**
 * Provisional garden: approved lighting/tone and a handful of static props.
 * Does not create slimes or write economic state.
 */

/**
 * @param {import('../../vendor/three/three.module.js').Object3D} object
 */
function skipRaycast(object) {
  object.traverse((node) => {
    if (node.isMesh) {
      node.raycast = function skipRaycastImpl() {};
    }
  });
}

/**
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Scene} scene
 * @param {object} layout
 * @param {number} layout.habitatRadius
 * @param {number} layout.floorRadius
 * @param {readonly { x: number, z: number }[]} layout.homeSlots
 * @param {{ x: number, z: number }} layout.entryPoint
 * @param {{ x: number, z: number }} layout.foodPoint
 * @param {{ x: number, z: number }} layout.shrubPoint
 */
export function createHabitat(THREE, scene, layout) {
  /** @type {import('../../vendor/three/three.module.js').BufferGeometry[]} */
  const geometries = [];
  /** @type {import('../../vendor/three/three.module.js').Material[]} */
  const materials = [];
  /** @type {import('../../vendor/three/three.module.js').Object3D[]} */
  const roots = [];

  const hemi = new THREE.HemisphereLight(0xf3ffff, 0x719c78, 2.4);
  scene.add(hemi);
  roots.push(hemi);

  const sun = new THREE.DirectionalLight(0xfff1ca, 3.1);
  sun.position.set(-3, 6, 4);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  roots.push(sun, sun.target);

  const rim = new THREE.DirectionalLight(0xbffff2, 1.3);
  rim.position.set(3, 3, -4);
  scene.add(rim);
  roots.push(rim);

  const group = new THREE.Group();
  group.name = 'habitat-garden-prototype-v1';
  scene.add(group);
  roots.push(group);

  const floorGeom = new THREE.CircleGeometry(layout.floorRadius, 48);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe2eacc, roughness: 1 });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.name = 'habitat-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  geometries.push(floorGeom);
  materials.push(floorMat);

  const ringGeom = new THREE.RingGeometry(
    layout.habitatRadius - 0.08,
    layout.habitatRadius + 0.08,
    64,
  );
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xc5d3b4,
    roughness: 1,
    metalness: 0,
  });
  const boundary = new THREE.Mesh(ringGeom, ringMat);
  boundary.name = 'habitat-boundary';
  boundary.rotation.x = -Math.PI / 2;
  boundary.position.y = 0.005;
  boundary.receiveShadow = true;
  group.add(boundary);
  geometries.push(ringGeom);
  materials.push(ringMat);

  const padGeom = new THREE.CircleGeometry(0.72, 24);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xd5e4c0,
    roughness: 1,
  });
  geometries.push(padGeom);
  materials.push(padMat);
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const pads = [];
  for (let i = 0; i < layout.homeSlots.length; i++) {
    const slot = layout.homeSlots[i];
    const pad = new THREE.Mesh(padGeom, padMat);
    pad.name = `habitat-pad-${i}`;
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(slot.x, 0.008, slot.z);
    pad.receiveShadow = true;
    pad.visible = false;
    group.add(pad);
    pads.push(pad);
  }

  const stoneGeom = new THREE.CircleGeometry(0.42, 16);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcdd6b8, roughness: 1 });
  const stoneA = new THREE.Mesh(stoneGeom, stoneMat);
  stoneA.rotation.x = -Math.PI / 2;
  stoneA.position.set(layout.entryPoint.x - 0.35, 0.007, layout.entryPoint.z);
  const stoneB = new THREE.Mesh(stoneGeom, stoneMat);
  stoneB.rotation.x = -Math.PI / 2;
  stoneB.position.set(layout.entryPoint.x + 0.38, 0.007, layout.entryPoint.z + 0.35);
  group.add(stoneA, stoneB);
  geometries.push(stoneGeom);
  materials.push(stoneMat);

  const basketGroup = new THREE.Group();
  basketGroup.name = 'habitat-basket';
  basketGroup.position.set(layout.foodPoint.x, 0, layout.foodPoint.z);
  const basketGeom = new THREE.CylinderGeometry(0.38, 0.42, 0.36, 12, 1, true);
  const basketMat = new THREE.MeshStandardMaterial({
    color: 0xb98a58,
    roughness: 0.84,
    side: THREE.DoubleSide,
  });
  const basket = new THREE.Mesh(basketGeom, basketMat);
  basket.position.y = 0.2;
  basket.castShadow = true;
  basket.receiveShadow = true;
  const rimGeom = new THREE.TorusGeometry(0.38, 0.045, 8, 16);
  const rimMesh = new THREE.Mesh(rimGeom, basketMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = 0.38;
  const baseGeom = new THREE.CircleGeometry(0.4, 12);
  const base = new THREE.Mesh(baseGeom, basketMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.02;
  basketGroup.add(basket, rimMesh, base);
  group.add(basketGroup);
  geometries.push(basketGeom, rimGeom, baseGeom);
  materials.push(basketMat);

  const shrubGroup = new THREE.Group();
  shrubGroup.name = 'habitat-shrub';
  shrubGroup.position.set(layout.shrubPoint.x, 0, layout.shrubPoint.z);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5f8a62, roughness: 0.86 });
  const leafAGeom = new THREE.SphereGeometry(0.55, 12, 10);
  const leafBGeom = new THREE.SphereGeometry(0.42, 12, 10);
  const leafCGeom = new THREE.SphereGeometry(0.36, 10, 8);
  const leafA = new THREE.Mesh(leafAGeom, leafMat);
  leafA.position.set(0, 0.52, 0);
  const leafB = new THREE.Mesh(leafBGeom, leafMat);
  leafB.position.set(-0.38, 0.4, 0.12);
  const leafC = new THREE.Mesh(leafCGeom, leafMat);
  leafC.position.set(0.32, 0.36, -0.18);
  leafA.castShadow = leafB.castShadow = leafC.castShadow = true;
  shrubGroup.add(leafA, leafB, leafC);
  group.add(shrubGroup);
  geometries.push(leafAGeom, leafBGeom, leafCGeom);
  materials.push(leafMat);

  skipRaycast(group);

  /**
   * @param {number} capacity
   */
  function setCapacity(capacity) {
    const enabled = Math.max(0, Math.min(pads.length, Math.floor(capacity) || 0));
    for (let i = 0; i < pads.length; i++) pads[i].visible = i < enabled;
  }

  /**
   * Cosmetic scale only. Does not change berry timers.
   * @param {number} level
   */
  function setShrubLevel(level) {
    const n = Math.max(0, Math.min(3, level | 0));
    const s = 1 + n * 0.1;
    shrubGroup.scale.set(s, s, s);
  }

  function dispose() {
    for (const root of roots) root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.length = 0;
    materials.length = 0;
    roots.length = 0;
    pads.length = 0;
  }

  return {
    group,
    sun,
    hemi,
    rim,
    setCapacity,
    setShrubLevel,
    dispose,
  };
}
