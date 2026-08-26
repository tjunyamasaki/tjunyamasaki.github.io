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
        kind: "card",
        face: { rank, suit: suit.id, symbol: suit.symbol, color: suit.color },
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

export function cardLabel(card) {
  if (!card) return "";
  if (card.kind === "token") return card.face?.label || card.label || "?";
  const rank = card.rank ?? card.face?.rank;
  const symbol = card.symbol ?? card.face?.symbol;
  return `${rank}${symbol}`;
}

export const HAND_SORT_MODES = [
  { id: "suit", label: "Suit" },
  { id: "rank", label: "Value" },
];

export function defaultCardOrder() {
  return {
    suits: SUITS.map((s) => s.id),
    ranks: RANKS.slice(),
  };
}

/**
 * Game modules may set:
 *   cardOrder: { suits: ["s","h","d","c"], ranks: ["A","2",...,"K"] }
 *   handSort:  { default: "suit"|"rank", modes: ["suit","rank"] }
 */
export function resolveHandSort(game, settings) {
  const base = defaultCardOrder();
  const custom = game?.cardOrder || {};
  const modes =
    settings?.handSortModes ||
    game?.handSort?.modes ||
    HAND_SORT_MODES.map((m) => m.id);
  return {
    suits: settings?.suits || custom.suits || base.suits,
    ranks: settings?.ranks || custom.ranks || base.ranks,
    modes,
    defaultMode:
      settings?.handSortDefault ||
      game?.handSort?.default ||
      modes[0] ||
      "suit",
  };
}

export function compareCards(a, b, { suits, ranks, primary }) {
  const suitOf = (card) => {
    const i = suits.indexOf(card.suit ?? card.face?.suit);
    return i < 0 ? 99 : i;
  };
  const rankOf = (card) => {
    const i = ranks.indexOf(card.rank ?? card.face?.rank);
    return i < 0 ? 99 : i;
  };
  if (primary === "rank") {
    const byRank = rankOf(a) - rankOf(b);
    if (byRank) return byRank;
    return suitOf(a) - suitOf(b);
  }
  const bySuit = suitOf(a) - suitOf(b);
  if (bySuit) return bySuit;
  return rankOf(a) - rankOf(b);
}

export function sortHand(cards, spec) {
  return (cards || []).slice().sort((a, b) => compareCards(a, b, spec));
}
