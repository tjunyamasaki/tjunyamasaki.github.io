export const SUIT_GLYPH = {
  clubs: "♣",
  hearts: "♥",
  spades: "♠",
  diamonds: "♦",
};

export function isRedSuit(suit) {
  return suit === "hearts" || suit === "diamonds";
}

export function cardLabel(card) {
  if (!card) return "";
  return `${card.rank}${SUIT_GLYPH[card.suit]}`;
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
    8: [
      [1, 1],
      [1, 3],
      [2, 1],
      [2, 3],
      [4, 1],
      [4, 3],
      [5, 1],
      [5, 3],
    ],
    9: [
      [1, 1],
      [1, 3],
      [2, 1],
      [2, 3],
      [3, 2],
      [4, 1],
      [4, 3],
      [5, 1],
      [5, 3],
    ],
    10: [
      [1, 1],
      [1, 3],
      [2, 1],
      [2, 2],
      [2, 3],
      [4, 1],
      [4, 2],
      [4, 3],
      [5, 1],
      [5, 3],
    ],
  };
  return layouts[rank] || [];
}

export function playingCard(
  card,
  { size = "", interactive = false, dim = false, legal = false, manilha = false, selected = false } = {}
) {
  const el = document.createElement(interactive ? "button" : "div");
  if (interactive) el.type = "button";
  el.className = "playing-card face";
  if (size) el.classList.add(size);
  if (isRedSuit(card.suit)) el.classList.add("red");
  if (manilha) el.classList.add("manilha");
  if (interactive && legal) el.classList.add("legal");
  if (interactive && dim) el.classList.add("illegal");
  if (selected) el.classList.add("selected");
  el.dataset.cardId = card.id;
  el.dataset.rank = card.rank;
  el.setAttribute("aria-label", cardLabel(card));

  const corners = ["idx", "idx tr", "idx bl", "idx br"];
  for (const cls of corners) {
    const span = document.createElement("span");
    span.className = cls;
    span.innerHTML = `${card.rank}<span>${SUIT_GLYPH[card.suit]}</span>`;
    el.append(span);
  }

  const pips = pipLayout(card.rank);
  if (pips.length) {
    const grid = document.createElement("div");
    grid.className = "pips";
    for (const [row, col] of pips) {
      const pip = document.createElement("span");
      pip.className = "pip" + (row >= 4 ? " flip" : "");
      pip.style.gridRow = String(row);
      pip.style.gridColumn = String(col);
      pip.textContent = SUIT_GLYPH[card.suit];
      grid.append(pip);
    }
    el.append(grid);
  } else {
    const center = document.createElement("div");
    center.className = "center-face";
    center.innerHTML = `<span>${card.rank}</span><span class="suit">${SUIT_GLYPH[card.suit]}</span>`;
    el.append(center);
  }
  return el;
}

export function cardBack(extraClass = "") {
  const el = document.createElement("div");
  el.className = `playing-card back ${extraClass}`.trim();
  el.setAttribute("aria-hidden", "true");
  return el;
}
