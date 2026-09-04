import {
  buildRound,
  pickGameId,
  catalog,
  resolveLevel,
  GAMES,
  MIX,
  DIFFICULTY_IDS,
  DEFAULT_DIFFICULTY,
} from "./games.js";

export const HOST_ID = "host";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;
export const ROUND_CHOICES = [5, 8, 12];
export const DEFAULT_ROUNDS = 8;
export const REVEAL_MS = 2500;
export const RACE_TAIL_MS = 5000;
export const MAX_GUESS = 99;
export { MIX, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, catalog };

function defaultSettings() {
  return {
    rounds: DEFAULT_ROUNDS,
    miniGame: MIX,
    difficulty: DEFAULT_DIFFICULTY,
  };
}

function normalizeSettings(raw) {
  const next = defaultSettings();
  const rounds = Math.floor(Number(raw?.rounds));
  if (ROUND_CHOICES.includes(rounds)) next.rounds = rounds;
  const mini = raw?.miniGame;
  if (mini === MIX || GAMES[mini]) next.miniGame = mini;
  if (DIFFICULTY_IDS.includes(raw?.difficulty)) next.difficulty = raw.difficulty;
  return next;
}

const COLORS = 8;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bump(game) {
  game.seq = (game.seq || 0) + 1;
}

function nextFreeColor(players, exceptId) {
  const used = new Set();
  for (const [id, player] of Object.entries(players)) {
    if (id !== exceptId && Number.isInteger(player.color)) used.add(player.color);
  }
  for (let i = 0; i < COLORS; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function makePlayer(name, { isHost = false, color = 0 } = {}) {
  return {
    name: name || "Player",
    ready: false,
    isHost: Boolean(isHost),
    connected: true,
    color,
    score: 0,
    guess: null,
    hasGuessed: false,
  };
}

export function connectedIds(game) {
  return game.playerOrder.filter((id) => game.players[id]?.connected);
}

function allConnectedReady(game) {
  const ids = connectedIds(game);
  return ids.length > 0 && ids.every((id) => game.players[id]?.ready);
}

function resetGuesses(game) {
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    p.guess = null;
    p.hasGuessed = false;
  }
}

function resetToLobby(game) {
  game.phase = "lobby";
  game.roundIndex = 0;
  game.roundTotal = game.settings?.rounds || DEFAULT_ROUNDS;
  game.roundId = null;
  game.gameId = null;
  game.gameName = null;
  game.prompt = "";
  game.scoring = null;
  game.answer = null;
  game.scene = null;
  game.watchMs = 0;
  game.guessMs = 0;
  game.roundWinners = [];
  game.winnerIds = [];
  game.lastResult = null;
  resetGuesses(game);
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    p.score = 0;
    p.ready = false;
  }
  bump(game);
}

export function createGame(hostName) {
  const players = {
    [HOST_ID]: makePlayer(hostName || "Host", { isHost: true, color: 0 }),
  };
  return {
    phase: "lobby",
    players,
    playerOrder: [HOST_ID],
    settings: defaultSettings(),
    roundIndex: 0,
    roundTotal: DEFAULT_ROUNDS,
    roundId: null,
    gameId: null,
    gameName: null,
    prompt: "",
    scoring: null,
    answer: null,
    scene: null,
    watchMs: 0,
    guessMs: 0,
    roundWinners: [],
    winnerIds: [],
    lastResult: null,
    lastGameId: null,
    gameBag: [],
    message: `Waiting for players (${MIN_PLAYERS}–${MAX_PLAYERS}).`,
    seq: 0,
  };
}

export function canAdmit(game, playerId) {
  if (game.players[playerId]) return true;
  if (game.phase !== "lobby" && game.phase !== "ended") return false;
  return game.playerOrder.length < MAX_PLAYERS;
}

export function addPlayer(game, playerId, name) {
  if (game.players[playerId]) {
    reconnectPlayer(game, playerId, name);
    return true;
  }
  if (!canAdmit(game, playerId)) return false;
  const color = nextFreeColor(game.players, playerId);
  game.players[playerId] = makePlayer(name, { color });
  game.playerOrder.push(playerId);
  bump(game);
  game.message = `${game.players[playerId].name} joined.`;
  return true;
}

export function reconnectPlayer(game, playerId, name) {
  const p = game.players[playerId];
  if (!p) return false;
  p.connected = true;
  if (name) p.name = name;
  if (!Number.isInteger(p.color)) p.color = nextFreeColor(game.players, playerId);
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
  if (game.phase === "lobby" || game.phase === "ended") {
    delete game.players[playerId];
    game.playerOrder = game.playerOrder.filter((id) => id !== playerId);
    bump(game);
    game.message = "A player left.";
    return;
  }
  game.players[playerId].connected = false;
  bump(game);
}

function dropDisconnectedGuests(game) {
  for (const id of [...game.playerOrder]) {
    if (id === HOST_ID) continue;
    if (game.players[id]?.connected) continue;
    delete game.players[id];
    game.playerOrder = game.playerOrder.filter((seat) => seat !== id);
  }
}

function activeIds(game) {
  return game.playerOrder.filter((id) => game.players[id]?.connected);
}

