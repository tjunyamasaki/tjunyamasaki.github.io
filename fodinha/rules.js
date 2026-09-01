import {
  makeDeck,
  shuffle,
  nextRank,
  sortHand,
  legalCards,
  trickWinner,
  maxHandSize,
  hookForbidden,
  cardLabel,
  rankName,
} from "./cards.js";

export const HOST_ID = "host";
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const START_LIVES = 5;
export const TRICK_PAUSE_MS = 1500;
export const HAND_PAUSE_MS = 2800;

const COLORS = 6;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    lives: START_LIVES,
    bid: null,
    hasBid: false,
    tricks: 0,
    eliminated: false,
  };
}

export function aliveIds(game) {
  return game.playerOrder.filter(
    (id) => game.players[id] && !game.players[id].eliminated
  );
}

export function connectedIds(game) {
  return game.playerOrder.filter((id) => game.players[id]?.connected);
}

export function nextAliveAfter(game, id) {
  const order = game.playerOrder;
  if (!order.length) return null;
  const start = Math.max(0, order.indexOf(id));
  for (let step = 1; step <= order.length; step++) {
    const cand = order[(start + step) % order.length];
    if (game.players[cand] && !game.players[cand].eliminated) return cand;
  }
  return null;
}

function bump(game) {
  game.seq = (game.seq || 0) + 1;
}

function resetHandFields(game, id) {
  const p = game.players[id];
  if (!p) return;
  p.bid = null;
  p.hasBid = false;
  p.tricks = 0;
}

export function createGame(hostName) {
  const players = {
    [HOST_ID]: makePlayer(hostName || "Host", { isHost: true, color: 0 }),
  };
  return {
    phase: "lobby",
    players,
    playerOrder: [HOST_ID],
    dealerId: HOST_ID,
    handSize: 1,
    suddenDeath: false,
    hands: { [HOST_ID]: [] },
    vira: null,
    manilhaRank: null,
    trick: [],
    lastTrick: null,
    lastTrickWinner: null,
    pendingTrickWinner: null,
    trickFrozen: false,
    ledSuit: null,
    toAct: null,
    lastHandResult: null,
    winnerId: null,
    message: "Waiting for players (3–6).",
    seq: 0,
  };
}

