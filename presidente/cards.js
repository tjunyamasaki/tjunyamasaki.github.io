/** 52-card French shoe for Brazilian Presidente. 3 low, 2 high. */

export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
export const SUITS = ["clubs", "hearts", "spades", "diamonds"];
export const SUIT_LETTER = { clubs: "c", hearts: "h", spades: "s", diamonds: "d" };

const RANK_INDEX = Object.fromEntries(RANKS.map((rank, i) => [rank, i]));

export function rankIndex(rank) {
  return RANK_INDEX[rank] ?? 0;
}

export function makeCard(rank, suit, copy = 0) {
  return {
    id: `${rank}${SUIT_LETTER[suit]}-${copy}`,
    rank,
    suit,
    copy,
  };
}

export function makeDeck(copies = 1) {
  const deck = [];
  for (let copy = 0; copy < copies; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push(makeCard(rank, suit, copy));
      }
    }
  }
  return deck;
}

function unitRandom() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function shuffle(cards) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(unitRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(cards) {
  return (cards || []).slice().sort((a, b) => {
    const d = rankIndex(a.rank) - rankIndex(b.rank);
    if (d) return d;
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return (a.copy || 0) - (b.copy || 0);
  });
}

export function groupByRank(cards) {
  const groups = new Map();
  for (const card of cards || []) {
    const list = groups.get(card.rank) || [];
    list.push(card);
    groups.set(card.rank, list);
  }
  return groups;
}

export function sameRank(cards) {
  if (!cards?.length) return false;
  return cards.every((c) => c.rank === cards[0].rank);
}

/** Pile is { count, rank } or null (lead). */
export function isLegalSet(cards, pile) {
  if (!cards?.length || !sameRank(cards)) return false;
  if (!pile) return true;
  if (cards.length !== pile.count) return false;
  return rankIndex(cards[0].rank) > rankIndex(pile.rank);
}

export function canPlayOn(hand, pile) {
  const groups = groupByRank(hand);
  if (!pile) return (hand || []).length > 0;
  for (const [rank, cards] of groups) {
    if (cards.length >= pile.count && rankIndex(rank) > rankIndex(pile.rank)) {
      return true;
    }
  }
  return false;
}

export function highestCards(hand, n) {
  const sorted = sortHand(hand).slice().reverse();
  return sorted.slice(0, Math.max(0, n));
}

export function decksForPlayers(n) {
  return n >= 6 ? 2 : 1;
}

export function comboLabel(cards) {
  if (!cards?.length) return "";
  const n = cards.length;
  const rank = cards[0].rank;
  if (n === 1) return rank;
  if (n === 2) return `pair of ${rank}s`;
  if (n === 3) return `three ${rank}s`;
  if (n === 4) return `four ${rank}s`;
  return `${n}× ${rank}`;
}
