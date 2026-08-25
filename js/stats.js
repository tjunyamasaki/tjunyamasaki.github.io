export const DEFAULT_STAT_KEYS = ["points", "lives", "coins"];

export const STAT_CAPS = {
  points: 99,
  lives: 99,
  coins: 999,
};

export function emptyPlayerStats() {
  return { points: 0, lives: 0, coins: 0 };
}

function syncAliases(player) {
  player.points = Number(player.stats.points) || 0;
  player.lives = Number(player.stats.lives) || 0;
  player.coins = Number(player.stats.coins) || 0;
}

export function ensurePlayerStats(player) {
  if (!player) return;
  const stats = {
    ...emptyPlayerStats(),
    ...(player.stats || {}),
  };
  if (!Number.isInteger(player.stats?.points) && Number.isInteger(player.points)) {
    stats.points = player.points;
  }
  if (!Number.isInteger(player.stats?.lives) && Number.isInteger(player.lives)) {
    stats.lives = player.lives;
  }
  if (!Number.isInteger(player.stats?.coins) && Number.isInteger(player.coins)) {
    stats.coins = player.coins;
  }
  player.stats = stats;
  syncAliases(player);
}

export function setPlayerStatValue(player, key, value) {
  ensurePlayerStats(player);
  const cap = STAT_CAPS[key] ?? 99;
  const next = Math.max(0, Math.min(cap, Math.floor(Number(value)) || 0));
  player.stats[key] = next;
  if (key in player.stats) player[key] = next;
  syncAliases(player);
}

export function snapshotPlayersStats(players) {
  const out = {};
  for (const id of Object.keys(players || {})) {
    ensurePlayerStats(players[id]);
    out[id] = { ...players[id].stats };
  }
  return out;
}

export function restorePlayersStats(players, snap) {
  if (!players || !snap) return;
  for (const id of Object.keys(players)) {
    const row = snap[id];
    if (!row) continue;
    players[id].stats = { ...emptyPlayerStats(), ...row };
    syncAliases(players[id]);
  }
}

export function tableStats(ts) {
  if (!ts.stats) ts.stats = { pot: Number(ts.pot) || 0 };
  if (!Number.isInteger(ts.stats.pot)) ts.stats.pot = Number(ts.pot) || 0;
  ts.pot = ts.stats.pot;
  return ts.stats;
}
