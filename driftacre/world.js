// Driftacre — the 3D world: a blocky floating island, billboarded 2D sprites, sky, clouds and particles.
import * as THREE from './vendor/three.min.js';
import { createPainter, mix } from './sprites.js';
import { BUILDING, CROP } from './data.js';
import { rt, parse, key, stageOf, dayPhase } from './state.js';

const U = 24; // art pixels per world unit
const CAP = 1600;
const GLOW_CROPS = { moonberry: '#7d96ff', gourd: '#ffcf6a', pepper: '#ffb347', dreamcap: '#d18cff', tulip: '#8af2ff', wishflower: '#fff4c8', drakefruit: '#ff9a4a' };
const GLOW_BLD = { lantern: ['#fff1a8', 1.0, 1.4], stonelamp: ['#ffd27a', 0.85, 1.0], well: ['#8ad0ff', 0.45, 0.8], arch: ['#ffc6e8', 1.0, 1.6], fountain: ['#9af5ff', 0.9, 1.8], shrine: ['#ffe08a', 1.6, 1.4], hut: ['#ffd27a', 0.5, 0.8] };
const ease = t => 1 - Math.pow(1 - t, 3);
const back = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
  const cam = { tx: 0, tz: 0, yaw: Math.PI / 4, yawT: Math.PI / 4, dist: 17, distT: 17, pitch: 0.78, shake: 0 };

  let style, painter, pixelScale = 1;
  const clock = { t: 0 };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#ffffff', '#886655', 1.2);
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  // ---------- sky ----------
  const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vp;
      void main(){ float h = vp.y; vec3 c = h > 0. ? mix(hor, top, pow(min(1.,h*1.6), .7)) : mix(hor, bot, pow(min(1.,-h*2.2), .6)); gl_FragColor = vec4(c,1.); }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog('#ffffff', 45, 170);

  const starGeo = new THREE.BufferGeometry();
  { const p = []; for (let i = 0; i < 420; i++) { const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y); p.push(Math.cos(a) * r * 350, y * 350, Math.sin(a) * r * 350); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff2d0', fog: false, depthWrite: false, transparent: true }));
  sunSprite.scale.set(70, 70, 1);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#dfe6ff', fog: false, depthWrite: false, transparent: true }));
  moonSprite.scale.set(40, 40, 1);
  scene.add(sunSprite, moonSprite);

  // ---------- materials ----------
  let gradMap;
  function toonGrad(n) {
    const d = new Uint8Array(n); for (let i = 0; i < n; i++) d[i] = Math.round(70 + (185 * i) / (n - 1));
    const t = new THREE.DataTexture(d, n, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
  }
  function canvasTex(c, repeat) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (style.res === 1) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    else t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // ---------- island ----------
  const island = new THREE.Group(); scene.add(island);
  const boxGeo = new THREE.BoxGeometry(1, 0.6, 1).translate(0, -0.3, 0);
  const coneGeo = (() => {
    const g = new THREE.CylinderGeometry(0.5, 0.07, 1, 6, 4).translate(0, -0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < -0.02 && y > -0.98) { const j = 0.06 * Math.sin(i * 12.9898) ; p.setX(i, p.getX(i) * (1 + j)); p.setZ(i, p.getZ(i) * (1 - j)); }
    }
    const f = g.toNonIndexed(); f.computeVertexNormals();
    f.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(f.attributes.position.count * 3), 3));
    return f;
  })();
  const vineGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const tileKinds = ['g0', 'g1', 'g2', 'g3', 'soil', 'pond'];
  const tileMeshes = {};
  let underMesh, vineMesh, ghostMesh, ghostTop, sideMat, bottomMat, underMat, vineMat;
  const islandBounds = { minI: -1, maxI: 1, minJ: -1, maxJ: 1, cx: 0, cz: 0, r: 3 };
  const rising = new Map();
  let lastRev = -1;
  const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };

  function buildIslandMaterials() {
    for (const k of tileKinds) if (tileMeshes[k]) { island.remove(tileMeshes[k]); tileMeshes[k].dispose(); }
    [underMesh, vineMesh, ghostMesh, ghostTop].forEach(m => { if (m) { island.remove(m); m.dispose(); } });
    sideMat = new THREE.MeshToonMaterial({ map: canvasTex(painter.tileTex('side')), gradientMap: gradMap });
    bottomMat = new THREE.MeshToonMaterial({ color: style.dirt, gradientMap: gradMap });
    const top = c => new THREE.MeshToonMaterial({ map: canvasTex(c), gradientMap: gradMap });
    const tops = { g0: painter.tileTex('grass', 0), g1: painter.tileTex('grass', 1), g2: painter.tileTex('grass', 2), g3: painter.tileTex('grass', 3), soil: painter.tileTex('soil'), pond: painter.tileTex('pond') };
    for (const k of tileKinds) {
      const m = new THREE.InstancedMesh(boxGeo, [sideMat, sideMat, top(tops[k]), bottomMat, sideMat, sideMat], CAP);
      m.receiveShadow = true; m.castShadow = true; m.count = 0; m.frustumCulled = false;
      tileMeshes[k] = m; island.add(m);
    }
    // gradient on the hanging rock
    const col = coneGeo.attributes.color, pos = coneGeo.attributes.position, a = new THREE.Color(style.dirt), b = new THREE.Color(style.rock), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(a).lerp(b, Math.min(1, -pos.getY(i) * 1.15)); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    underMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradMap });
    underMesh = new THREE.InstancedMesh(coneGeo, underMat, CAP); underMesh.count = 0; underMesh.frustumCulled = false;
    vineMat = new THREE.MeshBasicMaterial({ map: canvasTex(painter.tileTex('vine')), alphaTest: 0.5, side: THREE.DoubleSide });
    vineMesh = new THREE.InstancedMesh(vineGeo, vineMat, CAP); vineMesh.count = 0; vineMesh.frustumCulled = false;
    ghostMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false }), 400);
    ghostMesh.count = 0; ghostMesh.frustumCulled = false;
    const gt = document.createElement('canvas'); gt.width = gt.height = 128; const gx = gt.getContext('2d');
    gx.strokeStyle = '#fff'; gx.lineWidth = 9; gx.setLineDash([18, 12]); gx.beginPath(); gx.roundRect(10, 10, 108, 108, 22); gx.stroke();
    gx.setLineDash([]); gx.fillStyle = '#fff'; gx.beginPath(); gx.arc(64, 64, 13, 0, 7); gx.fill(); gx.lineWidth = 5; gx.beginPath(); gx.arc(64, 64, 24, 0, 7); gx.stroke();
    ghostTop = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gt), color: '#b6ffcf', transparent: true, depthWrite: false, fog: false }), 400);
    ghostTop.count = 0; ghostTop.frustumCulled = false; ghostTop.renderOrder = 3;
    island.add(underMesh, vineMesh, ghostMesh, ghostTop);
    lastRev = -1;
  }

  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), E = new THREE.Euler();
  function riseOffset(k) {
    const r = rising.get(k); if (r === undefined) return 0;
    const t = (clock.t - r) / 1.3; if (t >= 1) { rising.delete(k); return 0; }
    return -5 * (1 - ease(t));
  }
  function rebuildIsland(s) {
    const counts = Object.fromEntries(tileKinds.map(k => [k, 0]));
    let uc = 0, vc = 0;
    let minI = 1e9, maxI = -1e9, minJ = 1e9, maxJ = -1e9;
    for (const k in s.tiles) {
      const [i, j] = parse(k), t = s.tiles[k], y = riseOffset(k);
      minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
      const kind = t.b === 'pond' ? 'pond' : t.soil ? 'soil' : 'g' + Math.floor(hash(i, j) * 4);
      M4.makeTranslation(i, y, j); tileMeshes[kind].setMatrixAt(counts[kind]++, M4);
      let n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.tiles[key(i + di, j + dj)]) n++;
      const depth = 0.9 + n * 0.35 + hash(j, i) * 0.9 + (n === 4 ? 0.8 : 0);
      E.set(0, hash(i + 3, j) * Math.PI, 0); Q.setFromEuler(E);
      M4.compose(V.set(i, y - 0.6, j), Q, S3.set(1.3, depth, 1.3)); underMesh.setMatrixAt(uc++, M4);
      for (const [di, dj, ry] of [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]]) {
        if (s.tiles[key(i + di, j + dj)] || hash(i * 3 + di, j * 5 + dj) > 0.45) continue;
        E.set(0, ry, 0); Q.setFromEuler(E);
        M4.compose(V.set(i + di * 0.505, y + 0.001, j + dj * 0.505), Q, S3.set(1, 0.7 + hash(i, j + di) * 0.8, 1)); vineMesh.setMatrixAt(vc++, M4);
      }
    }
    for (const k of tileKinds) { tileMeshes[k].count = counts[k]; tileMeshes[k].instanceMatrix.needsUpdate = true; }
    underMesh.count = uc; underMesh.instanceMatrix.needsUpdate = true;
    vineMesh.count = vc; vineMesh.instanceMatrix.needsUpdate = true;
    Object.assign(islandBounds, { minI, maxI, minJ, maxJ, cx: (minI + maxI) / 2, cz: (minJ + maxJ) / 2, r: Math.max(maxI - minI, maxJ - minJ) / 2 + 2 });
    const R = islandBounds.r + 4;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  function setGhosts(keys, ready = true) {
    if (!keys) { ghostMesh.count = ghostTop.count = 0; return; }
    keys = keys.slice(0, 400);
    keys.forEach((k, idx) => { const [i, j] = parse(k); M4.makeTranslation(i, -0.1, j); ghostMesh.setMatrixAt(idx, M4); M4.makeTranslation(i, 0.0, j); ghostTop.setMatrixAt(idx, M4); });
    ghostMesh.count = ghostTop.count = keys.length; ghostMesh.instanceMatrix.needsUpdate = ghostTop.instanceMatrix.needsUpdate = true;
    ghostTop.material.color.set(ready ? '#b6ffcf' : '#ffe0a8');
  }

  // ---------- sprites ----------
  const geoCache = new Map(), matCache = new Map(), texCache = new Map(), alphaCache = new Map();
  function spriteGeo(s, centered) {
    const k = s.w + 'x' + s.h + 'p' + s.pad + (centered ? 'c' : '');
    if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(s.w / U, s.h / U).translate(0, centered ? 0 : s.h / U / 2 - s.pad / U, 0));
    return geoCache.get(k);
  }
  function spriteMat(name, ghost) {
    const mk = name + (ghost ? '#ghost' : '');
    if (matCache.has(mk)) return matCache.get(mk);
    if (!texCache.has(name)) texCache.set(name, canvasTex(painter.get(name).canvas));
    const m = new THREE.MeshBasicMaterial({ map: texCache.get(name), alphaTest: 0.5, alphaToCoverage: style.res > 1 && !ghost, transparent: !!ghost, opacity: ghost ? 0.6 : 1, depthWrite: !ghost });
    m.shadowSide = THREE.DoubleSide;
    matCache.set(mk, m);
    return m;
  }
  function makeSprite(name, centered) {
    const s = painter.get(name);
    const mesh = new THREE.Mesh(spriteGeo(s, centered), spriteMat(name));
    mesh.castShadow = true; mesh.rotation.order = 'YXZ'; mesh.userData.name = name;
    return mesh;
  }
  function alphaAt(name, u, v) {
    if (!alphaCache.has(name)) { const c = painter.get(name).canvas; alphaCache.set(name, { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }); }
    const a = alphaCache.get(name), x = Math.floor(u * a.w), y = Math.floor((1 - v) * a.h);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) return 0;
    return a.d[(y * a.w + x) * 4 + 3];
  }
  const glowMats = {};
  function glowMat(color) {
    if (!glowMats[color]) glowMats[color] = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    return glowMats[color];
  }

  const entLayer = new THREE.Group(); scene.add(entLayer);
  const ents = new Map(); // tile key -> { crop, cropName, bld, bldName, glow }
  const transients = [];
  function spriteTilt(mesh) { mesh.rotation.y = cam.yaw; mesh.rotation.x = -0.22; }

  function addCrop(e, k, name, id, stage, popIn) {
    const [i, j] = parse(k);
    const m = makeSprite(name); m.position.set(i, 0, j + 0.06);
    m.userData = { name, k, kind: 'crop', born: popIn ? clock.t : -9, phase: hash(i, j) * 6.28, stage, id };
    entLayer.add(m); e.crop = m; e.cropName = name;
    if (stage === 3 && GLOW_CROPS[id]) {
      const g = new THREE.Sprite(glowMat(GLOW_CROPS[id])); g.scale.set(1.5, 1.5, 1); g.position.set(0, 0.55, 0.05); m.add(g);
    }
  }
  function removeCrop(e, harvested) {
    const m = e.crop; if (!m) return;
    e.crop = null; e.cropName = null;
    if (harvested) { m.userData.dying = clock.t; transients.push(m); }
    else entLayer.remove(m);
  }
  function addBld(e, k, id) {
    const [i, j] = parse(k);
    const name = 'bld:' + id, m = makeSprite(name); m.position.set(i, 0, j + 0.06);
    m.userData = { name, k, kind: 'bld', born: clock.t, phase: hash(i, j) * 6.28, id };
    if (id === 'windmill') {
      const bl = makeSprite('bld:windmillBlades', true); bl.rotation.order = 'XYZ';
      bl.position.set(0, (painter.get(name).h - 13 - painter.get(name).pad) / U, 0.04); bl.userData.blade = true; m.add(bl);
    }
    if (GLOW_BLD[id]) { const [c, y, sc] = GLOW_BLD[id]; const g = new THREE.Sprite(glowMat(c)); g.scale.set(sc * 1.4, sc * 1.4, 1); g.position.set(id === 'lantern' ? 0.35 : 0, y, 0.05); m.add(g); }
    entLayer.add(m); e.bld = m; e.bldName = name;
  }

  function syncEntities(s) {
    for (const k in s.tiles) {
      const t = s.tiles[k];
      let e = ents.get(k);
      const cropName = t.crop ? 'crop:' + t.crop.id + ':' + stageOf(t.crop.p) + (t.crop.p >= 1 && t.crop.g ? ':g' : '') : null;
      const bldName = t.b && !BUILDING[t.b].flat ? 'bld:' + t.b : null;
      if (!e) { if (!cropName && !bldName) continue; e = {}; ents.set(k, e); }
      if (e.cropName !== cropName) {
        const prevStage = e.crop?.userData.stage, newStage = cropName ? stageOf(t.crop.p) : -1;
        if (e.crop) removeCrop(e, prevStage === 3 && newStage !== 3);
        if (cropName) addCrop(e, k, cropName, t.crop.id, newStage, true);
      }
      if (e.bldName !== bldName) {
        if (e.bld) { entLayer.remove(e.bld); e.bld = null; e.bldName = null; }
        if (bldName) addBld(e, k, t.b);
      }
      if (!e.crop && !e.bld) ents.delete(k);
    }
  }
  function clearEntities() { for (const e of ents.values()) { if (e.crop) entLayer.remove(e.crop); if (e.bld) entLayer.remove(e.bld); } ents.clear(); }

  // ---------- helpers ----------
  const helperMeshes = [];
  function syncHelpers(dt) {
    while (helperMeshes.length < rt.helpers.length) { const m = makeSprite('misc:helper0'); entLayer.add(m); helperMeshes.push(m); }
    while (helperMeshes.length > rt.helpers.length) entLayer.remove(helperMeshes.pop());
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    rt.helpers.forEach((h, idx) => {
      const m = helperMeshes[idx];
      const moving = h.path.length > 0, working = h.wait > 0 && h.task;
      const frame = moving ? Math.floor(h.hop * 8) % 2 : working ? Math.floor(h.hop * 6) % 2 : 0;
      const name = 'misc:helper' + frame;
      if (m.userData.name !== name) { m.material = spriteMat(name); m.userData.name = name; }
      const hop = moving ? Math.abs(Math.sin(h.hop * 12)) * 0.12 : 0;
      const k = key(Math.round(h.x), Math.round(h.z));
      m.position.set(h.x, hop + riseOffset(k), h.z + 0.3);
      if (moving && h.dx !== undefined) { const d = h.dx * rx + h.dz * rz; if (Math.abs(d) > 0.05) h.face = d > 0 ? 1 : -1; }
      spriteTilt(m); m.scale.set(h.face || 1, 1, 1);
      const born = (performance.now() - h.born) / 500; if (born < 1) m.scale.multiplyScalar(back(Math.max(0.01, born)));
    });
  }

  // ---------- clouds, islets, critters ----------
  const decor = new THREE.Group(); scene.add(decor);
  let clouds = [], islets = [], flies = [], cloudMats = [];
  function buildDecor() {
    decor.clear(); clouds = []; islets = []; flies = [];
    cloudMats = [0, 1, 2, 3].map(v => { const c = painter.get('cloud:' + v); const t = canvasTex(c.canvas); return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, alphaTest: style.res === 1 ? 0.5 : 0.02 }); });
    for (let i = 0; i < 46; i++) {
      const below = i < 34, sp = new THREE.Sprite(cloudMats[i % 4]);
      const a = Math.random() * Math.PI * 2, r = below ? 4 + Math.random() * 50 : 38 + Math.random() * 40;
      const w = below ? 7 + Math.random() * 11 : 12 + Math.random() * 12;
      sp.scale.set(w, w * 34 / 72, 1);
      sp.position.set(Math.cos(a) * r, below ? -6 - Math.random() * 14 : -4 + Math.random() * 5, Math.sin(a) * r);
      sp.userData.v = 0.25 + Math.random() * 0.5;
      decor.add(sp); clouds.push(sp);
    }
    const isMat = new THREE.MeshToonMaterial({ map: canvasTex(painter.tileTex('grass', 3)), gradientMap: gradMap });
    const isSide = new THREE.MeshToonMaterial({ map: canvasTex(painter.tileTex('side')), gradientMap: gradMap });
    const isUnder = underMat;
    for (let n = 0; n < 5; n++) {
      const g = new THREE.Group(), a = n / 5 * Math.PI * 2 + 0.4, r = 24 + Math.random() * 14;
      const size = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
        const b = new THREE.Mesh(boxGeo, [isSide, isSide, isMat, isSide, isSide, isSide]); b.position.set(i, 0, j); g.add(b);
        const c = new THREE.Mesh(coneGeo, isUnder); c.position.set(i, -0.6, j); c.scale.set(1.3, 1.4 + Math.random() * 1.6, 1.3); g.add(c);
      }
      const deco = ['bld:tree', 'crop:wishflower:3', 'crop:cotton:3', 'bld:shrooms', 'bld:stonelamp'][n];
      const sp = makeSprite(deco); sp.position.set((size - 1) / 2, 0, (size - 1) / 2); sp.castShadow = false; sp.userData.billboard = true; g.add(sp);
      g.position.set(Math.cos(a) * r, -3 + Math.random() * 5, Math.sin(a) * r);
      g.userData = { y: g.position.y, ph: Math.random() * 6 };
      decor.add(g); islets.push(g);
    }
    for (let i = 0; i < 5; i++) { const m = makeSprite('misc:fly0', true); m.castShadow = false; m.scale.setScalar(0.5); m.userData = { ph: Math.random() * 100, sp: 0.3 + Math.random() * 0.3 }; decor.add(m); flies.push(m); }
  }

  // ---------- particles ----------
  const PN = 1400;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
  const parts = Array.from({ length: PN }, () => ({ life: 0 }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { shape: { value: 0 }, scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vc; varying float va;
      uniform float scale; void main(){ vc = color; va = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform int shape; varying vec3 vc; varying float va; void main(){ vec2 p = gl_PointCoord - .5; float a = 1.;
      if (shape == 0) a = smoothstep(.5, .2, length(p));
      else if (shape == 2) { vec2 q = vec2(p.x*1.8, p.y); a = step(length(q), .45); }
      else if (shape == 3) a = step(length(p), .45);
      if (a * va < .02) discard; gl_FragColor = vec4(vc, a * va); }`,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
  let pCursor = 0;
  const tmpC = new THREE.Color();
  function emit(x, y, z, o) {
    const p = parts[pCursor]; pCursor = (pCursor + 1) % PN;
    p.x = x; p.y = y; p.z = z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = p.max = o.life || 1; p.g = o.g ?? 3; p.drag = o.drag ?? 0.98; p.size = o.size || 0.15; p.wob = o.wob || 0; p.ph = Math.random() * 6;
    tmpC.set(o.color || '#ffffff'); p.r = tmpC.r; p.gc = tmpC.g; p.b = tmpC.b; p.fade = o.fade ?? 1;
  }
  function burst(x, y, z, o) {
    const cols = [].concat(o.color || '#ffffff');
    for (let i = 0; i < (o.n || 10); i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 2) * (0.4 + Math.random() * 0.8);
      emit(x + (Math.random() - 0.5) * (o.spread || 0.3), y + Math.random() * (o.h || 0.2), z + (Math.random() - 0.5) * (o.spread || 0.3), {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (o.up || 2) * (0.6 + Math.random() * 0.8), life: (o.life || 0.8) * (0.7 + Math.random() * 0.6),
        g: o.g ?? 6, size: (o.size || 0.14) * (0.7 + Math.random() * 0.6), color: cols[i % cols.length], drag: o.drag ?? 0.96, wob: o.wob,
      });
    }
  }
  function updateParticles(dt) {
    const f = Math.pow(0.5, dt * 4);
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      if (p.life <= 0) { pAlpha[i] = 0; continue; }
      p.life -= dt;
      p.vy -= p.g * dt; const dr = Math.pow(p.drag, dt * 60); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += (p.vx + (p.wob ? Math.sin(clock.t * 3 + p.ph) * p.wob : 0)) * dt; p.y += p.vy * dt; p.z += (p.vz + (p.wob ? Math.cos(clock.t * 2.3 + p.ph) * p.wob : 0)) * dt;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = p.r; pCol[i * 3 + 1] = p.gc; pCol[i * 3 + 2] = p.b;
      const lt = p.life / p.max; pSize[i] = p.size; pAlpha[i] = p.fade ? Math.min(1, lt * 2.5) : 1;
    }
    void f;
    pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = pGeo.attributes.alpha.needsUpdate = true;
  }

  // ---------- sky events (whale, balloon, falling star) ----------
  const events = [];
  function spawnEvent(kind) {
    const c = new THREE.Vector3(islandBounds.cx, 0, islandBounds.cz);
    let obj;
    if (kind === 'star') {
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff6c8', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      obj.scale.set(2.2, 2.2, 1);
      const a = Math.random() * Math.PI * 2, from = new THREE.Vector3(Math.cos(a) * 26, 16, Math.sin(a) * 26).add(c), to = new THREE.Vector3(-Math.cos(a + 0.6) * 22, 7, -Math.sin(a + 0.6) * 22).add(c);
      obj.userData = { kind, from, to, dur: 5.5, t0: clock.t, r: 60 };
    } else if (kind === 'whale') {
      obj = makeSprite('misc:whale', true); obj.castShadow = false; obj.scale.setScalar(2.2);
      const a = Math.random() * Math.PI * 2, d = islandBounds.r + 10, side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const base = new THREE.Vector3(Math.cos(a) * d, 4.5, Math.sin(a) * d).add(c);
      obj.userData = { kind, from: base.clone().addScaledVector(side, -50), to: base.clone().addScaledVector(side, 50), dur: 60, t0: clock.t, r: 110, billboard: true };
    } else {
      obj = makeSprite('misc:balloon', true); obj.castShadow = false; obj.scale.setScalar(1.3);
      const a = Math.random() * Math.PI * 2, d = islandBounds.r + 1.5;
      obj.userData = { kind, from: new THREE.Vector3(Math.cos(a) * d, -10, Math.sin(a) * d).add(c), to: new THREE.Vector3(Math.cos(a) * d, 16, Math.sin(a) * d).add(c), dur: 42, t0: clock.t, r: 55, billboard: true };
    }
    obj.position.copy(obj.userData.from);
    scene.add(obj); events.push(obj);
    return obj;
  }
  function removeEvent(obj, popped) {
    const i = events.indexOf(obj); if (i >= 0) events.splice(i, 1);
    scene.remove(obj);
    if (popped) burst(obj.position.x, obj.position.y, obj.position.z, { n: 30, color: ['#ffffff', '#fff2a8', '#ffc6e8'], speed: 4, up: 2, g: 1, life: 1.2, size: 0.3 });
  }
  function updateEvents(dt) {
    for (const o of [...events]) {
      const u = o.userData, t = (clock.t - u.t0) / u.dur;
      if (t >= 1) { removeEvent(o); continue; }
      o.position.lerpVectors(u.from, u.to, u.kind === 'star' ? t : t);
      if (u.kind === 'whale') { o.position.y += Math.sin(clock.t * 0.8) * 0.6; if (Math.random() < dt * 3) emit(o.position.x, o.position.y + 1.6, o.position.z, { vy: 2.5, vx: (Math.random() - 0.5), g: 2, life: 1.4, size: 0.25, color: '#dff4ff' }); }
      if (u.kind === 'balloon') { o.position.x += Math.sin(clock.t * 0.9 + u.t0) * 0.5; }
      if (u.kind === 'star') { for (let n = 0; n < 3; n++) emit(o.position.x, o.position.y, o.position.z, { vx: (Math.random() - 0.5) * 0.4, vy: -0.3, vz: (Math.random() - 0.5) * 0.4, g: 0, life: 0.9, size: 0.35, color: n ? '#fff6c8' : '#ffc6e8' }); }
      if (u.billboard) { o.rotation.order = 'YXZ'; o.rotation.y = cam.yaw; const dir = (u.to.x - u.from.x) * Math.cos(cam.yaw) - (u.to.z - u.from.z) * Math.sin(cam.yaw); o.scale.x = Math.abs(o.scale.x) * (dir > 0 ? -1 : 1); }
    }
  }

  // ---------- hover marker & ghost ----------
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.roundRect(5, 5, 54, 54, 12); x.stroke(); return new THREE.CanvasTexture(c); })();
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, color: '#ffffff' }));
  hover.position.y = 0.015; hover.visible = false; hover.renderOrder = 2; scene.add(hover);
  let ghost = null, ghostName = null;
  function setHover(k, color, gName) {
    if (!k) { hover.visible = false; if (ghost) ghost.visible = false; return; }
    const [i, j] = parse(k);
    hover.visible = true; hover.position.x = i; hover.position.z = j; hover.material.color.set(color || '#ffffff');
    if (gName !== ghostName) { if (ghost) scene.remove(ghost); ghost = null; ghostName = gName; if (gName) { const s = painter.get(gName); ghost = new THREE.Mesh(spriteGeo(s), spriteMat(gName, true)); ghost.rotation.order = 'YXZ'; scene.add(ghost); } }
    if (ghost) { ghost.visible = true; ghost.position.set(i, 0, j + 0.06); spriteTilt(ghost); }
  }

  // ---------- day / night ----------
  const C = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  let nightAmt = 0;
  function dayCurve(p) { if (p < 0.05) return 0.5 + p / 0.1; if (p < 0.55) return 1; if (p < 0.66) return 1 - (p - 0.55) / 0.11; if (p < 0.93) return 0; return (p - 0.93) / 0.07 * 0.5; }
  const spriteTint = new THREE.Color();
  function applyDay(p) {
    const day = dayCurve(p), dusk = Math.max(0, 1 - Math.abs(day - 0.5) * 2), sk = style.sky;
    nightAmt = 1 - day;
    const top = C(sk.nightTop, sk.dayTop, day).lerp(new THREE.Color(sk.duskTop), dusk * 0.6);
    const hor = C(sk.nightHor, sk.dayHor, day).lerp(new THREE.Color(sk.duskHor), dusk * 0.7);
    skyU.top.value.copy(top); skyU.hor.value.copy(hor); skyU.bot.value.copy(top).lerp(hor, 0.45);
    scene.fog.color.copy(hor).lerp(skyU.bot.value, 0.4);
    const a = p * Math.PI * 2;
    const c = new THREE.Vector3(islandBounds.cx, 0, islandBounds.cz);
    const dir = new THREE.Vector3(Math.cos(a * 2 + 0.6) * 0.8, 1.15, Math.sin(a * 2 + 0.6) * 0.6 + 0.3).normalize();
    sun.position.copy(c).addScaledVector(dir, 40); sun.target.position.copy(c);
    sun.color.copy(C('#8ea0ff', style.sun, day)).lerp(new THREE.Color('#ffb48a'), dusk * 0.5);
    sun.intensity = (style.id === 'moonpetal' ? 0.8 : 0.55) + 1.75 * day;
    hemi.color.copy(top).lerp(new THREE.Color('#ffffff'), 0.5);
    hemi.groundColor.set(style.hemiGround);
    hemi.intensity = 0.9 + 0.8 * day;
    const nightTint = style.id === 'moonpetal' ? '#b6b2ff' : style.id === 'inkwash' ? '#a9a39a' : '#8a92d6';
    spriteTint.copy(C(nightTint, '#ffffff', day)).lerp(new THREE.Color('#ffd6bc'), dusk * 0.35);
    for (const m of matCache.values()) m.color.copy(spriteTint);
    if (vineMat) vineMat.color.copy(spriteTint);
    starMat.opacity = Math.max(0, 1 - day * 1.6) * (style.id === 'inkwash' ? 0.4 : 1);
    const glowA = style.glowy ? 0.45 + 0.55 * nightAmt : Math.max(0, nightAmt * 1.1 - 0.1);
    for (const m of Object.values(glowMats)) m.opacity = glowA * (style.id === 'inkwash' ? 0.5 : 0.9);
    const sa = (p + 0.0) * Math.PI * 2;
    sunSprite.position.set(Math.cos(sa) * -220 + c.x, Math.sin(sa + 0.25) * 200, -160 + c.z);
    moonSprite.position.set(Math.cos(sa) * 220 + c.x, -Math.sin(sa + 0.25) * 200, 160 + c.z);
    sunSprite.material.color.set(style.sun); sunSprite.material.opacity = day * 0.9;
    moonSprite.material.opacity = nightAmt * 0.9;
    const cc = C(style.id === 'moonpetal' ? '#8f86d8' : '#7d84b8', '#ffffff', day).lerp(new THREE.Color('#ffc2a8'), dusk * 0.3);
    for (const m of cloudMats) m.color.copy(cc);
  }

  // ---------- camera ----------
  function updateCamera(dt) {
    cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 7);
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt * 8);
    const sh = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0; cam.shake = Math.max(0, cam.shake - dt * 0.6);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist + sh, sp * cam.dist + sh, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 0.2, cam.tz);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
  }
  function clampTarget() {
    const b = islandBounds, m = 2.5;
    cam.tx = Math.max(b.minI - m, Math.min(b.maxI + m, cam.tx)); cam.tz = Math.max(b.minJ - m, Math.min(b.maxJ + m, cam.tz));
  }

  // ---------- main update ----------
  let ambientT = 0, rainT = 0;
  function update(s, dt) {
    clock.t += dt;
    if (rt.rev.land !== lastRev || rising.size) { lastRev = rt.rev.land; rebuildIsland(s); }
    if (frameWanted) applyFrame();
    syncEntities(s);
    syncHelpers(dt);
    const t = clock.t, wind = Math.sin(t * 0.7) * 0.5 + 0.5;
    const blades = [];
    for (const e of ents.values()) {
      for (const m of [e.crop, e.bld]) {
        if (!m) continue;
        const u = m.userData, y = riseOffset(u.k);
        spriteTilt(m); m.position.y = y;
        if (u.kind === 'crop') {
          m.rotation.z = Math.sin(t * 1.8 + u.phase) * (0.025 + 0.03 * wind) * (u.stage === 3 ? 1.4 : 1);
          if (u.id === 'melon' && u.stage === 3) m.rotation.z *= 2.2;
          if (u.stage === 3 && Math.random() < dt * (s.tiles[u.k]?.crop?.g ? 3 : 0.15)) emit(m.position.x + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, m.position.z, { vy: 0.5, g: 0, life: 0.9, size: 0.16, color: s.tiles[u.k]?.crop?.g ? '#ffe066' : '#ffffff' });
        } else if (u.id === 'windmill') blades.push(m);
        const bt = (t - u.born) / 0.45;
        if (bt < 1) { const sc = back(Math.max(0.02, bt)); m.scale.set(sc, sc, sc); }
        else if (m.scale.x !== 1) m.scale.set(1, 1, 1);
        if (u.kind === 'bld' && u.id === 'drizzle' && Math.random() < dt * 9) emit(m.position.x + (Math.random() - 0.5) * 0.7, 1.2, m.position.z + (Math.random() - 0.5) * 0.7, { vy: -3, g: 4, life: 0.35, size: 0.07, color: '#8ccaff', fade: 0 });
        if (u.kind === 'bld' && u.id === 'hive' && Math.random() < dt * 1.5) emit(m.position.x, 0.8, m.position.z, { vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 0.3, g: 0, life: 2, size: 0.09, color: '#ffd23f', wob: 1.2 });
        if (u.kind === 'bld' && u.id === 'tree' && Math.random() < dt * 1.2) emit(m.position.x + (Math.random() - 0.5) * 1.6, 2 + Math.random(), m.position.z + (Math.random() - 0.5) * 1.6, { vy: -0.2, g: 0.4, life: 3, size: 0.12, color: '#f6a5c0', wob: 0.6 });
      }
    }
    for (const m of blades) for (const c of m.children) if (c.userData.blade) c.rotation.z -= dt * (0.8 + wind * 1.5);
    // harvested sprites hop away
    for (let i = transients.length - 1; i >= 0; i--) {
      const m = transients[i], a = (t - m.userData.dying) / 0.4;
      if (a >= 1) { entLayer.remove(m); transients.splice(i, 1); continue; }
      const sc = a < 0.3 ? 1 + a * 0.9 : (1.27) * (1 - (a - 0.3) / 0.7);
      m.scale.set(sc * (1 - a * 0.3), sc, sc); m.position.y = Math.sin(a * Math.PI) * 0.5; spriteTilt(m);
    }
    // clouds drift
    for (const cl of clouds) { cl.position.x += cl.userData.v * dt; if (cl.position.x > islandBounds.cx + 60) cl.position.x -= 120; }
    for (const g of islets) { g.position.y = g.userData.y + Math.sin(t * 0.4 + g.userData.ph) * 0.4; for (const c of g.children) if (c.userData.billboard) { c.rotation.order = 'YXZ'; c.rotation.y = cam.yaw - 0; } }
    const dayish = nightAmt < 0.5;
    flies.forEach((f, idx) => {
      f.visible = dayish && !style.glowy;
      if (!f.visible) return;
      const u = f.userData, tt = t * u.sp + u.ph;
      f.position.set(islandBounds.cx + Math.sin(tt * 1.3) * (islandBounds.r - 1.2), 0.9 + Math.sin(tt * 3.1) * 0.35, islandBounds.cz + Math.cos(tt * 0.9 + idx) * (islandBounds.r - 1.2));
      const fr = Math.floor(t * 9 + idx) % 2, nm = 'misc:fly' + fr; if (f.userData.name !== nm) { f.material = spriteMat(nm); f.userData.name = nm; }
      f.rotation.order = 'YXZ'; f.rotation.y = cam.yaw;
    });
    // ambient particles
    ambientT += dt;
    const b = islandBounds;
    while (ambientT > 0.12) {
      ambientT -= 0.12;
      const x = b.cx + (Math.random() - 0.5) * (b.r * 2 + 6), z = b.cz + (Math.random() - 0.5) * (b.r * 2 + 6);
      if (nightAmt > 0.5 || style.glowy) { if (Math.random() < 0.5) emit(x, 0.3 + Math.random() * 2.2, z, { g: 0, life: 4, size: 0.12, color: style.glowy ? (Math.random() < 0.5 ? '#9ff5d8' : '#ffb3e6') : '#fff2a0', wob: 0.5, vy: 0.05 }); }
      else if (style.ambient === 'petals' && Math.random() < 0.35) emit(x - 6, 3 + Math.random() * 3, z, { vx: 1.2, vy: -0.3, g: 0.15, life: 7, size: 0.13, color: Math.random() < 0.5 ? '#ffc4d4' : '#fff0f4', wob: 0.7, drag: 1 });
      else if (style.ambient === 'pixels' && Math.random() < 0.3) emit(x, 0.2 + Math.random(), z, { vy: 0.6, g: 0, life: 1.6, size: 0.1, color: Math.random() < 0.5 ? '#fee761' : '#ffffff' });
      else if (style.ambient === 'ink' && Math.random() < 0.25) emit(x - 6, 3 + Math.random() * 3, z, { vx: 0.8, vy: -0.4, g: 0.1, life: 7, size: 0.1, color: Math.random() < 0.3 ? '#c8392b' : '#3a3632', wob: 0.4, drag: 1 });
    }
    if (s.rain > 0) {
      rainT += dt * 140;
      while (rainT > 1) { rainT--; emit(b.cx + (Math.random() - 0.5) * (b.r * 2 + 2), 7, b.cz + (Math.random() - 0.5) * (b.r * 2 + 2), { vy: -9, g: 6, life: 0.95, size: 0.07, color: '#9fd4ff', fade: 0 }); }
    }
    updateParticles(dt);
    updateEvents(dt);
    ghostMesh.material.opacity = 0.16 + Math.sin(t * 4) * 0.06; ghostTop.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
    hover.material.opacity = 0.75 + Math.sin(t * 6) * 0.2;
    applyDay(dayPhase(s));
    clampTarget();
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function setRay(x, y) { const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pickTile(x, y, s, sideFix = true) {
    setRay(x, y);
    const meshes = []; for (const e of ents.values()) { if (e.crop) meshes.push(e.crop); if (e.bld) meshes.push(e.bld); }
    for (const h of ray.intersectObjects(meshes, false)) if (h.uv && alphaAt(h.object.userData.name, h.uv.x, h.uv.y) > 100) return h.object.userData.k;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const k = key(Math.round(hit.x), Math.round(hit.z));
    if (s && sideFix && !s.tiles[k]) { // tapped a tile side? try slightly lower plane
      plane.constant = 0.45; if (ray.ray.intersectPlane(plane, hit)) { const k2 = key(Math.round(hit.x), Math.round(hit.z)); plane.constant = 0; if (s.tiles[k2]) return k2; } plane.constant = 0;
    }
    return k;
  }
  function pickEvent(x, y) {
    const r = canvas.getBoundingClientRect();
    let best = null, bd = 1e9;
    for (const o of events) { const p = project(o.position); if (!p) continue; const d = Math.hypot(p.x - (x - r.left), p.y - (y - r.top)); if (d < o.userData.r && d < bd) { bd = d; best = o; } }
    return best;
  }
  const PV = new THREE.Vector3();
  function project(v, y) {
    PV.copy(v); if (y !== undefined) PV.y = y;
    PV.project(camera);
    if (PV.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: (PV.x + 1) / 2 * r.width, y: (1 - PV.y) / 2 * r.height };
  }
  function tileScreen(k, y = 1) { const [i, j] = parse(k); return project(new THREE.Vector3(i, y, j)); }

  // ---------- public controls ----------
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) / pixelScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 42 : 30;
    camera.updateProjectionMatrix();
    pMat.uniforms.scale.value = h * Math.min(devicePixelRatio, 2) / pixelScale * 0.9 / Math.tan(camera.fov * Math.PI / 360) / 2;
  }
  function pan(dx, dy) {
    const h = canvas.clientHeight || innerHeight, wpp = 2 * cam.dist * Math.tan(camera.fov * Math.PI / 360) / h;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    cam.tx -= rx * dx * wpp; cam.tz -= rz * dx * wpp;
    cam.tx += fx * dy * wpp / Math.sin(cam.pitch); cam.tz += fz * dy * wpp / Math.sin(cam.pitch);
  }
  function zoom(f) { cam.distT = Math.max(7, Math.min(48, cam.distT * f)); }
  function rotate(dir) { cam.yawT += dir * Math.PI / 2; }
  function focus(k) { const [i, j] = parse(k); cam.tx = i; cam.tz = j; }
  let frameWanted = false;
  function frameIsland() { frameWanted = true; }
  function applyFrame() { frameWanted = false; cam.tx = islandBounds.cx; cam.tz = islandBounds.cz; cam.distT = Math.max(10.5, Math.min(42, islandBounds.r * 3.7)); }

  function setStyle(st) {
    style = st; painter = createPainter(st); pixelScale = st.pixel || 1;
    canvas.classList.toggle('pixelated', st.pixel > 1);
    gradMap = toonGrad(st.toon || 3);
    pMat.uniforms.shape.value = st.ambient === 'pixels' ? 1 : st.ambient === 'petals' ? 2 : st.ambient === 'ink' ? 3 : 0;
    for (const t of texCache.values()) t.dispose(); texCache.clear();
    for (const m of matCache.values()) m.dispose(); matCache.clear(); alphaCache.clear();
    clearEntities(); transients.forEach(m => entLayer.remove(m)); transients.length = 0;
    helperMeshes.forEach(m => entLayer.remove(m)); helperMeshes.length = 0;
    for (const o of [...events]) removeEvent(o);
    if (ghost) { scene.remove(ghost); ghost = null; ghostName = null; }
    buildIslandMaterials(); buildDecor(); resize();
  }

  return {
    update, resize, setStyle, pan, zoom, rotate, focus, frameIsland, pickTile, pickEvent, project, tileScreen, setHover, setGhosts,
    spawnEvent, removeEvent, burst, shake: v => { cam.shake = Math.max(cam.shake, v); }, riseTile: k => rising.set(k, clock.t),
    get painter() { return painter; }, get night() { return nightAmt; }, cam, events,
  };
}
