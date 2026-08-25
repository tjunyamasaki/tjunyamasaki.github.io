import { freshShoe } from "./gameSettings.js";
import { tableStats } from "./stats.js";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function handZoneId(playerId) {
  return `hand:${playerId}`;
}

export function personalZoneId(playerId) {
  return `personal:${playerId}`;
}

export function emptyZone(id, role, owner = null) {
  return { id, role, owner, items: [] };
}

const RESERVED_SPACE_IDS = new Set([
  "deck",
  "table",
  "discard",
  "special",
  "personal",
  "hand",
  "stock",
  "shared",
]);

export function extraSpaceIds(settings) {
  return Object.keys(settings?.spaces || {}).filter(
    (id) => !RESERVED_SPACE_IDS.has(id)
  );
}

export function createZones(playerIds, settings = null) {
  const zones = {
    stock: emptyZone("stock", "stock"),
    shared: emptyZone("shared", "shared"),
    discard: emptyZone("discard", "discard"),
    special: emptyZone("special", "special"),
  };
  for (const id of extraSpaceIds(settings)) {
    zones[id] = emptyZone(id, "shared");
  }
  for (const id of playerIds) {
    zones[handZoneId(id)] = emptyZone(handZoneId(id), "hand", id);
    zones[personalZoneId(id)] = emptyZone(personalZoneId(id), "personal", id);
  }
  return zones;
}

function liftNamed(named, playerIds, settings) {
  const zones = createZones(playerIds, settings);
  if (named.deck) zones.stock.items = clone(named.deck);
  if (named.shared) zones.shared.items = clone(named.shared);
  else if (named.table) zones.shared.items = clone(named.table);
  if (named.discard) zones.discard.items = clone(named.discard);
  if (named.special) zones.special.items = clone(named.special);
  const hands = named.hands || {};
  const personal = named.personal || {};
  for (const id of playerIds) {
    if (hands[id]) zones[handZoneId(id)].items = clone(hands[id]);
    if (personal[id]) zones[personalZoneId(id)].items = clone(personal[id]);
  }
  return zones;
}

export function createTableState(playerIds, saved = null, settings = null) {
  if (saved?.tableState) {
    const ts = clone(saved.tableState);
    ts.history = ts.history || [];
    if (!ts.zones) {
      ts.zones = liftNamed(ts, playerIds, settings);
      delete ts.deck;
      delete ts.discard;
      delete ts.shared;
      delete ts.special;
      delete ts.hands;
      delete ts.personal;
    }
    tableStats(ts);
    ensurePlayers(ts, playerIds, settings);
    return ts;
  }
  const ids = playerIds.slice();
  if (saved?.deck || saved?.hands || saved?.table) {
    const ts = {
      zones: liftNamed(saved, ids, settings),
      playerOrder: ids,
      turnIndex: 0,
      history: [],
      stats: { pot: 0 },
    };
    tableStats(ts);
    return ts;
  }
  const ts = {
    zones: createZones(ids, settings),
    playerOrder: ids,
    turnIndex: 0,
    history: [],
    stats: { pot: 0 },
  };
  ts.zones.stock.items = freshShoe(settings);
  tableStats(ts);
  return ts;
}

export function rebuildTable(ts, playerIds, settings) {
  const ids = playerIds.slice();
  ts.zones = createZones(ids, settings);
  ts.zones.stock.items = freshShoe(settings);
  ts.playerOrder = ids;
  ts.turnIndex = 0;
  ts.stats = { pot: 0 };
  tableStats(ts);
}

export function resetTable(ts, playerIds, settings) {
  rebuildTable(ts, playerIds, settings);
  ts.history = [];
}

export function ensurePlayers(ts, playerIds, settings = null) {
  if (!ts.zones) ts.zones = createZones(playerIds, settings);
  tableStats(ts);
  if (!ts.zones.stock) ts.zones.stock = emptyZone("stock", "stock");
  if (!ts.zones.shared) ts.zones.shared = emptyZone("shared", "shared");
  if (!ts.zones.discard) ts.zones.discard = emptyZone("discard", "discard");
  if (!ts.zones.special) ts.zones.special = emptyZone("special", "special");
  for (const id of extraSpaceIds(settings)) {
    if (!ts.zones[id]) ts.zones[id] = emptyZone(id, "shared");
  }
  for (const id of playerIds) {
    const hid = handZoneId(id);
    const pid = personalZoneId(id);
    if (!ts.zones[hid]) ts.zones[hid] = emptyZone(hid, "hand", id);
    if (!ts.zones[pid]) ts.zones[pid] = emptyZone(pid, "personal", id);
    if (!ts.playerOrder.includes(id)) ts.playerOrder.push(id);
  }
  const live = new Set(playerIds);
  ts.playerOrder = ts.playerOrder.filter((id) => live.has(id));
  if (!ts.playerOrder.length) ts.playerOrder = playerIds.slice();
  if (ts.turnIndex >= ts.playerOrder.length) ts.turnIndex = 0;
  for (const zone of Object.values(ts.zones)) {
    if (zone.role === "hand" || zone.role === "personal") {
      if (zone.owner && !live.has(zone.owner)) delete ts.zones[zone.id];
    }
  }
}

