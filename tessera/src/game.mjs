// Rules engine. Pure and deterministic: the same seed and actions always
// rebuild the same kingdom, which is how saved games are restored.
import { TILE_TYPES, TYPE_BY_ID, START_TILE, DX, DY, edgeAt, featureAtPort, tileBag } from './tiles.mjs';
import { createRng, shuffle } from './rng.mjs';

export const FOLLOWERS = 7;
export const KINDS = ['city', 'road', 'monastery', 'field'];
const SLOT = 16;
const cellKey = (x, y) => `${x},${y}`;
const gid = (tile, feature) => tile * SLOT + feature;

export function createGame({ players, seed = (Math.random() * 2 ** 32) >>> 0, meadows = true }) {
  const g = {
    seed, meadows,
    players: players.map((p, id) => ({
      name: p.name, color: p.color, kind: p.kind || 'human', level: p.level || 'normal',
      id, score: 0, followers: FOLLOWERS, tally: { city: 0, road: 0, monastery: 0, field: 0 },
    })),
    deck: shuffle(tileBag(), createRng(seed)),
    board: new Map(), tiles: [], parent: new Map(), info: new Map(),
    current: 0, phase: 'tile', tile: -1, turn: 0, actions: [], last: -1,
  };
  addTile(g, 0, 0, 0, TYPE_BY_ID[START_TILE].index, -1);
  g.openingEvents = [];
  draw(g, g.openingEvents);
  return g;
}

/** Rebuild a game from its creation options and recorded actions. */
export function restoreGame(options, actions) {
  const g = createGame(options);
  for (const a of actions) {
    if (a.a === 'tile') placeTile(g, a.x, a.y, a.rot);
    else if (a.a === 'follower') placeFollower(g, a.f);
    else throw new Error('Unknown action');
  }
  return g;
}

export const tileAt = (g, x, y) => g.board.get(cellKey(x, y));
export const remaining = g => g.deck.length + (g.phase === 'tile' ? 1 : 0);

export function find(g, id) {
  let root = id;
  while (g.parent.get(root) !== root) root = g.parent.get(root);
  while (g.parent.get(id) !== root) { const next = g.parent.get(id); g.parent.set(id, root); id = next; }
  return root;
}

function union(g, a, b) {
  let ra = find(g, a), rb = find(g, b);
  if (ra === rb) return ra;
  let ia = g.info.get(ra), ib = g.info.get(rb);
  if (ib.tiles.size > ia.tiles.size) { [ra, rb] = [rb, ra]; [ia, ib] = [ib, ia]; }
  g.parent.set(rb, ra);
  for (const t of ib.tiles) ia.tiles.add(t);
  for (const c of ib.cities) ia.cities.add(c);
  ia.shields += ib.shields;
  ia.open += ib.open;
  ia.followers.push(...ib.followers);
  g.info.delete(rb);
  return ra;
}

function addTile(g, x, y, rot, typeIndex, player) {
  const type = TILE_TYPES[typeIndex];
  const index = g.tiles.length;
  const tile = { index, x, y, rot, type: typeIndex, player, followers: [] };
  g.tiles.push(tile);
  g.board.set(cellKey(x, y), tile);
  type.features.forEach((f, fi) => {
    const id = gid(index, fi);
    g.parent.set(id, id);
    g.info.set(id, {
      type: f.type, tiles: new Set([index]), shields: f.shield ? 1 : 0,
      open: f.sides.length, followers: [], done: false, at: index,
      cities: new Set((f.cities || []).map(c => gid(index, c))),
    });
  });
  for (let side = 0; side < 4; side++) {
    const other = tileAt(g, x + DX[side], y + DY[side]);
    if (!other) continue;
    const otherType = TILE_TYPES[other.type];
    for (let k = 0; k < 3; k++) {
      const a = featureAtPort(type, rot, side * 3 + k);
      const b = featureAtPort(otherType, other.rot, ((side + 2) % 4) * 3 + (2 - k));
      union(g, gid(index, a), gid(other.index, b));
    }
    const middle = featureAtPort(type, rot, side * 3 + 1);
    const kind = type.features[middle].type;
    if (kind === 'city' || kind === 'road') g.info.get(find(g, gid(index, middle))).open -= 2;
  }
  return tile;
}

