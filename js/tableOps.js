import { shuffle, cardLabel } from "./cards.js";
import {
  clone,
  currentPlayerId,
  handZoneId,
  isInactive,
  clearInactive,
  move,
  moveAll,
  personalZoneId,
  resetTable,
  resolveZone,
  zoneItems,
} from "./tableState.js";
import {
  restorePlayersStats,
  snapshotPlayersStats,
  tableStats,
  ensurePlayerStats,
  setPlayerStatValue,
} from "./stats.js";

const HISTORY_CAP = 40;

export function pushHistory(ts, phase, message, players) {
  ts.history.push(
    clone({
      zones: ts.zones,
      playerOrder: ts.playerOrder,
      turnIndex: ts.turnIndex,
      phase,
      message,
      stats: tableStats(ts),
      playersStats: snapshotPlayersStats(players),
      inactiveIds: (ts.inactiveIds || []).slice(),
      bustedIds: (ts.bustedIds || []).slice(),
    })
  );
  if (ts.history.length > HISTORY_CAP) ts.history.shift();
}

export function restore(ts, snap, players) {
  if (snap.zones) {
    ts.zones = clone(snap.zones);
  } else {
    const ids = snap.playerOrder || Object.keys(players || {});
    ts.zones = {
      stock: { id: "stock", role: "stock", owner: null, items: clone(snap.deck || []) },
      shared: {
        id: "shared",
        role: "shared",
        owner: null,
        items: clone(snap.shared || []),
      },
      discard: {
        id: "discard",
        role: "discard",
        owner: null,
        items: clone(snap.discard || []),
      },
      special: {
        id: "special",
        role: "special",
        owner: null,
        items: clone(snap.special || []),
      },
    };
    for (const id of ids) {
      ts.zones[handZoneId(id)] = {
        id: handZoneId(id),
        role: "hand",
        owner: id,
        items: clone(snap.hands?.[id] || []),
      };
      ts.zones[personalZoneId(id)] = {
        id: personalZoneId(id),
        role: "personal",
        owner: id,
        items: clone(snap.personal?.[id] || []),
      };
    }
  }
  ts.playerOrder = clone(snap.playerOrder);
  ts.turnIndex = snap.turnIndex;
  ts.inactiveIds = Array.isArray(snap.inactiveIds) ? clone(snap.inactiveIds) : [];
  ts.bustedIds = Array.isArray(snap.bustedIds) ? clone(snap.bustedIds) : [];
  ts.stats = { pot: snap.stats?.pot ?? snap.pot ?? 0 };
  tableStats(ts);
  if (players) {
    if (snap.playersStats) restorePlayersStats(players, snap.playersStats);
    else if (snap.coins) {
      for (const id of Object.keys(players)) {
        ensurePlayerStats(players[id]);
        setPlayerStatValue(players[id], "coins", Number(snap.coins[id]) || 0);
      }
    }
  }
}

function destToRef(dest, actorId) {
  const type = dest?.type || dest;
  if (!dest || type === "shared" || type === "table") {
    return { id: "shared" };
  }
  if (type === "discard") return { id: "discard" };
  if (type === "special") return { id: "special" };
  if (type === "personal") {
    return { role: "personal", owner: dest.playerId || actorId };
  }
  if (type === "hand") {
    return { role: "hand", owner: dest.playerId || actorId };
  }
  if (dest.id) return dest;
  return { id: type };
}

function settingsDest(ctx, key, playerId, intentDest) {
  const type = intentDest?.type || ctx.settings?.[key] || "hand";
  return destToRef({ type, playerId: intentDest?.playerId || playerId }, playerId);
}

export function canPlayerAct(ctx, actorId) {
  if (ctx.phase !== "playing") return false;
  if (isInactive(ctx.ts, actorId)) return false;
  return currentPlayerId(ctx.ts) === actorId;
}

export function advanceTurn(ts) {
  if (!ts.playerOrder.length) return;
  ts.turnIndex = (ts.turnIndex + 1) % ts.playerOrder.length;
}

export function skipEmptyHands(ts, settings) {
  if (!settings?.skipEmptyHands) return;
  const n = ts.playerOrder.length;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const id = currentPlayerId(ts);
    if (zoneItems(ts, { role: "hand", owner: id }).length > 0) return;
    ts.turnIndex = (ts.turnIndex + 1) % n;
  }
}

export function skipInactive(ts) {
  const n = ts.playerOrder.length;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const id = currentPlayerId(ts);
    if (!isInactive(ts, id)) return;
    ts.turnIndex = (ts.turnIndex + 1) % n;
  }
}

export function skipSeats(ts, settings) {
  skipEmptyHands(ts, settings);
  skipInactive(ts);
}

export function actorName(ctx, actorId) {
  return ctx.players[actorId]?.name || "Player";
}