export function currentPlayerId(ts) {
  if (!ts.playerOrder.length) return null;
  return ts.playerOrder[ts.turnIndex % ts.playerOrder.length];
}

export function resolveZone(ts, ref) {
  if (!ref || !ts.zones) return null;
  if (ref.id && ts.zones[ref.id]) return ts.zones[ref.id];
  if (ref.role === "hand" && ref.owner) {
    return ts.zones[handZoneId(ref.owner)] || null;
  }
  if (ref.role === "personal" && ref.owner) {
    return ts.zones[personalZoneId(ref.owner)] || null;
  }
  if (ref.role) {
    return (
      Object.values(ts.zones).find(
        (zone) =>
          zone.role === ref.role &&
          (ref.owner == null || zone.owner === ref.owner)
      ) || null
    );
  }
  const type = ref.type;
  if (!type || type === "shared" || type === "table") return ts.zones.shared;
  if (type === "deck" || type === "stock") return ts.zones.stock;
  if (type === "discard") return ts.zones.discard;
  if (type === "special") return ts.zones.special;
  if (type === "personal") {
    return ts.zones[personalZoneId(ref.playerId || ref.owner)] || null;
  }
  if (type === "hand") {
    return ts.zones[handZoneId(ref.playerId || ref.owner)] || null;
  }
  if (type && ts.zones[type]) return ts.zones[type];
  return null;
}

export function zoneItems(ts, ref) {
  return resolveZone(ts, ref)?.items || [];
}

export function pullFrom(list, cardId) {
  const index = list.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  const [card] = list.splice(index, 1);
  return card;
}

export function move(ts, { elementIds, count, from, to, playedBy } = {}) {
  const src = resolveZone(ts, from);
  const dst = resolveZone(ts, to);
  if (!src || !dst) return { ok: false, error: "Unknown space.", moved: [] };
  const moved = [];
  if (elementIds?.length) {
    for (const id of elementIds) {
      const el = pullFrom(src.items, id);
      if (el) moved.push(el);
    }
  } else {
    const n = Math.max(0, Math.min(Number(count) || 0, src.items.length));
    moved.push(...src.items.splice(src.items.length - n, n));
  }
  for (const el of moved) {
    dst.items.push(playedBy ? { ...el, playedBy } : el);
  }
  return { ok: true, moved };
}

export function moveAll(ts, from, to) {
  const src = resolveZone(ts, from);
  const dst = resolveZone(ts, to);
  if (!src || !dst) return [];
  const moved = src.items.splice(0, src.items.length);
  dst.items.push(...moved);
  return moved;
}

export function drawFromDeck(ts, count) {
  const src = resolveZone(ts, { id: "stock" });
  if (!src) return [];
  const n = Math.max(0, Math.min(Number(count) || 0, src.items.length));
  return src.items.splice(src.items.length - n, n);
}

export function snapshotTable(ts, viewerId, players) {
  const discard = clone(zoneItems(ts, { id: "discard" }));
  const shared = clone(zoneItems(ts, { id: "shared" }));
  const handCounts = {};
  const personal = {};
  for (const id of Object.keys(players)) {
    handCounts[id] = zoneItems(ts, { role: "hand", owner: id }).length;
    personal[id] = clone(zoneItems(ts, { role: "personal", owner: id }));
  }
  return {
    deckCount: zoneItems(ts, { id: "stock" }).length,
    discardCount: discard.length,
    discard,
    discardTop: discard.length ? clone(discard[discard.length - 1]) : null,
    shared,
    table: shared,
    special: clone(zoneItems(ts, { id: "special" })),
    personal,
    hand: clone(zoneItems(ts, { role: "hand", owner: viewerId })),
    handCounts,
    playerOrder: ts.playerOrder.slice(),
    currentPlayerId: currentPlayerId(ts),
    canUndo: ts.history.length > 0,
    pot: tableStats(ts).pot || 0,
  };
}
