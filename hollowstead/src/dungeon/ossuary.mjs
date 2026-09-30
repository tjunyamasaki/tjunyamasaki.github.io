// The Moonlit Ossuary: a lattice of great square halls with colonnades, joined by short, wide
// doorways. Open sight lines and pillars to fight round; some halls have fallen in.
import {SOLID, between, carveRect, makeGrid, open, set, shuffle} from './grid.mjs?v=harvest-18';

export default Object.freeze({
  id: 'ossuary',
  name: 'The Moonlit Ossuary',
  short: 'MOONLIT OSSUARY',
  blurb: 'Great pillared halls stacked with the hollow’s bones. Wide open, and nowhere to hide from the wraiths.',
  palette: {floor: '#605f77', floorAlt: '#56556c', corridor: '#4d4c63', wallTop: '#1e1d31', wall: '#443f5f', rim: '#9d9bc0', accent: '#bfe0ff', warden: '#664e63', treasure: '#6a6356', camp: '#5f5a5c', shrine: '#4f5a78'},
  darkness: .56,
  torch: {key: 'gravewisp', scale: .62, radius: 5.4},
  decor: [
    {key: 'plaza-prop', scale: .8, where: 'wall', weight: 3},
    {key: 'bones', scale: .5, where: 'free', walk: true, weight: 2},
    {key: 'grave', scale: .6, where: 'wall', weight: 1},
  ],
  roster(depth){
    const list = [['crawler', 4], ['bonewalker', depth >= 2 ? 4 : 2], ['wraith', depth >= 2 ? 3 : 1.5]];
    if(depth >= 2) list.push(['bogling', 1.5]);
    if(depth >= 3) list.push(['brute', .45 + depth*.05]);
    if(depth >= 4) list.push(['golem', .35 + depth*.04]);
    return list;
  },
  warden: depth => depth >= 4 ? 'golem' : 'brute',
  escort: () => ['wraith', 'wraith', 'bonewalker'],
  carve(rng, {depth}){
    const cols = 3 + (depth >= 4 ? 1 : 0), rows = 3 + (depth >= 8 ? 1 : 0), pitch = 18;
    const size = Math.max(cols, rows)*pitch + 8, g = makeGrid(size, size);
    const ox = Math.floor((size - cols*pitch)/2), oz = Math.floor((size - rows*pitch)/2);
    // A few lattice spots have fallen in; the rest stand. Keep at least six halls.
    const spots = [];
    for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++) spots.push({c, r});
    const fallen = new Set(shuffle(rng, spots.slice()).slice(0, Math.max(0, Math.min(spots.length - 6, between(rng, 1, 2)))).map(s => `${s.c},${s.r}`));
    const halls = new Map();
    for(const s of spots){
      if(fallen.has(`${s.c},${s.r}`)) continue;
      const w = between(rng, 10, 14), h = between(rng, 9, 13);
      const x0 = ox + s.c*pitch + Math.floor((pitch - w)/2) + between(rng, -1, 1), z0 = oz + s.r*pitch + Math.floor((pitch - h)/2) + between(rng, -1, 1);
      const hall = {x0, z0, x1: x0 + w - 1, z1: z0 + h - 1, c: s.c, r: s.r};
      carveRect(g, hall.x0, hall.z0, hall.x1, hall.z1); halls.set(`${s.c},${s.r}`, hall);
    }
    // Doorways: a random spanning tree over neighbouring halls, then some extra doors for loops.
    const list = [...halls.values()], linked = new Set([list[0]]), doors = [];
    const neighbours = h => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => halls.get(`${h.c + dc},${h.r + dr}`)).filter(Boolean);
    const frontier = () => [...linked].flatMap(a => neighbours(a).filter(b => !linked.has(b)).map(b => [a, b]));
    for(let edges = frontier(); edges.length; edges = frontier()){const [a, b] = edges[Math.floor(rng()*edges.length)]; linked.add(b); doors.push([a, b]);}
    for(const a of list) for(const b of neighbours(a)) if(a.c + a.r < b.c + b.r && rng() < .3 && !doors.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) doors.push([a, b]);
    // A hall cut off by fallen neighbours rejoins through a longer gallery.
    for(const a of list) if(!linked.has(a)){
      const b = [...linked].sort((p, q) => Math.hypot(p.c - a.c, p.r - a.r) - Math.hypot(q.c - a.c, q.r - a.r))[0];
      if(b){doors.push([a, b]); linked.add(a);}
    }
    for(const [a, b] of doors){
      const width = between(rng, 3, 5), half = Math.floor(width/2);
      const acx = Math.floor((a.x0 + a.x1)/2), acz = Math.floor((a.z0 + a.z1)/2), bcx = Math.floor((b.x0 + b.x1)/2), bcz = Math.floor((b.z0 + b.z1)/2);
      if(a.r === b.r){const z = Math.floor((acz + bcz)/2); carveRect(g, Math.min(acx, bcx), z - half, Math.max(acx, bcx), z - half + width - 1);}
      else if(a.c === b.c){const x = Math.floor((acx + bcx)/2); carveRect(g, x - half, Math.min(acz, bcz), x - half + width - 1, Math.max(acz, bcz));}
      else{carveRect(g, Math.min(acx, bcx), acz - 1, Math.max(acx, bcx), acz + 1); carveRect(g, bcx - 1, Math.min(acz, bcz), bcx + 1, Math.max(acz, bcz));}
    }
    // Colonnades: two rows of pillars along the long side of each hall, two cells in from the wall.
    for(const hall of list){
      const w = hall.x1 - hall.x0 + 1, h = hall.z1 - hall.z0 + 1, along = w >= h;
      if(rng() < .2) continue;
      if(along){for(const j of [hall.z0 + 2, hall.z1 - 2]) for(let i = hall.x0 + 2; i <= hall.x1 - 2; i += 3) if(open(g, i, j)) set(g, i, j, SOLID);}
      else{for(const i of [hall.x0 + 2, hall.x1 - 2]) for(let j = hall.z0 + 2; j <= hall.z1 - 2; j += 3) if(open(g, i, j)) set(g, i, j, SOLID);}
    }
    return {grid: g, rooms: list.map(({x0, z0, x1, z1}) => ({x0, z0, x1, z1}))};
  },
});
