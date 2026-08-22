import { cardsPerPlayer, createDeck, deal, shuffle, rankValue } from "./cards.js";

export const GAMES = {
  freeplay: {
    id: "freeplay",
    name: "Free play (test)",
    blurb: "Sandbox: deal up to 5 cards, play anything to the table.",
    minPlayers: 1,
    cardsEach(playerCount) {
      return cardsPerPlayer(playerCount);
    },
    afterPlay({ table, hands, playerIds }) {
      const left = playerIds.reduce((n, id) => n + (hands[id]?.length || 0), 0);
      if (left > 0) return { phase: "playing" };
      return { phase: "ended", message: "Hands empty. Deal again when you want." };
    },
  },
  highcard: {
    id: "highcard",
    name: "High card",
    blurb: "Simplest real game: one card each, play it, highest rank wins (Ace high).",
    minPlayers: 2,
    cardsEach() {
      return 1;
    },
    afterPlay({ table, hands, playerIds, players }) {
      const left = playerIds.reduce((n, id) => n + (hands[id]?.length || 0), 0);
      if (left > 0) return { phase: "playing" };
      if (!table.length) return { phase: "ended", message: "No cards played." };
      let best = 0;
      for (const card of table) best = Math.max(best, rankValue(card));
      const winners = table.filter((card) => rankValue(card) === best);
      const names = winners.map(
        (card) => players[card.playedBy]?.name || "Player"
      );
      const labels = winners.map((card) => `${card.rank}${card.symbol}`);
      const uniqueNames = [...new Set(names)];
      const message =
        uniqueNames.length === 1
          ? `${uniqueNames[0]} wins with ${labels.join(", ")}.`
          : `Tie: ${uniqueNames.join(", ")} (${labels.join(", ")}).`;
      return { phase: "ended", message, winners: uniqueNames };
    },
  },
};

export function gameList() {
  return Object.values(GAMES);
}

export function getGame(id) {
  return GAMES[id] || GAMES.freeplay;
}

export function beginRound(game, playerIds) {
  const ids = playerIds.slice();
  const count = game.cardsEach(ids.length);
  return deal(shuffle(createDeck()), ids, count);
}
