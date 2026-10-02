// Scenery: non-interactive decoration (flowers, tufts, fences, scarecrows, old lanterns, cobwebs,
// puddles, border fences and thickets) and ambient life (crows, fireflies, bats, frogs, moths).
// Presentation only: never reads or writes simulation state beyond what it is handed, never
// affects collision, and must stay cheap on phones (batched draws, camera culling).
// Deterministic from the seed so every player sees the same props.
//
// WebGL: the camera is a fixed-angle orthographic view, so camera-facing quads are baked once into one
// merged mesh per 24-unit chunk (alpha-tested, depth-writing, so sprites sort against them per pixel) plus
// one flat-decal mesh per chunk. Critters are three small dynamic meshes (ground, air, glow). Night
// lighting comes from renderer.bindNight(); props also take the cool unlit / warm lamp tint sprites get.
// Canvas2D: the same props culled to the view from a pre-rasterised atlas, darkened with a tinted copy.

import {UPRIGHT_DEPTH} from './camera.mjs?v=harvest-18';
import {CELL} from './homestead.mjs?v=harvest-18';
import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {SCENERY_ATLAS} from './scenery-atlas.mjs?v=harvest-18';
import {CHUNK, PROPS, SceneryModel, chunkKey, propCovered, syntheticShape} from './scenery-layout.mjs?v=harvest-18';
import {AmbientLife} from './scenery-life.mjs?v=harvest-18';
import {brightnessAt, linearFromDisplay, parseHex} from './lighting.mjs?v=harvest-18';

// Camera basis (renderer: camera at focus + (0, 28, 27) looking at focus). UP is the screen's up in the world.
const CAM_L = Math.hypot(28, 27), UP_Y = 27 / CAM_L, UP_Z = -28 / CAM_L, FLAT_Y = .72;
const ATLAS = SCENERY_ATLAS, PPU = ATLAS.ppu;
const GLOW_COLORS = [[.82, 1, .42], [1, .78, .48]];
const ROTATING = new Set(['clover', 'leaves', 'leaves-red', 'lilypads']);
const COVER_EVERY = .5, MAX_CHUNKS = 40, MAX_NEW_CHUNKS = 1, PREFETCH = 8;
// Canvas screenPoint(x, z, y) lifts by y * .694 * scale; critters and props are placed h screen-units up.
const CANVAS_LIFT = 1 / .694;

function cellOf(kind){return ATLAS.cells[kind] || null;}
function hashXZ(x, z){const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;return h - Math.floor(h);}
/**
 * What hides scenery props: the buildings, plus every homestead tile (homestead.mjs), so grass and
 * flowers never grow up through a floor or a bed of soil. A tile counts as a building with no radius.
 */
const COVER = {buildings: null, rev: -1, n: -1, list: []};
function coverOf(world){
  const buildings = world?.buildings || [], cells = world?.tiles?.cells;
  if(!cells)return buildings;
  if(COVER.buildings !== buildings || COVER.rev !== world.tiles.rev || COVER.n !== buildings.length){
    COVER.buildings = buildings;COVER.rev = world.tiles.rev;COVER.n = buildings.length;
    COVER.list = buildings.concat(Object.keys(cells).map(key => {const [i, j] = key.split(',').map(Number);return {type: 'tile', x: (i + .5) * CELL, z: (j + .5) * CELL};}));
  }
  return COVER.list;
}
function buildingSig(buildings, x0, z0, x1, z1){
  let n = 0, s = 0;
  for(const b of buildings){if(b.type === 'cart' || b.type === 'hearth' || b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1)continue;n++;s = (s * 31 + Math.round(b.x * 4) * 7 + Math.round(b.z * 4)) % 1000003;}
  return n ? `${n}:${s}` : '';
}

