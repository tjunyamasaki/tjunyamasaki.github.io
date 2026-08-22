import { shuffle, createDeck, cardLabel } from "../cards.js";
import {
  clone,
  currentPlayerId,
  drawFromDeck,
  pullFrom,
} from "../tableState.js";

const HISTORY_CAP = 40;

function pushHistory(ts, phase, message) {
  ts.history.push(
    clone({
      deck: ts.deck,
      discard: ts.discard,
      shared: ts.shared,
      personal: ts.personal,
      hands: ts.hands,
      playerOrder: ts.playerOrder,
      turnIndex: ts.turnIndex,
      phase,
      message,
    })
  );
  if (ts.history.length > HISTORY_CAP) ts.history.shift();
}

function restore(ts, snap) {
  ts.deck = clone(snap.deck);
  ts.discard = clone(snap.discard);
  ts.shared = clone(snap.shared);
  ts.personal = clone(snap.personal);
  ts.hands = clone(snap.hands);
  ts.playerOrder = clone(snap.playerOrder);
  ts.turnIndex = snap.turnIndex;
}

function zoneList(ts, dest) {
  if (!dest || dest.type === "shared") return ts.shared;
  if (dest.type === "discard") return ts.discard;
  if (dest.type === "personal") {
    const id = dest.playerId;
    if (!ts.personal[id]) ts.personal[id] = [];
    return ts.personal[id];
  }
  return null;
}

function advanceTurn(ts) {
  if (!ts.playerOrder.length) return;
  ts.turnIndex = (ts.turnIndex + 1) % ts.playerOrder.length;
}

function canPlayerAct(ctx, actorId) {
  if (ctx.phase !== "playing") return false;
  if (ctx.isHost) return true;
  return currentPlayerId(ctx.ts) === actorId;
}

function actorName(ctx, actorId) {
  return ctx.players[actorId]?.name || "Player";
}

function announce(ctx, actorId, text) {
  ctx.message = `${actorName(ctx, actorId)} ${text}`;
}

function spaceLabel(ctx, dest, actorId) {
  if (!dest || dest.type === "shared") return "the shared space";
  if (dest.type === "discard") return "the discard pile";
  if (dest.playerId === actorId) return "their space";
  return `${ctx.players[dest.playerId]?.name || "a player"}'s space`;
}

/**
 * Pure-ish command. Mutates ctx.ts / ctx.phase / ctx.message.
 * Later UI can call the same action names from card/space clicks.
 */
