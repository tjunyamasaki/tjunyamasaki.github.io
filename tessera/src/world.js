// The 3D stage: sky, sea, light, the tiles themselves, followers, and every
// celebration. main.js decides what happens; this file decides how it looks.
import * as T from '../vendor/three.module.min.js';
import { TILE_TYPES, rotatePoint, RES } from './tiles.mjs';
import { tileCanvas, featureMask } from './art.js';
import { growTile, createLife, lifeUniforms, TOP } from './life.js';
import { createRig } from './camera.js';

const TAU = Math.PI * 2;
const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1, m = k - 1; return 1 + c3 * m * m * m + c1 * m * m; };
const easeInOut = k => k * k * (3 - 2 * k);
const easeOutBounce = k => {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
};

// Sky keyframes around a day: phase 0 is late morning.
const SKY = [
  { p: 0.0, elev: 0.95, sun: '#fff4e0', sunI: 2.6, hemiS: '#cfe6ff', hemiG: '#5a6e3a', hemiI: 1.25, top: '#5e9ee0', hor: '#cfe4f2', night: 0, sea: '#3f93a8' },
  { p: 0.2, elev: 0.55, sun: '#ffe2b0', sunI: 2.4, hemiS: '#d8e4f5', hemiG: '#5e6a3c', hemiI: 1.1, top: '#6aa0d8', hor: '#f0dcc0', night: 0, sea: '#3b8ba0' },
  { p: 0.3, elev: 0.2, sun: '#ffb070', sunI: 2.1, hemiS: '#f2c9a8', hemiG: '#5a4a3a', hemiI: 0.85, top: '#5a74b8', hor: '#f6b27e', night: 0.25, sea: '#3a6f8a' },
  { p: 0.38, elev: 0.06, sun: '#ff8a5a', sunI: 1.2, hemiS: '#9a8ab8', hemiG: '#3a3040', hemiI: 0.6, top: '#2f3f78', hor: '#d98a74', night: 0.65, sea: '#2b4d6c' },
  { p: 0.48, elev: 0.75, sun: '#a9c4ff', sunI: 0.75, hemiS: '#6a80bb', hemiG: '#232a3a', hemiI: 0.7, top: '#0c1530', hor: '#26355e', night: 1, sea: '#15304a' },
  { p: 0.72, elev: 0.75, sun: '#a9c4ff', sunI: 0.75, hemiS: '#6a80bb', hemiG: '#232a3a', hemiI: 0.7, top: '#0c1530', hor: '#26355e', night: 1, sea: '#15304a' },
  { p: 0.84, elev: 0.12, sun: '#ffb4a0', sunI: 1.3, hemiS: '#b8a8d0', hemiG: '#40384a', hemiI: 0.7, top: '#4a5ea8', hor: '#f0b8a0', night: 0.45, sea: '#2f5a78' },
  { p: 0.93, elev: 0.5, sun: '#ffe9c8', sunI: 2.2, hemiS: '#d5e3f8', hemiG: '#566a3a', hemiI: 1.05, top: '#5f98d8', hor: '#e6e0d0', night: 0, sea: '#3b8ba0' },
];
export const TIMES = { day: 0.04, golden: 0.27, night: 0.6, cycle: null };

function skyAt(p) {
  p = ((p % 1) + 1) % 1;
  let a = SKY[SKY.length - 1], b = SKY[0], k = 0;
  for (let i = 0; i < SKY.length; i++) {
    const cur = SKY[i], next = SKY[(i + 1) % SKY.length];
    const end = next.p > cur.p ? next.p : next.p + 1;
    const q = p < cur.p ? p + 1 : p;
    if (q >= cur.p && q < end) { a = cur; b = next; k = (q - cur.p) / (end - cur.p); break; }
  }
  k = easeInOut(k);
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 'p') continue;
    if (typeof a[key] === 'number') out[key] = a[key] + (b[key] - a[key]) * k;
    else out[key] = new T.Color(a[key]).lerp(new T.Color(b[key]), k);
  }
  return out;
}

