// Bot players. Each legal tile placement (and each follower choice on it) is
// simulated, then the resulting kingdom is valued for every player.
import { legalPlacements, simulate, cloneGame, followerOptions, find, majority, featureValue, placeTile } from './game.mjs';

export const LEVELS = {
  easy: { label: 'Easy', noise: 4, spread: 0.45, rivals: 'mean' },
  normal: { label: 'Steady', noise: 0.9, spread: 0, rivals: 'mean' },
  hard: { label: 'Cunning', noise: 0.15, spread: 0, rivals: 'max' },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Expected eventual points of an unfinished feature, given how much land is left to draw. */
export function potential(g, info, left) {
  const n = info.tiles.size, o = info.open;
  if (info.type === 'city') {
    const chance = clamp((0.97 - 0.2 * (o - 1)) * (0.3 + 0.7 * left), 0.04, 0.95);
    const grow = o * 0.7 * left;
    return chance * 2 * (n + info.shields + grow) + (1 - chance) * (n + info.shields + grow * 0.5);
  }
  if (info.type === 'road') return n + o * 0.6 * left + (o === 0 ? 0 : 0.2);
  if (info.type === 'monastery') {
    const k = featureValue(g, info, true);
    return k + (9 - k) * clamp(0.25 + 0.75 * left, 0, 0.9);
  }
  let value = 0;
  const seen = new Set();
  for (const c of info.cities) {
    const root = find(g, c);
    if (seen.has(root)) continue;
    seen.add(root);
    const town = g.info.get(root);
    value += town.open === 0 ? 3 : 3 * clamp((0.9 - 0.18 * (town.open - 1)) * (0.25 + 0.75 * left), 0.05, 0.85);
  }
  return value + left * 1.5;
}

/** Each player's worth: banked score + what their followers are likely to earn + followers in hand. */
export function appraise(g) {
  const left = clamp(g.deck.length / 71, 0, 1);
  const worth = g.players.map(p => p.score + p.followers * (0.4 + 2.4 * left) - (p.followers === 0 ? 3 * left : 0));
  for (const info of g.info.values()) {
    if (info.done || !info.followers.length) continue;
    if (info.type === 'field' && !g.meadows) continue;
    const value = potential(g, info, left);
    for (const p of majority(info.followers)) worth[p] += value;
  }
  return worth;
}

function judge(worth, me, rivals) {
  const others = worth.filter((_, i) => i !== me);
  if (!others.length) return worth[me];
  const rival = rivals === 'max' ? Math.max(...others) : others.reduce((a, b) => a + b, 0) / others.length;
  return worth[me] - rival * (rivals === 'max' ? 0.8 : 0.6);
}

export function rankMoves(g, level = 'normal', rng = Math.random) {
  const cfg = LEVELS[level] || LEVELS.normal;
  const me = g.current;
  const moves = [];
  for (const p of legalPlacements(g)) {
    const probe = cloneGame(g);
    placeTile(probe, p.x, p.y, p.rot);
    const choices = [null, ...followerOptions(probe).map(o => o.feature)];
    for (const feature of choices) {
      const after = simulate(g, { ...p, feature });
      const value = judge(appraise(after), me, cfg.rivals) + (rng() - 0.5) * cfg.noise;
      moves.push({ x: p.x, y: p.y, rot: p.rot, feature, value });
    }
  }
  moves.sort((a, b) => b.value - a.value);
  return moves;
}

export function chooseMove(g, level = 'normal', rng = Math.random) {
  const cfg = LEVELS[level] || LEVELS.normal;
  const moves = rankMoves(g, level, rng);
  if (!moves.length) return null;
  if (cfg.spread > 0) {
    const pool = moves.slice(0, Math.max(1, Math.ceil(moves.length * cfg.spread)));
    return pool[Math.floor(rng() * Math.min(pool.length, 6))];
  }
  return moves[0];
}