function allActiveLocked(game) {
  const ids = activeIds(game);
  return ids.length > 0 && ids.every((id) => game.players[id].hasGuessed);
}

function beginRound(game) {
  const settings = normalizeSettings(game.settings);
  game.settings = settings;
  const nextIndex = game.roundIndex + 1;
  const gameId = pickGameId(game);
  const level = resolveLevel({
    roundIndex: nextIndex,
    roundTotal: game.roundTotal,
    difficulty: settings.difficulty,
    miniGame: settings.miniGame,
  });
  const built = buildRound(gameId, level);
  game.roundIndex = nextIndex;
  game.roundId = `r${game.roundIndex}-${game.seq + 1}`;
  game.phase = "watch";
  game.gameId = built.gameId;
  game.gameName = built.name;
  game.prompt = built.prompt;
  game.scoring = built.scoring;
  game.answer = built.answer;
  game.scene = built.scene;
  game.watchMs = built.watchMs;
  game.guessMs = built.guessMs;
  game.roundLevel = built.level;
  game.roundWinners = [];
  game.lastResult = null;
  resetGuesses(game);
  bump(game);
  game.message = `${built.name} · round ${game.roundIndex}/${game.roundTotal}`;
  if (built.scoring === "timed") {
    return { pause: "watch", ms: built.watchMs };
  }
  return { pause: "raceEnd", ms: built.watchMs + RACE_TAIL_MS };
}

function startMatch(game) {
  dropDisconnectedGuests(game);
  const seated = connectedIds(game);
  if (seated.length < MIN_PLAYERS) {
    return { error: `Need at least ${MIN_PLAYERS} connected players.` };
  }
  if (!allConnectedReady(game)) {
    return { error: "Everyone connected must ready up." };
  }
  const settings = normalizeSettings(game.settings);
  game.settings = settings;
  game.roundTotal = settings.rounds;
  game.roundIndex = 0;
  game.winnerIds = [];
  game.gameBag = [];
  game.lastGameId = null;
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    p.score = 0;
    p.ready = false;
  }
  return beginRound(game);
}

function endMatch(game) {
  let best = -1;
  for (const id of game.playerOrder) {
    const score = game.players[id]?.score || 0;
    if (score > best) best = score;
  }
  game.winnerIds = game.playerOrder.filter(
    (id) => (game.players[id]?.score || 0) === best
  );
  game.phase = "ended";
  game.scene = null;
  const names = game.winnerIds
    .map((id) => game.players[id]?.name)
    .filter(Boolean);
  game.message =
    names.length === 1
      ? `${names[0]} wins!`
      : names.length
        ? `Tie: ${names.join(", ")}`
        : "Game over.";
  bump(game);
  return {};
}

function finishRound(game) {
  if (game.phase === "reveal" || game.phase === "ended" || game.phase === "lobby") {
    return {};
  }
  const answer = game.answer;
  let winners = Array.isArray(game.roundWinners) ? game.roundWinners.slice() : [];
  if (game.scoring === "timed") {
    winners = [];
    for (const id of game.playerOrder) {
      const p = game.players[id];
      if (!p?.hasGuessed) continue;
      if (p.guess === answer) {
        p.score += 1;
        winners.push(id);
      }
    }
  } else if (!winners.length) {
    for (const id of game.playerOrder) {
      const p = game.players[id];
      if (p?.hasGuessed && p.guess === answer) {
        p.score += 1;
        winners = [id];
        break;
      }
    }
  }
  game.roundWinners = winners;
  game.phase = "reveal";
  game.lastResult = {
    answer,
    gameId: game.gameId,
    gameName: game.gameName,
    winners: winners.slice(),
  };
  const names = winners.map((id) => game.players[id]?.name).filter(Boolean);
  if (winners.length === 1) {
    game.message = `${names[0]} +1 · answer ${answer}`;
  } else if (winners.length > 1) {
    game.message = `${names.join(", ")} +1 · answer ${answer}`;
  } else {
    game.message = `Nobody · answer ${answer}`;
  }
  bump(game);
  return { pause: "reveal", ms: REVEAL_MS };
}

function beginGuess(game) {
  if (game.phase !== "watch" || game.scoring !== "timed") return {};
  game.phase = "guess";
  bump(game);
  game.message = game.prompt || "How many?";
  return { pause: "guess", ms: game.guessMs || 8000 };
}

function nextRoundOrEnd(game) {
  if (game.phase !== "reveal") return {};
  if (game.roundIndex >= game.roundTotal) return endMatch(game);
  return beginRound(game);
}

function parseGuess(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isInteger(n) || n < 0 || n > MAX_GUESS) return null;
  return n;
}

function canGuessNow(game, player) {
  if (!player || !player.connected || player.hasGuessed) return false;
  if (game.scoring === "race" && game.phase === "watch") return true;
  if (game.scoring === "timed" && game.phase === "guess") return true;
  return false;
}

