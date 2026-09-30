// Hand cart presentation (cart.mjs): the rope from a puller's hands to the cart's handle, for the WebGL
// renderer (RopeLayer) and the Canvas2D fallback (paintRopes). Presentation only: reads the world.
import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {entityBrightness, linearFromDisplay} from './lighting.mjs?v=harvest-18';
import {CART} from './cart.mjs?v=harvest-18';

const ROPE = '#c9a36e', ROPE_DARK = '#3a2a2a', CORE_RGB = rgb(ROPE), EDGE_RGB = rgb(ROPE_DARK), SEGMENTS = 4, THICK = .065, OUTLINE = 1.9;
function rgb(hex){return [1, 3, 5].map(i => parseInt(hex.slice(i, i+2), 16)/255);}
/** Shade a plain colour the way the renderer shades sprites: scale in display space, then go linear. */
function shade(color, [r, g, b], display){color.setRGB(linearFromDisplay(r*display), linearFromDisplay(g*display), linearFromDisplay(b*display));}
/** Where the handle tip sits on the cart sheet cell: across from the centre and up from the ground, as shares of the sprite size. */
const HANDLE = Object.freeze({across: .38, up: .25}), HANDS = Object.freeze({across: .2, up: .78});

/**
 * Rope ends and sag for a pulled cart. `cart`/`puller` give the drawn positions (smoothed when the
 * renderer smooths them). The handle sits on the cart's `face` side; `size` is the cart sprite's [width, height].
 * Heights are in sprite units: a point `y` up a billboard lands where the world point (x, y, z) projects.
 */
export function ropeGeometry(cart, puller, face, size){
  const side = face === 1 ? 1 : -1, width = size?.[0] || 2.3, height = size?.[1] || 2.3;
  const bx = cart.x+side*width*HANDLE.across, bz = cart.z+.02, by = height*HANDLE.up;
  const toward = Math.sign(bx-puller.x) || -side;
  const ax = puller.x+toward*HANDS.across, az = puller.z+.03, ay = HANDS.up;
  const d = Math.hypot(ax-bx, az-bz);
  // Slack rope sags; a taut one runs nearly straight.
  const sag = .03+Math.max(0, CART.rope+.15-Math.hypot(puller.x-cart.x, puller.z-cart.z))*.3;
  // A cart farther from the camera than its puller has its rope drawn under the sprites (the puller's
  // body hides the hands' end); one in front has it drawn over them.
  return {ax, ay, az, bx, by, bz, sag, length: d, behind: cart.z < puller.z-.15};
}

/** Point t (0 at the hands, 1 at the handle) along the sagging rope. */
function along(g, t, out){
  out.x = g.ax+(g.bx-g.ax)*t; out.z = g.az+(g.bz-g.az)*t;
  out.y = g.ay+(g.by-g.ay)*t-Math.sin(Math.PI*t)*g.sag;
  return out;
}

const UNIT_X = new THREE.Vector3(1, 0, 0);
/**
 * WebGL: a pale rope core over a dark outline, a few thin boxes per pulled cart, pooled and reused every frame.
 * Both are drawn with the sprites (no depth writes): before them when the cart trails behind its puller,
 * after them when it rolls in front; the outline always first, so the core shows through it.
 */