export function announce(ctx, actorId, text) {
  ctx.message = `${actorName(ctx, actorId)} ${text}`;
}

export function spaceLabel(ctx, dest, actorId) {
  const ref = destToRef(dest, actorId);
  if (ref.id === "shared" || dest?.type === "shared" || dest?.type === "table") {
    return "the table";
  }
  if (ref.id === "discard" || dest?.type === "discard") return "the discard pile";
  if (ref.id === "special" || dest?.type === "special") return "the special pile";
  if (dest?.type === "personal") {
    if (dest.playerId === actorId) return "their space";
    return `${ctx.players[dest.playerId]?.name || "a player"}'s space`;
  }
  return "that space";
}

function idsOf(intent) {
  return intent.cardIds || intent.elementIds || (intent.cardId ? [intent.cardId] : []);
}

/**
 * Shared table commands. Mutates ctx.ts / ctx.phase / ctx.message.
 */
export function applyTableAction(ctx, actorId, intent) {
  const { ts, isHost } = ctx;
  let action = intent.action;
  if (action === "endTurn") action = "endTurn";
  if (action === "start") action = "startGame";
  if (action === "playCard") action = "placeCard";
  if (action === "sendCards") action = "sendCards";

  if (action === "endTurn") {
    if (!canPlayerAct(ctx, actorId)) {
      return ctx.phase !== "playing" ? "Start the game first." : "Not your turn.";
    }
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    advanceTurn(ts);
    skipSeats(ts, ctx.settings);
    const next = ctx.players[currentPlayerId(ts)]?.name;
    announce(ctx, actorId, next ? `ended their turn. ${next}'s turn.` : "ended their turn.");
    return;
  }

  if (action === "placeCard") {
    if (!canPlayerAct(ctx, actorId)) {
      return ctx.phase !== "playing" ? "Start the game first." : "Not your turn.";
    }
    const dest = intent.dest || { type: "shared" };
    if (dest.type === "personal" && dest.playerId !== actorId && !isHost) {
      return "You can only place into your own space.";
    }
    const to = destToRef(dest, actorId);
    if (!resolveZone(ts, to)) return "Unknown space.";
    const ids = idsOf(intent);
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const { moved } = move(ts, {
      elementIds: ids,
      from: { role: "hand", owner: actorId },
      to,
      playedBy: actorId,
    });
    if (!moved.length) {
      ts.history.pop();
      return "Those cards are not in your hand.";
    }
    const labels = moved.map(cardLabel).join(", ");
    announce(ctx, actorId, `placed ${labels} in ${spaceLabel(ctx, dest, actorId)}.`);
    if (ctx.phase === "playing") {
      const before = currentPlayerId(ts);
      skipSeats(ts, ctx.settings);
      const now = currentPlayerId(ts);
      if (now && now !== before) {
        const next = ctx.players[now]?.name;
        if (next) ctx.message += ` ${next}'s turn.`;
      }
    }
    return;
  }

  if (action === "drawCard") {
    if (!canPlayerAct(ctx, actorId)) {
      return ctx.phase !== "playing" ? "Start the game first." : "Not your turn.";
    }
    const count = Math.max(1, Number(intent.count) || 1);
    const to = settingsDest(ctx, "drawDest", actorId, intent.dest);
    if (!resolveZone(ts, to)) return "Unknown space.";
    const stockLen = zoneItems(ts, { id: "stock" }).length;
    if (!stockLen) return "The deck is empty.";
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const { moved } = move(ts, {
      count,
      from: { id: "stock" },
      to,
      playedBy: actorId,
    });
    ts.lastDrawn = moved.map(cardLabel);
    const labels = moved.map(cardLabel).join(", ");
    announce(ctx, actorId, `drew ${labels}.`);
    return;
  }

  if (action === "betCoins") {
    if (ctx.phase !== "playing") return "Start the game first.";
    const amount = Math.max(0, Math.floor(Number(intent.amount) || 0));
    if (!amount) return "Bet at least 1 coin.";
    const have =
      Number(ctx.players[actorId]?.stats?.coins ?? ctx.players[actorId]?.coins) || 0;
    if (amount > have) return "Not enough coins.";
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    ensurePlayerStats(ctx.players[actorId]);
    const stats = tableStats(ts);
    setPlayerStatValue(ctx.players[actorId], "coins", have - amount);
    stats.pot += amount;
    ts.pot = stats.pot;
    announce(ctx, actorId, `bet ${amount}. Pot is ${stats.pot}.`);
    return;
  }

  if (!isHost) return "Only the host can do that.";

  if (action === "undo") {
    const snap = ts.history.pop();
    if (!snap) return "Nothing to undo.";
    restore(ts, snap, ctx.players);
    ctx.phase = snap.phase;
    announce(ctx, actorId, "undid the last action.");
    return;
  }

  if (action === "startGame" || action === "start") {
    const min = ctx.settings?.minPlayers || 1;
    if (Object.keys(ctx.players).length < min) {
      return `Need at least ${min} players.`;
    }
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const ids = Object.keys(ctx.players);
    for (const id of ids) {
      if (!ts.playerOrder.includes(id)) ts.playerOrder.push(id);
    }
    ts.playerOrder = ts.playerOrder.filter((id) => ctx.players[id]);
    if (!ts.playerOrder.length) ts.playerOrder = ids;
    ts.turnIndex = 0;
    clearInactive(ts);
    ctx.phase = "playing";
    skipSeats(ts, ctx.settings);
    const first = ctx.players[currentPlayerId(ts)]?.name;
    announce(ctx, actorId, first ? `started the game. ${first}'s turn.` : "started the game.");
    return;
  }

  if (action === "setOrder") {
    const ids = (intent.playerIds || []).filter((id) => ctx.players[id]);
    if (ids.length !== Object.keys(ctx.players).length) {
      return "Order must include every player.";
    }
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    ts.playerOrder = ids;
    ts.turnIndex = Math.min(ts.turnIndex, ids.length - 1);
    skipSeats(ts, ctx.settings);
    announce(ctx, actorId, "set the player order.");
    return;
  }

  if (action === "shuffle") {
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const stock = resolveZone(ts, { id: "stock" });
    if (stock) stock.items = shuffle(stock.items);
    announce(ctx, actorId, "shuffled the deck.");
    return;
  }

  if (action === "deal") {
    const to = intent.playerId;
    const count = Number(intent.count) || 0;
    if (!ctx.players[to]) return "Unknown player.";
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const dest = settingsDest(ctx, "dealDest", to, intent.dest);
    const { moved } = move(ts, {
      count,
      from: { id: "stock" },
      to: dest,
    });
    announce(ctx, actorId, `dealt ${moved.length} to ${ctx.players[to].name}.`);
    if (ctx.phase === "playing") skipSeats(ts, ctx.settings);
    return;
  }

  if (action === "dealAll") {
    const requested = Math.max(0, Number(intent.count) || 0);
    const ids = ts.playerOrder.length ? ts.playerOrder : Object.keys(ctx.players);
    const n = ids.length;
    if (!n) return "No players.";
    const stockLen = zoneItems(ts, { id: "stock" }).length;
    const each = Math.min(requested, Math.floor(stockLen / n));
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    for (const id of ids) {
      move(ts, {
        count: each,
        from: { id: "stock" },
        to: settingsDest(ctx, "dealDest", id, intent.dest),
      });
    }
    announce(ctx, actorId, `dealt ${each} to each player.`);
    if (ctx.phase === "playing") skipSeats(ts, ctx.settings);
    return;
  }

  if (action === "drawToShared") {
    const count = Number(intent.count) || 0;
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const { moved } = move(ts, {
      count,
      from: { id: "stock" },
      to: { id: "shared" },
    });
    announce(ctx, actorId, `flipped ${moved.length} from the deck to the table.`);
    return;
  }

  if (action === "drawToSpecial") {
    const count = Number(intent.count) || 0;
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const { moved } = move(ts, {
      count,
      from: { id: "stock" },
      to: { id: "special" },
    });
    announce(ctx, actorId, `flipped ${moved.length} from the deck to the special pile.`);
    return;
  }

  if (action === "clearSpace") {
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    const dest = intent.dest || { type: "shared" };
    const from = destToRef(dest, actorId);
    if (!resolveZone(ts, from)) {
      ts.history.pop();
      return "Unknown space.";
    }
    moveAll(ts, from, { id: "discard" });
    announce(ctx, actorId, `moved ${spaceLabel(ctx, dest, actorId)} to the discard pile.`);
    return;
  }

  if (action === "discardAllPersonal") {
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    let n = 0;
    for (const id of Object.keys(ctx.players)) {
      n += moveAll(ts, { role: "personal", owner: id }, { id: "discard" }).length;
    }
    announce(ctx, actorId, `moved all player spaces (${n} cards) to the discard pile.`);
    return;
  }

  if (action === "reshuffle") {
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    moveAll(ts, { id: "discard" }, { id: "stock" });
    const stock = resolveZone(ts, { id: "stock" });
    if (stock) stock.items = shuffle(stock.items);
    announce(ctx, actorId, "shuffled the discard pile into the deck.");
    return;
  }

  if (action === "resetGame") {
    pushHistory(ts, ctx.phase, ctx.message, ctx.players);
    resetTable(ts, Object.keys(ctx.players), ctx.settings);
    ctx.phase = "lobby";
    announce(ctx, actorId, "reset the game.");
    return;
  }

  return null;
}
