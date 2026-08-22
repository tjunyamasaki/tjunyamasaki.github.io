import { cardsPerPlayer, createDeck, deal, shuffle, rankValue } from "../cards.js";

export const highcardGame = {
  id: "highcard",
  name: "High card",
  blurb: "One card each, play it, highest rank wins (Ace high).",
  minPlayers: 2,
  usesZones: false,
  cardsEach() {
    return 1;
  },
  beginRound(playerIds) {
    const count = this.cardsEach(playerIds.length);
    return deal(shuffle(createDeck()), playerIds, count);
  },
  afterPlay({ table, hands, playerIds, players }) {
    const left = playerIds.reduce((n, id) => n + (hands[id]?.length || 0), 0);
    if (left > 0) return { phase: "playing" };
    if (!table.length) return { phase: "ended", message: "No cards played." };
    let best = 0;
    for (const card of table) best = Math.max(best, rankValue(card));
    const winners = table.filter((card) => rankValue(card) === best);
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