function meepleGeometry() {
  const s = new T.Shape();
  s.moveTo(-0.46, 0);
  s.lineTo(-0.14, 0);
  s.quadraticCurveTo(0, 0.26, 0.14, 0);
  s.lineTo(0.46, 0);
  s.quadraticCurveTo(0.42, 0.22, 0.24, 0.42);
  s.quadraticCurveTo(0.42, 0.46, 0.52, 0.52);
  s.quadraticCurveTo(0.6, 0.62, 0.42, 0.64);
  s.lineTo(0.17, 0.66);
  s.quadraticCurveTo(0.3, 0.98, 0, 1);
  s.quadraticCurveTo(-0.3, 0.98, -0.17, 0.66);
  s.lineTo(-0.42, 0.64);
  s.quadraticCurveTo(-0.6, 0.62, -0.52, 0.52);
  s.quadraticCurveTo(-0.42, 0.46, -0.24, 0.42);
  s.quadraticCurveTo(-0.42, 0.22, -0.46, 0);
  const g = new T.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0.05, -0.15);
  g.scale(0.125, 0.125, 0.125);
  g.computeVertexNormals();
  return g;
}

function glowSquareTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff';
  x.shadowColor = '#fff';
  x.shadowBlur = 14;
  x.lineWidth = 6;
  x.beginPath(); x.roundRect(16, 16, 96, 96, 14); x.stroke();
  x.shadowBlur = 0;
  x.fillStyle = 'rgba(255,255,255,0.13)';
  x.beginPath(); x.roundRect(16, 16, 96, 96, 14); x.fill();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

