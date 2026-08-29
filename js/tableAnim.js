const DURATION_MS = 1000;
const STAGGER_MS = 100;
const MIN_STAGGER_MS = 28;
/** Full 100ms gap until this many cards; then gap shrinks with √n. */
const SPEEDUP_AFTER = 8;

function cardGapMs(count) {
  const n = Math.max(1, count);
  if (n <= SPEEDUP_AFTER) return STAGGER_MS;
  return Math.max(MIN_STAGGER_MS, STAGGER_MS / Math.sqrt(n / SPEEDUP_AFTER));
}

function reducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function copyRect(r) {
  if (!r) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value);
}

function pileRect(el) {
  if (!el || el.closest?.(".hidden")) return null;
  const pile =
    el.querySelector(".deck-back, .stack-card, .playing-card, .mini-pile, .face-down") || el;
  const rect = pile.getBoundingClientRect();
  if (!rect.width && !rect.height) return copyRect(el.getBoundingClientRect());
  return copyRect(rect);
}

function seatOrder(view) {
  if (view?.playerOrder?.length) return view.playerOrder;
  return Object.keys(view?.players || {});
}

function indexVisible(view, selfId) {
  const map = new Map();
  const put = (card, place, playerId = null) => {
    if (card?.id) map.set(card.id, { place, playerId });
  };
  for (const card of view?.hand || []) put(card, "hand", selfId);
  for (const card of view?.shared || []) put(card, "shared");
  for (const card of view?.discard || []) put(card, "discard");
  for (const card of view?.special || []) put(card, "special");
  for (const [playerId, list] of Object.entries(view?.personal || {})) {
    for (const card of list || []) put(card, "personal", playerId);
  }
  return map;
}

function placeChanged(a, b) {
  if (!a || !b) return true;
  return a.place !== b.place || a.playerId !== b.playerId;
}

function stackTopId(list) {
  const cards = list || [];
  return cards.length ? cards[cards.length - 1]?.id : null;
}

function shownAsCardEl(loc, view, id) {
  if (!loc) return false;
  if (loc.place === "discard") return stackTopId(view.discard) === id;
  if (loc.place === "special") return stackTopId(view.special) === id;
  return true;
}

function handDelta(prev, view, playerId) {
  return (view.handCounts?.[playerId] ?? 0) - (prev.handCounts?.[playerId] ?? 0);
}

function bestOpponent(prev, view, selfId, wantGain) {
  let best = null;
  let bestAbs = 0;
  for (const playerId of Object.keys(view.players || {})) {
    if (playerId === selfId) continue;
    const delta = handDelta(prev, view, playerId);
    const score = wantGain ? delta : -delta;
    if (score > bestAbs) {
      bestAbs = score;
      best = playerId;
    }
  }
  return bestAbs > 0 ? best : null;
}

function destForLoc(loc) {
  if (!loc) return null;
  if (loc.place === "hand") return { type: "el", id: null };
  if (loc.place === "shared" || loc.place === "personal") return { type: "el" };
  if (loc.place === "discard") return { type: "zone", zone: "discard" };
  if (loc.place === "special") return { type: "zone", zone: "special" };
  return null;
}

function listsEmpty(view) {
  const handsEmpty =
    !(view?.hand || []).length &&
    Object.values(view?.handCounts || {}).every((n) => !n);
  const boardEmpty =
    !(view?.shared || []).length &&
    !(view?.discard || []).length &&
    !(view?.special || []).length &&
    Object.values(view?.personal || {}).every((list) => !(list || []).length);
  return handsEmpty && boardEmpty;
}

function looksLikeReset(prev, view) {
  if (!prev || !view) return false;
  if (!listsEmpty(view) || listsEmpty(prev)) return false;
  return (view.deckCount ?? 0) >= (prev.deckCount ?? 0);
}

