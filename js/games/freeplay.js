import { shuffle, createDeck } from "../cards.js";
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
  if (ctx.isHost) return true;
  if (ctx.phase !== "playing") return false;
  return currentPlayerId(ctx.ts) === actorId;
}

/**
 * Pure-ish command. Mutates ctx.ts / ctx.phase / ctx.message.
 * Later UI can call the same action names from card/space clicks.
 */
export function applyFreeplayAction(ctx, actorId, intent) {
  const { ts, isHost } = ctx;
  const action = intent.action;

  if (action === "undo") {
    const snap = ts.history.pop();
    if (!snap) return "Nothing to undo.";
    restore(ts, snap);
    ctx.phase = snap.phase;
    ctx.message = snap.message || "";
    return;
  }

  if (action === "endTurn") {
    if (!canPlayerAct(ctx, actorId)) return "Not your turn.";
    pushHistory(ts, ctx.phase, ctx.message);
    advanceTurn(ts);
    return;
  }

  if (action === "placeCard") {
    if (!canPlayerAct(ctx, actorId)) return "Not your turn.";
    pushHistory(ts, ctx.phase, ctx.message);
    const card = pullFrom(ts.hands[actorId] || [], intent.cardId);
    if (!card) {
      ts.history.pop();
      return "That card is not in your hand.";
    }
    const dest = intent.dest || { type: "shared" };
    if (dest.type === "personal" && dest.playerId !== actorId && !isHost) {
      ts.hands[actorId].push(card);
      ts.history.pop();
      return "You can only place into your own space.";
    }
    const list = zoneList(ts, dest);
    if (!list) {
      ts.hands[actorId].push(card);
      ts.history.pop();
      return "Unknown space.";
    }
    list.push({ ...card, playedBy: actorId });
    if (!isHost || currentPlayerId(ts) === actorId) advanceTurn(ts);
    ctx.message = "";
    return;
  }

  if (!isHost) return "Only the host can do that.";

  if (action === "startGame") {
    pushHistory(ts, ctx.phase, ctx.message);
    if (!ts.playerOrder.length) {
      ts.playerOrder = Object.keys(ctx.players);
    }
    ts.turnIndex = 0;
    ctx.phase = "playing";
    ctx.message = "";
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
    return;
  }

  if (action === "shuffle") {
    pushHistory(ts, ctx.phase, ctx.message);
    ts.deck = shuffle(ts.deck);
    ctx.message = "Deck shuffled.";
    return;
  }

  if (action === "deal") {
    const to = intent.playerId;
    const count = Number(intent.count) || 0;
    if (!ctx.players[to]) return "Unknown player.";
    pushHistory(ts, ctx.phase, ctx.message);
    if (!ts.hands[to]) ts.hands[to] = [];
    ts.hands[to].push(...drawFromDeck(ts, count));
    ctx.message = `Dealt ${count} to ${ctx.players[to].name}.`;
    return;
  }

  if (action === "drawToShared") {
    const count = Number(intent.count) || 0;
    pushHistory(ts, ctx.phase, ctx.message);
    const cards = drawFromDeck(ts, count);
    ts.shared.push(...cards);
    ctx.message = `Drew ${cards.length} to shared space.`;
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
    ctx.message = "Moved space to discard.";
    return;
  }

  if (action === "reshuffle") {
    pushHistory(ts, ctx.phase, ctx.message);
    ts.deck = shuffle([...ts.discard, ...ts.deck]);
    ts.discard = [];
    ctx.message = "Discard shuffled into deck.";
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
    ctx.message = "Game reset.";
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
