import {
  makeDeck,
  shuffle,
  sortHand,
  sameRank,
  isLegalSet,
  canPlayOn,
  highestCards,
  decksForPlayers,
  comboLabel,
  rankIndex,
} from "./cards.js";

export const HOST_ID = "host";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const WIN_POINTS = 11;
export const BOMB_PAUSE_MS = 900;
export const HAND_PAUSE_MS = 2600;

export const TITLE_LABEL = {
  presidente: "Presidente",
  vice: "Vice",
  cidadao: "Cidadão",
  "vice-bobo": "Vice-Bobo",
  bobo: "Bobo",
};

const COLORS = 10;

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
    points: 0,
    title: null,
    eliminated: false,
  };
}

export function connectedIds(game) {
  return game.playerOrder.filter((id) => game.players[id]?.connected);
}

function inHandIds(game) {
  return game.playerOrder.filter(
    (id) =>
      game.players[id] &&
      !game.players[id].eliminated &&
      !game.forfeited[id] &&
      (game.hands[id] || []).length > 0
  );
}

function nextInHandAfter(game, id) {
  return nextSeatAfter(game, id, { skipPassed: false });
}

function nextInRoundAfter(game, id) {
  return nextSeatAfter(game, id, { skipPassed: true });
}

function nextSeatAfter(game, id, { skipPassed } = {}) {
  const order = game.playerOrder;
  if (!order.length) return null;
  const start = Math.max(0, order.indexOf(id));
  for (let step = 1; step <= order.length; step++) {
    const cand = order[(start + step) % order.length];
    if ((game.hands[cand] || []).length <= 0) continue;
    if (game.forfeited[cand]) continue;
    if (skipPassed && game.passed[cand]) continue;
    return cand;
  }
  return null;
}

function bump(game) {
  game.seq = (game.seq || 0) + 1;
}

function playerName(game, id) {
  return game.players[id]?.name || "Player";
}

export function createGame(hostName) {
  return {
    phase: "lobby",
    players: {
      [HOST_ID]: makePlayer(hostName || "Host", { isHost: true, color: 0 }),
    },
    playerOrder: [HOST_ID],
    hands: { [HOST_ID]: [] },
    pile: null,
    lastPlayId: null,
    passed: {},
    toAct: null,
    finishedOrder: [],
    forfeited: {},
    titles: {},
    taxQueue: [],
    firstHand: true,
    winnerId: null,
    lastHandResult: null,
    message: "Waiting for players (2–10).",
    seq: 0,
    frozen: false,
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
    if (id !== HOST_ID && game.players[id]) game.players[id].connected = false;
  }
}

