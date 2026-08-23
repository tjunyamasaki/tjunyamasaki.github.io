import { freshShoe } from "./gameSettings.js";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function emptyZones(playerIds) {
  const personal = {};
  const hands = {};
  for (const id of playerIds) {
    personal[id] = [];
    hands[id] = [];
  }
  return { personal, hands };
}

export function createTableState(playerIds, saved = null, settings = null) {
  if (saved?.tableState) {
    const ts = clone(saved.tableState);
    ts.history = ts.history || [];
    ensurePlayers(ts, playerIds);
    return ts;
  }
  const ids = playerIds.slice();
  const zones = emptyZones(ids);
  if (saved?.deck || saved?.hands || saved?.table) {
    return {
      deck: clone(saved.deck || []),
      discard: [],
      shared: clone(saved.table || []),
      special: [],
      personal: zones.personal,
      hands: { ...zones.hands, ...(saved.hands || {}) },
      playerOrder: ids,
      turnIndex: 0,
      history: [],
    };
  }
  return {
    deck: freshShoe(settings),
    discard: [],
    shared: [],
    special: [],
    personal: zones.personal,
    hands: zones.hands,
    playerOrder: ids,
    turnIndex: 0,
    history: [],
  };
}

export function ensurePlayers(ts, playerIds) {
  if (!ts.special) ts.special = [];
  if (!ts.shared) ts.shared = [];
  if (!ts.discard) ts.discard = [];
  for (const id of playerIds) {
    if (!ts.hands[id]) ts.hands[id] = [];
    if (!ts.personal[id]) ts.personal[id] = [];
    if (!ts.playerOrder.includes(id)) ts.playerOrder.push(id);
  }
  const live = new Set(playerIds);
  ts.playerOrder = ts.playerOrder.filter((id) => live.has(id));
  if (!ts.playerOrder.length) {
    ts.playerOrder = playerIds.slice();
  }
  if (ts.turnIndex >= ts.playerOrder.length) ts.turnIndex = 0;
}

export function currentPlayerId(ts) {
  if (!ts.playerOrder.length) return null;
  return ts.playerOrder[ts.turnIndex % ts.playerOrder.length];
}

export function pullFrom(list, cardId) {
  const index = list.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  const [card] = list.splice(index, 1);
  return card;
}

export function drawFromDeck(ts, count) {
  const n = Math.max(0, Math.min(count, ts.deck.length));
  return ts.deck.splice(ts.deck.length - n, n);
}

export function snapshotTable(ts, viewerId, players) {
  const handCounts = {};
  for (const id of Object.keys(players)) {
    handCounts[id] = (ts.hands[id] || []).length;
  }
  const personal = {};
  for (const id of Object.keys(players)) {
    personal[id] = clone(ts.personal[id] || []);
  }
  return {
    deckCount: ts.deck.length,
    discardCount: ts.discard.length,
    discard: clone(ts.discard),
    discardTop: ts.discard.length ? clone(ts.discard[ts.discard.length - 1]) : null,
    shared: clone(ts.shared),
    special: clone(ts.special || []),
    personal,
    hand: clone(ts.hands[viewerId] || []),
    handCounts,
    playerOrder: ts.playerOrder.slice(),
    currentPlayerId: currentPlayerId(ts),
    canUndo: ts.history.length > 0,
  };
}
