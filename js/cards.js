export const SUITS = [
  { id: "s", symbol: "♠", color: "black" },
  { id: "h", symbol: "♥", color: "red" },
  { id: "d", symbol: "♦", color: "red" },
  { id: "c", symbol: "♣", color: "black" },
];

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `${rank}${suit.id}`,
        rank,
        suit: suit.id,
        symbol: suit.symbol,
        color: suit.color,
      });
    }
  }
  return cards;
}

export function shuffle(cards) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardsPerPlayer(playerCount) {
  const n = Math.max(1, playerCount);
  return Math.min(5, Math.floor(52 / n));
}

export function deal(deck, playerIds, count) {
  const rest = deck.slice();
  const hands = {};
  for (const id of playerIds) hands[id] = [];
  for (let n = 0; n < count; n++) {
    for (const id of playerIds) {
      if (!rest.length) break;
      hands[id].push(rest.pop());
    }
  }
  return { deck: rest, hands };
}

export function cardLabel(card) {
  return `${card.rank}${card.symbol}`;
}
