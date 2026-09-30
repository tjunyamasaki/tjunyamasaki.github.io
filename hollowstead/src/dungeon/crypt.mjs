// The Barrow Crypt: masonry chambers split by binary space partition, joined by straight
// three-wide passages with square bends. Large chambers get a colonnade of pillars.
import {SOLID, between, carveCorridor, carveRect, makeGrid, open, set} from './grid.mjs?v=harvest-18';

const MIN_LEAF = 13;

function split(rng, node, out){
  const {x, z, w, h} = node;
  const canW = w >= MIN_LEAF*2, canH = h >= MIN_LEAF*2;
  if(!canW && !canH){out.push(node); node.leaf = true; return node;}
  const vertical = canW && (!canH || (w > h ? rng() < .8 : rng() < .25));
  const len = vertical ? w : h, cut = between(rng, MIN_LEAF, len - MIN_LEAF);
  node.a = split(rng, vertical ? {x, z, w: cut, h} : {x, z, w, h: cut}, out);
  node.b = split(rng, vertical ? {x: x + cut, z, w: w - cut, h} : {x, z: z + cut, w, h: h - cut}, out);
  return node;
}
const roomsUnder = node => node.leaf ? [node.room] : [...roomsUnder(node.a), ...roomsUnder(node.b)];
const centre = r => ({i: Math.floor((r.x0 + r.x1)/2), j: Math.floor((r.z0 + r.z1)/2)});

export default Object.freeze({
  id: 'crypt',
  name: 'The Barrow Crypt',
  short: 'BARROW CRYPT',
  blurb: 'Stone chambers and straight passages under the barrow fields. Bonewalkers keep the dead company.',
  palette: {floor: '#645c6b', floorAlt: '#58515f', corridor: '#4c4654', wallTop: '#221e28', wall: '#50475a', rim: '#8a7f8c', accent: '#f2a65a', warden: '#6e4c52', treasure: '#6d6150', camp: '#66584f', shrine: '#56506e'},
  darkness: .6,
  torch: {key: 'fire', scale: .46, radius: 5.2},
  decor: [
    {key: 'grave', scale: .62, where: 'wall', weight: 3},
    {key: 'bones', scale: .5, where: 'free', walk: true, weight: 2},
    {key: 'rock-rune', scale: .5, where: 'wall', weight: 1},
  ],
  /** Weighted creatures for a chamber on this floor. */
  roster(depth){
    const list = [['crawler', 6], ['bonewalker', depth >= 2 ? 4 : 2]];
    if(depth >= 2) list.push(['wraith', 2.5]);
    if(depth >= 3) list.push(['brute', .5 + depth*.08]);
    if(depth >= 6) list.push(['golem', .4]);
    return list;
  },
  warden: () => 'brute',
  escort: () => ['bonewalker', 'bonewalker'],
  carve(rng, {depth}){
    const size = 56 + Math.min(18, (depth - 1)*2), g = makeGrid(size, size), leaves = [];
    const root = split(rng, {x: 1, z: 1, w: size - 2, h: size - 2}, leaves);
    for(const leaf of leaves){
      const rw = between(rng, 7, Math.min(leaf.w - 3, 16)), rh = between(rng, 6, Math.min(leaf.h - 3, 13));
      const x0 = leaf.x + between(rng, 1, leaf.w - rw - 2), z0 = leaf.z + between(rng, 1, leaf.h - rh - 2);
      leaf.room = {x0, z0, x1: x0 + rw - 1, z1: z0 + rh - 1};
      carveRect(g, leaf.room.x0, leaf.room.z0, leaf.room.x1, leaf.room.z1);
    }
    // Each split joins its two halves by their closest pair of chambers.
    const links = new Set();
    const join = (a, b) => {
      const key = [a, b].map(r => `${r.x0},${r.z0}`).sort().join('|'); if(links.has(key)) return; links.add(key);
      carveCorridor(g, centre(a), centre(b), 3, rng);
    };
    const connect = node => {
      if(node.leaf) return;
      connect(node.a); connect(node.b);
      let best = null, bestD = Infinity;
      for(const a of roomsUnder(node.a)) for(const b of roomsUnder(node.b)){
        const ca = centre(a), cb = centre(b), d = Math.abs(ca.i - cb.i) + Math.abs(ca.j - cb.j);
        if(d < bestD){bestD = d; best = [a, b];}
      }
      if(best) join(...best);
    };
    connect(root);
    // A few loops so a floor is not a pure tree: a second way round keeps a chase interesting.
    const rooms = leaves.map(leaf => leaf.room);
    for(let a = 0; a < rooms.length; a++) for(let b = a + 1; b < rooms.length; b++){
      const ca = centre(rooms[a]), cb = centre(rooms[b]);
      if(Math.abs(ca.i - cb.i) + Math.abs(ca.j - cb.j) < 24 && rng() < .18) join(rooms[a], rooms[b]);
    }
    // Colonnades in the big chambers: pillars on a four-cell lattice, never in the middle.
    for(const r of rooms){
      const w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
      if(w < 10 || h < 9 || rng() < .35) continue;
      const mi = (r.x0 + r.x1)/2, mj = (r.z0 + r.z1)/2;
      for(let j = r.z0 + 2; j <= r.z1 - 2; j += 4) for(let i = r.x0 + 2; i <= r.x1 - 2; i += 4){
        if(Math.abs(i - mi) < 2.5 && Math.abs(j - mj) < 2.5) continue;
        if(open(g, i, j)) set(g, i, j, SOLID);
      }
    }
    return {grid: g, rooms};
  },
});