export function canAdmit(game, playerId) {
  if (game.players[playerId]) return true;
  if (game.phase !== "lobby") return false;
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
  game.hands[playerId] = [];
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

function allConnectedReady(game) {
  const ids = connectedIds(game);
  return ids.length > 0 && ids.every((id) => game.players[id].ready);
}

function beginHand(game) {
  const alive = aliveIds(game);
  const n = alive.length;
  if (n === 0) return;

  if (game.suddenDeath) game.handSize = 1;
  else {
    const max = maxHandSize(n);
    if (game.handSize < 1) game.handSize = 1;
    if (game.handSize > max) game.handSize = 1;
  }

  const shoe = shuffle(makeDeck());
  game.hands = {};
  for (const id of game.playerOrder) game.hands[id] = [];

  let i = 0;
  let seat = nextAliveAfter(game, game.dealerId);
  const total = n * game.handSize;
  for (let k = 0; k < total; k++) {
    game.hands[seat].push(shoe[i++]);
    seat = nextAliveAfter(game, seat);
  }
  game.vira = shoe[i] || null;
  game.manilhaRank = game.vira ? nextRank(game.vira.rank) : null;
  for (const id of alive) {
    game.hands[id] = sortHand(game.hands[id], game.manilhaRank);
    resetHandFields(game, id);
  }

  game.trick = [];
  game.lastTrick = null;
  game.lastTrickWinner = null;
  game.pendingTrickWinner = null;
  game.trickFrozen = false;
  game.ledSuit = null;
  game.winnerId = null;
  game.phase = "bidding";
  game.toAct = nextAliveAfter(game, game.dealerId);
  const man = game.manilhaRank
    ? `${rankName(game.manilhaRank)}s`
    : "manilhas";
  const vira = game.vira ? cardLabel(game.vira) : "—";
  const sd = game.suddenDeath ? "Sudden death. " : "";
  game.message = `${sd}${game.handSize}-card hand. Vira ${vira}; manilhas are ${man}.`;
  bump(game);
}

function summarizeResult(rows) {
  return rows
    .map((row) => {
      const hit = row.delta === 0 ? "made" : `missed by ${row.delta}`;
      return `${row.name} ${row.tricks}/${row.bid} (${hit}, ${row.lives}♥)`;
    })
    .join(" · ");
}

function scoreHand(game) {
  const cohort = aliveIds(game);
  const rows = [];
  for (const id of cohort) {
    const p = game.players[id];
    const bid = p.hasBid ? p.bid : 0;
    const delta = Math.abs(bid - p.tricks);
    p.lives = Math.max(0, p.lives - delta);
    rows.push({
      id,
      name: p.name,
      bid,
      tricks: p.tricks,
      delta,
      lives: p.lives,
    });
    if (p.lives <= 0) p.eliminated = true;
  }
  game.lastHandResult = rows;
  game.toAct = null;
  game.trick = [];
  game.trickFrozen = false;
  game.pendingTrickWinner = null;

  const still = aliveIds(game);
  if (still.length === 1) {
    game.phase = "ended";
    game.winnerId = still[0];
    game.suddenDeath = false;
    game.message = `${game.players[still[0]].name} wins!`;
    bump(game);
    return;
  }
  if (still.length === 0) {
    game.suddenDeath = true;
    for (const id of cohort) {
      game.players[id].eliminated = false;
      game.players[id].lives = 1;
    }
    game.phase = "reveal";
    game.message = `Everyone is out — sudden death! ${summarizeResult(rows)}`;
    bump(game);
    return;
  }
  game.suddenDeath = false;
  game.phase = "reveal";
  game.message = summarizeResult(rows);
  bump(game);
}

function maybeFinishBidding(game) {
  const alive = aliveIds(game);
  if (!alive.every((id) => game.players[id].hasBid)) return false;
  game.phase = "playing";
  game.toAct = nextAliveAfter(game, game.dealerId);
  const leader = game.players[game.toAct];
  game.message = `${leader?.name || "Player"} leads.`;
  bump(game);
  return true;
}

function maybeWinFromLeave(game) {
  const still = aliveIds(game);
  if (game.phase === "lobby" || game.phase === "ended") return;
  if (still.length === 1) {
    game.phase = "ended";
    game.winnerId = still[0];
    game.toAct = null;
    game.trickFrozen = false;
    game.message = `${game.players[still[0]].name} wins (others left).`;
    bump(game);
  } else if (still.length === 0) {
    game.phase = "ended";
    game.winnerId = null;
    game.toAct = null;
    game.message = "No one left.";
    bump(game);
  }
}

function advanceActor(game) {
  if (game.phase === "bidding") {
    if (maybeFinishBidding(game)) return;
    let id = game.toAct;
    for (let i = 0; i < game.playerOrder.length; i++) {
      id = nextAliveAfter(game, id);
      if (id && !game.players[id].hasBid) {
        game.toAct = id;
        game.message = `${game.players[id].name} to bid.`;
        bump(game);
        return;
      }
    }
    maybeFinishBidding(game);
    return;
  }
  if (game.phase === "playing" && !game.trickFrozen) {
    const alive = aliveIds(game);
    const need = alive.filter(
      (id) => !game.trick.some((play) => play.playerId === id)
    );
    if (need.length === 0) return;
    let id = game.toAct;
    for (let i = 0; i < alive.length + 1; i++) {
      id = nextAliveAfter(game, id);
      if (need.includes(id)) {
        game.toAct = id;
        bump(game);
        return;
      }
    }
  }
}

export function leaveSeat(game, playerId) {
  if (!playerId || playerId === HOST_ID) return;
  if (!game.players[playerId]) return;

  if (game.phase === "lobby" || game.phase === "ended") {
    delete game.players[playerId];
    game.playerOrder = game.playerOrder.filter((id) => id !== playerId);
    delete game.hands[playerId];
    bump(game);
    game.message = "A player left.";
    return;
  }

  const p = game.players[playerId];
  p.eliminated = true;
  p.lives = 0;
  p.connected = false;
  if (!p.hasBid) {
    p.bid = 0;
    p.hasBid = true;
  }
  game.hands[playerId] = [];
  bump(game);
  maybeWinFromLeave(game);
  if (game.phase === "ended") return;
  if (game.phase === "bidding") {
    maybeFinishBidding(game);
    if (game.phase === "bidding" && game.toAct === playerId) advanceActor(game);
    return;
  }
  if (game.phase === "playing") {
    const alive = aliveIds(game);
    const allPlayed =
      alive.length > 0 &&
      alive.every((id) => game.trick.some((play) => play.playerId === id));
    if (allPlayed && alive.length) {
      game.trickFrozen = true;
      game.pendingTrickWinner = trickWinner(game.trick, game.manilhaRank);
      game.ledSuit = game.trick[0]?.card.suit || null;
    } else if (game.toAct === playerId) {
      advanceActor(game);
    }
  }
}

function dropDisconnectedGuests(game) {
  for (const id of [...game.playerOrder]) {
    if (id === HOST_ID) continue;
    if (game.players[id]?.connected) continue;
    delete game.players[id];
    game.playerOrder = game.playerOrder.filter((seat) => seat !== id);
    delete game.hands[id];
  }
}

function startMatch(game, { rematch } = {}) {
  dropDisconnectedGuests(game);
  const seated = connectedIds(game);
  if (seated.length < MIN_PLAYERS) {
    return { error: `Need at least ${MIN_PLAYERS} connected players.` };
  }
  if (!rematch && !allConnectedReady(game)) {
    return { error: "Everyone connected must ready up." };
  }
  game.suddenDeath = false;
  game.handSize = 1;
  game.winnerId = null;
  game.lastHandResult = null;
  game.dealerId = game.playerOrder[0] || HOST_ID;
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    p.lives = START_LIVES;
    p.eliminated = false;
    p.ready = false;
    resetHandFields(game, id);
  }
  beginHand(game);
  return {};
}