export class RopeLayer {
  constructor(scene){this.scene = scene; this.ropes = new Map(); this.seen = new Set(); this.geometry = new THREE.BoxGeometry(1, 1, 1); this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.p = {x: 0, y: 0, z: 0}; this.q = {x: 0, y: 0, z: 0};}
  rope(id){
    let r = this.ropes.get(id);
    if(!r){
      const core = new THREE.MeshBasicMaterial({color: ROPE, transparent: true, depthWrite: false}), edge = new THREE.MeshBasicMaterial({color: ROPE_DARK, transparent: true, depthWrite: false});
      const parts = [], edges = [];
      for(let i = 0; i < SEGMENTS; i++){
        const mesh = new THREE.Mesh(this.geometry, core); mesh.renderOrder = 2; this.scene.add(mesh); parts.push(mesh);
        const rim = new THREE.Mesh(this.geometry, edge); rim.renderOrder = 1; this.scene.add(rim); edges.push(rim);
      }
      r = {core, edge, parts, edges}; this.ropes.set(id, r);
    }
    return r;
  }
  /** One segment box from this.a to this.b (direction this.dir). */
  place(mesh, len, thick){
    mesh.position.addVectors(this.a, this.b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UNIT_X, this.dir);
    mesh.scale.set(len+thick*.6, thick, thick); mesh.visible = true;
  }
  hide(r){for(const mesh of r.parts) mesh.visible = false; for(const mesh of r.edges) mesh.visible = false;}
  /** `objects` is the renderer's sprite map ('building'+id, 'player'+id) holding smoothed positions. */
  update(world, objects, frame, theme){
    const seen = this.seen; seen.clear();
    const size = theme.sprites.cart?.size;
    for(const b of world.buildings){
      if(b.type !== 'cart' || !b.towedBy || !(b.hp > 0)) continue;
      const cart = objects.get('building'+b.id), puller = objects.get('player'+b.towedBy);
      if(!cart?.initialized || !puller?.initialized || !cart.sprite.visible || !puller.sprite.visible) continue;
      seen.add(b.id);
      const g = ropeGeometry(cart, puller, b.face, size), r = this.rope(b.id);
      const light = Math.min(1, entityBrightness(frame, (g.ax+g.bx)/2, (g.az+g.bz)/2));
      shade(r.core.color, CORE_RGB, light); shade(r.edge.color, EDGE_RGB, light);
      const order = g.behind ? -.6 : 2;
      for(let i = 0; i < SEGMENTS; i++){
        along(g, i/SEGMENTS, this.p); along(g, (i+1)/SEGMENTS, this.q);
        this.a.set(this.p.x, this.p.y, this.p.z); this.b.set(this.q.x, this.q.y, this.q.z);
        const len = this.a.distanceTo(this.b);
        this.dir.subVectors(this.b, this.a).normalize();
        this.place(r.parts[i], len, THICK); this.place(r.edges[i], len, THICK*OUTLINE);
        r.parts[i].renderOrder = order+.1; r.edges[i].renderOrder = order;
      }
    }
    for(const [id, r] of this.ropes){
      if(seen.has(id)) continue;
      if(world.buildings.some(b => b.id === id && b.type === 'cart' && b.hp > 0)){this.hide(r); continue;}
      for(const mesh of r.parts) this.scene.remove(mesh);
      for(const mesh of r.edges) this.scene.remove(mesh);
      r.core.dispose(); r.edge.dispose(); this.ropes.delete(id);
    }
  }
}

/**
 * Canvas2D fallback: one sagging two-tone stroke per pulled cart. Called twice a frame: `behind` before the
 * sprites (carts trailing behind their puller), then after them for the rest.
 */
export function paintRopes(renderer, c, world, frame, theme, behind=false){
  for(const b of world.buildings){
    if(b.type !== 'cart' || !b.towedBy || !(b.hp > 0)) continue;
    const puller = world.player(b.towedBy); if(!puller?.online) continue;
    const g = ropeGeometry(b, puller, b.face, theme.sprites.cart?.size);
    if(g.behind !== behind) continue;
    const light = Math.max(0, Math.min(1, entityBrightness(frame, (g.ax+g.bx)/2, (g.az+g.bz)/2)));
    const a = renderer.screenPoint(g.ax, g.az, g.ay), e = renderer.screenPoint(g.bx, g.bz, g.by), mid = renderer.screenPoint((g.ax+g.bx)/2, (g.az+g.bz)/2, (g.ay+g.by)/2-g.sag*2);
    c.save(); c.lineCap = 'round'; c.filter = `brightness(${light.toFixed(2)})`;
    c.strokeStyle = '#2a1f26b0'; c.lineWidth = Math.max(3, .11*renderer.scale);
    c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mid.x, mid.y, e.x, e.y); c.stroke();
    c.strokeStyle = ROPE; c.lineWidth = Math.max(1.6, .06*renderer.scale);
    c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mid.x, mid.y, e.x, e.y); c.stroke();
    c.restore();
  }
}