/** Vertex/fragment additions on top of renderer.bindNight(): wind sway, see-through near the local wanderer, night tint. */
function sceneryShader(material, renderer, uniforms, {sway = false, peek = false, tint = true, floor = 0, upright = false, key}){
  renderer.bindNight(material);
  const night = material.onBeforeCompile;
  material.onBeforeCompile = (shader, gl) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    const vHead = ['uniform float uSceneryTime;'], fHead = ['uniform vec3 uSceneryUnlit;', 'uniform vec3 uScenerySource;', 'uniform float uSceneryTintMix;'];
    if(sway){vHead.push('attribute float aSway;');vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x+=aSway*sin(uSceneryTime*1.7+position.x*.35+position.z*.23)*(.65+.35*sin(uSceneryTime*.37+position.x*.05));');}
    if(peek){
      vHead.push('attribute vec2 aBase;', 'varying vec2 vSceneryBase;');fHead.push('uniform vec4 uSceneryPeek;', 'varying vec2 vSceneryBase;');
      vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSceneryBase=aBase;');
      // Big props in front of the local wanderer thin out (a dithered hole) so nobody is ever hidden.
      fs = fs.replace('void main() {', 'void main() {\nif(uSceneryPeek.z>0.0&&vSceneryBase.y>.5&&vSceneryBase.x>uSceneryPeek.w){vec2 dp=gl_FragCoord.xy-uSceneryPeek.xy;if(dot(dp,dp)<uSceneryPeek.z*uSceneryPeek.z&&mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<1.0)discard;}');
    }
    // Standing props get the same upright depth as sprites (camera.mjs), so wanderers and props sort the same way against walls.
    if(upright)vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${UPRIGHT_DEPTH(`(position.y / ${UP_Y.toFixed(6)})`)}`);
    shader.vertexShader = vHead.join('\n') + '\n' + vs;
    if(tint)fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n{vec2 sluv=(vNightWorld.xz-uNightOrigin)/uNightSpan;float slamp=texture2D(uNightLight,clamp(sluv,0.0,1.0)).r;diffuseColor.rgb*=mix(vec3(1.0),mix(uSceneryUnlit,uScenerySource,slamp),uNightCover*uSceneryTintMix);}');
    // Fliers catch the moonlight: never darker than `floor` of their own (cooled) colour, so bats read against the dark ground.
    if(floor)fs = fs.replace('#include <map_fragment>', '#include <map_fragment>\nvec3 sceneryBase=diffuseColor.rgb;').replace('#include <alphatest_fragment>', `diffuseColor.rgb=max(diffuseColor.rgb,sceneryBase*vec3(.78,.84,1.0)*${floor.toFixed(3)}*uNightCover);\n#include <alphatest_fragment>`);
    shader.fragmentShader = fHead.join('\n') + '\n' + fs;
    night(shader, gl);
  };
  material.customProgramCacheKey = () => `hollowstead-scenery-${key}`;
  return material;
}

/** Growable interleaved-ish buffers for building one chunk mesh without per-quad allocation. */
class QuadWriter {
  constructor(n, extras){
    this.n = 0;this.pos = new Float32Array(n * 12);this.uv = new Float32Array(n * 8);this.col = new Float32Array(n * 12);
    this.sway = extras ? new Float32Array(n * 4) : null;this.base = extras ? new Float32Array(n * 8) : null;
  }
  quad(c, uv, tone, swayTop, baseZ, big){
    const i = this.n++, p = this.pos, o = i * 12;
    for(let k = 0; k < 12; k++)p[o + k] = c[k];
    const t = this.uv, q = i * 8, u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];t[q] = u0;t[q + 1] = v0;t[q + 2] = u1;t[q + 3] = v0;t[q + 4] = u1;t[q + 5] = v1;t[q + 6] = u0;t[q + 7] = v1;
    const col = this.col;for(let k = 0; k < 4; k++){col[o + k * 3] = tone;col[o + k * 3 + 1] = tone;col[o + k * 3 + 2] = tone;}
    if(this.sway){const s = this.sway, b = this.base;s[i * 4] = s[i * 4 + 1] = 0;s[i * 4 + 2] = s[i * 4 + 3] = swayTop;for(let k = 0; k < 4; k++){b[i * 8 + k * 2] = baseZ;b[i * 8 + k * 2 + 1] = big;}}
  }
  geometry(){
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.subarray(0, n * 12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.subarray(0, n * 8), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.subarray(0, n * 12), 3));
    if(this.sway){g.setAttribute('aSway', new THREE.BufferAttribute(this.sway.subarray(0, n * 4), 1));g.setAttribute('aBase', new THREE.BufferAttribute(this.base.subarray(0, n * 8), 2));}
    g.setIndex(quadIndex(n));
    return g;
  }
}
let INDEX = new Uint32Array(0);
/** Quad index list for n quads: every geometry gets its own attribute over one shared, read-only array. */
function quadIndex(n){
  if(INDEX.length < n * 6){const m = Math.max(n, 2048), a = new Uint32Array(m * 6);for(let i = 0; i < m; i++){const v = i * 4, o = i * 6;a[o] = v;a[o + 1] = v + 1;a[o + 2] = v + 2;a[o + 3] = v;a[o + 4] = v + 2;a[o + 5] = v + 3;}INDEX = a;}
  return new THREE.BufferAttribute(INDEX.subarray(0, n * 6), 1);
}
// Scratch outputs, reused every call: no allocation per prop or per critter.
const CORNERS = new Float32Array(12), UVS = new Float32Array(4), GLOW_UV = new Float32Array([0, 0, 1, 1]);
function corner(c, i, x, y, z){c[i] = x;c[i + 1] = y;c[i + 2] = z;}
/** Upright billboard corners for an atlas cell anchored at (x, 0, z) + UP * h, optionally leaning. */
function upright(cell, x, z, h, s, flip, lean, nudge){
  const k = s / PPU, cw = cell[2], ch = cell[3], ax = cell[4], ay = cell[5];
  let l = -ax * k, r = (cw - ax) * k;const t = ay * k, b = -(ch - ay) * k;
  if(flip){const tmp = l;l = -r;r = -tmp;}
  const cs = lean ? Math.cos(lean) : 1, sn = lean ? Math.sin(lean) : 0, c = CORNERS, zz = z + nudge;
  let v = l * sn + b * cs + h;corner(c, 0, x + l * cs - b * sn, UP_Y * v, zz + UP_Z * v);
  v = r * sn + b * cs + h;corner(c, 3, x + r * cs - b * sn, UP_Y * v, zz + UP_Z * v);
  v = r * sn + t * cs + h;corner(c, 6, x + r * cs - t * sn, UP_Y * v, zz + UP_Z * v);
  v = l * sn + t * cs + h;corner(c, 9, x + l * cs - t * sn, UP_Y * v, zz + UP_Z * v);
  return c;
}
/** Flat decal corners on the ground, rotated by `angle`, the image's top pointing away from the camera. */
function flat(cell, x, z, y, s, flip, angle){
  const k = s / PPU, cw = cell[2], ch = cell[3], ax = cell[4], ay = cell[5];
  let l = -ax * k, r = (cw - ax) * k;const n = -ay * k, so = (ch - ay) * k;
  if(flip){const tmp = l;l = -r;r = -tmp;}
  const cs = Math.cos(angle), sn = Math.sin(angle), c = CORNERS;
  corner(c, 0, x + l * cs - so * sn, y, z + l * sn + so * cs);corner(c, 3, x + r * cs - so * sn, y, z + r * sn + so * cs);
  corner(c, 6, x + r * cs - n * sn, y, z + r * sn + n * cs);corner(c, 9, x + l * cs - n * sn, y, z + l * sn + n * cs);
  return c;
}
function uvOf(cell, flip){
  const W = ATLAS.width, H = ATLAS.height;
  let u0 = cell[0] / W, u1 = (cell[0] + cell[2]) / W;if(flip){const t = u0;u0 = u1;u1 = t;}
  UVS[0] = u0;UVS[1] = 1 - (cell[1] + cell[3]) / H;UVS[2] = u1;UVS[3] = 1 - cell[1] / H;
  return UVS;
}

