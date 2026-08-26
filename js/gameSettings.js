import { RANKS, SUITS, shuffle } from "./cards.js";

export const PRESET_MAX_PLAYERS = 15;

export const TABLE_SPACES = [
  { id: "deck", label: "Deck" },
  { id: "table", label: "Table" },
  { id: "discard", label: "Discard" },
  { id: "special", label: "Special", defaultVisible: false },
  { id: "personal", label: "Personal spaces" },
  { id: "hand", label: "Hands" },
];

export const SPACE_VISIBILITY = [
  { id: "deck", label: "Deck" },
  { id: "table", label: "Table" },
  { id: "discard", label: "Discard" },
  { id: "special", label: "Special" },
  { id: "personal", label: "Personal" },
];

export function defaultSpaces() {
  const spaces = {};
  for (const space of TABLE_SPACES) {
    spaces[space.id] = space.defaultVisible !== false;
  }
  return spaces;
}

function normalizeSpaces(spaces = {}) {
  const next = { ...spaces };
  if (next.shared !== undefined && next.table === undefined) next.table = next.shared;
  delete next.shared;
  return next;
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
    skipEmptyHands: false,
    opponentHandView: "expanded",
    showPoints: true,
    showLives: false,
    showCoins: false,
    catalog: null,
    dealDest: "hand",
    drawDest: "personal",
    personalRows: 1,
    sharedRows: 1,
  };
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
    spaces: { ...base.spaces, ...normalizeSpaces(fromGame.spaces) },
    decks: fromGame.decks ?? base.decks,
    handSortDefault:
      fromGame.handSortDefault ?? game?.handSort?.default ?? base.handSortDefault,
    handSortModes:
      fromGame.handSortModes ?? game?.handSort?.modes ?? base.handSortModes,
    skipEmptyHands: fromGame.skipEmptyHands ?? base.skipEmptyHands,
    opponentHandView: fromGame.opponentHandView ?? base.opponentHandView,
    showPoints: fromGame.showPoints ?? base.showPoints,
    showLives: fromGame.showLives ?? base.showLives,
    showCoins: fromGame.showCoins ?? base.showCoins,
    catalog: fromGame.catalog || null,
    dealDest: fromGame.dealDest ?? base.dealDest,
    drawDest: fromGame.drawDest ?? base.drawDest,
    personalRows: fromGame.personalRows ?? base.personalRows,
    sharedRows: fromGame.sharedRows ?? base.sharedRows,
  };
  const next = { ...merged, ...overrides };
  next.ranks = (overrides.ranks || merged.ranks).slice();
  next.suits = (overrides.suits || merged.suits).slice();
  next.banished = [...new Set(overrides.banished || merged.banished)];
  next.spaces = {
    ...base.spaces,
    ...normalizeSpaces(merged.spaces),
    ...normalizeSpaces(overrides.spaces),
  };
  next.catalog = overrides.catalog || merged.catalog || null;
  next.decks = Math.max(1, Math.min(8, Number(next.decks) || 1));
  next.minPlayers = Math.max(1, Number(next.minPlayers) || 1);
  next.maxPlayers = Math.max(
    next.minPlayers,
    Math.min(PRESET_MAX_PLAYERS, Number(next.maxPlayers) || PRESET_MAX_PLAYERS)
  );
  next.skipEmptyHands = Boolean(next.skipEmptyHands);
  next.opponentHandView =
    next.opponentHandView === "collapsed" ? "collapsed" : "expanded";
  next.showPoints = next.showPoints !== false;
  next.showLives = Boolean(next.showLives);
  next.showCoins = Boolean(next.showCoins);
  next.dealDest = destType(next.dealDest, base.dealDest);
  next.drawDest = destType(next.drawDest, base.drawDest);
  next.personalRows = clampRows(next.personalRows);
  next.sharedRows = clampRows(next.sharedRows);
  return next;
}

function clampRows(value) {
  return Math.max(1, Math.min(4, Number(value) || 1));
}

const DEST_TYPES = new Set(["hand", "personal", "shared", "discard", "special"]);

function destType(value, fallback) {
  return DEST_TYPES.has(value) ? value : fallback;
}

export function isBanished(rank, suit, banished) {
  const list = banished || [];
  return list.includes(rank) || list.includes(faceKey(rank, suit));
}

export function makeCard(rank, suitId, copy = 0) {
  const suit = SUITS.find((s) => s.id === suitId);
  const face = {
    rank,
    suit: suitId || "",
    symbol: suit?.symbol || "",
    color: suit?.color || "black",
  };
  return {
    id: copy ? `${rank}${suitId}-${copy}` : `${rank}${suitId}`,
    kind: "card",
    face,
    copy,
    rank: face.rank,
    suit: face.suit,
    symbol: face.symbol,
    color: face.color,
  };
}

export function makeToken(face, copy = 0) {
  const label = face?.label || "token";
  const color = face?.color || "black";
  const slug = String(label).replace(/\s+/g, "-").toLowerCase();
  return {
    id: copy ? `${slug}-${copy}` : slug,
    kind: "token",
    face: { label, color },
    copy,
    color,
  };
}

export function instantiateTemplate(template, copy = 0) {
  if (template.kind === "token") {
    return makeToken(template.face || template, copy);
  }
  const face = template.face || template;
  return makeCard(face.rank, face.suit, copy);
}

export function catalogFromPreset(preset) {
  if (preset?.catalog?.length) return preset.catalog;
  const templates = [];
  for (const suitId of preset.suits) {
    for (const rank of RANKS) {
      if (isBanished(rank, suitId, preset.banished)) continue;
      const suit = SUITS.find((s) => s.id === suitId) || SUITS[0];
      templates.push({
        kind: "card",
        face: {
          rank,
          suit: suitId,
          symbol: suit.symbol,
          color: suit.color,
        },
      });
    }
  }
  return templates;
}

export function createShoe(settings) {
  const preset = resolvePreset(null, settings);
  const elements = [];
  if (preset.catalog?.length) {
    for (const template of preset.catalog) {
      const copies = Math.max(1, Number(template.copies) || 1);
      for (let copy = 0; copy < copies; copy++) {
        elements.push(instantiateTemplate(template, copies > 1 ? copy : 0));
      }
    }
    return elements;
  }
  const catalog = catalogFromPreset(preset);
  for (let copy = 0; copy < preset.decks; copy++) {
    for (const template of catalog) {
      elements.push(instantiateTemplate(template, copy));
    }
  }
  return elements;
}

export function freshShoe(settings) {
  return shuffle(createShoe(settings));
}

export function compositionKey(settings) {
  return JSON.stringify({
    decks: settings.decks,
    suits: settings.suits,
    banished: [...(settings.banished || [])].sort(),
    catalog: settings.catalog || null,
  });
}
