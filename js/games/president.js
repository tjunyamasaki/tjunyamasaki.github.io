import { cardLabel, defaultCardOrder } from "../cards.js";
import { presidentRanks } from "../gameSettings.js";
import { pullFrom } from "../tableState.js";
import { applyFreeplayAction, pushHistory } from "./freeplay.js";

function actorName(ctx, actorId) {
  return ctx.players[actorId]?.name || "Player";
}

function applyPresidentAction(ctx, actorId, intent) {
  if (intent.action === "sendCards") {
    if (ctx.phase !== "lobby") return "Send cards before the game starts.";
    const to = intent.playerId;
    if (!to || !ctx.players[to]) return "Pick a player.";
    if (to === actorId) return "Pick another player.";
    const ids = intent.cardIds || (intent.cardId ? [intent.cardId] : []);
    if (!ids.length) return "Select cards in your hand first.";
    const { ts } = ctx;
    pushHistory(ts, ctx.phase, ctx.message);
    if (!ts.hands[actorId]) ts.hands[actorId] = [];
    if (!ts.hands[to]) ts.hands[to] = [];
    const moved = [];
    for (const id of ids) {
      const card = pullFrom(ts.hands[actorId], id);
      if (card) moved.push(card);
    }
    if (!moved.length) {
      ts.history.pop();
      return "Those cards are not in your hand.";
    }
    ts.hands[to].push(...moved);
    const labels = moved.map(cardLabel).join(", ");
    ctx.message = `${actorName(ctx, actorId)} sent ${labels} to ${ctx.players[to].name}.`;
    return;
  }
  return applyFreeplayAction(ctx, actorId, intent);
}

export const presidentGame = {
  id: "president",
  name: "President",
  blurb: "Shed-style table: 3 low, 2 high. One deck up to 4 players, two decks after that. Pass cards before start.",
  usesZones: true,
  decksForPlayers(n) {
    return n > 4 ? 2 : 1;
  },
  tableActions: {
    placeShared: true,
    placePersonal: false,
    placeDiscard: false,
    endTurn: true,
    sendCards: true,
  },
  preset: {
    ...defaultCardOrder(),
    ranks: presidentRanks(),
    decks: 1,
    minPlayers: 2,
    maxPlayers: 15,
    banished: [],
    spaces: {
      deck: true,
      table: true,
      special: false,
      personal: false,
      discard: true,
      hand: true,
    },
    handSortDefault: "rank",
    handSortModes: ["suit", "rank"],
    skipEmptyHands: true,
    opponentHandView: "collapsed",
  },
  handSort: { default: "rank", modes: ["suit", "rank"] },
  applyAction: applyPresidentAction,
};
