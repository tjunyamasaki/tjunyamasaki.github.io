import { cardLabel, defaultCardOrder } from "../cards.js";
import { aceHighRanks } from "../gameSettings.js";
import { move, rebuildTable, zoneItems } from "../tableState.js";
import { applyTableAction, pushHistory } from "../tableOps.js";

function scoreHighcard(ctx) {
  const playerIds = Object.keys(ctx.players);
  const left = playerIds.reduce(
    (n, id) => n + zoneItems(ctx.ts, { role: "hand", owner: id }).length,
    0
  );
  if (left > 0) return;
  const table = zoneItems(ctx.ts, { id: "shared" });
  if (!table.length) {
    ctx.phase = "ended";
    ctx.message = "No cards played.";
    return;
  }
  const ranks = ctx.settings?.ranks || aceHighRanks();
  const value = (card) => {
    const rank = card.rank ?? card.face?.rank;
    const i = ranks.indexOf(rank);
    return i < 0 ? -1 : i;
  };
  let best = -1;
  for (const card of table) best = Math.max(best, value(card));
  const winners = table.filter((card) => value(card) === best);
  const names = winners.map((card) => ctx.players[card.playedBy]?.name || "Player");
  const labels = winners.map((card) => cardLabel(card));
  const uniqueNames = [...new Set(names)];
  ctx.phase = "ended";
  ctx.message =
    uniqueNames.length === 1
      ? `${uniqueNames[0]} wins with ${labels.join(", ")}.`
      : `Tie: ${uniqueNames.join(", ")} (${labels.join(", ")}).`;
}

function applyHighcardAction(ctx, actorId, intent) {
  let action = intent.action;
  if (action === "playCard") {
    action = "placeCard";
    intent = { ...intent, dest: { type: "shared" }, cardIds: [intent.cardId] };
  }
  if (action === "start") action = "startGame";

  if (action === "startGame") {
    if (!ctx.isHost) return "Only the host can do that.";
    if (ctx.phase !== "lobby" && ctx.phase !== "ended") return "Finish this round first.";
    const min = ctx.settings?.minPlayers || 2;
    const ids = Object.keys(ctx.players);
    if (ids.length < min) return `Need at least ${min} players.`;
    pushHistory(ctx.ts, ctx.phase, ctx.message, ctx.players);
    rebuildTable(ctx.ts, ids, ctx.settings);
    for (const id of ids) {
      move(ctx.ts, {
        count: 1,
        from: { id: "stock" },
        to: { role: "hand", owner: id },
      });
    }
    ctx.phase = "playing";
    ctx.message = "";
    return;
  }

  if (action === "placeCard") {
    if (ctx.phase !== "playing") return "Start the game first.";
    const ids = intent.cardIds || (intent.cardId ? [intent.cardId] : []);
    if (!ids.length) return "Pick a card.";
    pushHistory(ctx.ts, ctx.phase, ctx.message, ctx.players);
    const { moved } = move(ctx.ts, {
      elementIds: ids,
      from: { role: "hand", owner: actorId },
      to: { id: "shared" },
      playedBy: actorId,
    });
    if (!moved.length) {
      ctx.ts.history.pop();
      return "Those cards are not in your hand.";
    }
    scoreHighcard(ctx);
    return;
  }

  return applyTableAction(ctx, actorId, intent);
}

export const highcardGame = {
  id: "highcard",
  name: "High card",
  blurb: "One card each, play it, highest rank wins (Ace high).",
  layout: "compact",
  tableActions: {
    placeShared: false,
    placePersonal: false,
    placeDiscard: false,
    endTurn: false,
    sendCards: false,
    betCoins: false,
  },
  preset: {
    decks: 1,
    minPlayers: 2,
    maxPlayers: 15,
    ranks: aceHighRanks(),
    suits: defaultCardOrder().suits,
    banished: [],
    spaces: {
      deck: true,
      table: true,
      special: false,
      personal: false,
      discard: false,
      hand: true,
    },
    handSortDefault: "rank",
    handSortModes: ["suit", "rank"],
  },
  handSort: { default: "rank", modes: ["suit", "rank"] },
  applyAction: applyHighcardAction,
};