export function resolveTrick(game) {
  if (game.phase !== "playing") return {};
  if (!game.trick.length) {
    game.trickFrozen = false;
    return {};
  }
  const winnerId =
    game.pendingTrickWinner || trickWinner(game.trick, game.manilhaRank);
  const winner = game.players[winnerId];
  if (winner && !winner.eliminated) winner.tricks += 1;
  game.lastTrick = game.trick.slice();
  game.lastTrickWinner = winnerId;
  game.trick = [];
  game.ledSuit = null;
  game.trickFrozen = false;
  game.pendingTrickWinner = null;

  const alive = aliveIds(game);
  const handDone = alive.every((id) => (game.hands[id] || []).length === 0);
  if (handDone) {
    scoreHand(game);
    if (game.phase === "reveal") return { pause: "hand", ms: HAND_PAUSE_MS };
    return {};
  }
  game.toAct = winnerId;
  if (!game.players[game.toAct] || game.players[game.toAct].eliminated) {
    game.toAct = nextAliveAfter(game, winnerId);
  }
  game.message = `${game.players[game.toAct]?.name || "Player"} leads.`;
  bump(game);
  return {};
}

export function completeHand(game) {
  if (game.phase !== "reveal") return {};
  const n = aliveIds(game).length;
  if (n <= 1) {
    if (n === 1) {
      game.phase = "ended";
      game.winnerId = aliveIds(game)[0];
      game.message = `${game.players[game.winnerId].name} wins!`;
    }
    return {};
  }
  game.dealerId = nextAliveAfter(game, game.dealerId) || game.dealerId;
  if (game.suddenDeath) {
    game.handSize = 1;
  } else {
    const max = maxHandSize(n);
    game.handSize = (game.handSize || 1) + 1;
    if (game.handSize > max) game.handSize = 1;
  }
  beginHand(game);
  return {};
}