export function applyAction(game, playerId, intent) {
  const action = intent?.action;
  const player = game.players[playerId];
  const isHost = playerId === HOST_ID;

  if (action === "setReady") {
    if (game.phase !== "lobby" || !player) return { error: "Can't ready now." };
    player.ready =
      typeof intent.ready === "boolean" ? Boolean(intent.ready) : !player.ready;
    bump(game);
    game.message = player.ready
      ? `${player.name} is ready.`
      : `${player.name} is not ready.`;
    return {};
  }

  if (action === "setSettings") {
    if (!isHost) return { error: "Only the host can change settings." };
    if (game.phase !== "lobby") return { error: "Settings are locked." };
    const next = normalizeSettings({ ...game.settings, ...intent });
    game.settings = next;
    game.roundTotal = next.rounds;
    bump(game);
    const gameLabel =
      next.miniGame === MIX ? "mix" : GAMES[next.miniGame]?.name || next.miniGame;
    game.message = `${next.rounds} rounds · ${next.difficulty} · ${gameLabel}`;
    return {};
  }

  if (action === "startGame") {
    if (!isHost) return { error: "Only the host can start." };
    if (game.phase !== "lobby") return { error: "Game already started." };
    return startMatch(game);
  }

  if (action === "playAgain") {
    if (!isHost) return { error: "Only the host can restart." };
    if (game.phase !== "ended") return { error: "Finish this game first." };
    resetToLobby(game);
    game.message = "New match. Ready up.";
    return {};
  }

  if (action === "leaveSeat") {
    leaveSeat(game, playerId);
    if (
      (game.phase === "watch" || game.phase === "guess") &&
      allActiveLocked(game)
    ) {
      return finishRound(game);
    }
    return {};
  }

  if (action === "guess") {
    if (!player) return { error: "No seat." };
    if (!canGuessNow(game, player)) {
      if (player.hasGuessed) return { error: "Already guessed." };
      if (game.phase === "watch" && game.scoring === "timed") {
        return { error: "Wait until the scene hides." };
      }
      return { error: "Can't guess now." };
    }
    const value = parseGuess(intent.value);
    if (value == null) return { error: `Guess 0–${MAX_GUESS}.` };
    player.guess = value;
    player.hasGuessed = true;
    bump(game);

    if (game.scoring === "race" && value === game.answer && !game.roundWinners.length) {
      player.score += 1;
      game.roundWinners = [playerId];
      return finishRound(game);
    }

    if (allActiveLocked(game)) return finishRound(game);
    game.message = `${player.name} locked in.`;
    return {};
  }

  return { error: "Unknown action." };
}

export function snapshotFor(game, viewerId) {
  const connected = connectedIds(game);
  const you = game.players[viewerId];
  const showAnswer = game.phase === "reveal" || game.phase === "ended";
  const showScene = game.phase === "watch" && game.scene;
  const players = {};
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    const showValue = showAnswer || id === viewerId;
    players[id] = {
      name: p.name,
      ready: p.ready,
      isHost: p.isHost,
      connected: p.connected,
      color: p.color,
      score: p.score,
      hasGuessed: Boolean(p.hasGuessed),
      guess: showValue && p.hasGuessed ? p.guess : null,
    };
  }

  return {
    phase: game.phase,
    viewerId,
    gameName: "Count",
    players,
    playerOrder: game.playerOrder.slice(),
    settings: normalizeSettings(game.settings),
    catalog: catalog(),
    roundIndex: game.roundIndex,
    roundTotal: game.roundTotal,
    roundId: game.roundId,
    miniGameId: game.gameId,
    miniGameName: game.gameName,
    prompt: game.prompt,
    scoring: game.scoring,
    scene: showScene ? clone(game.scene) : null,
    answer: showAnswer ? game.answer : null,
    roundWinners: (game.roundWinners || []).slice(),
    winnerIds: (game.winnerIds || []).slice(),
    lastResult: game.lastResult ? clone(game.lastResult) : null,
    message: game.message,
    seq: game.seq,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    connectedCount: connected.length,
    allReady: allConnectedReady(game),
    canStart:
      game.phase === "lobby" &&
      connected.length >= MIN_PLAYERS &&
      allConnectedReady(game),
    canGuess: canGuessNow(game, you),
    youAreHost: viewerId === HOST_ID,
  };
}

export function restoreGame(saved, hostName) {
  const game = saved ? clone(saved) : createGame(hostName);
  if (!game.players) return createGame(hostName);
  if (!game.settings) game.settings = defaultSettings();
  else game.settings = normalizeSettings(game.settings);
  markGuestsDisconnected(game);
  if (game.players[HOST_ID]) {
    game.players[HOST_ID].name = hostName || game.players[HOST_ID].name;
    game.players[HOST_ID].connected = true;
    game.players[HOST_ID].isHost = true;
  }
  if (game.phase !== "lobby" && game.phase !== "ended") {
    resetToLobby(game);
    game.message = "Room resumed. Start when everyone is ready.";
  }
  return game;
}

export function afterPause(game, kind) {
  if (kind === "watch") return beginGuess(game);
  if (kind === "raceEnd") return finishRound(game);
  if (kind === "guess") return finishRound(game);
  if (kind === "reveal") return nextRoundOrEnd(game);
  return {};
}