export function fits(g, typeIndex, x, y, rot) {
  if (tileAt(g, x, y)) return false;
  const type = TILE_TYPES[typeIndex];
  let neighbours = 0;
  for (let side = 0; side < 4; side++) {
    const other = tileAt(g, x + DX[side], y + DY[side]);
    if (!other) continue;
    neighbours++;
    if (edgeAt(type, rot, side) !== edgeAt(TILE_TYPES[other.type], other.rot, (side + 2) % 4)) return false;
  }
  return neighbours > 0;
}

/** Empty cells that touch the kingdom. */
export function frontier(g) {
  const seen = new Set(), cells = [];
  for (const t of g.tiles) {
    for (let side = 0; side < 4; side++) {
      const x = t.x + DX[side], y = t.y + DY[side], k = cellKey(x, y);
      if (seen.has(k) || g.board.has(k)) continue;
      seen.add(k); cells.push([x, y]);
    }
  }
  return cells;
}

export function legalPlacements(g, typeIndex = g.tile) {
  const out = [];
  const type = TILE_TYPES[typeIndex];
  // Symmetric tiles (abbey, crossroads, straight road…) repeat under rotation;
  // every base tile whose edges repeat is truly symmetric, so offer each look once.
  const looks = new Set();
  for (const [x, y] of frontier(g)) {
    looks.clear();
    for (let rot = 0; rot < 4; rot++) {
      const look = [0, 1, 2, 3].map(s => edgeAt(type, rot, s)).join('');
      if (looks.has(look)) continue;
      if (fits(g, typeIndex, x, y, rot)) { looks.add(look); out.push({ x, y, rot }); }
    }
  }
  return out;
}

export function placeTile(g, x, y, rot) {
  if (g.phase !== 'tile') throw new Error('Not time to place a tile');
  if (!fits(g, g.tile, x, y, rot)) throw new Error('That tile does not fit there');
  const tile = addTile(g, x, y, rot, g.tile, g.current);
  g.last = tile.index;
  g.phase = 'follower';
  g.actions.push({ a: 'tile', x, y, rot });
  return tile;
}

/** Features on the newly placed tile that may take a follower right now. */
export function followerOptions(g) {
  if (g.phase !== 'follower' || g.players[g.current].followers <= 0) return [];
  const tile = g.tiles[g.last];
  const type = TILE_TYPES[tile.type];
  const out = [];
  type.features.forEach((f, fi) => {
    if (f.type === 'field' && !g.meadows) return;
    const info = g.info.get(find(g, gid(tile.index, fi)));
    if (info.followers.length === 0) out.push({ feature: fi, type: f.type, anchor: f.anchor });
  });
  return out;
}

/** Place a follower (feature index) or pass with null; then score and move on. */
export function placeFollower(g, feature) {
  if (g.phase !== 'follower') throw new Error('Not time to place a follower');
  const player = g.players[g.current];
  const tile = g.tiles[g.last];
  if (feature != null) {
    if (!followerOptions(g).some(o => o.feature === feature)) throw new Error('No room for a follower there');
    const follower = { player: player.id, tile: tile.index, feature };
    g.info.get(find(g, gid(tile.index, feature))).followers.push(follower);
    tile.followers.push(follower);
    player.followers--;
  }
  g.actions.push({ a: 'follower', f: feature });
  const events = scorePlacement(g, tile);
  g.turn++;
  g.current = (g.current + 1) % g.players.length;
  draw(g, events);
  return events;
}

function draw(g, events) {
  while (g.deck.length) {
    const t = g.deck.pop();
    if (legalPlacements(g, t).length) {
      g.tile = t; g.phase = 'tile';
      events.push({ kind: 'draw', type: t, player: g.current });
      return;
    }
    events.push({ kind: 'discard', type: t });
  }
  g.tile = -1;
  finalScoring(g, events);
}

function monasteryCount(g, tile) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(g, tile.x + dx, tile.y + dy)) n++;
  return n;
}

export function featureValue(g, info, final) {
  if (info.type === 'city') return (info.tiles.size + info.shields) * (final ? 1 : 2);
  if (info.type === 'road') return info.tiles.size;
  if (info.type === 'monastery') return monasteryCount(g, g.tiles[info.at]);
  const towns = new Set();
  for (const c of info.cities) {
    const town = g.info.get(find(g, c));
    if (town.open === 0) towns.add(find(g, c));
  }
  return towns.size * 3;
}

