import { cardsPerPlayer, deal, defaultCardOrder } from "../cards.js";
import { aceHighRanks, freshShoe } from "../gameSettings.js";

export const highcardGame = {
  id: "highcard",
  name: "High card",
  blurb: "One card each, play it, highest rank wins (Ace high).",
  usesZones: false,
  preset: {
    decks: 1,
    minPlayers: 2,
    maxPlayers: 15,
    ranks: aceHighRanks(),
    suits: defaultCardOrder().suits,
    banished: [],
    spaces: { deck: true, shared: true, personal: false, discard: false, hand: true },
    handSortDefault: "rank",
    handSortModes: ["suit", "rank"],
  },
  handSort: { default: "rank", modes: ["suit", "rank"] },
  cardsEach() {
    return 1;
  },
  beginRound(playerIds, settings) {
    const count = this.cardsEach(playerIds.length);
    return deal(freshShoe(settings), playerIds, count);
  },
  afterPlay({ table, hands, playerIds, players, settings }) {
    const left = playerIds.reduce((n, id) => n + (hands[id]?.length || 0), 0);
    if (left > 0) return { phase: "playing" };
    if (!table.length) return { phase: "ended", message: "No cards played." };
    const ranks = settings?.ranks || aceHighRanks();
    const value = (card) => {
      const i = ranks.indexOf(card.rank);
      return i < 0 ? -1 : i;
    };
    let best = -1;
    for (const card of table) best = Math.max(best, value(card));
    const winners = table.filter((card) => value(card) === best);
    const names = winners.map((card) => players[card.playedBy]?.name || "Player");
    const labels = winners.map((card) => `${card.rank}${card.symbol}`);
    const uniqueNames = [...new Set(names)];
    const message =
      uniqueNames.length === 1
        ? `${uniqueNames[0]} wins with ${labels.join(", ")}.`
        : `Tie: ${uniqueNames.join(", ")} (${labels.join(", ")}).`;
    return { phase: "ended", message, winners: uniqueNames };
  },
};

export const highcardDealCount = cardsPerPlayer;
