// The Rootwarren: organic caves. Round chambers with ragged edges, joined by winding tunnels,
// smoothed like eroded rock. Glowcaps and moonshard crystals light the way.
import {DIRS8, SOLID, between, carve, carveTunnel, makeGrid, roomy, set, smooth} from './grid.mjs?v=harvest-18';

function blob(g, rng, cx, cz, r){
  // A ragged disc: the radius wobbles with three low harmonics so no two chambers match.
  const waves = [0, 1, 2].map(k => ({f: 2 + k*2 + Math.floor(rng()*2), p: rng()*Math.PI*2, a: .16/(k + 1)}));
  const cells = [];
  for(let j = Math.floor(cz - r*1.5); j <= Math.ceil(cz + r*1.5); j++) for(let i = Math.floor(cx - r*1.5); i <= Math.ceil(cx + r*1.5); i++){
    const dx = i + .5 - cx, dz = j + .5 - cz, a = Math.atan2(dz, dx);
    let edge = r;
    for(const w of waves) edge += r*w.a*Math.sin(a*w.f + w.p);
    if(Math.hypot(dx, dz) <= edge && i > 1 && j > 1 && i < g.w - 2 && j < g.h - 2){carve(g, i, j); cells.push(i + j*g.w);}
  }
  return cells;
}

export default Object.freeze({
  id: 'caverns',
  name: 'The Rootwarren',
  short: 'ROOTWARREN',
  blurb: 'Winding caves under the mire, lit by glowcaps. Boglings nest in the wet chambers.',
  palette: {floor: '#56624f', floorAlt: '#4a5645', corridor: '#454f42', wallTop: '#1a201c', wall: '#3b4a3d', rim: '#7d8f78', accent: '#9fd8a8', warden: '#5c4a4a', treasure: '#65604a', camp: '#5e5a48', shrine: '#4d5669'},
  darkness: .66,
  torch: {key: 'glowcap', scale: .5, radius: 4.6},
  decor: [
    {key: 'shardrock', scale: .42, where: 'wall', light: 3.4, weight: 2},
    {key: 'mushroom', scale: .55, where: 'free', walk: true, weight: 3},
    {key: 'rock', scale: .4, where: 'free', weight: 2},
  ],
  roster(depth){
    const list = [['crawler', 6], ['bogling', depth >= 2 ? 3 : 1.5]];
    if(depth >= 2) list.push(['wraith', 1.5], ['bonewalker', 1.5]);
    if(depth >= 3) list.push(['golem', .4 + depth*.06]);
    if(depth >= 5) list.push(['brute', .5]);
    return list;
  },
  warden: depth => depth >= 3 ? 'golem' : 'brute',
  escort: () => ['bogling', 'bogling', 'crawler'],
  carve(rng, {depth}){
    const size = 66 + Math.min(18, (depth - 1)*3), g = makeGrid(size, size);
    const want = 7 + Math.min(4, Math.floor(depth/2)), centres = [];
    for(let tries = 0; centres.length < want && tries < 900; tries++){
      const x = between(rng, 9, size - 10), z = between(rng, 9, size - 10), r = 4.6 + rng()*3.6;
      if(centres.every(c => Math.hypot(c.x - x, c.z - z) > c.r + r + 6)) centres.push({x, z, r});
    }
    const rooms = centres.map(c => ({cells: blob(g, rng, c.x, c.z, c.r)}));
    // Minimum spanning tree over the chambers, then an extra tunnel or two for loops.
    const inTree = [0], edges = [];
    while(inTree.length < centres.length){
      let best = null;
      for(const a of inTree) for(let b = 0; b < centres.length; b++){
        if(inTree.includes(b)) continue;
        const d = Math.hypot(centres[a].x - centres[b].x, centres[a].z - centres[b].z);
        if(!best || d < best.d) best = {a, b, d};
      }
      inTree.push(best.b); edges.push([best.a, best.b]);
    }
    for(let extra = 0; extra < 1 + Math.floor(rng()*2); extra++){
      const a = Math.floor(rng()*centres.length), b = Math.floor(rng()*centres.length);
      if(a !== b && Math.hypot(centres[a].x - centres[b].x, centres[a].z - centres[b].z) < 34) edges.push([a, b]);
    }
    for(const [a, b] of edges){
      const A = centres[a], B = centres[b];
      carveTunnel(g, {i: Math.floor(A.x), j: Math.floor(A.z)}, {i: Math.floor(B.x), j: Math.floor(B.z)}, 1.55 + rng()*.35, rng);
    }
    smooth(g, 2, 'open');
    // Boulders: a few solid lumps inside the bigger chambers (cover from spit and spores).
    for(const room of rooms){
      if(room.cells.length < 110) continue;
      for(let n = 0; n < 1 + Math.floor(rng()*2); n++){
        const k = room.cells[Math.floor(rng()*room.cells.length)], i = k % g.w, j = (k - i)/g.w;
        if(!roomy(g, i, j, 3)) continue;
        // Chosen before any is set, so the lump never seals a gap (the 5x5 round it is open).
        const lump = [[0, 0], ...DIRS8.filter(() => rng() < .3)];
        for(const [di, dj] of lump) set(g, i + di, j + dj, SOLID);
      }
    }
    for(const room of rooms) room.cells = room.cells.filter(k => g.cells[k] !== 0);
    return {grid: g, rooms};
  },
});
