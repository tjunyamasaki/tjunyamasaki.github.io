// WebGL look of a dungeon floor: one mesh for the floor, one for the walls and pillars (tops and the
// faces the camera sees), and the stairs and shrine rings. The renderer builds it when the floor
// changes and updates it every frame. Colours come from art.mjs, the light from the renderer's
// night field (bindNight), so torches and wanderers light the stone like they light the hollow.
import * as THREE from '../../../hushlight/vendor/three.module.min.js';
import {FLOOR, ROCK, SOLID} from './grid.mjs?v=harvest-18';
import {WALL, floorTones, wallCell, wallHeight} from './art.mjs?v=harvest-18';
import {layoutOf} from './run.mjs?v=harvest-18';

export class DungeonLayer {
  constructor(scene, bindNight){this.scene = scene; this.bindNight = bindNight; this.key = ''; this.meshes = []; this.fx = null; this.chargeKey = '';}
  dispose(){
    for(const m of this.meshes){this.scene.remove(m); m.geometry.dispose(); m.material.dispose();}
    this.meshes = []; this.fx = null; this.key = ''; this.chargeKey = '';
  }
  add(mesh){this.scene.add(mesh); this.meshes.push(mesh); return mesh;}
  build(world){
    this.dispose();
    const L = layoutOf(world); if(!L) return;
    this.key = L.key;
    const tones = floorTones(L), c = new THREE.Color(), top = new THREE.Color(), bottom = new THREE.Color();
    const code = (i, j) => i < 0 || j < 0 || i >= L.w || j >= L.h ? ROCK : L.cells[i + j*L.w];
    const fp = [], fc = [], wp = [], wc = [];
    const flat = (pos, col, x0, z0, x1, z1, y, hex) => {c.set(hex); for(const [a, b] of [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]]){pos.push(a, y, b); col.push(c.r, c.g, c.b);}};
    // A face toward the camera (+z), lighter at the top.
    const face = (x0, x1, z, y0, y1) => {
      top.set(tones.face); bottom.set(tones.faceDark);
      const lo = bottom.clone().lerp(top, y0/Math.max(.01, y1));
      for(const [x, y, t] of [[x0, y1, 1], [x0, y0, 0], [x1, y1, 1], [x1, y1, 1], [x0, y0, 0], [x1, y0, 0]]){wp.push(x, y, z); const k = t ? top : lo; wc.push(k.r, k.g, k.b);}
    };
    for(let j = 0; j < L.h; j++) for(let i = 0; i < L.w; i++){
      const k = i + j*L.w, cell = L.cells[k], x0 = L.ox + i, z0 = L.oz + j, x1 = x0 + 1, z1 = z0 + 1;
      if(cell !== ROCK) flat(fp, fc, x0, z0, x1, z1, -.04, tones.floor[k]);
      if(cell === FLOOR || !wallCell(L, i, j)) continue;
      const h = wallHeight(L, i, j); if(!(h > 0)) continue;
      if(cell === SOLID){
        // A pillar: narrower than its cell, so the floor shows round it.
        const inset = (1 - WALL.pillarWidth)/2;
        flat(wp, wc, x0 + inset, z0 + inset, x1 - inset, z1 - inset, h, tones.wall[k]);
        face(x0 + inset, x1 - inset, z1 - inset, 0, h);
        continue;
      }
      flat(wp, wc, x0, z0, x1, z1, h, tones.wall[k]);
      const south = code(i, j + 1) === FLOOR ? 0 : code(i, j + 1) === SOLID ? 0 : wallHeight(L, i, j + 1);
      if(south < h) face(x0, x1, z1, south, h);
    }
    const mesh = (pos, col) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide});
      this.bindNight(m);
      return this.add(new THREE.Mesh(g, m));
    };
    mesh(fp, fc); mesh(wp, wc);
    // The stairs down: a dark well with a ring that wakes when the Warden falls; the shrine's circle.
    const ring = (inner, outer, color, opacity, additive = true) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 56), new THREE.MeshBasicMaterial({color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending}));
      m.rotation.x = -Math.PI/2; return this.add(m);
    };
    const well = this.add(new THREE.Mesh(new THREE.CircleGeometry(1.75, 40), new THREE.MeshBasicMaterial({color: 0x100d16, transparent: true, opacity: .88, depthWrite: false})));
    well.rotation.x = -Math.PI/2; well.position.set(L.portal.x, .006, L.portal.z);
    const steps = ring(.7, .86, 0x3a3346, .9, false), steps2 = ring(1.2, 1.34, 0x2e2838, .9, false);
    steps.position.set(L.portal.x, .008, L.portal.z); steps2.position.set(L.portal.x, .008, L.portal.z);
    const rim = ring(1.85, 2.2, new THREE.Color(tones.accent), .25); rim.position.set(L.portal.x, .012, L.portal.z);
    const halo = ring(.2, 1.7, new THREE.Color(tones.accent), 0); halo.position.set(L.portal.x, .014, L.portal.z);
    let shrine = null;
    if(L.shrine){shrine = ring(1.9, 2.1, 0xbfe0ff, .45); shrine.position.set(L.shrine.x, .012, L.shrine.z);}
    this.fx = {L, rim, halo, shrine, charge: null};
  }
  /** Rebuilds when the floor changes; pulses the stairs and the shrine. */
  update(world, frame, clock){
    const L = layoutOf(world);
    if(!L){if(this.meshes.length) this.dispose(); return;}
    if(L.key !== this.key) this.build(world);
    const fx = this.fx; if(!fx) return;
    const d = world.dungeon, open = d.phase === 'open', pulse = .5 + .5*Math.sin(clock*3.2);
    fx.rim.material.opacity = open ? .55 + .35*pulse : .16 + .06*pulse;
    fx.rim.scale.setScalar(open ? 1 + .04*pulse : 1);
    fx.halo.material.opacity = open ? .22 + .18*pulse : 0;
    fx.halo.rotation.z = clock*.6;
    if(fx.shrine){
      const used = !!d.shrine;
      fx.shrine.material.opacity = used ? .1 : .3 + .25*pulse + .4*(d.shrineT || 0);
      fx.shrine.scale.setScalar(1 - .12*(d.shrineT || 0)*(used ? 0 : 1));
    }
    // The descent: an arc that fills while the whole party stands in the stairs.
    const charge = open ? Math.round((d.portal || 0)*40)/40 : 0, key = `${L.key}:${charge}`;
    if(key !== this.chargeKey){
      this.chargeKey = key;
      if(fx.charge){this.scene.remove(fx.charge); fx.charge.geometry.dispose(); fx.charge.material.dispose(); this.meshes = this.meshes.filter(m => m !== fx.charge); fx.charge = null;}
      if(charge > 0){
        const m = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 56, 1, Math.PI/2, -Math.PI*2*charge), new THREE.MeshBasicMaterial({color: 0xfff1c8, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending}));
        m.rotation.x = -Math.PI/2; m.position.set(L.portal.x, .016, L.portal.z); fx.charge = this.add(m);
      }
    }
  }
}