/** WebGL layer. Renderer creates one, calls build() when the terrain is (re)built and update() every frame. */
export class SceneryLayer {
  constructor(renderer){
    this.renderer = renderer;this.model = new SceneryModel();this.life = new AmbientLife();this.meshes = new Map();
    this.override = null;this.enabled = true;this.off = true;this.world = null;this.coverClock = 0;this.clock = 0;this.tintKey = '';
    this.uniforms = {uSceneryTime:{value:0}, uSceneryUnlit:{value:new THREE.Color(1, 1, 1)}, uScenerySource:{value:new THREE.Color(1, 1, 1)}, uSceneryTintMix:{value:.85}, uSceneryPeek:{value:new THREE.Vector4(0, 0, 0, 0)}};
    this.group = new THREE.Group();this.group.name = 'scenery';renderer.scene.add(this.group);
    this.v = new THREE.Vector3();this.view = {x0:0, z0:0, x1:0, z1:0};this.stats = {chunks:0, quads:0, critters:0};
  }
  /** Lazily made once the theme's atlas has loaded (renderer.preload). */
  ensureMaterials(){
    if(this.materials)return true;
    const image = this.renderer.textures.get('scenery')?.image;
    if(!image)return false;
    const map = new THREE.Texture(image);map.colorSpace = THREE.SRGBColorSpace;map.minFilter = THREE.LinearFilter;map.magFilter = THREE.LinearFilter;map.generateMipmaps = false;map.needsUpdate = true;
    const r = this.renderer, u = this.uniforms;
    const up = sceneryShader(new THREE.MeshBasicMaterial({map, vertexColors:true, alphaTest:.5, alphaToCoverage:true, side:THREE.DoubleSide}), r, u, {sway:true, peek:true, upright:true, key:'up'});
    const decal = sceneryShader(new THREE.MeshBasicMaterial({map, vertexColors:true, transparent:true, depthWrite:false, side:THREE.DoubleSide}), r, u, {key:'decal'});
    const ground = sceneryShader(new THREE.MeshBasicMaterial({map, vertexColors:true, alphaTest:.5, alphaToCoverage:true, side:THREE.DoubleSide}), r, u, {key:'ground'});
    const air = sceneryShader(new THREE.MeshBasicMaterial({map, vertexColors:true, transparent:true, depthWrite:false, side:THREE.DoubleSide}), r, u, {floor:.95, key:'air'});
    const c = document.createElement('canvas');c.width = c.height = 64;const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');grad.addColorStop(.18, 'rgba(255,255,255,.85)');grad.addColorStop(.45, 'rgba(255,255,255,.22)');grad.addColorStop(1, 'rgba(255,255,255,0)');g.fillStyle = grad;g.fillRect(0, 0, 64, 64);
    const glowMap = new THREE.CanvasTexture(c);
    const glow = new THREE.MeshBasicMaterial({map:glowMap, vertexColors:true, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide});
    this.materials = {map, up, decal, ground, air, glow};
    this.dynamic = {ground:this.dynamicMesh(ground, 48, 3, 0), air:this.dynamicMesh(air, 64, 4, 4), glow:this.dynamicMesh(glow, 96, 4, 5)};
    return true;
  }
  dynamicMesh(material, n, colorSize, renderOrder){
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3), uv = new THREE.BufferAttribute(new Float32Array(n * 8), 2), col = new THREE.BufferAttribute(new Float32Array(n * 4 * colorSize), colorSize);
    for(const a of [pos, uv, col])a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pos);g.setAttribute('uv', uv);g.setAttribute('color', col);g.setIndex(quadIndex(n));g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, material);mesh.frustumCulled = false;mesh.renderOrder = renderOrder;this.group.add(mesh);
    return {mesh, pos, uv, col, n, colorSize};
  }
  /** Rebuild for a new world (seed change, arena on/off). */
  build(seed, world){
    this.clear();this.world = world;this.seed = seed;this.life.reset();
    this.off = !this.enabled || !!world?.arena || !!world?.dungeon;
    if(this.off)return;
    this.model.reset(seed, world, this.override ? syntheticShape(seed, world?.radius, this.override) : null);
    this.syncLake();
  }
  clear(){
    for(const m of this.meshes.values())this.dispose(m);
    this.meshes.clear();
  }
  dispose(m){for(const mesh of [m.up, m.decal])if(mesh){this.group.remove(mesh);mesh.geometry.dispose();}}
  /** Presentation test: a synthetic border ring and lake while worldgen is a plain disc. null restores worldgen. */
  useSynthetic(options = {}){this.override = options;if(this.seed !== undefined)this.build(this.seed, this.world);}
  syncLake(){
    if(this.lakeMesh){this.group.remove(this.lakeMesh);this.lakeMesh.geometry.dispose();this.lakeMesh.material.dispose();this.lakeMesh = null;}
    const lake = this.model.override?.lake;if(!lake)return;
    const m = new THREE.Mesh(new THREE.CircleGeometry(lake.r, 40), new THREE.MeshBasicMaterial({color:this.renderer.theme.palette.water || '#3f5566'}));
    this.renderer.bindNight(m.material);m.rotation.x = -Math.PI / 2;m.position.set(lake.x, -.02, lake.z);this.group.add(m);this.lakeMesh = m;
  }
  /** One chunk: its upright props and border pieces in one mesh, its flat decals in another. */
  buildChunk(c){
    const buildings = coverOf(this.world);
    const ups = new QuadWriter(c.props.length + c.pieces.length, true), decals = new QuadWriter(c.props.length, false);
    let flatIndex = 0;
    for(const p of c.props){
      const cell = cellOf(p.kind), def = PROPS[p.kind];if(!cell || !def)continue;
      if(propCovered(p, buildings))continue;
      const uv = uvOf(cell, p.flip);
      if(def.flat){
        const angle = ROTATING.has(p.kind) ? hashXZ(p.x, p.z) * Math.PI * 2 : 0;
        decals.quad(flat(cell, p.x, p.z, .006 + (flatIndex++ % 8) * .0006, p.s, p.flip, angle), uv, p.tone, 0, 0, 0);
      }else ups.quad(upright(cell, p.x, p.z, 0, p.s, p.flip, 0, 0), uv, p.tone, (def.sway || 0) * p.s, p.z, def.big ? 1 : 0);
    }
    for(const p of c.pieces){
      const cell = cellOf(p.kind);if(!cell)continue;
      if(p.kind === 'rail'){
        const uv = uvOf(cell, false), q = CORNERS, back = -.045;
        q[0] = p.x0;q[1] = UP_Y * p.lo;q[2] = p.z0 + UP_Z * p.lo + back;q[3] = p.x1;q[4] = UP_Y * p.lo;q[5] = p.z1 + UP_Z * p.lo + back;
        q[6] = p.x1;q[7] = UP_Y * p.hi;q[8] = p.z1 + UP_Z * p.hi + back;q[9] = p.x0;q[10] = UP_Y * p.hi;q[11] = p.z0 + UP_Z * p.hi + back;
        ups.quad(q, uv, p.tone, 0, Math.max(p.z0, p.z1), 1);continue;
      }
      const def = PROPS[p.kind] || {};
      ups.quad(upright(cell, p.x, p.z, 0, p.s, p.flip, p.lean || 0, 0), uvOf(cell, p.flip), p.tone, (def.sway || 0) * p.s, p.z, 1);
    }
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, sphere = new THREE.Sphere(new THREE.Vector3(x0 + CHUNK / 2, 1, z0 + CHUNK / 2), CHUNK * .75 + 3);
    const out = {key:c.key, cx:c.cx, cz:c.cz, up:null, decal:null, sig:buildingSig(buildings, x0 - 1, z0 - 1, x0 + CHUNK + 1, z0 + CHUNK + 1), quads:ups.n + decals.n};
    if(ups.n){const g = ups.geometry();g.boundingSphere = sphere;out.up = new THREE.Mesh(g, this.materials.up);this.group.add(out.up);}
    if(decals.n){const g = decals.geometry();g.boundingSphere = sphere.clone();out.decal = new THREE.Mesh(g, this.materials.decal);out.decal.renderOrder = -3;this.group.add(out.decal);}
    return out;
  }
  /** Every frame after the ground and plaza. `frame` is lighting.frameLighting(); `focus` the camera target {x,z}. */
  update(world, frame, dt, focus){
    this.world = world;
    if(this.off || !this.ensureMaterials()){this.group.visible = false;return;}
    this.group.visible = true;this.clock += dt;
    const r = this.renderer, cam = r.camera, u = this.uniforms;
    u.uSceneryTime.value = this.clock;
    const lighting = frame.lighting, key = lighting.unlitTint + lighting.sourceTint;
    if(key !== this.tintKey){this.tintKey = key;for(const [name, hex] of [['uSceneryUnlit', lighting.unlitTint], ['uScenerySource', lighting.sourceTint]]){const c = parseHex(hex) || {r:255, g:255, b:255};u[name].value.setRGB(linearFromDisplay(c.r / 255), linearFromDisplay(c.g / 255), linearFromDisplay(c.b / 255));}}
    // Visible ground: the ortho frustum projected onto y = 0, padded for tall props below the bottom edge.
    const halfW = (cam.right - cam.left) / 2, halfH = (cam.top - cam.bottom) / 2, view = this.view;
    view.x0 = focus.x - halfW - 1.5;view.x1 = focus.x + halfW + 1.5;view.z0 = focus.z - halfH / FLAT_Y - 1;view.z1 = focus.z + halfH / FLAT_Y + 3.4;
    // Chunks in view are built at once; the ring beyond is prefetched a couple per frame so walking never hitches.
    const {cx0, cz0, cx1, cz1} = this.model.range(view.x0 - PREFETCH, view.z0 - PREFETCH, view.x1 + PREFETCH, view.z1 + PREFETCH);
    this.coverClock -= dt;const recheck = this.coverClock <= 0;if(recheck)this.coverClock = COVER_EVERY;
    const buildings = coverOf(world);let fresh = 0, quads = 0, shown = 0;
    for(const m of this.meshes.values()){if(m.up)m.up.visible = false;if(m.decal)m.decal.visible = false;}
    for(let cz = cz0; cz <= cz1; cz++)for(let cx = cx0; cx <= cx1; cx++){
      const x0 = cx * CHUNK, z0 = cz * CHUNK, visible = x0 < view.x1 && x0 + CHUNK > view.x0 && z0 < view.z1 && z0 + CHUNK > view.z0;
      const k = chunkKey(cx, cz);let m = this.meshes.get(k);
      if(m && recheck && visible&&buildingSig(buildings, x0 - 1, z0 - 1, x0 + CHUNK + 1, z0 + CHUNK + 1) !== m.sig){this.dispose(m);this.meshes.delete(k);m = null;}
      if(!m){if(!visible && fresh >= MAX_NEW_CHUNKS)continue;m = this.buildChunk(this.model.chunk(cx, cz));this.meshes.set(k, m);fresh++;}
      m.seen = this.clock;if(!visible)continue;
      if(m.up)m.up.visible = true;if(m.decal)m.decal.visible = true;quads += m.quads;shown++;
    }
    if(this.meshes.size > MAX_CHUNKS){const old = [...this.meshes.values()].sort((a, b) => a.seen - b.seen);for(const m of old.slice(0, this.meshes.size - MAX_CHUNKS)){this.dispose(m);this.meshes.delete(m.key);}}
    this.stats.chunks = shown;this.stats.quads = quads;
    this.peek(world, cam);
    this.life.update(this.model, world, frame, this.clock, dt, view);
    this.writeDynamic();
  }
  /** Screen hole for the local wanderer (drawing-buffer pixels) so tall props never hide them. */
  peek(world, cam){
    const r = this.renderer, id = r.localId, body = id ? r.objects.get('player' + id) : null, p = body?.initialized ? body : (id && world.player ? world.player(id) : null);
    const peek = this.uniforms.uSceneryPeek.value;
    if(!p){peek.set(0, 0, 0, 0);return;}
    const ratio = r.gl.getPixelRatio(), h = r.viewHeight || 1, perUnit = h / (cam.top - cam.bottom) * ratio;
    this.v.set(p.x, .95, p.z).project(cam);
    peek.set((this.v.x * .5 + .5) * (r.viewWidth || 1) * ratio, (this.v.y * .5 + .5) * h * ratio, 1.15 * perUnit, p.z + .12);
  }
  writeDynamic(){
    const life = this.life, dyn = this.dynamic;
    // Ground critters: perched crows, frogs, ripples (alpha-tested, depth-sorted with everything else).
    {const d = dyn.ground, pos = d.pos.array, uv = d.uv.array, col = d.col.array;let n = 0;
      for(let i = 0; i < life.nGround && n < d.n; i++){
        const rec = life.ground[i], cell = cellOf(rec.cell);if(!cell)continue;
        const c = rec.flat ? flat(cell, rec.x, rec.z, .01, rec.s, rec.flip, 0) : upright(cell, rec.x, rec.z, rec.h, rec.s, rec.flip, 0, rec.h > .05 ? .07 : .01);
        this.put(pos, uv, col, n++, c, uvOf(cell, rec.flip), 1, 1, 1, 1, 3);
      }
      this.finish(d, n);}
    {const d = dyn.air, pos = d.pos.array, uv = d.uv.array, col = d.col.array;let n = 0;
      for(let i = 0; i < life.nAir && n < d.n; i++){
        const rec = life.air[i], cell = cellOf(rec.cell);if(!cell)continue;
        this.put(pos, uv, col, n++, upright(cell, rec.x, rec.z, rec.h, rec.s, rec.flip, 0, 0), uvOf(cell, rec.flip), 1, 1, 1, rec.a, 4);
      }
      this.finish(d, n);}
    {const d = dyn.glow, pos = d.pos.array, uv = d.uv.array, col = d.col.array;let n = 0;
      for(let i = 0; i < life.nGlow && n < d.n; i++){
        const g = life.glow[i], rr = g.r, c = CORNERS, cy = UP_Y * g.h, cz = g.z + UP_Z * g.h;
        c[0] = g.x - rr;c[1] = cy - UP_Y * rr;c[2] = cz - UP_Z * rr;c[3] = g.x + rr;c[4] = cy - UP_Y * rr;c[5] = cz - UP_Z * rr;
        c[6] = g.x + rr;c[7] = cy + UP_Y * rr;c[8] = cz + UP_Z * rr;c[9] = g.x - rr;c[10] = cy + UP_Y * rr;c[11] = cz + UP_Z * rr;
        const tint = GLOW_COLORS[g.color] || GLOW_COLORS[0], cr = tint[0], cg = tint[1], cb = tint[2];
        this.put(pos, uv, col, n++, c, GLOW_UV, cr, cg, cb, g.a, 4);
      }
      this.finish(d, n);}
    this.stats.critters = life.nGround + life.nAir + life.nGlow;
  }
  put(pos, uv, col, i, c, w, r, g, b, alpha, size){
    const o = i * 12;for(let k = 0; k < 12; k++)pos[o + k] = c[k];
    const q = i * 8, u0 = w[0], v0 = w[1], u1 = w[2], v1 = w[3];uv[q] = u0;uv[q + 1] = v0;uv[q + 2] = u1;uv[q + 3] = v0;uv[q + 4] = u1;uv[q + 5] = v1;uv[q + 6] = u0;uv[q + 7] = v1;
    for(let k = 0; k < 4; k++){const j = (i * 4 + k) * size;col[j] = r;col[j + 1] = g;col[j + 2] = b;if(size === 4)col[j + 3] = alpha;}
  }
  finish(d, n){d.mesh.geometry.setDrawRange(0, n * 6);d.mesh.visible = n > 0;if(n){d.pos.needsUpdate = true;d.uv.needsUpdate = true;d.col.needsUpdate = true;}}
}

