/** 40-card Truco shoe and comparison. Not the lobby `js/cards.js`. */

export const RANKS = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
export const SUITS = ["clubs", "hearts", "spades", "diamonds"];
export const SUIT_GLYPH = {
  clubs: "♣",
  hearts: "♥",
  spades: "♠",
  diamonds: "♦",
};
export const SUIT_LETTER = { clubs: "c", hearts: "h", spades: "s", diamonds: "d" };
/** Manilha strength: clubs (zap) highest. */
export const MANILHA_SUIT_POWER = {
  clubs: 4,
  hearts: 3,
  spades: 2,
  diamonds: 1,
};

const RANK_INDEX = Object.fromEntries(RANKS.map((rank, i) => [rank, i]));

export function isRedSuit(suit) {
  return suit === "hearts" || suit === "diamonds";
}

export function cardId(rank, suit) {
  return `${rank}${SUIT_LETTER[suit]}`;
}

export function makeCard(rank, suit) {
  return { id: cardId(rank, suit), rank, suit };
}

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
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

export function nextRank(rank) {
  const i = RANK_INDEX[rank];
  if (i == null) return RANKS[0];
  return RANKS[(i + 1) % RANKS.length];
}

export function trucoIndex(rank) {
  return RANK_INDEX[rank] ?? 0;
}

export function cardLabel(card) {
  if (!card) return "";
  return `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

export function rankName(rank) {
  if (rank === "A") return "Ace";
  if (rank === "Q") return "Queen";
  if (rank === "J") return "Jack";
  if (rank === "K") return "King";
  return rank;
}

export function isManilha(card, manilhaRank) {
  return Boolean(card && manilhaRank && card.rank === manilhaRank);
}

/** Higher number wins the trick. Off-suit non-manilhas cannot win. */
export function trickPower(card, ledSuit, manilhaRank) {
  if (!card) return -1;
  if (isManilha(card, manilhaRank)) return 100 + MANILHA_SUIT_POWER[card.suit];
  if (card.suit === ledSuit) return trucoIndex(card.rank);
  return -1;
}

export function trickWinner(plays, manilhaRank) {
  if (!plays?.length) return null;
  const ledSuit = plays[0].card.suit;
  let bestI = 0;
  let bestP = trickPower(plays[0].card, ledSuit, manilhaRank);
  for (let i = 1; i < plays.length; i++) {
    const p = trickPower(plays[i].card, ledSuit, manilhaRank);
    if (p > bestP) {
      bestP = p;
      bestI = i;
    }
  }
  return plays[bestI].playerId;
}

export function legalCards(hand, trick) {
  const cards = hand || [];
  if (!trick?.length) return cards.slice();
  const ledSuit = trick[0].card.suit;
  const follow = cards.filter((c) => c.suit === ledSuit);
  return follow.length ? follow : cards.slice();
}

export function sortHand(cards, manilhaRank) {
  return (cards || []).slice().sort((a, b) => {
    const am = isManilha(a, manilhaRank) ? 1 : 0;
    const bm = isManilha(b, manilhaRank) ? 1 : 0;
    if (am !== bm) return am - bm;
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return trucoIndex(a.rank) - trucoIndex(b.rank);
  });
}

export function maxHandSize(playerCount) {
  const n = Math.max(1, playerCount);
  return Math.max(1, Math.floor(39 / n));
}

export function hookForbidden(priorBids, handSize, { suddenDeath } = {}) {
  if (suddenDeath) return null;
  const sum = priorBids.reduce((s, n) => s + n, 0);
  const forbidden = handSize - sum;
  if (forbidden < 0 || forbidden > handSize) return null;
  return forbidden;
}

/** CSS grid slots (1-indexed row 1–5, col 1–3). Bottom row is drawn flipped. */
export function pipLayout(rank) {
  const layouts = {
    2: [
      [1, 2],
      [5, 2],
    ],
    3: [
      [1, 2],
      [3, 2],
      [5, 2],
    ],
    4: [
      [1, 1],
      [1, 3],
      [5, 1],
      [5, 3],
    ],
    5: [
      [1, 1],
      [1, 3],
      [3, 2],
      [5, 1],
      [5, 3],
    ],
    6: [
      [1, 1],
      [1, 3],
      [3, 1],
      [3, 3],
      [5, 1],
      [5, 3],
    ],
    7: [
      [1, 1],
      [1, 3],
      [2, 2],
      [3, 1],
      [3, 3],
      [5, 1],
      [5, 3],
    ],
  };
  return layouts[rank] || [];
}