function allConnectedReady(game) {
  const ids = connectedIds(game);
  return ids.length > 0 && ids.every((id) => game.players[id].ready);
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

function assignTitles(finishOrder) {
  const n = finishOrder.length;
  const titles = {};
  if (!n) return titles;
  titles[finishOrder[0]] = "presidente";
  titles[finishOrder[n - 1]] = "bobo";
  if (n >= 4) {
    titles[finishOrder[1]] = "vice";
    titles[finishOrder[n - 2]] = "vice-bobo";
  }
  for (const id of finishOrder) {
    if (!titles[id]) titles[id] = "cidadao";
  }
  return titles;
}

function pointsFor(title) {
  if (title === "presidente") return 2;
  if (title === "vice") return 1;
  return 0;
}

function find3SpadesOwner(game) {
  for (const id of game.playerOrder) {
    const hit = (game.hands[id] || []).find(
      (c) => c.rank === "3" && c.suit === "spades"
    );
    if (hit) return id;
  }
  return game.playerOrder[0];
}

function dealHands(game) {
  const seated = game.playerOrder.filter((id) => game.players[id]);
  const n = seated.length;
  const copies = decksForPlayers(n);
  const shoe = shuffle(makeDeck(copies));
  game.hands = {};
  for (const id of game.playerOrder) game.hands[id] = [];
  let i = 0;
  while (i < shoe.length) {
    const id = seated[i % n];
    game.hands[id].push(shoe[i]);
    i += 1;
  }
  for (const id of seated) game.hands[id] = sortHand(game.hands[id]);
}

function clearPile(game) {
  game.pile = null;
  game.lastPlayId = null;
  game.passed = {};
}

function winPile(game) {
  const lead =
    (game.hands[game.lastPlayId] || []).length > 0
      ? game.lastPlayId
      : nextInHandAfter(game, game.lastPlayId);
  clearPile(game);
  game.toAct = lead;
  if (game.toAct) {
    game.message = `${playerName(game, game.toAct)} takes the lead.`;
  }
  bump(game);
}

function pileSettled(game) {
  if (!game.pile) return false;
  const inHand = inHandIds(game);
  if (!inHand.length) return true;
  return inHand.every((id) => id === game.lastPlayId || game.passed[id]);
}

function maybeEndHand(game) {
  const leftover = inHandIds(game);
  if (leftover.length > 1) return false;
  if (leftover.length === 1) game.finishedOrder.push(leftover[0]);
  for (const id of game.playerOrder) {
    if (game.forfeited[id] && !game.finishedOrder.includes(id)) {
      game.finishedOrder.push(id);
    }
  }
  scoreHand(game);
  return true;
}

function scoreHand(game) {
  const order = game.finishedOrder.slice();
  const titles = assignTitles(order);
  const rows = [];
  for (const id of order) {
    const p = game.players[id];
    if (!p) continue;
    p.title = titles[id] || "cidadao";
    const gain = pointsFor(p.title);
    p.points += gain;
    rows.push({
      id,
      name: p.name,
      title: p.title,
      gain,
      points: p.points,
    });
  }
  game.titles = titles;
  game.lastHandResult = rows;
  game.toAct = null;
  game.frozen = false;
  clearPile(game);

  const champ = order.find((id) => (game.players[id]?.points || 0) >= WIN_POINTS);
  if (champ) {
    game.phase = "ended";
    game.winnerId = champ;
    game.message = `${playerName(game, champ)} wins the table (${game.players[champ].points} pts)!`;
    bump(game);
    return;
  }
  game.phase = "reveal";
  game.message = rows
    .map((row) => `${row.name} ${TITLE_LABEL[row.title]}${row.gain ? ` +${row.gain}` : ""}`)
    .join(" · ");
  bump(game);
}

function startTax(game) {
  const n = game.playerOrder.filter((id) => game.players[id]).length;
  const presidente = Object.keys(game.titles).find((id) => game.titles[id] === "presidente");
  const vice = Object.keys(game.titles).find((id) => game.titles[id] === "vice");
  const bobo = Object.keys(game.titles).find((id) => game.titles[id] === "bobo");
  const viceBobo = Object.keys(game.titles).find((id) => game.titles[id] === "vice-bobo");
  const queue = [];

  function pay(from, to, count) {
    if (!from || !to || from === to || !game.players[from] || !game.players[to]) return;
    const taken = highestCards(game.hands[from], count);
    if (!taken.length) return;
    game.hands[from] = (game.hands[from] || []).filter((c) => !taken.some((t) => t.id === c.id));
    game.hands[to] = sortHand([...(game.hands[to] || []), ...taken]);
    game.hands[from] = sortHand(game.hands[from]);
    queue.push({ giver: to, receiver: from, count: taken.length, taken: taken.map((c) => c.id) });
  }

  pay(bobo, presidente, n > 5 ? 2 : 1);
  if (n > 5 && vice && viceBobo) pay(viceBobo, vice, 1);

  game.taxQueue = queue.filter((step) => step.count > 0);
  if (!game.taxQueue.length) {
    beginPlay(game, presidente || game.playerOrder[0]);
    return;
  }
  game.phase = "tax";
  game.toAct = game.taxQueue[0].giver;
  const step = game.taxQueue[0];
  game.message = `${playerName(game, step.giver)}: give ${step.count} card${
    step.count > 1 ? "s" : ""
  } back to ${playerName(game, step.receiver)}.`;
  bump(game);
}

function beginPlay(game, leadId) {
  game.phase = "playing";
  game.frozen = false;
  clearPile(game);
  game.finishedOrder = [];
  game.forfeited = {};
  game.toAct = leadId && (game.hands[leadId] || []).length ? leadId : inHandIds(game)[0];
  game.message = `${playerName(game, game.toAct)} leads.`;
  bump(game);
}

function beginHand(game) {
  dealHands(game);
  const lead = game.firstHand
    ? find3SpadesOwner(game)
    : Object.keys(game.titles).find((id) => game.titles[id] === "presidente") ||
      game.playerOrder[0];
  if (game.firstHand) {
    beginPlay(game, lead);
    return;
  }
  startTax(game);
  if (game.phase === "playing") {
    game.toAct = lead;
    if (!(game.hands[game.toAct] || []).length) {
      game.toAct = inHandIds(game)[0];
    }
    game.message = `${playerName(game, game.toAct)} (Presidente) leads.`;
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
  for (const id of game.playerOrder) {
    const p = game.players[id];
    if (!p) continue;
    p.points = 0;
    p.title = null;
    p.ready = false;
    p.eliminated = false;
  }
  game.firstHand = true;
  game.titles = {};
  game.winnerId = null;
  game.lastHandResult = null;
  game.forfeited = {};
  beginHand(game);
  return {};
}

function afterPlay(game, playerId) {
  const emptied = (game.hands[playerId] || []).length === 0;
  if (emptied) {
    if (!game.finishedOrder.includes(playerId)) game.finishedOrder.push(playerId);
    game.message =
      game.finishedOrder.length === 1
        ? `${playerName(game, playerId)} is Presidente!`
        : `${playerName(game, playerId)} is out.`;
  }
  if (maybeEndHand(game)) {
    if (game.phase === "reveal") return { pause: "hand", ms: HAND_PAUSE_MS };
    return {};
  }

  const unbeatable = game.pile && rankIndex(game.pile.rank) === rankIndex("2");
  if (unbeatable) {
    game.frozen = true;
    game.message = `${playerName(game, playerId)} plays 2s — the pile is closed.`;
    return { pause: "bomb", ms: BOMB_PAUSE_MS };
  }
  if (pileSettled(game)) {
    winPile(game);
    return {};
  }
  const next = nextInRoundAfter(game, playerId);
  if (!next || next === game.lastPlayId) {
    winPile(game);
    return {};
  }
  game.toAct = next;
  if (!emptied) {
    game.message = `${playerName(game, game.toAct)} to play.`;
  }
  bump(game);
  return {};
}

export function afterPause(game, kind) {
  if (kind === "bomb") {
    game.frozen = false;
    if (!maybeEndHand(game)) winPile(game);
    return {};
  }
  if (kind === "hand") {
    if (game.phase !== "reveal") return {};
    game.firstHand = false;
    beginHand(game);
    return {};
  }
  return {};
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
  game.forfeited[playerId] = true;
  game.hands[playerId] = [];
  game.players[playerId].connected = false;
  bump(game);
  if (game.phase === "playing" && !game.frozen) {
    if (maybeEndHand(game)) return;
    if (pileSettled(game)) {
      winPile(game);
      return;
    }
    if (game.toAct === playerId) {
      const next = game.pile ? nextInRoundAfter(game, playerId) : nextInHandAfter(game, playerId);
      if (game.pile && (!next || next === game.lastPlayId)) winPile(game);
      else game.toAct = next;
    }
  }
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
    if (connectedIds(game).length < MIN_PLAYERS) {
      game.phase = "lobby";
      game.message = "Need 2 players to rematch. Waiting in lobby.";
      bump(game);
      return {};
    }
    return startMatch(game, { rematch: true });
  }

  if (action === "leaveSeat") {
    leaveSeat(game, playerId);
    return {};
  }

  if (action === "pass") {
    if (game.phase !== "playing" || game.frozen) return { error: "Can't pass now." };
    if (game.toAct !== playerId) return { error: "Wait your turn." };
    if (!game.pile) return { error: "You must lead." };
    game.passed[playerId] = true;
    bump(game);
    if (pileSettled(game)) {
      winPile(game);
      return {};
    }
    const next = nextInRoundAfter(game, playerId);
    if (!next || next === game.lastPlayId) {
      winPile(game);
      return {};
    }
    game.toAct = next;
    game.message = `${playerName(game, playerId)} passes and is out of this pile. ${playerName(game, game.toAct)} to play.`;
    return {};
  }

  if (action === "playCards") {
    if (game.phase !== "playing" || game.frozen) return { error: "Can't play now." };
    if (game.toAct !== playerId) return { error: "Wait your turn." };
    if (game.passed[playerId]) return { error: "You already passed this pile." };
    const ids = intent.cardIds || (intent.cardId ? [intent.cardId] : []);
    const hand = game.hands[playerId] || [];
    const cards = ids.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (cards.length !== ids.length) return { error: "Those cards are not in your hand." };
    if (!isLegalSet(cards, game.pile)) {
      if (!game.pile) return { error: "Lead any number of the same rank." };
      return {
        error: `Play ${game.pile.count} card${game.pile.count > 1 ? "s" : ""} higher than ${game.pile.rank}.`,
      };
    }
    game.hands[playerId] = hand.filter((c) => !ids.includes(c.id));
    game.pile = {
      count: cards.length,
      rank: cards[0].rank,
      cards: cards.slice(),
      playerId,
    };
    game.lastPlayId = playerId;
    bump(game);
    game.message = `${playerName(game, playerId)} plays ${comboLabel(cards)}.`;
    return afterPlay(game, playerId);
  }

  if (action === "giveTax") {
    if (game.phase !== "tax") return { error: "Not exchanging cards." };
    const step = game.taxQueue[0];
    if (!step || step.giver !== playerId) return { error: "Wait your turn to give cards back." };
    const ids = intent.cardIds || [];
    if (ids.length !== step.count) {
      return { error: `Give exactly ${step.count} card${step.count > 1 ? "s" : ""}.` };
    }
    const hand = game.hands[playerId] || [];
    const cards = ids.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (cards.length !== ids.length) return { error: "Those cards are not in your hand." };
    game.hands[playerId] = hand.filter((c) => !ids.includes(c.id));
    game.hands[step.receiver] = sortHand([
      ...(game.hands[step.receiver] || []),
      ...cards,
    ]);
    game.hands[playerId] = sortHand(game.hands[playerId]);
    game.taxQueue.shift();
    bump(game);
    if (game.taxQueue.length) {
      const next = game.taxQueue[0];
      game.toAct = next.giver;
      game.message = `${playerName(game, next.giver)}: give ${next.count} card${
        next.count > 1 ? "s" : ""
      } back to ${playerName(game, next.receiver)}.`;
      return {};
    }
    const lead =
      Object.keys(game.titles).find((id) => game.titles[id] === "presidente") ||
      game.playerOrder[0];
    beginPlay(game, lead);
    return {};
  }

  return { error: "Unknown action." };
}

export function snapshotFor(game, viewerId) {
  const connected = connectedIds(game);
  const hand = sortHand(game.hands[viewerId] || []);
  const myTurn =
    (game.phase === "playing" || game.phase === "tax") &&
    game.toAct === viewerId &&
    !game.frozen;

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
      points: p.points,
      title: p.title,
      eliminated: p.eliminated,
    };
  }

  const handCounts = {};
  for (const id of game.playerOrder) {
    handCounts[id] = (game.hands[id] || []).length;
  }

  const tax = game.phase === "tax" ? game.taxQueue[0] || null : null;

  return {
    phase: game.phase,
    viewerId,
    gameName: "Presidente",
    players,
    playerOrder: game.playerOrder.slice(),
    toAct: game.toAct,
    pile: game.pile ? clone(game.pile) : null,
    lastPlayId: game.lastPlayId,
    passed: { ...game.passed },
    hand: clone(hand),
    handCounts,
    titles: { ...game.titles },
    tax: tax
      ? { giver: tax.giver, receiver: tax.receiver, count: tax.count }
      : null,
    canPass: Boolean(myTurn && game.phase === "playing" && game.pile),
    canPlay: Boolean(myTurn && game.phase === "playing" && canPlayOn(hand, game.pile)),
    lastHandResult: game.lastHandResult ? clone(game.lastHandResult) : null,
    winnerId: game.winnerId,
    message: game.message,
    seq: game.seq,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    winPoints: WIN_POINTS,
    firstHand: game.firstHand,
    frozen: game.frozen,
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
  if (game.frozen && game.phase === "playing") {
    afterPause(game, "bomb");
  }
  if (game.phase === "reveal") {
    afterPause(game, "hand");
  }
  return game;
}