export function applyFreeplayAction(ctx, actorId, intent) {
  const { ts, isHost } = ctx;
  const action = intent.action;

  if (action === "endTurn") {
    if (!canPlayerAct(ctx, actorId)) {
      return ctx.phase !== "playing" ? "Start the game first." : "Not your turn.";
    }
    pushHistory(ts, ctx.phase, ctx.message);
    advanceTurn(ts);
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
    const list = zoneList(ts, dest);
    if (!list) return "Unknown space.";
    const ids = intent.cardIds || (intent.cardId ? [intent.cardId] : []);
    pushHistory(ts, ctx.phase, ctx.message);
    const moved = [];
    for (const id of ids) {
      const card = pullFrom(ts.hands[actorId] || [], id);
      if (card) moved.push(card);
    }
    if (!moved.length) {
      ts.history.pop();
      return "Those cards are not in your hand.";
    }
    for (const card of moved) {
      list.push({ ...card, playedBy: actorId });
    }
    const labels = moved.map(cardLabel).join(", ");
    announce(ctx, actorId, `placed ${labels} in ${spaceLabel(ctx, dest, actorId)}.`);
    return;
  }

  if (!isHost) return "Only the host can do that.";

  if (action === "undo") {
    const snap = ts.history.pop();
    if (!snap) return "Nothing to undo.";
    restore(ts, snap);
    ctx.phase = snap.phase;
    announce(ctx, actorId, "undid the last action.");
    return;
  }

  if (action === "startGame") {
    pushHistory(ts, ctx.phase, ctx.message);
    const ids = Object.keys(ctx.players);
    for (const id of ids) {
      if (!ts.playerOrder.includes(id)) ts.playerOrder.push(id);
    }
    ts.playerOrder = ts.playerOrder.filter((id) => ctx.players[id]);
    if (!ts.playerOrder.length) ts.playerOrder = ids;
    ts.turnIndex = 0;
    ctx.phase = "playing";
    const first = ctx.players[currentPlayerId(ts)]?.name;
    announce(ctx, actorId, first ? `started the game. ${first}'s turn.` : "started the game.");
    return;
  }

  if (action === "setOrder") {
    const ids = (intent.playerIds || []).filter((id) => ctx.players[id]);
    if (ids.length !== Object.keys(ctx.players).length) {
      return "Order must include every player.";
    }
    pushHistory(ts, ctx.phase, ctx.message);
    ts.playerOrder = ids;
    ts.turnIndex = Math.min(ts.turnIndex, ids.length - 1);
    announce(ctx, actorId, "set the player order.");
    return;
  }

  if (action === "shuffle") {
    pushHistory(ts, ctx.phase, ctx.message);
    ts.deck = shuffle(ts.deck);
    announce(ctx, actorId, "shuffled the deck.");
    return;
  }

  if (action === "deal") {
    const to = intent.playerId;
    const count = Number(intent.count) || 0;
    if (!ctx.players[to]) return "Unknown player.";
    pushHistory(ts, ctx.phase, ctx.message);
    if (!ts.hands[to]) ts.hands[to] = [];
    const cards = drawFromDeck(ts, count);
    ts.hands[to].push(...cards);
    announce(ctx, actorId, `dealt ${cards.length} to ${ctx.players[to].name}.`);
    return;
  }

  if (action === "dealAll") {
    const count = Number(intent.count) || 0;
    pushHistory(ts, ctx.phase, ctx.message);
    const ids = ts.playerOrder.length ? ts.playerOrder : Object.keys(ctx.players);
    for (const id of ids) {
      if (!ts.hands[id]) ts.hands[id] = [];
      ts.hands[id].push(...drawFromDeck(ts, count));
    }
    announce(ctx, actorId, `dealt ${count} to each player.`);
    return;
  }

  if (action === "drawToShared") {
    const count = Number(intent.count) || 0;
    pushHistory(ts, ctx.phase, ctx.message);
    const cards = drawFromDeck(ts, count);
    ts.shared.push(...cards);
    announce(ctx, actorId, `flipped ${cards.length} from the deck to the shared space.`);
    return;
  }

  if (action === "clearSpace") {
    pushHistory(ts, ctx.phase, ctx.message);
    const dest = intent.dest || { type: "shared" };
    const list = zoneList(ts, dest);
    if (!list) {
      ts.history.pop();
      return "Unknown space.";
    }
    ts.discard.push(...list.splice(0, list.length));
    announce(ctx, actorId, `moved ${spaceLabel(ctx, dest, actorId)} to the discard pile.`);
    return;
  }

  if (action === "reshuffle") {
    pushHistory(ts, ctx.phase, ctx.message);
    ts.deck = shuffle([...ts.discard, ...ts.deck]);
    ts.discard = [];
    announce(ctx, actorId, "shuffled the discard pile into the deck.");
    return;
  }

  if (action === "resetGame") {
    pushHistory(ts, ctx.phase, ctx.message);
    const ids = Object.keys(ctx.players);
    ts.deck = shuffle(createDeck());
    ts.discard = [];
    ts.shared = [];
    for (const id of ids) {
      ts.personal[id] = [];
      ts.hands[id] = [];
    }
    ts.playerOrder = ids.slice();
    ts.turnIndex = 0;
    ts.history = [];
    ctx.phase = "lobby";
    announce(ctx, actorId, "reset the game.");
    return;
  }

  return null;
}

export const freeplayGame = {
  id: "freeplay",
  name: "Free play (test)",
  blurb: "Sandbox table: shared space, personal spaces, discard, turns, host tools.",
  minPlayers: 1,
  usesZones: true,
  applyAction: applyFreeplayAction,
};
