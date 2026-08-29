/** Fit table-space cards to a box. Pure sizing + DOM variable paint. */

export const SPACE_CARD_AR = 4.05 / 5.7;
export const SPACE_GAP_PX = 6;
export const MIN_CARD_H = 28;
export const STACK_PEEK_RATIO = 0.32;

export function fitGrid(width, height, count, maxCardH, gap = SPACE_GAP_PX) {
  const n = Math.max(0, Number(count) || 0);
  const cap = Math.max(MIN_CARD_H * 0.5, Math.min(maxCardH, height));
  if (n <= 0) {
    const h = Math.max(MIN_CARD_H, cap);
    return { width: h * SPACE_CARD_AR, height: h, cols: 1, rows: 1 };
  }
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (width - (cols - 1) * gap) / cols;
    const cellH = (height - (rows - 1) * gap) / rows;
    if (cellW <= 1 || cellH <= 1) continue;
    let h = Math.min(cap, cellH, cellW / SPACE_CARD_AR);
    let w = h * SPACE_CARD_AR;
    if (w > cellW) {
      w = cellW;
      h = w / SPACE_CARD_AR;
    }
    if (h > cellH) {
      h = cellH;
      w = h * SPACE_CARD_AR;
    }
    if (h <= 0 || w <= 0) continue;
    if (
      !best ||
      h > best.height + 0.05 ||
      (Math.abs(h - best.height) <= 0.05 && cols < best.cols)
    ) {
      best = { width: w, height: h, cols, rows };
    }
  }
  return (
    best || {
      width: MIN_CARD_H * SPACE_CARD_AR,
      height: MIN_CARD_H,
      cols: Math.max(1, n),
      rows: 1,
    }
  );
}

export function fitStack(width, height, count, maxCardH, gap = SPACE_GAP_PX) {
  const n = Math.max(1, Number(count) || 1);
  const cap = Math.max(MIN_CARD_H * 0.5, Math.min(maxCardH, height));
  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const perRow = Math.ceil(n / rows);
    const rowH = (height - (rows - 1) * gap) / rows;
    if (rowH <= 1) continue;
    let h = Math.min(cap, rowH);
    let w = h * SPACE_CARD_AR;
    const peekOf = (cardW) => Math.max(12, cardW * STACK_PEEK_RATIO);
    let peek = peekOf(w);
    const rowW = (cardW, peekW) => cardW + Math.max(0, perRow - 1) * peekW;
    if (rowW(w, peek) > width) {
      const denom = SPACE_CARD_AR * (1 + Math.max(0, perRow - 1) * STACK_PEEK_RATIO);
      if (denom > 0) h = Math.min(h, width / denom);
      w = h * SPACE_CARD_AR;
      peek = peekOf(w);
    }
    if (rowW(w, peek) > width && perRow > 1) {
      peek = Math.max(8, (width - w) / (perRow - 1));
      if (w + (perRow - 1) * peek > width) {
        w = Math.min(w, width * 0.72);
        h = w / SPACE_CARD_AR;
        peek = Math.max(8, (width - w) / (perRow - 1));
      }
    }
    if (h > rowH) {
      h = rowH;
      w = h * SPACE_CARD_AR;
      peek = peekOf(w);
    }
    if (!best || h > best.height) {
      best = { width: w, height: h, rows, perRow, peek };
    }
  }
  return (
    best || {
      width: MIN_CARD_H * SPACE_CARD_AR,
      height: MIN_CARD_H,
      rows: 1,
      perRow: n,
      peek: MIN_CARD_H * SPACE_CARD_AR * STACK_PEEK_RATIO,
    }
  );
}

export function layoutSpaceEl(el) {
  if (!el) return;
  const kind = el.dataset.spaceKind === "shared" ? "shared" : "personal";
  const mode = el.classList.contains("space-view-stack") ? "stacked" : "grid";
  const piles = [...el.querySelectorAll(":scope > .space-pile")].filter(
    (pile) => pile.childElementCount
  );
  const rect = el.getBoundingClientRect();
  const boxW = rect.width;
  const boxH = rect.height;
  if (boxW < 4 || boxH < 4) return;
  const gap = SPACE_GAP_PX;
  el.style.setProperty("--space-gap", `${gap}px`);
  const maxH = kind === "shared" ? boxH / 3 : boxH;
  if (!piles.length) return;
  const pileH =
    piles.length === 1 ? boxH : (boxH - (piles.length - 1) * gap) / piles.length;
  for (const pile of piles) {
    const n = pile.childElementCount;
    if (mode === "stacked") {
      const fit = fitStack(boxW, pileH, n, maxH, gap);
      pile.style.setProperty("--space-card-w", `${fit.width}px`);
      pile.style.setProperty("--space-card-h", `${fit.height}px`);
      pile.style.setProperty("--stack-peek", `${fit.peek}px`);
      pile.style.setProperty("--stack-n", String(fit.perRow));
      pile.style.setProperty("--space-rows", String(fit.rows));
      [...pile.children].forEach((card, i) => {
        const row = Math.floor(i / fit.perRow);
        const col = i % fit.perRow;
        card.style.setProperty("--stack-row", String(row));
        card.style.setProperty("--stack-col", String(col));
        card.style.zIndex = String(row * 32 + col + 1);
      });
    } else {
      const fit = fitGrid(boxW, pileH, n, maxH, gap);
      pile.style.setProperty("--space-card-w", `${fit.width}px`);
      pile.style.setProperty("--space-card-h", `${fit.height}px`);
      pile.style.setProperty("--space-cols", String(fit.cols));
    }
  }
}
