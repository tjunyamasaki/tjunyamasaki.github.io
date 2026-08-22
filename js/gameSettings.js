import { RANKS, SUITS, shuffle } from "./cards.js";

export const PRESET_MAX_PLAYERS = 15;

export const TABLE_SPACES = [
  { id: "deck", label: "Deck" },
  { id: "shared", label: "Shared / table" },
  { id: "personal", label: "Personal spaces" },
  { id: "discard", label: "Discard" },
  { id: "hand", label: "Hands" },
];

export function defaultSpaces() {
  const spaces = {};
  for (const space of TABLE_SPACES) spaces[space.id] = true;
  return spaces;
}

export function defaultPreset() {
  return {
    decks: 1,
    minPlayers: 1,
    maxPlayers: PRESET_MAX_PLAYERS,
    ranks: RANKS.slice(),
    suits: SUITS.map((s) => s.id),
    banished: [],
    spaces: defaultSpaces(),
    handSortDefault: "suit",
    handSortModes: ["suit", "rank"],
  };
}

export function aceHighRanks() {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
}

/** President / shed: 3 low, 2 high. */
export function presidentRanks() {
  return ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
}

export function faceKey(rank, suit) {
  return `${rank}${suit}`;
}

export function resolvePreset(game, overrides = {}) {
  const base = defaultPreset();
  const fromGame = game?.preset || {};
  const merged = {
    ...base,
    ...fromGame,
    minPlayers: fromGame.minPlayers ?? game?.minPlayers ?? base.minPlayers,
    maxPlayers: fromGame.maxPlayers ?? game?.maxPlayers ?? base.maxPlayers,
    ranks: (fromGame.ranks || game?.cardOrder?.ranks || base.ranks).slice(),
    suits: (fromGame.suits || game?.cardOrder?.suits || base.suits).slice(),
    banished: (fromGame.banished || base.banished).slice(),
    spaces: { ...base.spaces, ...(fromGame.spaces || {}) },
    decks: fromGame.decks ?? base.decks,
    handSortDefault:
      fromGame.handSortDefault ?? game?.handSort?.default ?? base.handSortDefault,
    handSortModes:
      fromGame.handSortModes ?? game?.handSort?.modes ?? base.handSortModes,
  };
  const next = { ...merged, ...overrides };
  next.ranks = (overrides.ranks || merged.ranks).slice();
  next.suits = (overrides.suits || merged.suits).slice();
  next.banished = [...new Set(overrides.banished || merged.banished)];
  next.spaces = { ...base.spaces, ...(merged.spaces || {}), ...(overrides.spaces || {}) };
  next.decks = Math.max(1, Math.min(8, Number(next.decks) || 1));
  next.minPlayers = Math.max(1, Number(next.minPlayers) || 1);
  next.maxPlayers = Math.max(
    next.minPlayers,
    Math.min(PRESET_MAX_PLAYERS, Number(next.maxPlayers) || PRESET_MAX_PLAYERS)
  );
  return next;
}

export function isBanished(rank, suit, banished) {
  const list = banished || [];
  return list.includes(rank) || list.includes(faceKey(rank, suit));
}

export function makeCard(rank, suitId, copy = 0) {
  const suit = SUITS.find((s) => s.id === suitId) || SUITS[0];
  return {
    id: copy ? `${rank}${suitId}-${copy}` : `${rank}${suitId}`,
    rank,
    suit: suitId,
    symbol: suit.symbol,
    color: suit.color,
    copy,
  };
}

export function createShoe(settings) {
  const preset = resolvePreset(null, settings);
  const cards = [];
  for (let copy = 0; copy < preset.decks; copy++) {
    for (const suitId of preset.suits) {
      for (const rank of RANKS) {
        if (isBanished(rank, suitId, preset.banished)) continue;
        cards.push(makeCard(rank, suitId, copy));
      }
    }
  }
  return cards;
}

export function freshShoe(settings) {
  return shuffle(createShoe(settings));
}

export function compositionKey(settings) {
  return JSON.stringify({
    decks: settings.decks,
    suits: settings.suits,
    banished: [...settings.banished].sort(),
  });
}