export function majority(followers) {
  const counts = new Map();
  for (const f of followers) counts.set(f.player, (counts.get(f.player) || 0) + 1);
  const best = Math.max(0, ...counts.values());
  return [...counts].filter(([, n]) => n === best && n > 0).map(([p]) => p).sort((a, b) => a - b);
}

function award(g, root, info, final) {
  const points = featureValue(g, info, final);
  const winners = majority(info.followers);
  for (const p of winners) {
    g.players[p].score += points;
    g.players[p].tally[info.type] += points;
  }
  const event = {
    kind: 'score', feature: info.type, root, points, winners, final,
    tiles: [...info.tiles], followers: info.followers.slice(),
  };
  if (!final) {
    info.done = true;
    info.winners = winners;
    for (const f of info.followers) {
      g.players[f.player].followers++;
      const t = g.tiles[f.tile];
      t.followers = t.followers.filter(x => x !== f);
    }
    info.followers = [];
  }
  return event;
}

function scorePlacement(g, tile) {
  const events = [];
  const roots = new Set();
  TILE_TYPES[tile.type].features.forEach((f, fi) => {
    if (f.type === 'city' || f.type === 'road') roots.add(find(g, gid(tile.index, fi)));
  });
  for (const root of roots) {
    const info = g.info.get(root);
    if (info.open === 0 && !info.done) events.push(award(g, root, info, false));
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(g, tile.x + dx, tile.y + dy);
      if (!t) continue;
      const type = TILE_TYPES[t.type];
      if (type.monasteryFeature < 0) continue;
      const root = find(g, gid(t.index, type.monasteryFeature));
      const info = g.info.get(root);
      if (!info.done && monasteryCount(g, t) === 9) events.push(award(g, root, info, false));
    }
  }
  return events;
}

function finalScoring(g, events) {
  for (const kind of KINDS) {
    if (kind === 'field' && !g.meadows) continue;
    for (const [root, info] of g.info) {
      if (info.type !== kind || info.done || !info.followers.length) continue;
      events.push(award(g, root, info, true));
    }
  }
  g.phase = 'over';
  events.push({ kind: 'over', standings: standings(g) });
}

export function standings(g) {
  return g.players.slice().sort((a, b) => b.score - a.score || a.id - b.id).map(p => ({ id: p.id, score: p.score }));
}

/** Projected final-scoring points for each player if the game ended now. */
export function projectedFinal(g) {
  const extra = g.players.map(() => 0);
  for (const info of g.info.values()) {
    if (info.done || !info.followers.length) continue;
    if (info.type === 'field' && !g.meadows) continue;
    const points = featureValue(g, info, true);
    for (const p of majority(info.followers)) extra[p] += points;
  }
  return extra;
}

export function featureOf(g, tileIndex, feature) {
  const root = find(g, gid(tileIndex, feature));
  return { root, info: g.info.get(root) };
}

/** A cheap copy for look-ahead: everything placement and scoring touch. */
export function cloneGame(g) {
  const c = {
    ...g,
    players: g.players.map(p => ({ ...p, tally: { ...p.tally } })),
    deck: g.deck.slice(), actions: [],
    tiles: g.tiles.map(t => ({ ...t, followers: t.followers.slice() })),
    parent: new Map(g.parent), info: new Map(),
  };
  c.board = new Map();
  for (const t of c.tiles) c.board.set(cellKey(t.x, t.y), t);
  for (const [k, v] of g.info) {
    c.info.set(k, { ...v, tiles: new Set(v.tiles), cities: new Set(v.cities), followers: v.followers.slice() });
  }
  return c;
}

/** Apply a move to a clone without drawing the next tile (used by the bots). */
export function simulate(g, move) {
  const c = cloneGame(g);
  const tile = addTile(c, move.x, move.y, move.rot, c.tile, c.current);
  c.last = tile.index;
  if (move.feature != null) {
    const follower = { player: c.current, tile: tile.index, feature: move.feature };
    c.info.get(find(c, gid(tile.index, move.feature))).followers.push(follower);
    tile.followers.push(follower);
    c.players[c.current].followers--;
  }
  c.events = scorePlacement(c, tile);
  c.phase = 'sim';
  return c;
}

export { gid, cellKey };