/** Abstract flights: zone changes, draws, sends. Same-zone reshuffles are skipped. */
export function tableFlights(prev, view, selfId) {
  if (!prev || !view || prev === view) return [];
  if (looksLikeReset(prev, view)) return [];
  const before = indexVisible(prev, selfId);
  const after = indexVisible(view, selfId);
  const flights = [];
  const used = new Set();
  const explainedGain = {};
  const deckDrop = (prev.deckCount ?? 0) - (view.deckCount ?? 0);
  const deckGain = (view.deckCount ?? 0) - (prev.deckCount ?? 0);
  const fromOpp = bestOpponent(prev, view, selfId, false);
  const toOpp = bestOpponent(prev, view, selfId, true);
  const collapsed = view.settings?.opponentHandView === "collapsed";

  const push = (flight) => {
    if (flight.id) used.add(flight.id);
    const fromHidden = flight.from?.type === "deck" || flight.from?.type === "player";
    const showsFace =
      flight.dest?.type === "el" ||
      (flight.dest?.type === "zone" && flight.dest.zone && flight.dest.zone !== "deck");
    flight.reveal = Boolean(fromHidden && showsFace);
    flights.push(flight);
  };

  for (const [id, loc] of after) {
    const was = before.get(id);
    if (was && !placeChanged(was, loc)) continue;
    const toEl = shownAsCardEl(loc, view, id);
    const dest = toEl
      ? { type: "el", id }
      : destForLoc(loc) && { type: "zone", zone: loc.place };
    if (!dest) continue;
    if (was) {
      push({ id, from: { type: "card", id }, dest });
      continue;
    }
    if (deckDrop > 0) {
      push({ id, from: { type: "deck" }, dest });
      continue;
    }
    if (fromOpp) {
      push({ id, from: { type: "player", playerId: fromOpp }, dest });
    }
  }

  const lost = [];
  for (const [id, loc] of before) {
    if (after.has(id) || used.has(id)) continue;
    lost.push({ id, loc });
  }

  let deckSlots = Math.max(0, deckGain);
  for (const { id } of lost) {
    if (toOpp && (explainedGain[toOpp] || 0) < handDelta(prev, view, toOpp)) {
      push({
        id,
        from: { type: "card", id },
        dest: { type: "player", playerId: toOpp },
      });
      explainedGain[toOpp] = (explainedGain[toOpp] || 0) + 1;
    } else if (deckSlots > 0) {
      push({ id, from: { type: "card", id }, dest: { type: "zone", zone: "deck" } });
      deckSlots -= 1;
    } else {
      push({ id, from: { type: "card", id }, dest: { type: "zone", zone: "discard" } });
    }
  }

  for (const playerId of seatOrder(view)) {
    if (playerId === selfId) continue;
    const leftover = handDelta(prev, view, playerId) - (explainedGain[playerId] || 0);
    if (leftover <= 0 || deckDrop <= 0) continue;
    if (collapsed) {
      push({ from: { type: "deck" }, dest: { type: "player", playerId } });
    } else {
      for (let i = 0; i < leftover; i++) {
        push({
          from: { type: "deck" },
          dest: { type: "back", playerId, fromEnd: leftover - i },
        });
      }
    }
  }

  return flights;
}

export function captureCardOrigins(root) {
  // Pile ids / data-* hooks: docs/TABLE_ANIM.md — keep in sync when adding spaces.
  const cards = {};
  const players = {};
  const zones = {};
  if (!root) return { cards, players, zones };
  for (const el of root.querySelectorAll("[data-card-id]")) {
    if (el.closest("#space-overlay, #table-menu")) continue;
    const id = el.dataset.cardId;
    if (!id) continue;
    cards[id] = {
      rect: copyRect(el.getBoundingClientRect()),
      node: el.cloneNode(true),
    };
  }
  for (const box of root.querySelectorAll('[data-pile="hand"][data-player-id]')) {
    if (box.closest("#space-overlay, #table-menu")) continue;
    const playerId = box.dataset.playerId;
    const pile = box.querySelector(".mini-pile") || box.querySelector(".face-down") || box;
    players[playerId] = copyRect(pile.getBoundingClientRect());
  }
  zones.deck = pileRect(root.querySelector("#fp-deck"));
  zones.discard = pileRect(root.querySelector("#discard-cards"));
  zones.special = pileRect(root.querySelector("#special-cards"));
  zones.shared = pileRect(root.querySelector("#shared-cards"));
  zones.hand = pileRect(root.querySelector("#hand-cards"));
  zones.personal = pileRect(root.querySelector("#my-personal"));
  return { cards, players, zones };
}

