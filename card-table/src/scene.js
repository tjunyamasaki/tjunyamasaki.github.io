// The 3D table. It owns no game state: it draws the latest view, eases every
// card toward where that view says it belongs, and answers "what is under
// this finger?" for the controller.
import * as T from '../vendor/three.module.min.js';
import { CARD_W, CARD_H, tableRadius, seatAngle } from './model.js';
import { faceCanvas, backCanvas } from './faces.js';

const THICK = 0.006;
const STEP = 0.0068;
const HAND_DIST = 3;
const TILT = { normal: 1.05, top: 1.47 };
const FELT = {
  green: ['#1f6a47', '#0f3b27'],
  blue: ['#1f4f7d', '#0f2945'],
  wine: ['#6b2233', '#3a0f1a'],
  slate: ['#3c4654', '#1d232c'],
  sand: ['#a8875a', '#5f4a2e'],
};

const UP = new T.Vector3(0, 1, 0);
const Z_AXIS = new T.Vector3(0, 0, 1);
const FLIP = new T.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function cardGeometry() {
  const w = CARD_W / 2;
  const h = CARD_H / 2;
  const r = 0.075;
  const seg = 6;
  const ring = [];
  const corners = [[w - r, h - r, 0], [-(w - r), h - r, Math.PI / 2], [-(w - r), -(h - r), Math.PI], [w - r, -(h - r), (Math.PI * 3) / 2]];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
  }
  const pos = [];
  const nor = [];
  const uv = [];
  const groups = [];
  const y0 = THICK / 2;
  const tri = (a, b, c, n, uvf) => {
    // keep winding consistent with the normal
    const cross = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if ((cross > 0) !== (n[1] > 0)) [b, c] = [c, b];
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(...n);
      uv.push(...uvf(p));
    }
  };
  let start = 0;
  const cap = (y, n, uvf) => {
    const c = [0, y, 0];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      tri(c, [a[0], y, a[1]], [b[0], y, b[1]], n, uvf);
    }
  };
  cap(y0, [0, 1, 0], (p) => [(p[0] + w) / CARD_W, (-p[2] + h) / CARD_H]);
  groups.push([start, pos.length / 3 - start, 0]);
  start = pos.length / 3;
  cap(-y0, [0, -1, 0], (p) => [(-p[0] + w) / CARD_W, (-p[2] + h) / CARD_H]);
  groups.push([start, pos.length / 3 - start, 1]);
  start = pos.length / 3;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const quad = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], -y0, b[1]], [a[0], -y0, a[1]]];
    const n = [(a[2] + b[2]) / 2, 0, (a[3] + b[3]) / 2];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      pos.push(...quad[idx]);
      nor.push(...n);
      uv.push(0, 0);
    }
  }
  groups.push([start, pos.length / 3 - start, 2]);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  g.computeBoundingSphere();
  return g;
}

function feltTexture(colors) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(512, 512, 60, 512, 512, 520);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255, 236, 190, 0.16)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(512, 512, 455, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([2, 10]);
  g.beginPath();
  g.arc(512, 512, 440, 0, Math.PI * 2);
  g.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 12;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(16, 16, 96, 128, 12);
  g.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 80;
  const g = c.getContext('2d');
  g.filter = 'blur(7px)';
  g.fillStyle = 'rgba(0,0,0,1)';
  g.beginPath();
  g.roundRect(14, 14, 36, 52, 6);
  g.fill();
  const t = new T.CanvasTexture(c);
  return t;
}