function textTexture(text, colorHex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.font = '600 74px Georgia, "Times New Roman", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = 'rgba(20,16,12,0.85)';
  x.strokeText(text, 128, 66);
  x.fillStyle = colorHex;
  x.fillText(text, 128, 66);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

export function createWorld(canvas, { onTap, onHover, onRightTap } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const lowPower = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.6 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.fog = new T.Fog('#cfe4f2', 20, 70);
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 400);
  const rig = createRig(camera, canvas, { onTap, onHover, onRightTap });

  // ---------------------------------------------------------------- sky
  const skyUniforms = { uTop: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunColor: { value: new T.Color() }, uNight: { value: 0 } };
  const sky = new T.Mesh(new T.SphereGeometry(180, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : uHorizon * 0.92;
        float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(d, 900.0) * 3.0 * (1.0 - uNight * 0.5) + pow(d, 12.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  const starGeo = new T.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * TAU, y = Math.random() * 0.9 + 0.08, r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * 170, y * 170, Math.sin(a) * r * 170);
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: '#fff8e8', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // ---------------------------------------------------------------- light
  const hemi = new T.HemisphereLight('#cfe6ff', '#5a6e3a', 1.2);
  scene.add(hemi);
  const sun = new T.DirectionalLight('#fff4e0', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.015;
  Object.assign(sun.shadow.camera, { near: 1, far: 80 });
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- sea
  const seaUniforms = { uTime: lifeUniforms.uTime };
  const seaMat = new T.MeshStandardMaterial({ color: '#3f93a8', roughness: 0.32, metalness: 0.05, flatShading: true });
  seaMat.onBeforeCompile = s => {
    s.uniforms.uTime = seaUniforms.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float edge = smoothstep(19.0, 15.0, max(abs(position.x), abs(position.z)));
        transformed.y += edge * (sin(wp.x * 1.4 + uTime * 0.9) * 0.022 + sin(wp.z * 1.15 - uTime * 0.75) * 0.022 + sin((wp.x + wp.z) * 2.6 + uTime * 1.7) * 0.01);`);
  };
  const sea = new T.Mesh(new T.PlaneGeometry(40, 40, 100, 100).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = -0.04;
  const farSea = new T.Mesh(new T.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), seaMat);
  farSea.position.y = -0.045;
  scene.add(sea, farSea);

  // ------------------------------------------------------- clouds & birds
  const cloudMat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.94 });
  const puff = new T.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const g = new T.Group();
    g.userData.mat = cloudMat.clone();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const m = new T.Mesh(puff, g.userData.mat);
      m.position.set((k - n / 2) * 0.55 + Math.random() * 0.3, Math.random() * 0.25, (Math.random() - 0.5) * 0.6);
      m.scale.setScalar(0.45 + Math.random() * 0.45);
      m.scale.y *= 0.7;
      m.castShadow = true;
      g.add(m);
    }
    g.position.set((Math.random() - 0.5) * 40, 5 + Math.random() * 2.5, (Math.random() - 0.5) * 40);
    g.userData.speed = 0.15 + Math.random() * 0.2;
    scene.add(g);
    clouds.push(g);
  }
  const birdGeo = new T.BufferGeometry();
  birdGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.025, -0.08, 0.03, -0.01, 0, 0, -0.02, 0, 0, 0.025, 0, 0, -0.02, 0.08, 0.03, -0.01], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new T.MeshBasicMaterial({ color: '#3a3e48', side: T.DoubleSide });
  const birds = [];
  for (let i = 0; i < 11; i++) {
    const m = new T.Mesh(birdGeo, birdMat);
    m.userData = { r: 1.2 + Math.random() * 1.2, h: 1.3 + Math.random() * 0.6, sp: 0.18 + Math.random() * 0.05, ph: i * 0.18 + Math.random() * 0.15, flap: Math.random() * TAU };
    scene.add(m);
    birds.push(m);
  }

  // ---------------------------------------------------------------- board
  const board = new T.Group();
  scene.add(board);
  const life = createLife(scene);
  const boxGeo = (() => {
    const g = new T.BoxGeometry(0.996, 0.6, 0.996, 1, 3, 1);
    g.translate(0, TOP - 0.3, 0);
    const pos = g.attributes.position, col = [];
    const top = new T.Color('#7b6a49'), mid = new T.Color('#5d4c36'), low = new T.Color('#3a3026');
    for (let i = 0; i < pos.count; i++) {
      const k = (TOP - pos.getY(i)) / 0.6;
      const c = k < 0.05 ? new T.Color('#5d8a3b') : k < 0.5 ? top.clone().lerp(mid, k * 2) : mid.clone().lerp(low, (k - 0.5) * 2);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  })();
  const boxMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const topGeo = new T.PlaneGeometry(0.996, 0.996).rotateX(-Math.PI / 2);
  const topMats = new Map();
  const topMaterial = type => {
    if (!topMats.has(type)) {
      const tex = new T.CanvasTexture(tileCanvas(type));
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      topMats.set(type, new T.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    }
    return topMats.get(type);
  };
  const meepleGeo = meepleGeometry();
  const meepleMats = new Map();
  const meepleMaterial = (hex, ghost = false) => {
    const k = hex + ghost;
    if (!meepleMats.has(k)) meepleMats.set(k, new T.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.05, emissive: hex, emissiveIntensity: ghost ? 0.5 : 0.12, transparent: ghost, opacity: ghost ? 0.6 : 1, depthWrite: !ghost }));
    return meepleMats.get(k);
  };

  const tiles = new Map(); // tile index -> { group, tile, agents }
  const followerMeshes = new Map();
  const flagsByKey = new Set();
  const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

  // ---------------------------------------------------------------- time
  let now = 0;
  let generation = 0;
  const tweens = [];
  function tween(dur, fn, delay = 0) {
    return new Promise(resolve => tweens.push({ t0: now + delay, dur, fn, resolve }));
  }
  const wait = s => tween(s, () => {});

  // ---------------------------------------------------------------- fx
  const MAX_P = 700;
  const partMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ toneMapped: false }), MAX_P);
  partMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
  partMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  partMesh.frustumCulled = false;
  partMesh.count = 0;
  scene.add(partMesh);
  let parts = [];
  const dummy = new T.Object3D();
  const tmpColor = new T.Color();
  function burst(x, y, z, { n = 30, colors = ['#ffffff'], speed = 1, up = 1.2, gravity = 2.5, size = 0.02, life = 1.4, spread = 0.1 } = {}) {
    for (let i = 0; i < n && parts.length < MAX_P; i++) {
      const a = Math.random() * TAU, s = (0.3 + Math.random()) * speed;
      parts.push({
        x: x + Math.cos(a) * spread * Math.random(), y, z: z + Math.sin(a) * spread * Math.random(),
        vx: Math.cos(a) * s * 0.6, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s * 0.6,
        g: gravity, age: 0, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8),
        c: tmpColor.set(colors[Math.floor(Math.random() * colors.length)]).clone(), spin: Math.random() * 10,
      });
    }
  }
  function ringPulse(x, y, z, hex, size = 0.9, dur = 0.9) {
    const m = new T.Mesh(new T.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, z);
    scene.add(m);
    tween(dur, k => { m.scale.setScalar(0.2 + k * size); m.material.opacity = 0.8 * (1 - k); }).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
  function popup(text, hex, x, y, z, delay = 0) {
    const tex = textTexture(text, hex);
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }));
    s.renderOrder = 20;
    s.position.set(x, y, z);
    s.scale.set(0.001, 0.001, 1);
    scene.add(s);
    const size = Math.max(0.5, Math.min(1.4, rig.dist * 0.09));
    tween(2.1, k => {
      s.position.y = y + easeInOut(Math.min(1, k * 1.3)) * 0.55;
      const pop = k < 0.2 ? easeOutBack(k / 0.2) : 1;
      s.scale.set(size * pop, size * 0.5 * pop, 1);
      s.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    }, delay).then(() => { scene.remove(s); tex.dispose(); s.material.dispose(); });
  }

  const flagGeo = new T.PlaneGeometry(0.1, 0.06, 8, 1).translate(0.05, 0, 0);
  const poleGeo = new T.CylinderGeometry(0.0035, 0.0035, 1, 5).translate(0, 0.5, 0);
  const poleMat = new T.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.8 });
  function flagMaterial(hex) {
    const m = new T.MeshStandardMaterial({ color: hex, roughness: 0.7, side: T.DoubleSide, emissive: hex, emissiveIntensity: 0.12 });
    m.onBeforeCompile = s => {
      s.uniforms.uTime = lifeUniforms.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); float fk = position.x / 0.1; transformed.z += sin(position.x * 60.0 - uTime * 7.0) * 0.012 * fk; transformed.y -= fk * fk * 0.008;');
    };
    return m;
  }
  /** A flag on a pole, raised over a tile-local spot. */
  function raiseFlag(group, [x, y, z], hex, delay = 0, pole = 0.09) {
    const g = new T.Group();
    g.position.set(x, y - 0.005, z);
    const stick = new T.Mesh(poleGeo, poleMat);
    stick.scale.set(1, 0.001, 1);
    const cloth = new T.Mesh(flagGeo, flagMaterial(hex));
    cloth.position.y = pole - 0.03;
    cloth.scale.setScalar(0.001);
    cloth.castShadow = true;
    g.rotation.y = Math.random() * TAU;
    g.add(stick, cloth);
    group.add(g);
    tween(0.7, k => {
      stick.scale.y = Math.max(0.001, easeInOut(k) * pole);
      cloth.position.y = Math.max(0, easeInOut(k) * pole - 0.03);
      cloth.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, k * 1.3))));
    }, delay);
    return g;
  }

  // ---------------------------------------------------------------- tiles
  function localToWorld(tile, u, v) {
    const [ru, rv] = rotatePoint(u, v, tile.rot);
    return [tile.x + ru - 0.5, tile.y + rv - 0.5];
  }

  function addTile(tile, { animate = true, delay = 0 } = {}) {
    const group = new T.Group();
    group.position.set(tile.x, 0, tile.y);
    group.rotation.y = -tile.rot * Math.PI / 2;
    const box = new T.Mesh(boxGeo, boxMat);
    box.castShadow = true; box.receiveShadow = true;
    const top = new T.Mesh(topGeo, topMaterial(tile.type));
    top.position.y = TOP + 0.0005;
    top.receiveShadow = true;
    group.add(box, top);
    const drop = animate ? 0.6 : 0;
    const landAt = now + delay + drop;
    const { mesh, agents } = growTile(tile, animate ? landAt + 0.05 : now - 30);
    mesh.position.y = TOP;
    group.add(mesh);
    const record = { group, tile, agents, lifeGroup: new T.Group() };
    record.lifeGroup.position.y = TOP;
    group.add(record.lifeGroup);
    tiles.set(tile.index, record);
    board.add(group);
    life.add(tile, agents, record.lifeGroup);
    bounds.minX = Math.min(bounds.minX, tile.x); bounds.maxX = Math.max(bounds.maxX, tile.x);
    bounds.minZ = Math.min(bounds.minZ, tile.y); bounds.maxZ = Math.max(bounds.maxZ, tile.y);
    rig.setBounds(bounds);
    if (!animate) return Promise.resolve();
    group.position.y = 1.6;
    group.visible = delay <= 0;
    const gen = generation;
    const spin = (Math.random() - 0.5) * 0.5;
    return tween(drop, k => {
      group.visible = true;
      const e = easeOutBounce(k);
      group.position.y = (1 - e) * 1.6;
      group.rotation.y = -tile.rot * Math.PI / 2 + spin * (1 - Math.min(1, k * 1.6));
    }, delay).then(() => {
      if (gen !== generation) return;
      group.rotation.y = -tile.rot * Math.PI / 2;
      burst(tile.x, TOP + 0.02, tile.y, { n: 26, colors: ['#c9b48a', '#a68f68', '#e2d3b0'], speed: 1.1, up: 0.5, gravity: 1.6, size: 0.022, life: 0.9, spread: 0.55 });
      ringPulse(tile.x, TOP + 0.01, tile.y, '#fff2cc', 1.3, 0.8);
      // Sparkles as life takes root.
      setTimeout(() => gen === generation && burst(tile.x, TOP + 0.05, tile.y, { n: 18, colors: ['#fff6c8', '#d8ff9a', '#ffffff'], speed: 0.6, up: 0.9, gravity: -0.1, size: 0.012, life: 1.6, spread: 0.45 }), 250);
    });
  }

  function followerPosition(f) {
    const rec = tiles.get(f.tile);
    const type = TILE_TYPES[rec.tile.type];
    const feat = type.features[f.feature];
    const [x, z] = localToWorld(rec.tile, feat.anchor[0], feat.anchor[1]);
    return { x, z, lying: feat.type === 'field' };
  }

  function addFollower(f, hex, { animate = true } = {}) {
    const { x, z, lying } = followerPosition(f);
    const m = new T.Mesh(meepleGeo, meepleMaterial(hex));
    m.castShadow = true;
    m.position.set(x, TOP + (lying ? 0.022 : 0), z);
    if (lying) m.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 0.8 + Math.PI);
    else m.rotation.y = (Math.random() - 0.5) * 1.2;
    scene.add(m);
    followerMeshes.set(f, m);
    if (!animate) return Promise.resolve();
    const base = m.position.y;
    return tween(0.55, k => {
      m.position.y = base + (1 - easeOutBounce(k)) * 0.9;
      const sq = k > 0.35 && k < 0.6 ? 1 - Math.sin((k - 0.35) / 0.25 * Math.PI) * 0.25 : 1;
      m.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    }).then(() => {
      m.scale.set(1, 1, 1);
      burst(x, TOP + 0.02, z, { n: 14, colors: [hex, '#ffffff'], speed: 0.6, up: 0.6, gravity: 2, size: 0.014, life: 0.8, spread: 0.05 });
    });
  }

  function recallFollower(f, hex, delay = 0) {
    const m = followerMeshes.get(f);
    if (!m) return Promise.resolve();
    followerMeshes.delete(f);
    const y0 = m.position.y, r0 = m.rotation.y;
    return tween(0.75, k => {
      m.position.y = y0 + Math.sin(k * Math.PI) * 0.35 + k * 0.15;
      m.rotation.y = r0 + k * TAU * 1.5;
      m.scale.setScalar(Math.max(0.001, 1 - easeInOut(Math.max(0, (k - 0.45) / 0.55))));
    }, delay).then(() => {
      burst(m.position.x, m.position.y, m.position.z, { n: 22, colors: [hex, '#fff6c8'], speed: 0.8, up: 0.6, gravity: 0.4, size: 0.014, life: 1, spread: 0.02 });
      scene.remove(m);
    });
  }

  /** Light up exactly the regions of a finished (or scored) feature. */
  function highlight(regions, hex, delay = 0, dur = 2.2) {
    for (const { tile, features } of regions) {
      const rec = tiles.get(tile);
      if (!rec) continue;
      for (const f of features) {
        const tex = new T.CanvasTexture(featureMask(rec.tile.type, f));
        const mat = new T.MeshBasicMaterial({ color: hex, alphaMap: tex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
        const m = new T.Mesh(topGeo, mat);
        m.position.y = TOP + 0.003;
        rec.group.add(m);
        tween(dur, k => { mat.opacity = Math.sin(Math.PI * k) * (0.55 + Math.sin(k * 18) * 0.12); }, delay)
          .then(() => { rec.group.remove(m); mat.dispose(); tex.dispose(); });
      }
    }
  }

  function regionCentre(regions) {
    let x = 0, z = 0, n = 0;
    for (const { tile } of regions) { const r = tiles.get(tile); if (r) { x += r.tile.x; z += r.tile.y; n++; } }
    return n ? [x / n, z / n] : [0, 0];
  }

  /** Fly the owners' colours (or white, for an unclaimed town) from every tower of a finished town. */
  function flagTown(regions, owners, delay = 0) {
    if (!owners.length) owners = ['#f5efe0'];
    let k = 0;
    for (const { tile, features } of regions) {
      const rec = tiles.get(tile);
      if (!rec) continue;
      for (const f of features) {
        const key = `${tile}:${f}`;
        if (flagsByKey.has(key)) continue;
        flagsByKey.add(key);
        const spots = rec.agents.flags.get(f) || [];
        const anchor = TILE_TYPES[rec.tile.type].features[f].anchor;
        const list = spots.length ? spots : [[anchor[0] - 0.5, 0, anchor[1] - 0.5]];
        list.forEach((s, i) => raiseFlag(rec.lifeGroup, s, owners[(k + i) % owners.length], delay + k * 0.08, spots.length ? 0.07 : 0.16));
        k++;
      }
    }
  }

  /**
   * Celebrate a scored feature: glow, points, followers going home, and for a
   * finished town, its owners' flags raised on the towers for good.
   */
  async function celebrate(event, regions, colors, { delay = 0 } = {}) {
    const lead = event.winners.length ? colors[event.winners[0]] : '#fff2c4';
    highlight(regions, lead, delay);
    const [cx, cz] = regionCentre(regions);
    const finished = !event.final;
    if (finished && event.feature === 'city') flagTown(regions, event.winners.map(w => colors[w]), delay + 0.3);
    if (finished) {
      for (const { tile } of regions) {
        const r = tiles.get(tile);
        const gen = generation;
        if (r) setTimeout(() => gen === generation && burst(r.tile.x, TOP + 0.2, r.tile.y, { n: 16, colors: event.winners.length ? event.winners.map(w => colors[w]).concat('#fff3c4') : ['#fff3c4', '#ffffff'], speed: 0.9, up: 1.6, gravity: 2.4, size: 0.018, life: 1.5, spread: 0.4 }), (delay + 0.2) * 1000);
      }
      ringPulse(cx, TOP + 0.02, cz, lead, 1.6 + Math.sqrt(regions.length), 1.2);
    }
    if (event.points > 0 && event.winners.length) {
      event.winners.forEach((w, i) => popup(`+${event.points}`, colors[w], cx + i * 0.25, TOP + 0.45, cz, delay + 0.25 + i * 0.12));
    }
    const recalls = finished ? event.followers.map((f, i) => recallFollower(f, colors[f.player], delay + 0.6 + i * 0.08)) : [];
    await Promise.all([wait(delay + 1.2), ...recalls]);
  }

  // ------------------------------------------------------ placement hints
  const slotTex = glowSquareTexture();
  const slotMat = new T.MeshBasicMaterial({ map: slotTex, color: '#fff3c4', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending });
  const slotHot = new T.MeshBasicMaterial({ map: slotTex, color: '#ffffff', transparent: true, opacity: 1, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending });
  const slotGeo = new T.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const slots = new T.Group();
  scene.add(slots);
  const slotMeshes = [];
  function showSlots(cells, hex = '#fff3c4') {
    slotMat.color.set(hex).lerp(new T.Color('#ffffff'), 0.45);
    slotMeshes.length = 0;
    slots.clear();
    for (const [x, y] of cells) {
      const m = new T.Mesh(slotGeo, slotMat);
      m.position.set(x, TOP - 0.02, y);
      m.userData.cell = [x, y];
      slots.add(m);
      slotMeshes.push(m);
    }
  }
  const hideSlots = () => { slots.clear(); slotMeshes.length = 0; };
  function hotSlot(x, y) {
    for (const m of slotMeshes) m.material = m.userData.cell[0] === x && m.userData.cell[1] === y ? slotHot : slotMat;
  }

  const ghost = new T.Group();
  const ghostBox = new T.Mesh(boxGeo, new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 1 }));
  const ghostTopMat = new T.MeshStandardMaterial({ transparent: true, opacity: 0.92, roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.08 });
  const ghostTop = new T.Mesh(topGeo, ghostTopMat);
  ghostTop.position.y = TOP + 0.001;
  ghost.add(ghostBox, ghostTop);
  ghost.visible = false;
  scene.add(ghost);
  const ghostState = { x: 0, y: 0, rot: 0, angle: 0, lift: 0.18, valid: true, locked: false };
  function setGhost(type, x, y, rot, { valid = true, locked = false, snap = false } = {}) {
    const mat = topMaterial(type);
    ghostTopMat.map = mat.map;
    ghostTopMat.needsUpdate = true;
    ghostTopMat.emissive.set(valid ? '#ffffff' : '#ff3b2f');
    ghostTopMat.emissiveIntensity = valid ? 0.06 : 0.45;
    if (!ghost.visible || snap) {
      ghost.position.set(x, 0.18, y);
      ghostState.angle = -rot * Math.PI / 2;
    }
    Object.assign(ghostState, { x, y, rot, valid, locked });
    ghost.visible = true;
  }
  const hideGhost = () => { ghost.visible = false; };

  const optionGroup = new T.Group();
  scene.add(optionGroup);
  const discGeo = new T.CircleGeometry(0.06, 24).rotateX(-Math.PI / 2);
  const hitGeo = new T.SphereGeometry(0.085, 8, 6);
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  function showOptions(options, tileIndex, hex) {
    optionGroup.clear();
    const rec = tiles.get(tileIndex);
    for (const o of options) {
      const [x, z] = localToWorld(rec.tile, o.anchor[0], o.anchor[1]);
      const g = new T.Group();
      g.position.set(x, TOP, z);
      const disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      disc.position.y = 0.004;
      const ghostM = new T.Mesh(meepleGeo, meepleMaterial(hex, true));
      if (o.type === 'field') { ghostM.rotation.set(-Math.PI / 2, 0, Math.PI); ghostM.position.y = 0.024; }
      const hit = new T.Mesh(hitGeo, hitMat);
      hit.position.y = 0.06;
      hit.userData.option = o;
      g.add(disc, ghostM, hit);
      g.userData = { ghostM, disc, base: ghostM.position.y, ph: Math.random() * TAU };
      optionGroup.add(g);
    }
  }
  const hideOptions = () => optionGroup.clear();

  // ---------------------------------------------------------------- picking
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
  const hit = new T.Vector3();
  function aim(px, py) {
    ndc.set(px / canvas.clientWidth * 2 - 1, -(py / canvas.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pickPoint(px, py) {
    aim(px, py);
    return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
  }
  function pickCell(px, py) {
    const p = pickPoint(px, py);
    return p ? [Math.round(p[0]), Math.round(p[1])] : null;
  }
  function pickOption(px, py, options, tileIndex) {
    aim(px, py);
    const hits = ray.intersectObjects(optionGroup.children, true).filter(h => h.object.userData.option);
    if (hits.length) return hits[0].object.userData.option;
    // Otherwise, any click on the region of an available feature counts.
    const p = pickPoint(px, py);
    const rec = tiles.get(tileIndex);
    if (!p || !rec) return null;
    const lu = p[0] - rec.tile.x + 0.5, lv = p[1] - rec.tile.y + 0.5;
    if (lu < 0 || lv < 0 || lu > 1 || lv > 1) return null;
    const [u, v] = rotatePoint(lu, lv, (4 - rec.tile.rot) % 4);
    const type = TILE_TYPES[rec.tile.type];
    const f = type.labels[Math.min(RES - 1, Math.floor(v * RES)) * RES + Math.min(RES - 1, Math.floor(u * RES))];
    return options.find(o => o.feature === f) || null;
  }

  // ---------------------------------------------------------------- sky time
  let timeMode = 'day', phase = TIMES.day, phaseGoal = TIMES.day;
  function setTime(mode) {
    timeMode = mode;
    if (TIMES[mode] != null) phaseGoal = TIMES[mode];
  }
  const sunDir = new T.Vector3();
  function updateSky(dt) {
    if (timeMode === 'cycle') { phase += dt / 240; phaseGoal = phase; }
    else {
      let d = phaseGoal - phase;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      phase += d * Math.min(1, dt * 1.6);
    }
    phase = ((phase % 1) + 1) % 1;
    const s = skyAt(phase);
    const az = 0.8 + phase * TAU * 0.5;
    sunDir.set(Math.cos(az) * Math.cos(s.elev), Math.sin(s.elev), Math.sin(az) * Math.cos(s.elev)).normalize();
    sun.color.copy(s.sun); sun.intensity = s.sunI;
    hemi.color.copy(s.hemiS); hemi.groundColor.copy(s.hemiG); hemi.intensity = s.hemiI;
    skyUniforms.uTop.value.copy(s.top); skyUniforms.uHorizon.value.copy(s.hor);
    skyUniforms.uSunColor.value.copy(s.sun); skyUniforms.uSunDir.value.copy(sunDir); skyUniforms.uNight.value = s.night;
    scene.fog.color.copy(s.hor);
    seaMat.color.copy(s.sea);
    lifeUniforms.uNight.value = s.night;
    stars.material.opacity = Math.max(0, s.night - 0.3) * 1.3;
    cloudMat.color.setRGB(1, 1, 1).lerp(new T.Color('#6a7290'), s.night * 0.8);
    birdMat.color.set(s.night > 0.6 ? '#9aa6c8' : '#3a3e48');
    const t = rig.target;
    const half = Math.min(18, Math.max(4.5, rig.dist * 0.95));
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(t.x, 0, t.z);
    sun.position.set(t.x + sunDir.x * 30, sunDir.y * 30, t.z + sunDir.z * 30);
    return s;
  }

  // ---------------------------------------------------------------- loop
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let last = performance.now(), running = true;
  const listeners = [];
  function frame(ms) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ms - last) / 1000);
    last = ms;
    now += dt;
    lifeUniforms.uTime.value = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = (now - tw.t0) / tw.dur;
      if (k < 0) continue;
      tw.fn(Math.min(1, k));
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    rig.update(dt);
    updateSky(dt);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    const step = 0.4;
    sea.position.x = Math.round(rig.target.x / step) * step;
    sea.position.z = Math.round(rig.target.z / step) * step;
    scene.fog.near = rig.dist * 1.4 + 4;
    scene.fog.far = rig.dist * 5 + 30;
    life.update(dt, now);
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > cx + 22) { c.position.x = cx - 22; c.position.z = cz + (Math.random() - 0.5) * 30; }
      // Thin out clouds that drift close to the camera instead of blotting out the view.
      const near = c.position.distanceTo(camera.position);
      c.userData.mat.opacity = 0.94 * Math.min(1, Math.max(0, (near - 2.5) / 4));
      c.visible = c.userData.mat.opacity > 0.02;
      c.userData.mat.color.copy(cloudMat.color);
    }
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5;
    for (const b of birds) {
      const u = b.userData, a = now * u.sp + u.ph * TAU * 0.15;
      const r = u.r + span * 0.45;
      b.position.set(cx + Math.cos(a) * r, u.h + span * 0.08 + Math.sin(now * 0.7 + u.ph) * 0.15, cz + Math.sin(a) * r);
      b.rotation.y = -a;
      b.scale.set(0.75, 0.75 * Math.sin(now * 9 + u.flap), 0.75);
    }
    if (ghost.visible) {
      ghost.position.x += (ghostState.x - ghost.position.x) * Math.min(1, dt * 14);
      ghost.position.z += (ghostState.y - ghost.position.z) * Math.min(1, dt * 14);
      const lift = ghostState.locked ? 0.07 : 0.2;
      ghost.position.y += (lift + Math.sin(now * 3) * 0.02 - ghost.position.y) * Math.min(1, dt * 8);
      const goalAngle = -ghostState.rot * Math.PI / 2;
      let d = goalAngle - ghostState.angle;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      ghostState.angle += d * Math.min(1, dt * 14);
      ghost.rotation.y = ghostState.angle;
    }
    slotMat.opacity = 0.6 + Math.sin(now * 3) * 0.25;
    for (const g of optionGroup.children) {
      const u = g.userData;
      u.ghostM.position.y = u.base + 0.03 + Math.sin(now * 4 + u.ph) * 0.02;
      u.disc.scale.setScalar(1 + Math.sin(now * 4 + u.ph) * 0.15);
    }
    parts = parts.filter(p => (p.age += dt) < p.life);
    parts.forEach((p, i) => {
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < TOP + 0.005 && p.g > 0) { p.y = TOP + 0.005; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const k = p.age / p.life;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.spin * p.age, p.spin * 0.7 * p.age, 0);
      dummy.scale.setScalar(p.size * (1 - k * k));
      dummy.updateMatrix();
      partMesh.setMatrixAt(i, dummy.matrix);
      partMesh.setColorAt(i, p.c);
    });
    partMesh.count = parts.length;
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    for (const fn of listeners) fn(dt, now);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  function reset() {
    // Drop every pending animation from the previous board (resolving, so no await hangs).
    generation++;
    for (const tw of tweens.splice(0)) tw.resolve();
    parts = [];
    for (const rec of tiles.values()) board.remove(rec.group);
    tiles.clear();
    for (const m of followerMeshes.values()) scene.remove(m);
    followerMeshes.clear();
    flagsByKey.clear();
    life.clear();
    hideSlots(); hideGhost(); hideOptions();
    Object.assign(bounds, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    rig.setBounds(bounds);
  }

  return {
    rig, camera, renderer,
    get now() { return now; },
    get bounds() { return { ...bounds }; },
    reset, addTile, addFollower, recallFollower, celebrate, flagTown, highlight, popup, burst, wait, tween,
    showSlots, hideSlots, hotSlot, setGhost, hideGhost, showOptions, hideOptions,
    pickCell, pickOption, setTime, onFrame: fn => listeners.push(fn),
    hasFollower: f => followerMeshes.has(f),
    setWind: w => { lifeUniforms.uWind.value = w; },
    counts: () => life.counts,
    lookAtTile(x, y, force = false) {
      if (force || !rig.isVisible(x, y)) rig.focus(x, y);
    },
  };
}