function queryCard(root, id) {
  const felt = root.querySelector("#layout-freeplay") || root;
  return felt.querySelector(`[data-card-id="${cssEscape(id)}"]`);
}

function playerBox(root, playerId) {
  const sel = `[data-pile="hand"][data-player-id="${cssEscape(playerId)}"]`;
  return root.querySelector(sel) || document.querySelector(sel);
}

function liveZoneRect(root, zone, deckEl, feltEl) {
  if (zone === "deck") return pileRect(deckEl) || pileRect(root.querySelector("#fp-deck"));
  if (zone === "discard") return pileRect(root.querySelector("#discard-cards"));
  if (zone === "special") return pileRect(root.querySelector("#special-cards"));
  if (zone === "shared") return pileRect(root.querySelector("#shared-cards"));
  if (zone === "hand") return pileRect(root.querySelector("#hand-cards"));
  if (zone === "personal") return pileRect(root.querySelector("#my-personal"));
  return pileRect(feltEl);
}

function fromRect(flight, origins, root, deckEl, feltEl) {
  const from = flight.from;
  if (!from) return null;
  if (from.type === "card") return origins.cards[from.id]?.rect || null;
  if (from.type === "deck") {
    return origins.zones?.deck || liveZoneRect(root, "deck", deckEl, feltEl);
  }
  if (from.type === "player") {
    const box = playerBox(root, from.playerId);
    return origins.players?.[from.playerId] || pileRect(box);
  }
  return null;
}

function destTarget(flight, root, deckEl, feltEl) {
  const dest = flight.dest;
  if (!dest) return { el: null, rect: null };
  if (dest.type === "el" && dest.id) {
    const el = queryCard(root, dest.id);
    return { el, rect: el ? copyRect(el.getBoundingClientRect()) : null };
  }
  if (dest.type === "player") {
    const box = playerBox(root, dest.playerId);
    const pile = box?.querySelector(".mini-pile") || box;
    return { el: null, rect: pileRect(pile || box) };
  }
  if (dest.type === "back") {
    const box = playerBox(root, dest.playerId);
    const backs = box ? box.querySelectorAll(".face-down") : [];
    const el = backs[backs.length - dest.fromEnd] || backs[backs.length - 1] || null;
    return { el, rect: el ? copyRect(el.getBoundingClientRect()) : pileRect(box) };
  }
  if (dest.type === "zone") {
    return { el: null, rect: liveZoneRect(root, dest.zone, deckEl, feltEl) };
  }
  return { el: null, rect: null };
}

function ensureLayer() {
  let layer = document.getElementById("card-fly-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "card-fly-layer";
    document.body.append(layer);
  }
  return layer;
}

function invertOffset(from, to) {
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
  };
}

function flipFace(spin, delay) {
  if (!spin) return;
  spin.style.transform = "rotateY(180deg)";
  const anim = spin.animate(
    [{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }],
    {
      duration: DURATION_MS,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    }
  );
  const clear = () => {
    spin.style.transform = "";
  };
  anim.finished.then(clear, clear);
}