export function applyAction(game, playerId, intent) {
  const action = intent?.action;
  const player = game.players[playerId];
  const isHost = playerId === HOST_ID;

  if (action === "ready") {
    if (game.phase !== "lobby" || !player) return { error: "Can't ready now." };
    player.ready = !player.ready;
    bump(game);
    game.message = player.ready
      ? `${player.name} is ready.`
      : `${player.name} is not ready.`;
    return {};
  }

  if (action === "startGame") {
    if (!isHost) return { error: "Only the host can start." };
    if (game.phase !== "lobby") return { error: "Game already started." };
    return startMatch(game, { rematch: false });
  }

  if (action === "rematch") {
    if (!isHost) return { error: "Only the host can rematch." };
    if (game.phase !== "ended") return { error: "Finish this game first." };
    const seated = connectedIds(game);
    if (seated.length < MIN_PLAYERS) {
      game.phase = "lobby";
      game.message = "Need 3 players to rematch. Waiting in lobby.";
      bump(game);
      return {};
    }
    return startMatch(game, { rematch: true });
  }

  if (action === "leaveSeat") {
    const wasFrozen = game.trickFrozen;
    leaveSeat(game, playerId);
    if (game.trickFrozen && game.phase === "playing" && !wasFrozen) {
      return { pause: "trick", ms: TRICK_PAUSE_MS };
    }
    return {};
  }

  if (action === "bid") {
    if (game.phase !== "bidding") return { error: "Not bidding now." };
    if (!player || player.eliminated) return { error: "You are out." };
    if (game.toAct !== playerId) return { error: "Wait your turn to bid." };
    const n = Math.floor(Number(intent.n));
    if (!Number.isFinite(n) || n < 0 || n > game.handSize) {
      return { error: `Bid 0–${game.handSize}.` };
    }
    const alive = aliveIds(game);
    const isLast = playerId === game.dealerId ||
      alive.filter((id) => !game.players[id].hasBid).length === 1;
    if (isLast) {
      const prior = alive
        .filter((id) => game.players[id].hasBid)
        .map((id) => game.players[id].bid);
      const forbid = hookForbidden(prior, game.handSize, {
        suddenDeath: game.suddenDeath,
      });
      if (forbid != null && n === forbid) {
        return { error: `Hook: you cannot bid ${forbid}.` };
      }
    }
    player.bid = n;
    player.hasBid = true;
    bump(game);
    maybeFinishBidding(game);
    if (game.phase === "bidding") advanceActor(game);
    return {};
  }

  if (action === "playCard") {
    if (game.phase !== "playing") return { error: "Not playing a card now." };
    if (game.trickFrozen) return { error: "Wait for the trick to finish." };
    if (!player || player.eliminated) return { error: "You are out." };
    if (game.toAct !== playerId) return { error: "Wait your turn." };
    const hand = game.hands[playerId] || [];
    const card = hand.find((c) => c.id === intent.cardId);
    if (!card) return { error: "That card is not in your hand." };
    const legal = legalCards(hand, game.trick);
    if (!legal.some((c) => c.id === card.id)) {
      return { error: "You must follow suit." };
    }
    game.hands[playerId] = hand.filter((c) => c.id !== card.id);
    if (!game.trick.length) game.ledSuit = card.suit;
    game.trick.push({ playerId, card });
    bump(game);

    const alive = aliveIds(game);
    const allPlayed = alive.every((id) =>
      game.trick.some((play) => play.playerId === id)
    );
    if (allPlayed) {
      game.trickFrozen = true;
      game.pendingTrickWinner = trickWinner(game.trick, game.manilhaRank);
      const w = game.players[game.pendingTrickWinner];
      game.message = `${w?.name || "Player"} takes the trick.`;
      game.toAct = null;
      return { pause: "trick", ms: TRICK_PAUSE_MS };
    }
    advanceActor(game);
    game.message = `${game.players[game.toAct]?.name || "Player"} to play.`;
    return {};
  }

  return { error: "Unknown action." };
}

