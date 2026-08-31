export const HOST_ID = "host";
export const MAX_PLAYERS = 15;
export const MAX_GROUPS = 12;
export const MAX_ROSTER = 24;
export const MAX_NAME = 24;
export const MAX_SETS = 99;
export const EDITOR_NAMES = ["admjun", "admyasmin", "admlaio", "admgui"];

const EDITOR_SET = new Set(EDITOR_NAMES);

export function isEditorName(name) {
  return EDITOR_SET.has(normalizeName(name).toLowerCase());
}

export function canEditBoard(game, playerId) {
  if (playerId === HOST_ID) return true;
  return isEditorName(game.players[playerId]?.name);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nid(prefix) {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${rand.slice(0, 8)}`;
}

function bump(game) {
  game.seq = (game.seq || 0) + 1;
}

export function normalizeName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function parseSets(value) {
  if (typeof value === "string" && value.trim() === "") return NaN;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_SETS) return NaN;
  return n;
}

function makeWatcher(name, { isHost = false } = {}) {
  return {
    name: normalizeName(name) || "Player",
    isHost: Boolean(isHost),
    connected: true,
  };
}

function defaultGroup() {
  return { id: "g1", name: "Group A" };
}

function nextGroupName(game) {
  const used = new Set(game.groups.map((g) => g.name.toLowerCase()));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of letters) {
    const name = `Group ${ch}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Group ${game.groups.length + 1}`;
}

export function createGame(hostName) {
  const group = defaultGroup();
  return {
    phase: "lobby",
    players: {
      [HOST_ID]: makeWatcher(hostName || "Host", { isHost: true }),
    },
    playerOrder: [HOST_ID],
    groups: [group],
    roster: [],
    matches: [],
    message: "Add players or record a result.",
    seq: 0,
  };
}

export function canAdmit(game, playerId) {
  if (game.players[playerId]) return true;
  return game.playerOrder.length < MAX_PLAYERS;
}

export function addPlayer(game, playerId, name) {
  if (game.players[playerId]) {
    reconnectPlayer(game, playerId, name);
    return true;
  }
  if (!canAdmit(game, playerId)) return false;
  game.players[playerId] = makeWatcher(name);
  game.playerOrder.push(playerId);
  bump(game);
  return true;
}

export function reconnectPlayer(game, playerId, name) {
  const p = game.players[playerId];
  if (!p) return false;
  p.connected = true;
  if (name) p.name = normalizeName(name) || p.name;
  bump(game);
  return true;
}

export function setConnected(game, playerId, connected) {
  const p = game.players[playerId];
  if (!p || playerId === HOST_ID) return;
  p.connected = Boolean(connected);
  bump(game);
}

export function markGuestsDisconnected(game) {
  for (const id of game.playerOrder) {
    if (id !== HOST_ID && game.players[id]) {
      game.players[id].connected = false;
    }
  }
}

export function leaveSeat(game, playerId) {
  if (!playerId || playerId === HOST_ID) return;
  if (!game.players[playerId]) return;
  delete game.players[playerId];
  game.playerOrder = game.playerOrder.filter((id) => id !== playerId);
  bump(game);
}

function groupById(game, groupId) {
  return game.groups.find((g) => g.id === groupId) || null;
}

function rosterInGroup(game, groupId) {
  return game.roster.filter((p) => p.groupId === groupId);
}

export function findRosterByName(game, name, groupId) {
  const key = normalizeName(name).toLowerCase();
  if (!key) return null;
  if (groupId) {
    const local = game.roster.find(
      (p) => p.groupId === groupId && p.name.toLowerCase() === key
    );
    if (local) return local;
  }
  return game.roster.find((p) => p.name.toLowerCase() === key) || null;
}

export function findMatchBetween(game, aId, bId) {
  return (
    game.matches.find(
      (m) =>
        (m.aId === aId && m.bId === bId) || (m.aId === bId && m.bId === aId)
    ) || null
  );
}

function setsFor(match, playerId) {
  if (match.aId === playerId) return match.aSets;
  if (match.bId === playerId) return match.bSets;
  return null;
}

function opponentId(match, playerId) {
  if (match.aId === playerId) return match.bId;
  if (match.bId === playerId) return match.aId;
  return null;
}

function ensurePlayer(game, name, groupId) {
  const existing = findRosterByName(game, name, groupId);
  if (existing) return { player: existing };
  const label = normalizeName(name);
  if (!label) return { error: "Player name is required." };
  const taken = findRosterByName(game, label);
  if (taken && taken.groupId !== groupId) {
    const g = groupById(game, taken.groupId);
    return { error: `${taken.name} is already in ${g?.name || "another group"}.` };
  }
  if (taken) return { player: taken };
  const group = groupById(game, groupId);
  if (!group) return { error: "Unknown group." };
  if (rosterInGroup(game, groupId).length >= MAX_ROSTER) {
    return { error: `This group is full (${MAX_ROSTER} players).` };
  }
  const player = { id: nid("p"), name: label, groupId };
  game.roster.push(player);
  return { player, created: true };
}

function hostOnly(game, playerId) {
  if (canEditBoard(game, playerId)) return null;
  return { error: "Only an admin can edit the board." };
}

function addGroup(game, name) {
  if (game.groups.length >= MAX_GROUPS) {
    return { error: `At most ${MAX_GROUPS} groups.` };
  }
  const label = normalizeName(name) || nextGroupName(game);
  const clash = game.groups.some((g) => g.name.toLowerCase() === label.toLowerCase());
  if (clash) return { error: "That group name is already used." };
  const group = { id: nid("g"), name: label };
  game.groups.push(group);
  bump(game);
  game.message = `${group.name} added.`;
  return { groupId: group.id };
}

function renameGroup(game, groupId, name) {
  const group = groupById(game, groupId);
  if (!group) return { error: "Unknown group." };
  const label = normalizeName(name);
  if (!label) return { error: "Group name is required." };
  const clash = game.groups.some(
    (g) => g.id !== groupId && g.name.toLowerCase() === label.toLowerCase()
  );
  if (clash) return { error: "That group name is already used." };
  group.name = label;
  bump(game);
  game.message = `Group renamed to ${label}.`;
  return {};
}

function removeGroup(game, groupId) {
  if (game.groups.length <= 1) return { error: "Keep at least one group." };
  const group = groupById(game, groupId);
  if (!group) return { error: "Unknown group." };
  const ids = new Set(rosterInGroup(game, groupId).map((p) => p.id));
  game.groups = game.groups.filter((g) => g.id !== groupId);
  game.roster = game.roster.filter((p) => p.groupId !== groupId);
  game.matches = game.matches.filter((m) => !ids.has(m.aId) && !ids.has(m.bId));
  bump(game);
  game.message = `${group.name} removed.`;
  return {};
}

function addRoster(game, name, groupId) {
  const group = groupById(game, groupId) || game.groups[0];
  if (!group) return { error: "Unknown group." };
  const result = ensurePlayer(game, name, group.id);
  if (result.error) return result;
  if (!result.created) return { error: `${result.player.name} is already on the board.` };
  bump(game);
  game.message = `${result.player.name} added to ${group.name}.`;
  return { playerId: result.player.id };
}

function renameRoster(game, playerId, name) {
  const player = game.roster.find((p) => p.id === playerId);
  if (!player) return { error: "Unknown player." };
  const label = normalizeName(name);
  if (!label) return { error: "Player name is required." };
  const clash = game.roster.find(
    (p) => p.id !== playerId && p.name.toLowerCase() === label.toLowerCase()
  );
  if (clash) return { error: `${clash.name} is already on the board.` };
  player.name = label;
  bump(game);
  game.message = `Renamed to ${label}.`;
  return {};
}

function removeRoster(game, playerId) {
  const player = game.roster.find((p) => p.id === playerId);
  if (!player) return { error: "Unknown player." };
  game.roster = game.roster.filter((p) => p.id !== playerId);
  game.matches = game.matches.filter((m) => m.aId !== playerId && m.bId !== playerId);
  bump(game);
  game.message = `${player.name} removed.`;
  return {};
}

function resolveGroupForMatch(game, aPlayer, bPlayer, requested) {
  if (aPlayer && bPlayer && aPlayer.groupId !== bPlayer.groupId) {
    return { error: "Those players are in different groups." };
  }
  if (aPlayer) return { groupId: aPlayer.groupId };
  if (bPlayer) return { groupId: bPlayer.groupId };
  if (requested && groupById(game, requested)) return { groupId: requested };
  return { groupId: game.groups[0].id };
}

function saveMatch(game, { aName, bName, aSets, bSets, groupId, matchId }) {
  const aLabel = normalizeName(aName);
  const bLabel = normalizeName(bName);
  if (!aLabel || !bLabel) return { error: "Both player names are required." };
  if (aLabel.toLowerCase() === bLabel.toLowerCase()) {
    return { error: "A player cannot play themselves." };
  }
  const aCount = parseSets(aSets);
  const bCount = parseSets(bSets);
  if (Number.isNaN(aCount) || Number.isNaN(bCount)) {
    return { error: `Sets must be whole numbers 0–${MAX_SETS}.` };
  }

  let existing = matchId ? game.matches.find((m) => m.id === matchId) : null;
  if (matchId && !existing) return { error: "Unknown match." };

  const groupGuess = resolveGroupForMatch(
    game,
    findRosterByName(game, aLabel),
    findRosterByName(game, bLabel),
    existing?.groupId || groupId
  );
  if (groupGuess.error) return groupGuess;

  const slotsNeeded =
    (findRosterByName(game, aLabel, groupGuess.groupId) ? 0 : 1) +
    (findRosterByName(game, bLabel, groupGuess.groupId) ? 0 : 1);
  if (rosterInGroup(game, groupGuess.groupId).length + slotsNeeded > MAX_ROSTER) {
    return { error: `This group is full (${MAX_ROSTER} players).` };
  }

  const aRes = ensurePlayer(game, aLabel, groupGuess.groupId);
  if (aRes.error) return aRes;
  const bRes = ensurePlayer(game, bLabel, groupGuess.groupId);
  if (bRes.error) return bRes;

  const a = aRes.player;
  const b = bRes.player;
  if (a.groupId !== b.groupId) {
    return { error: "Those players are in different groups." };
  }

  const other = findMatchBetween(game, a.id, b.id);
  if (other && existing && other.id !== existing.id) {
    return { error: "That pair already has a result. Edit that match instead." };
  }
  if (other && (!existing || other.id !== existing.id)) {
    existing = other;
  }

  if (existing) {
    existing.aId = a.id;
    existing.bId = b.id;
    existing.aSets = aCount;
    existing.bSets = bCount;
    existing.groupId = a.groupId;
    bump(game);
    game.message = `Updated ${a.name} ${aCount}–${bCount} ${b.name}.`;
    return { matchId: existing.id };
  }

  const match = {
    id: nid("m"),
    groupId: a.groupId,
    aId: a.id,
    bId: b.id,
    aSets: aCount,
    bSets: bCount,
  };
  game.matches.push(match);
  bump(game);
  game.message = `${a.name} ${aCount}–${bCount} ${b.name}.`;
  return { matchId: match.id };
}

function deleteMatch(game, matchId) {
  const match = game.matches.find((m) => m.id === matchId);
  if (!match) return { error: "Unknown match." };
  game.matches = game.matches.filter((m) => m.id !== matchId);
  bump(game);
  game.message = "Match removed.";
  return {};
}

export function applyAction(game, playerId, intent) {
  const action = intent?.action;
  if (action === "leaveSeat") {
    leaveSeat(game, playerId);
    return {};
  }

  const denied = hostOnly(game, playerId);
  if (denied) return denied;

  if (action === "addGroup") return addGroup(game, intent.name);
  if (action === "renameGroup") return renameGroup(game, intent.groupId, intent.name);
  if (action === "removeGroup") return removeGroup(game, intent.groupId);
  if (action === "addRoster") return addRoster(game, intent.name, intent.groupId);
  if (action === "renameRoster") return renameRoster(game, intent.playerId, intent.name);
  if (action === "removeRoster") return removeRoster(game, intent.playerId);
  if (action === "recordMatch" || action === "editMatch") {
    return saveMatch(game, {
      aName: intent.aName,
      bName: intent.bName,
      aSets: intent.aSets,
      bSets: intent.bSets,
      groupId: intent.groupId,
      matchId: action === "editMatch" ? intent.matchId : intent.matchId || null,
    });
  }
  if (action === "deleteMatch") return deleteMatch(game, intent.matchId);
  if (action === "loadBoard") {
    if (playerId !== HOST_ID) return { error: "Only the host can load a saved board." };
    return loadSavedBoard(game, intent);
  }
  return { error: "Unknown action." };
}

function uniqueById(items, cap) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

export function loadSavedBoard(game, intent) {
  const source = intent?.game || intent;
  if (!source || typeof source !== "object") {
    return { error: "No saved board." };
  }

  const groups = uniqueById(
    (Array.isArray(source.groups) ? source.groups : [])
      .map((group) => {
        const id = String(group?.id || "").slice(0, 40);
        const name = normalizeName(group?.name);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter(Boolean),
    MAX_GROUPS
  );
  if (!groups.length) return { error: "Saved board has no groups." };
  const groupIds = new Set(groups.map((g) => g.id));

  const roster = uniqueById(
    (Array.isArray(source.roster) ? source.roster : [])
      .map((player) => {
        const id = String(player?.id || "").slice(0, 40);
        const name = normalizeName(player?.name);
        const groupId = String(player?.groupId || "");
        if (!id || !name || !groupIds.has(groupId)) return null;
        return { id, name, groupId };
      })
      .filter(Boolean),
    MAX_GROUPS * MAX_ROSTER
  );
  const byGroup = new Map(groups.map((g) => [g.id, 0]));
  const cappedRoster = [];
  for (const player of roster) {
    const used = byGroup.get(player.groupId) || 0;
    if (used >= MAX_ROSTER) continue;
    byGroup.set(player.groupId, used + 1);
    cappedRoster.push(player);
  }
  const playerIds = new Set(cappedRoster.map((p) => p.id));

  const matches = uniqueById(
    (Array.isArray(source.matches) ? source.matches : [])
      .map((match) => {
        const id = String(match?.id || "").slice(0, 40);
        const aId = String(match?.aId || "");
        const bId = String(match?.bId || "");
        const groupId = String(match?.groupId || "");
        const aSets = parseSets(match?.aSets);
        const bSets = parseSets(match?.bSets);
        if (!id || aId === bId || !playerIds.has(aId) || !playerIds.has(bId)) return null;
        if (!groupIds.has(groupId) || Number.isNaN(aSets) || Number.isNaN(bSets)) return null;
        const a = cappedRoster.find((p) => p.id === aId);
        const b = cappedRoster.find((p) => p.id === bId);
        if (!a || !b || a.groupId !== b.groupId || a.groupId !== groupId) return null;
        return { id, groupId, aId, bId, aSets, bSets };
      })
      .filter(Boolean),
    MAX_GROUPS * ((MAX_ROSTER * (MAX_ROSTER - 1)) / 2)
  );
  const pairSeen = new Set();
  const uniqueMatches = [];
  for (const match of matches) {
    const pair = match.aId < match.bId ? `${match.aId}:${match.bId}` : `${match.bId}:${match.aId}`;
    if (pairSeen.has(pair)) continue;
    pairSeen.add(pair);
    uniqueMatches.push(match);
  }

  game.groups = groups;
  game.roster = cappedRoster;
  game.matches = uniqueMatches;
  game.phase = "lobby";
  bump(game);
  const n = uniqueMatches.length;
  game.message = n
    ? `Loaded ${n} ${n === 1 ? "match" : "matches"} from a saved board.`
    : "Loaded a saved board.";
  return {};
}

function emptyStats(player) {
  return {
    id: player.id,
    name: player.name,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    setsFor: 0,
    setsAgainst: 0,
    setDiff: 0,
    remaining: 0,
  };
}

function compareRank(a, b, game) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
  if (b.setsFor !== a.setsFor) return b.setsFor - a.setsFor;
  if (a.losses !== b.losses) return a.losses - b.losses;
  const h2h = findMatchBetween(game, a.id, b.id);
  if (h2h) {
    const aSets = setsFor(h2h, a.id);
    const bSets = setsFor(h2h, b.id);
    if (aSets !== bSets) return bSets - aSets;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function buildBoard(game, groupId) {
  const group = groupById(game, groupId);
  const players = rosterInGroup(game, groupId);
  const stats = new Map(players.map((p) => [p.id, emptyStats(p)]));
  const cells = {};
  const playedByPlayer = {};
  const remainingByPlayer = {};
  for (const p of players) {
    playedByPlayer[p.id] = [];
    remainingByPlayer[p.id] = [];
  }

  for (const match of game.matches) {
    if (!stats.has(match.aId) || !stats.has(match.bId)) continue;
    const a = stats.get(match.aId);
    const b = stats.get(match.bId);
    a.played += 1;
    b.played += 1;
    a.setsFor += match.aSets;
    a.setsAgainst += match.bSets;
    b.setsFor += match.bSets;
    b.setsAgainst += match.aSets;
    if (match.aSets > match.bSets) {
      a.wins += 1;
      b.losses += 1;
    } else if (match.bSets > match.aSets) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
    }
    cells[`${match.aId}:${match.bId}`] = {
      sets: match.aSets,
      against: match.bSets,
      matchId: match.id,
      won: match.aSets > match.bSets,
      lost: match.aSets < match.bSets,
    };
    cells[`${match.bId}:${match.aId}`] = {
      sets: match.bSets,
      against: match.aSets,
      matchId: match.id,
      won: match.bSets > match.aSets,
      lost: match.bSets < match.aSets,
    };
    playedByPlayer[match.aId].push({
      matchId: match.id,
      opponentId: match.bId,
      opponentName: b.name,
      for: match.aSets,
      against: match.bSets,
      won: match.aSets > match.bSets,
    });
    playedByPlayer[match.bId].push({
      matchId: match.id,
      opponentId: match.aId,
      opponentName: a.name,
      for: match.bSets,
      against: match.aSets,
      won: match.bSets > match.aSets,
    });
  }

  for (const p of players) {
    const row = stats.get(p.id);
    row.setDiff = row.setsFor - row.setsAgainst;
    row.remaining = Math.max(0, players.length - 1 - row.played);
    for (const other of players) {
      if (other.id === p.id) continue;
      if (!findMatchBetween(game, p.id, other.id)) {
        remainingByPlayer[p.id].push({ id: other.id, name: other.name });
      }
    }
  }

  const ranking = [...stats.values()].sort((a, b) => compareRank(a, b, game));
  ranking.forEach((row, i) => {
    row.rank = i + 1;
  });

  const matches = game.matches
    .filter((m) => m.groupId === groupId)
    .map((m) => {
      const a = stats.get(m.aId);
      const b = stats.get(m.bId);
      return {
        id: m.id,
        aId: m.aId,
        bId: m.bId,
        aName: a?.name || "Player",
        bName: b?.name || "Player",
        aSets: m.aSets,
        bSets: m.bSets,
      };
    });

  return {
    groupId,
    groupName: group?.name || "Group",
    playerIds: players.map((p) => p.id),
    players: players.map((p) => ({ id: p.id, name: p.name })),
    ranking,
    cells,
    matches,
    playedByPlayer,
    remainingByPlayer,
    remainingPairs: players.length
      ? (players.length * (players.length - 1)) / 2 - matches.length
      : 0,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function matchesToCsv(matches, roster) {
  const names = new Map((roster || []).map((p) => [p.id, p.name]));
  return (matches || [])
    .map((m) => {
      const a = names.get(m.aId) || m.aName || "Player";
      const b = names.get(m.bId) || m.bName || "Player";
      return [csvCell(a), m.aSets, csvCell(b), m.bSets].join(",");
    })
    .join("\n");
}

export function snapshotFor(game, viewerId) {
  const boards = {};
  for (const group of game.groups) {
    boards[group.id] = buildBoard(game, group.id);
  }
  const watchers = game.playerOrder.map((id) => {
    const p = game.players[id];
    return {
      id,
      name: p?.name || "Player",
      connected: Boolean(p?.connected),
      isHost: Boolean(p?.isHost),
      isEditor: canEditBoard(game, id),
    };
  });
  return {
    phase: game.phase,
    viewerId,
    gameName: "Table tennis",
    youAreHost: viewerId === HOST_ID,
    youCanEdit: canEditBoard(game, viewerId),
    players: clone(game.players),
    playerOrder: game.playerOrder.slice(),
    watchers,
    connectedCount: watchers.filter((w) => w.connected).length,
    groups: clone(game.groups),
    roster: clone(game.roster),
    matches: clone(game.matches),
    boards,
    message: game.message,
    seq: game.seq,
    maxPlayers: MAX_PLAYERS,
  };
}

export function restoreGame(saved, hostName) {
  const game = saved ? clone(saved) : createGame(hostName);
  if (!game.players) return createGame(hostName);
  if (!Array.isArray(game.groups) || !game.groups.length) {
    game.groups = [defaultGroup()];
  }
  if (!Array.isArray(game.roster)) game.roster = [];
  if (!Array.isArray(game.matches)) game.matches = [];
  if (!Array.isArray(game.playerOrder)) game.playerOrder = [HOST_ID];
  markGuestsDisconnected(game);
  if (game.players[HOST_ID]) {
    game.players[HOST_ID].name = hostName || game.players[HOST_ID].name;
    game.players[HOST_ID].connected = true;
    game.players[HOST_ID].isHost = true;
  } else {
    game.players[HOST_ID] = makeWatcher(hostName || "Host", { isHost: true });
    if (!game.playerOrder.includes(HOST_ID)) game.playerOrder.unshift(HOST_ID);
  }
  game.phase = "lobby";
  return game;
}