function unrotatedRect(el) {
  if (!el) return null;
  const inline = el.style.transform;
  const trans = el.style.transition;
  el.style.transition = "none";
  el.style.transform = "none";
  const rect = copyRect(el.getBoundingClientRect());
  el.style.transform = inline;
  el.style.transition = trans;
  return rect;
}

function flyIntoFan(el, from, delay, reveal) {
  const slot = el.closest(".fan-slot");
  if (!slot || !from) return;
  const to = unrotatedRect(slot);
  if (!to || (!to.width && !to.height)) return;
  const rot = (slot.style.getPropertyValue("--fan-rot") || "0deg").trim() || "0deg";
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const start = `translate(${dx}px, ${dy}px) rotate(0deg)`;
  const end = `rotate(${rot})`;
  slot.style.transition = "none";
  slot.style.transform = start;
  if (reveal) flipFace(el.querySelector(".card-3d"), delay);
  const anim = slot.animate([{ transform: start }, { transform: end }], {
    duration: DURATION_MS,
    delay,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "both",
  });
  const clear = () => {
    slot.style.transform = "";
    slot.style.transition = "";
  };
  anim.finished.then(clear, clear);
}

function flyGhost(from, to, delay, clone, reveal, onDone) {
  if (!from || !to) {
    onDone?.();
    return;
  }
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
    onDone?.();
    return;
  }
  const layer = ensureLayer();
  const ghost = clone ? clone.cloneNode(true) : document.createElement("div");
  if (!clone) ghost.className = "deck-back card-ghost";
  ghost.classList.add("card-ghost", "card-fly");
  ghost.style.visibility = "visible";
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  ghost.disabled = true;
  layer.append(ghost);
  if (reveal) flipFace(ghost.querySelector(".card-3d"), delay);
  const anim = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${dx}px, ${dy}px) scale(0.92)` },
    ],
    {
      duration: DURATION_MS,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    }
  );
  const done = () => {
    ghost.remove();
    onDone?.();
  };
  anim.finished.then(done, done);
}

function flyEl(el, from, delay, reveal) {
  const to = el.getBoundingClientRect();
  if (!to.width && !to.height) return;
  if (el.closest(".fan-slot")) {
    flyIntoFan(el, from, delay, reveal);
    return;
  }
  const { dx, dy } = invertOffset(from, to);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
    if (reveal) flipFace(el.querySelector(".card-3d"), delay);
    return;
  }
  const invert = `translate(${dx}px, ${dy}px) scale(0.92)`;
  el.classList.add("card-fly");
  el.style.transform = invert;
  if (reveal) flipFace(el.querySelector(".card-3d"), delay);
  const anim = el.animate([{ transform: invert }, { transform: "none" }], {
    duration: DURATION_MS,
    delay,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "both",
  });
  const clear = () => {
    el.classList.remove("card-fly");
    el.style.transform = "";
  };
  anim.finished.then(clear, clear);
}

export function playTableMoves(prev, view, { selfId, origins, deckEl, feltEl, root }) {
  if (reducedMotion()) return;
  if (!prev || prev === view) return;
  const flights = tableFlights(prev, view, selfId);
  if (!flights.length) return;
  const scope = root || document;
  const snap = origins || { cards: {}, players: {}, zones: {} };
  const gap = cardGapMs(flights.length);
  flights.forEach((flight, i) => {
    const from = fromRect(flight, snap, scope, deckEl, feltEl);
    const dest = destTarget(flight, scope, deckEl, feltEl);
    if (!from || (!dest.el && !dest.rect)) return;
    const delay = i * gap;
    if (dest.el) flyEl(dest.el, from, delay, flight.reveal);
    else {
      const clone = flight.id ? snap.cards[flight.id]?.node : null;
      flyGhost(from, dest.rect, delay, clone, flight.reveal);
    }
  });
}

/** @deprecated use playTableMoves */
export function playDealFromDeck(prev, view, opts) {
  playTableMoves(prev, view, { origins: { cards: {}, players: {}, zones: {} }, ...opts });
}