export function snapshotFor(game, viewerId) {
  const alive = aliveIds(game);
  const connected = connectedIds(game);
  const allBid = alive.length > 0 && alive.every((id) => game.players[id].hasBid);
  const showBids = game.phase !== "bidding" || allBid;
  const isDealerBid =
    game.phase === "bidding" &&
    game.toAct === viewerId &&
    (viewerId === game.dealerId ||
      alive.filter((id) => !game.players[id].hasBid).length === 1);
  let forbidden = null;
  if (isDealerBid) {
    const prior = alive
      .filter((id) => game.players[id].hasBid)
      .map((id) => game.players[id].bid);
    forbidden = hookForbidden(prior, game.handSize, {
      suddenDeath: game.suddenDeath,
    });
  }

  const hand = sortHand(game.hands[viewerId] || [], game.manilhaRank);
  const legal =
    game.phase === "playing" &&
    !game.trickFrozen &&
    game.toAct === viewerId
      ? legalCards(hand, game.trick).map((c) => c.id)
      : [];

  const players = {};
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    players[id] = {
      name: p.name,
      ready: p.ready,
      isHost: p.isHost,
      connected: p.connected,
      color: p.color,
      lives: p.lives,
      eliminated: p.eliminated,
      tricks: p.tricks,
      hasBid: p.hasBid,
      bid: showBids || id === viewerId ? p.bid : null,
    };
  }

  const handCounts = {};
  for (const id of game.playerOrder) {
    handCounts[id] = (game.hands[id] || []).length;
  }

  return {
    phase: game.phase,
    viewerId,
    gameName: "Fodinha",
    players,
    playerOrder: game.playerOrder.slice(),
    dealerId: game.dealerId,
    toAct: game.toAct,
    handSize: game.handSize,
    suddenDeath: game.suddenDeath,
    vira: game.vira ? clone(game.vira) : null,
    manilhaRank: game.manilhaRank,
    trick: clone(game.trick),
    lastTrickWinner: game.lastTrickWinner,
    pendingTrickWinner: game.pendingTrickWinner,
    trickFrozen: game.trickFrozen,
    ledSuit: game.ledSuit,
    hand: clone(hand),
    handCounts,
    legalCardIds: legal,
    hookForbidden: forbidden,
    lastHandResult: game.lastHandResult ? clone(game.lastHandResult) : null,
    winnerId: game.winnerId,
    message: game.message,
    seq: game.seq,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    startLives: START_LIVES,
    connectedCount: connected.length,
    allReady: allConnectedReady(game),
    canStart:
      game.phase === "lobby" &&
      connected.length >= MIN_PLAYERS &&
      allConnectedReady(game),
    youAreHost: viewerId === HOST_ID,
  };
}

export function restoreGame(saved, hostName) {
  const game = saved ? clone(saved) : createGame(hostName);
  if (!game.players) return createGame(hostName);
  markGuestsDisconnected(game);
  if (game.players[HOST_ID]) {
    game.players[HOST_ID].name = hostName || game.players[HOST_ID].name;
    game.players[HOST_ID].connected = true;
    game.players[HOST_ID].isHost = true;
  }
  if (game.trickFrozen && game.phase === "playing") {
    resolveTrick(game);
  }
  if (game.phase === "reveal") {
    completeHand(game);
  }
  return game;
}

export function afterPause(game, kind) {
  if (kind === "trick") return resolveTrick(game);
  if (kind === "hand") return completeHand(game);
  return {};
}