export function createScene(canvas, hooks = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(camera);
  scene.add(new T.HemisphereLight(0xfff8ea, 0x40382c, 2.1));
  const sun = new T.DirectionalLight(0xffffff, 1.25);
  sun.position.set(-3, 10, 6);
  scene.add(sun);

  // ---- table
  const tableGroup = new T.Group();
  scene.add(tableGroup);
  let feltStyle = 'green';
  const feltMat = new T.MeshLambertMaterial({ map: feltTexture(FELT.green) });
  const felt = new T.Mesh(new T.CircleGeometry(1, 128), feltMat);
  felt.rotation.x = -Math.PI / 2;
  tableGroup.add(felt);
  const rim = new T.Mesh(new T.TorusGeometry(1, 0.035, 14, 128), new T.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.45, metalness: 0.1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.01;
  tableGroup.add(rim);
  const base = new T.Mesh(new T.CylinderGeometry(1.035, 1.0, 0.09, 96, 1, true), new T.MeshStandardMaterial({ color: 0x24150c, roughness: 0.6 }));
  base.position.y = -0.055;
  tableGroup.add(base);

  const seatGroup = new T.Group();
  scene.add(seatGroup);

  // ---- cards
  const geo = cardGeometry();
  const edgeMat = new T.MeshLambertMaterial({ color: 0xece6d8 });
  const faceMats = new Map();
  let backStyle = 'navy';
  let backMat = makeMat(backCanvas(backStyle));

  function makeMat(canvasEl) {
    const t = new T.CanvasTexture(canvasEl);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return new T.MeshLambertMaterial({ map: t });
  }
  function faceMat(f) {
    let m = faceMats.get(f);
    if (!m) {
      m = makeMat(faceCanvas(f));
      faceMats.set(f, m);
    }
    return m;
  }

  const meshes = new Map();
  const shadowMat = new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.4 });
  const shadowGeo = new T.PlaneGeometry(CARD_W * 1.25, CARD_H * 1.25);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadows = [];
  for (let i = 0; i < 70; i++) {
    const m = new T.Mesh(shadowGeo, shadowMat.clone());
    m.visible = false;
    m.renderOrder = -1;
    scene.add(m);
    shadows.push(m);
  }

  const glowMat = new T.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: 0x8af5c4 });
  const glowGeo = new T.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const slotMat = new T.MeshBasicMaterial({ map: glowMat.map, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.22 });
  const slots = [];
  for (let i = 0; i < 12; i++) {
    const m = new T.Mesh(glowGeo, slotMat);
    m.visible = false;
    m.scale.set(CARD_W * 1.33, 1, CARD_H * 1.25);
    scene.add(m);
    slots.push(m);
  }
  const glow = new T.Mesh(glowGeo, glowMat);
  glow.visible = false;
  glow.renderOrder = 2;
  scene.add(glow);

  // ---- state
  let view = null;
  let me = null;
  let loc = new Map();
  let R = 5;
  let Rshown = 5;
  let phi = 0;
  let phiTarget = 0;
  let width = 1;
  let height = 1;
  let dirty = true;
  let drag = null;
  let dropHint = null;
  let selected = new Set();
  let remoteDrags = new Map();
  let handGap = -1;
  let handLayout = { s: 1, cw: 1, ch: 1.4, hh: 1, hw: 1, topPx: 0, xs: [] };

  const cam = { tx: 0, tz: 0, zoom: 1, top: false, fitDist: 14, fitZ: 0, tilt: TILT.normal };
  const camNow = { tx: 0, tz: 0, dist: 14, tilt: TILT.normal };

  function setView(v, mePid) {
    const prevBack = backStyle;
    const first = !view || me !== mePid;
    view = v;
    me = mePid;
    loc = new Map();
    for (const p of Object.values(v.piles)) p.cards.forEach((id, i) => loc.set(id, { pile: p.id, i, n: p.cards.length }));
    for (const pl of Object.values(v.players)) pl.hand.forEach((id, i) => loc.set(id, { hand: pl.id, i, n: pl.hand.length }));
    const nextR = tableRadius(v.order.length);
    if (nextR !== R) {
      R = nextR;
      fit();
    }
    const myIndex = Math.max(0, v.order.indexOf(me));
    let target = seatAngle(myIndex, v.order.length) - Math.PI / 2;
    // rotate the short way round
    while (target - phiTarget > Math.PI) target -= Math.PI * 2;
    while (target - phiTarget < -Math.PI) target += Math.PI * 2;
    phiTarget = target;
    if (first) phi = phiTarget;
    if (v.style.back !== prevBack) {
      backStyle = v.style.back;
      backMat.map.dispose();
      backMat.dispose();
      backMat = makeMat(backCanvas(backStyle));
    }
    if (v.style.felt !== feltStyle && FELT[v.style.felt]) {
      feltStyle = v.style.felt;
      feltMat.map.dispose();
      feltMat.map = feltTexture(FELT[feltStyle]);
      feltMat.needsUpdate = true;
    }
    for (const [id, m] of meshes) {
      if (!v.cards[id]) {
        scene.remove(m);
        meshes.delete(id);
      }
    }
    for (const [id, c] of Object.entries(v.cards)) {
      let m = meshes.get(id);
      const born = !m;
      if (!m) {
        m = new T.Mesh(geo, [backMat, backMat, edgeMat]);
        m.userData.id = id;
        // taps test against where a card is going, not where it is mid-flight
        m.userData.proxy = new T.Mesh(geo);
        m.userData.proxy.userData.id = id;
        meshes.set(id, m);
        scene.add(m);
      }
      m.material[0] = c.f ? faceMat(c.f) : backMat;
      m.material[1] = backMat;
      m.userData.born = born;
    }
    rebuildSeats();
    computeTargets();
    for (const m of meshes.values()) {
      if (!m.userData.born) continue;
      m.userData.born = false;
      const t = m.userData.target;
      if (!t) continue;
      // fresh cards (new deck or a shuffle) slide in from a loose spread
      m.position.set(t.p.x + (Math.random() - 0.5) * 1.6, t.p.y + 0.3 + Math.random() * 0.6, t.p.z + (Math.random() - 0.5) * 1.2);
      m.quaternion.copy(t.q);
      m.scale.setScalar(t.s);
    }
    dirty = true;
  }

  let seatKey = '';
  function rebuildSeats() {
    const key = view.order.map((pid) => `${pid}:${view.players[pid].color}:${view.turn === pid}`).join('|');
    if (key === seatKey) return;
    seatKey = key;
    while (seatGroup.children.length) {
      const c = seatGroup.children.pop();
      c.geometry.dispose();
      c.material.dispose();
    }
    const n = view.order.length;
    view.order.forEach((pid, i) => {
      const a = seatAngle(i, n);
      const span = Math.min(0.9, (Math.PI * 2) / n - 0.25);
      const g = new T.RingGeometry(0.965, 0.995, 48, 1, 0, span);
      g.rotateX(-Math.PI / 2);
      const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: view.players[pid].color, transparent: true, opacity: view.turn === pid ? 0.95 : 0.35, depthWrite: false }));
      m.userData.angle = a;
      m.userData.span = span;
      m.position.y = 0.002;
      seatGroup.add(m);
    });
  }

  // ---- coordinates
  function toWorld(x, z) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    return { x: x * c + z * s, z: -x * s + z * c };
  }
  function toTable(x, z) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    return { x: x * c - z * s, z: x * s + z * c };
  }
  function seatWorld(pid, r) {
    const i = view.order.indexOf(pid);
    const a = seatAngle(i, view.order.length);
    return toWorld(Math.cos(a) * r, Math.sin(a) * r);
  }

  const qTmp = new T.Quaternion();
  function flatQuat(yaw, up, out = new T.Quaternion()) {
    out.setFromAxisAngle(UP, yaw);
    if (!up) out.multiply(FLIP);
    return out;
  }

  // Offsets of each card in a pile relative to its anchor, in world units.
  function pileOffsets(p) {
    const n = p.cards.length;
    const out = [];
    if (p.layout === 'row') {
      const sp = n > 1 ? Math.min(0.62, 4.6 / (n - 1)) : 0;
      for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * sp, y: 0.003 + i * 0.0016, z: 0, yaw: 0 });
    } else if (p.layout === 'column') {
      let z = 0;
      for (let i = 0; i < n; i++) {
        out.push({ x: 0, y: 0.003 + i * 0.0016, z, yaw: 0 });
        z += view.cards[p.cards[i]]?.up ? 0.36 : 0.15;
      }
    } else if (p.layout === 'grid') {
      const cols = n <= 4 ? 2 : Math.ceil(Math.sqrt(n * 1.4));
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        out.push({ x: (c - (cols - 1) / 2) * 1.12, y: 0.003, z: (r - (rows - 1) / 2) * 1.52, yaw: 0 });
      }
    } else {
      const messy = p.layout === 'messy';
      for (let i = 0; i < n; i++) {
        const h = messy ? hash(p.cards[i]) : 0.5;
        const h2 = messy ? hash(p.cards[i] + 'z') : 0.5;
        out.push({ x: (h - 0.5) * 0.22, y: 0.003 + i * STEP, z: (h2 - 0.5) * 0.22, yaw: messy ? (h - 0.5) * 0.7 : 0 });
      }
    }
    return out;
  }

  function footprint(p, offs = pileOffsets(p)) {
    const w = toWorld(p.x, p.z);
    if (!offs.length) return { cx: w.x, cz: w.z, hw: CARD_W / 2, hh: CARD_H / 2, x: w.x, z: w.z };
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const o of offs) {
      x0 = Math.min(x0, o.x);
      x1 = Math.max(x1, o.x);
      z0 = Math.min(z0, o.z);
      z1 = Math.max(z1, o.z);
    }
    return { cx: w.x + (x0 + x1) / 2, cz: w.z + (z0 + z1) / 2, hw: (x1 - x0) / 2 + CARD_W / 2, hh: (z1 - z0) / 2 + CARD_H / 2, x: w.x, z: w.z };
  }

  // ---- hand in camera space
  const camR = new T.Vector3();
  const camU = new T.Vector3();
  const camF = new T.Vector3();
  const camBasis = new T.Quaternion();
  const m4 = new T.Matrix4();

  function updateCamBasis() {
    camera.updateMatrixWorld();
    camR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    camU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    camF.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
    m4.makeBasis(camR, camF.clone().negate(), camU.clone().negate());
    camBasis.setFromRotationMatrix(m4);
  }

  function computeHandLayout(n) {
    const hh = HAND_DIST * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const hw = hh * camera.aspect;
    const maxPx = 230;
    let s = Math.min((0.22 * 2 * hh) / CARD_H, (0.27 * 2 * hw) / CARD_W, ((maxPx / height) * 2 * hh) / CARD_H);
    const cw = CARD_W * s;
    const ch = CARD_H * s;
    const avail = 2 * hw * 0.94 - cw;
    const sp = n > 1 ? Math.min(cw * 0.78, avail / (n - 1)) : 0;
    const baseY = -hh + ch * 0.5 + hh * 0.06;
    const topPx = height * (1 - (baseY + ch * 0.62 + hh) / (2 * hh));
    const liftPx = ((ch * 0.24) / (2 * hh)) * height;
    handLayout = { s, cw, ch, hh, hw, sp, baseY, topPx, liftPx, n };
    return handLayout;
  }

  function handSlot(i, n, lift) {
    const L = handLayout;
    const x = (i - (n - 1) / 2) * L.sp;
    const bend = (x / Math.max(L.hw, 0.01)) ** 2 * L.ch * 0.18;
    const y = L.baseY - bend + (lift ? L.ch * 0.24 : 0);
    const roll = -(x / Math.max(L.hw, 0.01)) * 0.16;
    return { x, y, roll, d: HAND_DIST - i * 0.004 };
  }

  function camPoint(x, y, d, out = new T.Vector3()) {
    return out.copy(camera.position).addScaledVector(camF, d).addScaledVector(camR, x).addScaledVector(camU, y);
  }

  function handQuat(roll, out = new T.Quaternion()) {
    qTmp.setFromAxisAngle(camF, -roll);
    return out.copy(qTmp).multiply(camBasis);
  }

  // ---- targets
  function setTarget(m, p, q, s, mode) {
    const t = m.userData.target || (m.userData.target = { p: new T.Vector3(), q: new T.Quaternion(), s: 1, mode: '' });
    t.p.copy(p);
    t.q.copy(q);
    t.s = s;
    t.mode = mode;
  }

  const vTmp = new T.Vector3();
  const vTmp2 = new T.Vector3();
  const qA = new T.Quaternion();

  function computeTargets() {
    if (!view) return;
    updateCamBasis();
    const dragging = new Set(drag?.ids || []);
    const remote = new Map();
    for (const [pid, rd] of remoteDrags) for (const [k, id] of rd.ids.entries()) remote.set(id, { rd, k, pid });

    // piles
    for (const p of Object.values(view.piles)) {
      const offs = pileOffsets(p);
      const w = toWorld(p.x, p.z);
      p.cards.forEach((id, i) => {
        const m = meshes.get(id);
        if (!m || dragging.has(id) || remote.has(id)) return;
        const o = offs[i];
        vTmp.set(w.x + o.x, o.y, w.z + o.z);
        setTarget(m, vTmp, flatQuat(o.yaw, view.cards[id].up, qA), 1, 'table');
      });
    }

    // my hand
    const mine = view.players[me]?.hand || [];
    const rest = mine.filter((id) => !dragging.has(id));
    const slots = rest.length + (handGap >= 0 ? 1 : 0);
    computeHandLayout(Math.max(slots, 1));
    let k = 0;
    rest.forEach((id) => {
      if (k === handGap) k++;
      const m = meshes.get(id);
      if (!m) return;
      const sl = handSlot(k, slots, selected.has(id));
      camPoint(sl.x, sl.y, sl.d, vTmp);
      setTarget(m, vTmp, handQuat(sl.roll, qA), handLayout.s, 'hand');
      k++;
    });

    // other hands
    for (const pid of view.order) {
      if (pid === me) continue;
      const pl = view.players[pid];
      const ids = pl.hand.filter((id) => !remote.has(id));
      const n = ids.length;
      // held a little inside the rim so phones (which crop the sides) still show them
      const seat = seatWorld(pid, R - 0.95);
      const o = vTmp2.set(seat.x, 0, seat.z).normalize();
      if (pl.revealed) {
        const inner = seatWorld(pid, R - 1.05);
        const sp = n > 1 ? Math.min(0.5, 3.4 / (n - 1)) : 0;
        ids.forEach((id, i) => {
          const m = meshes.get(id);
          if (!m) return;
          vTmp.set(inner.x + (i - (n - 1) / 2) * sp, 0.004 + i * 0.0016, inner.z);
          setTarget(m, vTmp, flatQuat(0, true, qA), 0.72, 'table');
        });
        continue;
      }
      const t = new T.Vector3().crossVectors(UP, o);
      const lean = 0.42;
      const nF = new T.Vector3().copy(o).multiplyScalar(Math.cos(lean)).addScaledVector(UP, Math.sin(lean)).normalize();
      const zAxis = new T.Vector3().crossVectors(t, nF);
      m4.makeBasis(t, nF, zAxis);
      const baseQ = new T.Quaternion().setFromRotationMatrix(m4);
      const scale = 0.6;
      const sp = n > 1 ? Math.min(0.22, 1.8 / (n - 1)) : 0;
      ids.forEach((id, i) => {
        const m = meshes.get(id);
        if (!m) return;
        const off = i - (n - 1) / 2;
        const roll = off * Math.min(0.09, 0.9 / Math.max(n, 1));
        vTmp.set(seat.x, 0.5 - Math.abs(off) * 0.012, seat.z).addScaledVector(t, off * sp).addScaledVector(nF, i * 0.004);
        qTmp.setFromAxisAngle(nF, roll);
        qA.copy(qTmp).multiply(baseQ);
        setTarget(m, vTmp, qA, scale, 'held');
      });
    }

    // cards other players are dragging right now
    for (const [id, { rd, k: idx }] of remote) {
      const m = meshes.get(id);
      if (!m) continue;
      const w = toWorld(rd.x, rd.z);
      vTmp.set(w.x + idx * 0.22, 0.5 + idx * 0.01, w.z);
      setTarget(m, vTmp, flatQuat(0, view.cards[id]?.up ?? false, qA), 1, 'air');
    }

    // my drag
    if (drag) placeDrag();
  }

  function placeDrag() {
    const ids = drag.ids;
    const inHand = drag.kind === 'cards' && drag.py > handLayout.topPx;
    if (inHand) {
      const x = ((drag.px / width) * 2 - 1) * handLayout.hw;
      const y = (1 - (drag.py / height) * 2) * handLayout.hh;
      ids.forEach((id, i) => {
        const m = meshes.get(id);
        if (!m) return;
        camPoint(x + i * handLayout.cw * 0.3, y, HAND_DIST - 0.2 - i * 0.004, vTmp);
        setTarget(m, vTmp, handQuat(0, qA), handLayout.s * 1.05, 'hand');
      });
      return;
    }
    const hit = groundPoint(drag.px, drag.py);
    if (!hit) return;
    if (drag.kind === 'pile') {
      const p = view.piles[drag.pile];
      if (!p) return;
      const offs = pileOffsets(p);
      p.cards.forEach((id, i) => {
        const m = meshes.get(id);
        if (!m) return;
        const o = offs[i];
        vTmp.set(hit.x + o.x, 0.55 + o.y, hit.z + o.z);
        setTarget(m, vTmp, flatQuat(o.yaw, view.cards[id].up, qA), 1, 'air');
      });
      return;
    }
    const column = drag.column;
    ids.forEach((id, i) => {
      const m = meshes.get(id);
      if (!m) return;
      const up = drag.face === 'up' ? true : drag.face === 'down' ? false : view.cards[id]?.up;
      const dx = column ? 0 : (i - (ids.length - 1) / 2) * 0.24;
      const dz = column ? i * 0.34 : 0;
      vTmp.set(hit.x + dx, 0.6 + i * 0.008, hit.z + dz - 0.25);
      setTarget(m, vTmp, flatQuat(0, up, qA), 1, 'air');
    });
  }

  // ---- camera
  const ndcTmp = new T.Vector3();
  function placeCamera(tx, tz, dist, tilt) {
    camera.position.set(tx, Math.sin(tilt) * dist, tz + Math.cos(tilt) * dist);
    camera.lookAt(tx, 0, tz);
    camera.updateMatrixWorld();
  }
  function ringBox(radius) {
    let y0 = Infinity;
    let y1 = -Infinity;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ndcTmp.set(Math.cos(a) * radius, 0, Math.sin(a) * radius).project(camera);
      x0 = Math.min(x0, ndcTmp.x);
      x1 = Math.max(x1, ndcTmp.x);
      y0 = Math.min(y0, ndcTmp.y);
      y1 = Math.max(y1, ndcTmp.y);
    }
    return { x0, x1, y0, y1 };
  }

  function fit() {
    const portrait = height > width;
    const tilt = cam.top ? TILT.top : portrait ? TILT.normal : 0.88;
    cam.tilt = tilt;
    // phones crop the table's sides a little; nameplates stay pinned on screen
    const radius = portrait ? R * 0.74 : R + 0.45;
    computeHandLayout(8);
    const yTop = 0.86;
    const yBot = 1 - (handLayout.topPx / height) * 2 + 0.02;
    const span = yTop - yBot;
    let lo = 2;
    let hi = 120;
    let cz = 0;
    for (let pass = 0; pass < 3; pass++) {
      lo = 2;
      hi = 120;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        placeCamera(0, cz, mid, tilt);
        const b = ringBox(radius);
        if (b.x1 - b.x0 <= 1.94 && b.y1 - b.y0 <= span) hi = mid;
        else lo = mid;
      }
      placeCamera(0, cz, hi, tilt);
      const b = ringBox(radius);
      const err = (b.y0 + b.y1) / 2 - (yTop + yBot) / 2;
      placeCamera(0, cz + 0.5, hi, tilt);
      const b2 = ringBox(radius);
      const slope = ((b2.y0 + b2.y1) / 2 - (b.y0 + b.y1) / 2) / 0.5;
      if (Math.abs(slope) > 1e-4) cz -= err / slope;
    }
    cam.fitDist = hi;
    cam.fitZ = cz;
    dirty = true;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = height > width ? 46 : 38;
    camera.updateProjectionMatrix();
    fit();
  }

  function applyCamera(dt) {
    const k = dt == null ? 1 : 1 - Math.exp(-dt * 10);
    const wantDist = cam.fitDist * cam.zoom;
    const want = { tx: cam.tx, tz: cam.fitZ + cam.tz, dist: wantDist, tilt: cam.tilt };
    let moved = false;
    for (const key of ['tx', 'tz', 'dist', 'tilt']) {
      const d = want[key] - camNow[key];
      if (Math.abs(d) > 1e-4) {
        camNow[key] += d * k;
        moved = true;
      } else camNow[key] = want[key];
    }
    placeCamera(camNow.tx, camNow.tz, camNow.dist, camNow.tilt);
    return moved;
  }

  // ---- picking
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function setRay(px, py) {
    ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  function groundPoint(px, py, y = 0) {
    setRay(px, py);
    plane.constant = -y;
    const p = ray.ray.intersectPlane(plane, new T.Vector3());
    return p;
  }

  function pick(px, py) {
    if (!view) return { kind: 'void' };
    setRay(px, py);
    const proxies = [];
    for (const m of meshes.values()) {
      const t = m.userData.target;
      if (!t) continue;
      const p = m.userData.proxy;
      p.position.copy(t.p);
      p.quaternion.copy(t.q);
      p.scale.setScalar(t.s);
      p.updateMatrixWorld();
      proxies.push(p);
    }
    const hits = ray.intersectObjects(proxies, false);
    for (const h of hits) {
      const id = h.object.userData.id;
      const l = loc.get(id);
      if (!l) continue;
      if (l.hand === me) return { kind: 'hand', id, index: l.i };
      if (l.hand) return { kind: 'player', pid: l.hand };
      const p = view.piles[l.pile];
      const spread = p.layout === 'row' || p.layout === 'column' || p.layout === 'grid';
      return { kind: 'pile', pile: p.id, card: spread ? id : p.cards[p.cards.length - 1], index: spread ? l.i : p.cards.length - 1, spread };
    }
    const g = groundPoint(px, py);
    if (!g) return { kind: 'void' };
    for (const pid of view.order) {
      if (pid === me) continue;
      const s = seatWorld(pid, R - 0.95);
      if (Math.hypot(g.x - s.x, g.z - s.z) < 1.1) return { kind: 'player', pid };
    }
    for (const p of Object.values(view.piles)) {
      if (p.cards.length) continue;
      const f = footprint(p);
      if (Math.abs(g.x - f.cx) < f.hw && Math.abs(g.z - f.cz) < f.hh) return { kind: 'pile', pile: p.id, card: null, index: -1, spread: false };
    }
    const t = toTable(g.x, g.z);
    if (Math.hypot(g.x, g.z) > R + 0.3) return { kind: 'void', ...t };
    return { kind: 'table', ...t };
  }

  function handInsertIndex(px, count) {
    const x = ((px / width) * 2 - 1) * handLayout.hw;
    const n = count + 1;
    const sp = handLayout.sp || handLayout.cw;
    const idx = Math.round(x / sp + (n - 1) / 2);
    return Math.max(0, Math.min(count, idx));
  }

  function dropTarget(px, py, d) {
    if (!view) return null;
    const myHand = view.players[me]?.hand || [];
    if (py > handLayout.topPx) {
      const rest = myHand.filter((id) => !d.ids.includes(id));
      return { kind: 'hand', at: handInsertIndex(px, rest.length) };
    }
    const g = groundPoint(px, py);
    if (!g) return null;
    // dragged cards float a little above the finger; drop where they are drawn
    const cz = g.z - 0.25;
    let best = null;
    let bestD = Infinity;
    for (const p of Object.values(view.piles)) {
      if (d.kind === 'pile' && p.id === d.pile) continue;
      const f = footprint(p);
      const pad = 0.25;
      if (Math.abs(g.x - f.cx) <= f.hw + pad && Math.abs(cz - f.cz) <= f.hh + pad) {
        const dist = Math.hypot(g.x - f.cx, cz - f.cz);
        if (dist < bestD) {
          bestD = dist;
          best = p;
        }
      }
    }
    if (best) return { kind: 'pile', pile: best.id };
    for (const pid of view.order) {
      if (pid === me) continue;
      const s = seatWorld(pid, R - 0.95);
      if (Math.hypot(g.x - s.x, g.z - s.z) < 1.35) return { kind: 'player', pid };
    }
    if (Math.hypot(g.x, cz) < R - 0.35) {
      const t = toTable(g.x, cz);
      return { kind: 'new', x: t.x, z: t.z };
    }
    return null;
  }

  function setDropHint(target) {
    dropHint = target;
    glow.visible = false;
    if (!target || !view) return;
    if (target.kind === 'pile' && view.piles[target.pile]) {
      const f = footprint(view.piles[target.pile]);
      glow.position.set(f.cx, 0.012, f.cz);
      glow.scale.set((f.hw * 2 + 0.3) * 1.33, 1, (f.hh * 2 + 0.3) * 1.25);
      glowMat.opacity = 1;
      glow.visible = true;
    } else if (target.kind === 'new') {
      const w = toWorld(target.x, target.z);
      glow.position.set(w.x, 0.012, w.z);
      glow.scale.set(CARD_W * 1.33 * 1.1, 1, CARD_H * 1.25 * 1.1);
      glowMat.opacity = 0.45;
      glow.visible = true;
    }
    dirty = true;
  }

  // ---- loop
  let last = performance.now();
  let lastSettled = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = applyCamera(dt);
    const dphi = phiTarget - phi;
    if (Math.abs(dphi) > 1e-4) {
      phi += dphi * (1 - Math.exp(-dt * 6));
      moving = true;
    } else phi = phiTarget;
    if (Math.abs(R - Rshown) > 1e-3) {
      Rshown += (R - Rshown) * (1 - Math.exp(-dt * 6));
      moving = true;
    } else Rshown = R;
    tableGroup.scale.set(Rshown, 1, Rshown);
    for (const m of seatGroup.children) {
      m.scale.set(Rshown, 1, Rshown);
      // the ring segment spans [-span, 0] around y; centre it on the seat
      m.rotation.y = phi - m.userData.angle - m.userData.span / 2;
    }
    if (moving || dirty || !lastSettled) computeTargets();
    const kPos = 1 - Math.exp(-dt * 15);
    const kRot = 1 - Math.exp(-dt * 13);
    let animating = false;
    let sh = 0;
    for (const m of meshes.values()) {
      const t = m.userData.target;
      if (!t) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const dist = m.position.distanceTo(t.p);
      if (dist > 1e-4 || m.quaternion.angleTo(t.q) > 1e-3 || Math.abs(m.scale.x - t.s) > 1e-4) {
        animating = true;
        vTmp.copy(t.p);
        if (t.mode !== 'hand' && dist > 0.35) vTmp.y += Math.min(0.9, dist * 0.22);
        const ang = m.quaternion.angleTo(t.q);
        if (t.mode === 'table' && ang > 1) vTmp.y += 0.35;
        m.position.lerp(vTmp, kPos);
        m.quaternion.slerp(t.q, kRot);
        m.scale.setScalar(m.scale.x + (t.s - m.scale.x) * kPos);
        if (dist < 0.002) m.position.copy(t.p);
      }
      if (t.mode !== 'hand' && t.mode !== 'held' && m.position.y > 0.08 && sh < shadows.length) {
        const s = shadows[sh++];
        s.visible = true;
        s.position.set(m.position.x + m.position.y * 0.12, 0.004, m.position.z + m.position.y * 0.18);
        s.quaternion.copy(m.quaternion);
        s.quaternion.x = 0;
        s.quaternion.z = 0;
        s.quaternion.normalize();
        s.scale.setScalar(m.scale.x * (1 + m.position.y * 0.25));
        s.material.opacity = Math.max(0.05, 0.5 - m.position.y * 0.25);
      }
    }
    // a soft contact shadow under every pile, an outline where empty piles wait
    let sl = 0;
    if (view) {
      for (const p of Object.values(view.piles)) {
        if (!p.cards.length) {
          if (sl < slots.length) {
            const w = toWorld(p.x, p.z);
            slots[sl].position.set(w.x, 0.003, w.z);
            slots[sl++].visible = true;
          }
          continue;
        }
        if (sh >= shadows.length) continue;
        const f = footprint(p);
        const s = shadows[sh++];
        s.visible = true;
        s.position.set(f.cx + 0.04, 0.002, f.cz + 0.07);
        s.quaternion.identity();
        s.scale.set((f.hw * 2) / CARD_W, 1, (f.hh * 2) / CARD_H);
        s.material.opacity = 0.42;
      }
    }
    for (let i = sh; i < shadows.length; i++) shadows[i].visible = false;
    for (let i = sl; i < slots.length; i++) slots[i].visible = false;
    const render = moving || animating || dirty;
    if (render) {
      renderer.render(scene, camera);
      hooks.onFrame?.();
    }
    lastSettled = !render;
    dirty = false;
    requestAnimationFrame(frame);
  }

  // ---- public helpers for overlays
  const pv = new T.Vector3();
  function project(x, y, z) {
    pv.set(x, y, z).project(camera);
    return { x: (pv.x * 0.5 + 0.5) * width, y: (-pv.y * 0.5 + 0.5) * height, behind: pv.z > 1 };
  }

  function seatScreen(pid) {
    if (!view || !view.players[pid]) return null;
    const w = seatWorld(pid, Rshown + 0.1);
    return project(w.x, 0.3, w.z);
  }

  function pileScreen(id) {
    const p = view?.piles[id];
    if (!p) return null;
    const f = footprint(p);
    const top = project(f.cx, 0, f.cz - f.hh);
    const bottom = project(f.cx, 0, f.cz + f.hh + 0.08);
    const mid = project(f.cx, 0, f.cz);
    return { x: bottom.x, y: bottom.y, top: top.y, midY: mid.y };
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();
  requestAnimationFrame(frame);

  return {
    setView,
    pick,
    dropTarget,
    tablePoint(px, py) {
      const g = groundPoint(px, py);
      return g ? toTable(g.x, g.z - 0.25) : null;
    },
    setDropHint,
    seatScreen,
    pileScreen,
    get handTop() {
      return handLayout.topPx;
    },
    get handLift() {
      return handLayout.liftPx;
    },
    setDrag(d) {
      drag = d;
      if (!d) handGap = -1;
      dirty = true;
    },
    setHandGap(i) {
      if (handGap !== i) {
        handGap = i;
        dirty = true;
      }
    },
    setSelected(set) {
      selected = new Set(set);
      dirty = true;
    },
    setRemoteDrag(pid, d) {
      if (d) remoteDrags.set(pid, d);
      else remoteDrags.delete(pid);
      dirty = true;
    },
    refreshFaces() {
      for (const m of faceMats.values()) {
        m.map.dispose();
        m.dispose();
      }
      faceMats.clear();
      if (view) setView(view, me);
    },
    pan(px0, py0, px1, py1) {
      const a = groundPoint(px0, py0);
      const b = groundPoint(px1, py1);
      if (!a || !b) return;
      cam.tx -= b.x - a.x;
      cam.tz -= b.z - a.z;
      const lim = R * 0.9;
      cam.tx = Math.max(-lim, Math.min(lim, cam.tx));
      cam.tz = Math.max(-lim, Math.min(lim, cam.tz));
      camNow.tx = cam.tx;
      camNow.tz = cam.fitZ + cam.tz;
      dirty = true;
    },
    zoom(factor, px, py) {
      const before = groundPoint(px, py);
      cam.zoom = Math.max(0.32, Math.min(1.5, cam.zoom / factor));
      camNow.dist = cam.fitDist * cam.zoom;
      placeCamera(camNow.tx, camNow.tz, camNow.dist, camNow.tilt);
      const after = groundPoint(px, py);
      if (before && after) {
        cam.tx += before.x - after.x;
        cam.tz += before.z - after.z;
        camNow.tx = cam.tx;
        camNow.tz = cam.fitZ + cam.tz;
      }
      if (cam.zoom > 0.98) {
        cam.tx *= 0.9;
        cam.tz *= 0.9;
      }
      dirty = true;
    },
    resetView() {
      cam.tx = 0;
      cam.tz = 0;
      cam.zoom = 1;
      dirty = true;
    },
    setTopView(on) {
      cam.top = !!on;
      fit();
    },
    get topView() {
      return cam.top;
    },
    get zoomed() {
      return cam.zoom < 0.97 || Math.abs(cam.tx) > 0.2 || Math.abs(cam.tz) > 0.2;
    },
    refit: () => {
      fit();
    },
    markDirty() {
      dirty = true;
    },
  };
}