// ------------------------------------------------------------------ Canvas2D fallback
/** Per-renderer canvas state: the rasterised atlas, a night-tinted copy, the chunk cache and the critters. */
class CanvasScenery {
  constructor(renderer){
    this.renderer = renderer;this.model = new SceneryModel();this.life = new AmbientLife();this.seed = null;this.clock = 0;
    this.view = {x0:0, z0:0, x1:0, z1:0};this.ups = [];this.coverClock = 0;this.hidden = new Map();
    const img = renderer.images.get('scenery');
    if(img){
      const make = () => {const c = document.createElement('canvas');c.width = ATLAS.width;c.height = ATLAS.height;return c;};
      this.atlas = make();this.atlas.getContext('2d').drawImage(img, 0, 0, ATLAS.width, ATLAS.height);
      this.dark = make();const g = this.dark.getContext('2d');g.drawImage(this.atlas, 0, 0);g.globalCompositeOperation = 'source-in';g.fillStyle = '#10121d';g.fillRect(0, 0, ATLAS.width, ATLAS.height);
      const glow = document.createElement('canvas');glow.width = glow.height = 32;const gg = glow.getContext('2d'), grad = gg.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');grad.addColorStop(.2, 'rgba(255,255,255,.8)');grad.addColorStop(.5, 'rgba(255,255,255,.2)');grad.addColorStop(1, 'rgba(255,255,255,0)');gg.fillStyle = grad;gg.fillRect(0, 0, 32, 32);
      this.glow = GLOW_COLORS.map(([r, g2, b]) => {const c = document.createElement('canvas');c.width = c.height = 32;const x = c.getContext('2d');x.drawImage(glow, 0, 0);x.globalCompositeOperation = 'source-in';x.fillStyle = `rgb(${r * 255 | 0},${g2 * 255 | 0},${b * 255 | 0})`;x.fillRect(0, 0, 32, 32);x.globalCompositeOperation = 'destination-in';x.drawImage(glow, 0, 0);return c;});
    }
  }
  /** Presentation test, as SceneryLayer.useSynthetic. */
  useSynthetic(options = {}){this.renderer.sceneryOverride = options;this.seed = null;}
  sync(world){
    if(this.seed === world.seed && this.arena === !!world.arena)return;
    this.seed = world.seed;this.arena = !!world.arena;this.life.reset();
    if(!this.arena)this.model.reset(world.seed, world, this.renderer.sceneryOverride ? syntheticShape(world.seed, world.radius, this.renderer.sceneryOverride) : null);
  }
  /** Draw one atlas cell: upright at its ground point (plus h up the screen), or flat and foreshortened. */
  draw(c, cell, x, z, h, s, flip, flat, dark, sway){
    const r = this.renderer, sc = r.scale, k = s / PPU * sc, [cx, cy, cw, ch, ax, ay] = cell;
    const p = r.screenPoint(x, z, h * CANVAS_LIFT);
    const w = cw * k, hh = ch * k * (flat ? FLAT_Y : 1), dx = -ax * k, dy = -ay * k * (flat ? FLAT_Y : 1);
    const shear = sway ? sway * sc / Math.max(1, hh) : 0;
    c.setTransform(r.ctxScale * (flip ? -1 : 1), 0, -shear * r.ctxScale, r.ctxScale, p.x * r.ctxScale, p.y * r.ctxScale);
    c.drawImage(this.atlas, cx, cy, cw, ch, dx, dy, w, hh);
    if(dark > .02){c.globalAlpha = dark;c.drawImage(this.dark, cx, cy, cw, ch, dx, dy, w, hh);c.globalAlpha = 1;}
  }
  paint(c, world, frame, dt, pass){
    if(!this.atlas || world.arena || world.dungeon)return;
    this.sync(world);
    const r = this.renderer, view = this.view;
    r.ctxScale = Math.min(globalThis.devicePixelRatio || 1, 1.6);
    const halfX = r.width / r.scale / 2 + 1.5, halfZ = r.height / (r.scale * FLAT_Y) / 2;
    view.x0 = r.focus.x - halfX;view.x1 = r.focus.x + halfX;view.z0 = r.focus.z - halfZ - 1;view.z1 = r.focus.z + halfZ + 3.4;
    const cover = frame.darkness, lighting = frame.lighting;
    const shade = (x, z) => cover > .02 ? (1 - brightnessAt(frame.sources, x, z, cover, lighting)) * .94 : 0;
    c.save();
    if(pass === 'ground'){
      this.clock += dt;
      const {cx0, cz0, cx1, cz1} = this.model.range(view.x0, view.z0, view.x1, view.z1), ups = this.ups;ups.length = 0;
      this.coverClock -= dt;const recheck = this.coverClock <= 0;if(recheck)this.coverClock = COVER_EVERY;
      const buildings = coverOf(world);
      for(let cz = cz0; cz <= cz1; cz++)for(let cx = cx0; cx <= cx1; cx++){
        const ch = this.model.chunk(cx, cz);
        if(recheck || !this.hidden.has(ch.key)){const x0 = cx * CHUNK, z0 = cz * CHUNK, sig = buildingSig(buildings, x0 - 1, z0 - 1, x0 + CHUNK + 1, z0 + CHUNK + 1), was = this.hidden.get(ch.key);if(!was || was.sig !== sig)this.hidden.set(ch.key, {sig, set:sig ? new Set(ch.props.filter(p => propCovered(p, buildings))) : null});}
        const hidden = this.hidden.get(ch.key).set;
        for(const p of ch.props){
          if(p.x < view.x0 || p.x > view.x1 || p.z < view.z0 || p.z > view.z1 || hidden?.has(p))continue;
          const cell = cellOf(p.kind);if(!cell)continue;
          if(PROPS[p.kind].flat)this.draw(c, cell, p.x, p.z, 0, p.s, p.flip, true, shade(p.x, p.z), 0);else ups.push(p);
        }
        for(const p of ch.pieces)if(p.x > view.x0 - 2 && p.x < view.x1 + 2 && p.z > view.z0 && p.z < view.z1)ups.push(p);
      }
      ups.sort((a, b) => a.z - b.z);
      for(const p of ups){
        if(p.kind === 'rail'){this.rail(c, p, shade(p.x, p.z));continue;}
        const cell = cellOf(p.kind);if(!cell)continue;
        const sway = PROPS[p.kind]?.sway ? PROPS[p.kind].sway * p.s * Math.sin(this.clock * 1.7 + p.x * .35 + p.z * .23) : 0;
        this.draw(c, cell, p.x, p.z, 0, p.s, p.flip, false, shade(p.x, p.z), sway);
      }
      // Lay out one chunk of the ring beyond the view per frame, so walking into it never hitches.
      const pre = this.model.range(view.x0 - PREFETCH, view.z0 - PREFETCH, view.x1 + PREFETCH, view.z1 + PREFETCH);
      prefetch: for(let cz = pre.cz0; cz <= pre.cz1; cz++)for(let cx = pre.cx0; cx <= pre.cx1; cx++)if(!this.model.chunks.has(chunkKey(cx, cz))){this.model.chunk(cx, cz);break prefetch;}
      this.life.update(this.model, world, frame, this.clock, dt, view, true);
      for(let i = 0; i < this.life.nGround; i++){const g = this.life.ground[i], cell = cellOf(g.cell);if(cell)this.draw(c, cell, g.x, g.z, g.h, 1, g.flip, g.flat, shade(g.x, g.z), 0);}
    }else{
      for(let i = 0; i < this.life.nAir; i++){const g = this.life.air[i], cell = cellOf(g.cell);if(!cell)continue;c.globalAlpha = g.a;this.draw(c, cell, g.x, g.z, g.h, 1, g.flip, false, 0, 0);c.globalAlpha = 1;}
      c.setTransform(r.ctxScale, 0, 0, r.ctxScale, 0, 0);c.globalCompositeOperation = 'lighter';
      for(let i = 0; i < this.life.nGlow; i++){const g = this.life.glow[i], p = r.screenPoint(g.x, g.z, g.h * CANVAS_LIFT), s = g.r * r.scale * 2;c.globalAlpha = Math.min(1, g.a);c.drawImage(this.glow[g.color] || this.glow[0], p.x - s / 2, p.y - s / 2, s, s);}
      c.globalCompositeOperation = 'source-over';c.globalAlpha = 1;
    }
    c.restore();
  }
  /** A fence rail: the plank strip stretched between the end posts, sheared to their heading. */
  rail(c, p, dark){
    const r = this.renderer, cell = cellOf('rail'), [cx, cy, cw, ch] = cell;
    const a = r.screenPoint(p.x0, p.z0, p.lo * CANVAS_LIFT), b = r.screenPoint(p.x1, p.z1, p.lo * CANVAS_LIFT), top = (p.hi - p.lo) * r.scale;
    const s = r.ctxScale, ux = (b.x - a.x) / cw, uy = (b.y - a.y) / cw;
    c.setTransform(ux * s, uy * s, 0, top / ch * s, a.x * s, a.y * s);
    c.drawImage(this.atlas, cx, cy, cw, ch, 0, -ch, cw, ch);
    if(dark > .02){c.globalAlpha = dark;c.drawImage(this.dark, cx, cy, cw, ch, 0, -ch, cw, ch);c.globalAlpha = 1;}
  }
}

/** Canvas2D fallback. `pass` is 'ground' (after tiles, before entities) or 'air' (after entities). */
export function paintScenery(renderer, ctx, world, frame, dt, pass){
  if(!renderer.scenery)renderer.scenery = new CanvasScenery(renderer);
  renderer.scenery.paint(ctx, world, frame, dt, pass);
}
