import { isFirebaseConfigured } from "./config.js";
import { initFirebase } from "./signaling.js";
import { createHost } from "./host.js";
import { createGuest } from "./guest.js";
import {
  saveHostSession,
  loadHostSession,
  clearHostSession,
  saveGuestSession,
  loadGuestSession,
  clearGuestSession,
  lobbyStateForResume,
  secretForResume,
  getOrCreatePlayerId,
} from "./persist.js";
import { cardLabel, cardSprite, HAND_SORT_MODES, resolveHandSort, sortHand, RANKS, SUITS } from "./cards.js";
import { gameList, getGame } from "./games.js";
import { faceKey, isBanished, SPACE_VISIBILITY, FACE_VARIANTS, BACK_VARIANTS } from "./gameSettings.js";
import { captureCardOrigins, playTableMoves } from "./tableAnim.js";
import { layoutSpaceEl } from "./spaceLayout.js";

const els = {
  configError: document.getElementById("config-error"),
  viewHome: document.getElementById("view-home"),
  viewTable: document.getElementById("view-table"),
  nickname: document.getElementById("nickname"),
  joinCode: document.getElementById("join-code"),
  btnHost: document.getElementById("btn-host"),
  btnJoin: document.getElementById("btn-join"),
  btnResume: document.getElementById("btn-resume"),
  btnDiscard: document.getElementById("btn-discard"),
  resumeRow: document.getElementById("resume-row"),
  btnLeave: document.getElementById("btn-leave"),
  btnStart: document.getElementById("btn-start"),
  btnHostStart: document.getElementById("btn-host-start"),
  homeStatus: document.getElementById("home-status"),
  lobbyStatus: document.getElementById("lobby-status"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  lobbyTools: document.getElementById("lobby-tools"),
  colorPicks: document.getElementById("color-picks"),
  colorSwatches: document.getElementById("color-swatches"),
  handCards: document.getElementById("hand-cards"),
  handHint: document.getElementById("hand-hint"),
  handSort: document.getElementById("hand-sort"),
  handsStrip: document.getElementById("hands-strip"),
  tableGrid: document.getElementById("table-grid"),
  playerGrid: document.getElementById("player-grid"),
  personalPark: document.getElementById("personal-park"),
  gameType: document.getElementById("game-type"),
  gameBlurb: document.getElementById("game-blurb"),
  gameNameLabel: document.getElementById("game-name-label"),
  roundMessage: document.getElementById("round-message"),
  layoutFreeplay: document.getElementById("layout-freeplay"),
  freeplayBar: document.getElementById("freeplay-bar"),
  playerActions: document.getElementById("player-actions"),
  sendTarget: document.getElementById("send-target"),
  hostTools: document.getElementById("host-tools"),
  sharedCards: document.getElementById("shared-cards"),
  specialCards: document.getElementById("special-cards"),
  myPersonal: document.getElementById("my-personal"),
  discardCards: document.getElementById("discard-cards"),
  fpDeck: document.getElementById("fp-deck"),
  turnLabel: document.getElementById("turn-label"),
  dealCount: document.getElementById("deal-count"),
  dealTarget: document.getElementById("deal-target"),
  discardTarget: document.getElementById("discard-target"),
  actionLog: document.getElementById("action-log"),
  orderList: document.getElementById("order-list"),
  gameSettings: document.getElementById("game-settings"),
  settingDecks: document.getElementById("setting-decks"),
  settingDecksField: document.getElementById("setting-decks-field"),
  settingFrenchShoe: document.getElementById("setting-french-shoe"),
  faceVariants: document.getElementById("face-variants"),
  backVariants: document.getElementById("back-variants"),
  settingMin: document.getElementById("setting-min"),
  settingMax: document.getElementById("setting-max"),
  settingPersonalRows: document.getElementById("setting-personal-rows"),
  settingSharedRows: document.getElementById("setting-shared-rows"),
  settingSpaceViewGrid: document.getElementById("setting-space-view-grid"),
  settingSpaceViewStack: document.getElementById("setting-space-view-stack"),
  settingSkipEmpty: document.getElementById("setting-skip-empty"),
  settingHandView: document.getElementById("setting-hand-view"),
  settingShowPoints: document.getElementById("setting-show-points"),
  settingShowLives: document.getElementById("setting-show-lives"),
  settingShowCoins: document.getElementById("setting-show-coins"),
  settingCoins: document.getElementById("setting-coins"),
  btnSetCoinsAll: document.getElementById("btn-set-coins-all"),
  potPile: document.getElementById("pot-pile"),
  potValue: document.getElementById("pot-value"),
  betCount: document.getElementById("bet-count"),
  youStats: document.getElementById("you-stats"),
  playerRoster: document.getElementById("player-roster"),
  botTools: document.getElementById("bot-tools"),
  btnAddBot: document.getElementById("btn-add-bot"),
  botControl: document.getElementById("bot-control"),
  botControlName: document.getElementById("bot-control-name"),
  btnBotSelf: document.getElementById("btn-bot-self"),
  handOwnerLabel: document.getElementById("hand-owner-label"),
  rankOrder: document.getElementById("rank-order"),
  banRanks: document.getElementById("ban-ranks"),
  banGrid: document.getElementById("ban-grid"),
  spaceToggles: document.getElementById("space-toggles"),
  btnTurnChange: document.getElementById("btn-turn-change"),
  btnTurnSave: document.getElementById("btn-turn-save"),
  btnTurnCancel: document.getElementById("btn-turn-cancel"),
  btnRankChange: document.getElementById("btn-rank-change"),
  btnRankSave: document.getElementById("btn-rank-save"),
  btnRankCancel: document.getElementById("btn-rank-cancel"),
  mySpace: document.getElementById("my-space"),
  youArea: document.getElementById("you-area"),
  seatSouth: document.getElementById("seat-south"),
  btnMenu: document.getElementById("btn-menu"),
  btnMenuClose: document.getElementById("btn-menu-close"),
  tableMenu: document.getElementById("table-menu"),
  menuColorSwatches: document.getElementById("menu-color-swatches"),
  spaceOverlay: document.getElementById("space-overlay"),
  spaceOverlayTitle: document.getElementById("space-overlay-title"),
  spaceOverlayBody: document.getElementById("space-overlay-body"),
  spaceOverlayClose: document.getElementById("space-overlay-close"),
  playerDock: document.getElementById("player-dock"),
  btnOverflow: document.getElementById("btn-overflow"),
  handPeek: document.getElementById("hand-peek"),
};

const HAND_SORT_KEY = "cardLobby.handSort";
const LONG_PRESS_MS = 480;

let session = null;
let role = null;
let selfId = null;
let currentRoom = "";
let guestRetryTimer = null;
let leaving = false;
let joiningGuest = false;
let selectedGameId = "freeplay";
let lastView = null;
let selectedCardIds = new Set();
let handSortMode = null;
let turnOrderPicks = null;
let rankOrderPicks = null;
let suppressFeltClick = false;
let longPressTimer = null;
let spaceLayoutObserver = null;

function playerStat(player, key) {
  return Number(player?.stats?.[key] ?? player?.[key]) || 0;
}

function readHandSortStore() {
  try {
    return JSON.parse(sessionStorage.getItem(HAND_SORT_KEY) || "{}");
  } catch {
    return {};
  }
}

function handSortSpec(view) {
  const game = getGame(view?.gameId);
  const spec = resolveHandSort(game, view?.settings);
  const stored = readHandSortStore()[game.id];
  const mode =
    (handSortMode && spec.modes.includes(handSortMode) && handSortMode) ||
    (spec.modes.includes(stored) && stored) ||
    spec.defaultMode;
  return { ...spec, primary: mode, gameId: game.id };
}

function setHandSortMode(gameId, mode) {
  handSortMode = mode;
  try {
    const store = readHandSortStore();
    store[gameId] = mode;
    sessionStorage.setItem(HAND_SORT_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function renderHandSort(spec) {
  els.handSort.innerHTML = "";
  for (const mode of HAND_SORT_MODES) {
    if (!spec.modes.includes(mode.id)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost sort-btn" + (spec.primary === mode.id ? " selected" : "");
    btn.textContent = mode.label;
    btn.addEventListener("click", () => {
      setHandSortMode(spec.gameId, mode.id);
      if (lastView) renderState(lastView);
    });
    els.handSort.append(btn);
  }
}

const SEAT_COUNT = 15;

function seatIndex(view, playerId) {
  if (!playerId || !view) return -1;
  const picked = view.players?.[playerId]?.color;
  if (Number.isInteger(picked) && picked >= 0) return picked % SEAT_COUNT;
  const order = view.playerOrder?.length
    ? view.playerOrder
    : Object.keys(view.players || {});
  let index = order.indexOf(playerId);
  if (index < 0) index = Object.keys(view.players || {}).indexOf(playerId);
  return index < 0 ? -1 : index % SEAT_COUNT;
}

function seatClass(view, playerId) {
  const index = seatIndex(view, playerId);
  return index < 0 ? "" : `seat-${index}`;
}

function setSeatClass(el, view, playerId) {
  if (!el) return;
  for (const name of [...el.classList]) {
    if (name.startsWith("seat-")) el.classList.remove(name);
  }
  const name = seatClass(view, playerId);
  if (name) el.classList.add(name);
}

function setHomeStatus(text, error = false) {
  els.homeStatus.textContent = text || "";
  els.homeStatus.classList.toggle("error", error);
}

const CONNECTION_STATUS = new Set([
  "connected",
  "signaling",
  "connecting",
  "host gone",
  "reconnecting… waiting for host",
]);

function setLobbyStatus({ text, error }) {
  const hide = !text || CONNECTION_STATUS.has(text);
  els.lobbyStatus.textContent = hide ? "" : text;
  els.lobbyStatus.classList.toggle("error", Boolean(error) && !hide);
  els.lobbyStatus.classList.toggle("hidden", hide);
}

function nickname() {
  const value = els.nickname.value.trim();
  return value || "Player";
}

function showHome() {
  closeSpaceOverlay();
  closeTableMenu();
  els.viewTable.classList.add("hidden");
  els.viewHome.classList.remove("hidden");
  currentRoom = "";
  if (location.hash !== "#home") location.hash = "home";
  refreshResumeUi();
}

function showTable(code) {
  els.viewHome.classList.add("hidden");
  els.viewTable.classList.remove("hidden");
  els.roomCodeDisplay.textContent = code;
  currentRoom = code;
  els.lobbyTools.classList.add("hidden");
  if (location.hash !== "#table") location.hash = "table";
}

function sendAction(action, extra = {}) {
  if (!session) return;
  if (role === "host") session.hostIntent(action, extra);
  else session.sendIntent(action, extra);
}

function paintIndex(rank, symbol) {
  const index = document.createElement("span");
  index.className = "card-index";
  if (rank) {
    const rankEl = document.createElement("span");
    rankEl.className = "card-rank";
    rankEl.textContent = String(rank);
    index.append(rankEl);
  }
  if (symbol) {
    const suitEl = document.createElement("span");
    suitEl.className = "card-suit";
    suitEl.textContent = symbol;
    index.append(suitEl);
  }
  return index;
}

const PIP_SLOTS = {
  2: ["t", "b"],
  3: ["t", "c", "b"],
  4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "c", "bl", "br"],
  6: ["tl", "tr", "ml", "mr", "bl", "br"],
  7: ["tl", "tr", "tc", "ml", "mr", "bl", "br"],
  8: ["tl", "tr", "tc", "ml", "mr", "bc", "bl", "br"],
  9: ["tl", "tr", "tcl", "tcr", "c", "bcl", "bcr", "bl", "br"],
  10: ["tl", "tr", "tcl", "tcr", "ml", "mr", "bcl", "bcr", "bl", "br"],
};

function paintCardFace(btn, card) {
  const label = cardLabel(card);
  const sprite = cardSprite(card);
  const front = btn.querySelector(".card-front") || btn;
  const rank = card.rank ?? card.face?.rank;
  const symbol = card.symbol ?? card.face?.symbol;
  const variant = lastView?.settings?.faceVariant || "default";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  front.replaceChildren();
  front.style.backgroundImage = "";
  btn.classList.remove("has-sprite", "has-index", "has-pips", "has-ornate");
  if (sprite) {
    btn.classList.add("has-sprite");
    front.style.backgroundImage = `url("${sprite}")`;
    return;
  }
  if (card.kind !== "token" && (rank || symbol)) {
    btn.classList.add("has-index");
    front.append(paintIndex(rank, symbol));
    if (variant === "pips") {
      const slots = PIP_SLOTS[String(rank)];
      if (slots) {
        btn.classList.add("has-pips");
        const wrap = document.createElement("span");
        wrap.className = `card-pips pips-${rank}`;
        for (const pos of slots) {
          const pip = document.createElement("span");
          pip.className = `pip pip-${pos}`;
          pip.textContent = symbol || "";
          wrap.append(pip);
        }
        front.append(wrap);
      } else if (symbol) {
        const center = document.createElement("span");
        center.className = "card-center";
        center.textContent = symbol;
        front.append(center);
      }
    } else if (variant === "ornate") {
      btn.classList.add("has-ornate");
      if (symbol || rank) {
        const center = document.createElement("span");
        center.className = "card-center";
        center.textContent = symbol || String(rank);
        front.append(center);
      }
      const br = paintIndex(rank, symbol);
      br.classList.add("card-index-br");
      front.append(br);
    }
    return;
  }
  front.textContent = label;
}

function makePlayingCard(card, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "playing-card" + extraClass + ((card.color ?? card.face?.color) === "red" ? " red" : "");
  const spin = document.createElement("span");
  spin.className = "card-3d";
  const front = document.createElement("span");
  front.className = "card-front";
  const back = document.createElement("span");
  back.className = "card-back";
  back.setAttribute("aria-hidden", "true");
  spin.append(front, back);
  btn.append(spin);
  if (card.id) btn.dataset.cardId = card.id;
  paintCardFace(btn, card);
  return btn;
}

function wrapFanSlot(child, selected) {
  const slot = document.createElement("span");
  slot.className = "fan-slot" + (selected ? " selected" : "");
  slot.append(child);
  return slot;
}

function layoutFan(container) {
  if (!container) return;
  const slots = [...container.children].filter((el) => el.classList.contains("fan-slot"));
  const n = slots.length;
  container.dataset.count = String(n);
  if (!n) return;
  const cardW = parseFloat(getComputedStyle(container).getPropertyValue("--fan-card-w")) || 4.7;
  const spread = n <= 1 ? 0 : Math.min(96, 26 + n * 6.2);
  const step = n <= 1 ? cardW : Math.max(cardW * 0.2, cardW * 0.5 - n * 0.06);
  container.style.setProperty("--fan-step", `${step}rem`);
  slots.forEach((slot, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rot = -spread / 2 + t * spread;
    slot.style.setProperty("--fan-rot", `${rot}deg`);
    const z = String(i + 1);
    slot.style.setProperty("--fan-z", z);
    slot.style.zIndex = z;
  });
}

function toggleHandCard(cardId, btn) {
  const on = !selectedCardIds.has(cardId);
  if (on) selectedCardIds.add(cardId);
  else selectedCardIds.delete(cardId);
  const cardBtn =
    btn || els.handCards?.querySelector(`[data-card-id="${cardId}"]`);
  cardBtn?.classList.toggle("selected-card", on);
  const slot = cardBtn?.closest(".fan-slot");
  if (slot) slot.classList.toggle("selected", on);
  updateDropTargets(lastView);
}

function clearHandSelection() {
  selectedCardIds.clear();
  for (const el of els.handCards?.querySelectorAll(".selected-card") || []) {
    el.classList.remove("selected-card");
  }
  for (const el of els.handCards?.querySelectorAll(".fan-slot.selected") || []) {
    el.classList.remove("selected");
  }
  updateDropTargets(lastView);
}

function appendCardButton(parent, card, { selectable, view, ownerId, fan } = {}) {
  const btn = makePlayingCard(card);
  const seat = seatClass(view || lastView, card.playedBy || ownerId);
  if (seat) btn.classList.add(seat);
  if (selectable && selectedCardIds.has(card.id)) btn.classList.add("selected-card");
  if (selectable) {
    btn.addEventListener("click", () => toggleHandCard(card.id, btn));
  } else {
    btn.disabled = true;
  }
  parent.append(fan ? wrapFanSlot(btn, btn.classList.contains("selected-card")) : btn);
}

function splitSpaceRows(cards, rowCount) {
  const n = Math.max(1, Math.min(4, Number(rowCount) || 1));
  const list = cards || [];
  const rows = Array.from({ length: n }, () => []);
  if (n <= 1) {
    rows[0] = list.slice();
    return rows;
  }
  if (n === 2) {
    for (const card of list) {
      if (card.kind === "token") rows[1].push(card);
      else rows[0].push(card);
    }
    return rows;
  }
  const size = Math.max(1, Math.ceil(list.length / n));
  list.forEach((card, i) => rows[Math.min(n - 1, Math.floor(i / size))].push(card));
  return rows;
}

function spaceViewMode(view) {
  return view?.settings?.spaceView === "stacked" ? "stacked" : "grid";
}

function fillSpace(el, cards, opts, rowCount) {
  if (!el) return;
  el.innerHTML = "";
  const mode = spaceViewMode(opts?.view || lastView);
  const kind = opts?.spaceKind || el.dataset.spaceKind || "personal";
  el.dataset.spaceKind = kind;
  el.classList.add("space-chip", "space-stack");
  el.classList.toggle("space-view-grid", mode === "grid");
  el.classList.toggle("space-view-stack", mode === "stacked");
  const list = cards || [];
  el.dataset.cardCount = String(list.length);
  for (const rowCards of splitSpaceRows(list, rowCount)) {
    if (!rowCards.length) continue;
    const row = document.createElement("div");
    row.className = "space-pile";
    row.dataset.count = String(rowCards.length);
    for (const card of rowCards) {
      appendCardButton(row, card, {
        ...opts,
        selectable: false,
      });
    }
    el.append(row);
  }
}

function layoutTableSpaces() {
  for (const el of els.tableGrid?.querySelectorAll(".space-chip") || []) {
    layoutSpaceEl(el);
  }
}

function ensureSpaceLayoutObserver() {
  if (spaceLayoutObserver || typeof ResizeObserver === "undefined" || !els.tableGrid) return;
  spaceLayoutObserver = new ResizeObserver(() => layoutTableSpaces());
  spaceLayoutObserver.observe(els.tableGrid);
}

function renderCardStack(el, cards, view) {
  if (!el) return;
  el.innerHTML = "";
  const list = cards || [];
  const top = list[list.length - 1];
  if (top) {
    const btn = makePlayingCard(top, " stack-card");
    const seat = seatClass(view || lastView, top.playedBy);
    if (seat) btn.classList.add(seat);
    btn.disabled = true;
    el.append(btn);
  }
  const count = document.createElement("div");
  count.className = "deck-count";
  count.textContent = String(list.length);
  el.append(count);
}

function renderDeck(el, count) {
  if (!el) return;
  el.innerHTML = "";
  const n = Math.min(8, Math.max(0, count));
  for (let i = 0; i < n; i++) {
    const back = document.createElement("div");
    back.className = "deck-back";
    back.style.left = `${i * 2}px`;
    back.style.top = `${-i * 2}px`;
    back.style.zIndex = String(i);
    el.append(back);
  }
  const label = document.createElement("div");
  label.className = "deck-count";
  label.textContent = String(count);
  el.append(label);
}

const STAT_META = {
  points: { className: "stat-star", label: "Points" },
  lives: { className: "stat-heart", label: "Lives" },
  coins: { className: "stat-coin", label: "Coins" },
};

function bumpPlayerStat(playerId, stat, delta) {
  if (role !== "host") return;
  sendAction("setPlayerStat", { playerId, stat, delta });
}

function appendStatBadge(parent, view, playerId, stat, value) {
  const meta = STAT_META[stat];
  const wrap = document.createElement("span");
  wrap.className = "stat-wrap";
  if (role === "host") {
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stat-adj";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Remove ${meta.label}`);
    minus.addEventListener("click", () => bumpPlayerStat(playerId, stat, -1));
    wrap.append(minus);
  }
  const badge = document.createElement("span");
  badge.className = meta.className;
  badge.textContent = String(value ?? 0);
  badge.title = meta.label;
  wrap.append(badge);
  if (role === "host") {
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stat-adj";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add ${meta.label}`);
    plus.addEventListener("click", () => bumpPlayerStat(playerId, stat, 1));
    wrap.append(plus);
  }
  parent.append(wrap);
}

function fillPlayerStats(el, view, playerId) {
  if (!el) return;
  el.innerHTML = "";
  const player = view.players?.[playerId];
  if (!player) return;
  if (view.settings?.showPoints !== false) {
    appendStatBadge(el, view, playerId, "points", playerStat(player, "points"));
  }
  if (view.settings?.showLives) {
    appendStatBadge(el, view, playerId, "lives", playerStat(player, "lives"));
  }
  if (view.settings?.showCoins) {
    appendStatBadge(el, view, playerId, "coins", playerStat(player, "coins"));
  }
}

function playerOrderList(view) {
  const players = view.players || {};
  const order = view.playerOrder?.length ? view.playerOrder : Object.keys(players);
  return order.filter((id) => players[id]);
}

function opponentsClockwise(view) {
  const order = playerOrderList(view);
  const i = order.indexOf(selfId);
  if (i < 0) return order.filter((id) => id !== selfId);
  return [...order.slice(i + 1), ...order.slice(0, i)];
}

/** Table slots: circular playerOrder rotated so You is last (bottom-right when even / 6+). */
function tableSlotOrder(view) {
  const order = playerOrderList(view);
  if (!order.length) return [];
  const others = opponentsClockwise(view);
  if (!order.includes(selfId)) return others;
  return [...others, selfId];
}

function personalTableOn(view) {
  return spaceVisible(view, "personal");
}

function sharedTableOn(view) {
  return !personalTableOn(view) && spaceVisible(view, "table");
}

function applyCardVariants(view) {
  const root = document.documentElement;
  root.dataset.faceVariant = view?.settings?.faceVariant || "default";
  root.dataset.backVariant = view?.settings?.backVariant || "default";
}

function parkMySpace() {
  if (els.mySpace && els.personalPark && els.mySpace.parentElement !== els.personalPark) {
    els.personalPark.append(els.mySpace);
  }
}

function fillHandPile(hand, n, seatName, collapsed) {
  hand.innerHTML = "";
  if (collapsed) {
    const pile = document.createElement("div");
    pile.className = "mini-pile";
    pile.title = `${n} in hand`;
    const back = document.createElement("div");
    back.className = "deck-back " + (seatName || "");
    pile.append(back);
    const count = document.createElement("div");
    count.className = "deck-count";
    count.textContent = String(n);
    pile.append(count);
    hand.append(pile);
    return;
  }
  for (let i = 0; i < n; i++) {
    const back = document.createElement("span");
    back.className = "face-down " + (seatName || "");
    hand.append(back);
  }
}

function renderHandsStrip(view) {
  const strip = els.handsStrip;
  if (!strip) return;
  strip.innerHTML = "";
  const players = view.players || {};
  const counts = view.handCounts || {};
  const collapsed = view.settings?.opponentHandView === "collapsed";
  const showHands = spaceVisible(view, "hand");
  for (const id of playerOrderList(view)) {
    const player = players[id];
    if (!player) continue;
    const chip = document.createElement("div");
    chip.className =
      "hand-chip" +
      (id === selfId ? " is-you" : "") +
      (player.connected === false ? " offline" : "");
    chip.dataset.playerId = id;
    chip.dataset.pile = "hand";
    setSeatClass(chip, view, id);
    const name = document.createElement("div");
    name.className = "hand-chip-name";
    name.textContent = id === selfId ? "You" : player.name || "Player";
    const pile = document.createElement("div");
    pile.className = "opponent-hand card-row";
    const n = showHands ? counts[id] ?? 0 : 0;
    fillHandPile(pile, n, seatClass(view, id), collapsed);
    chip.append(name, pile);
    strip.append(chip);
  }
}

function mountPlayerSlot(view, id, { span, phase }) {
  const players = view.players || {};
  const player = players[id];
  if (!player || !els.playerGrid) return;
  const mine = id === selfId;
  const box = document.createElement("div");
  box.className =
    "player-slot" +
    (mine ? " is-you" : " opponent") +
    (player.connected === false ? " offline" : "") +
    (span ? " is-span" : "");
  box.dataset.playerId = id;
  box.dataset.pile = "personal";
  box.dataset.drop = "player";
  setSeatClass(box, view, id);
  if (phase === "playing" && view.currentPlayerId === id) box.classList.add("is-turn");
  const name = document.createElement("div");
  name.className = "opponent-name";
  const bits = document.createElement("span");
  const labels = [mine ? "You" : player.name || "Player"];
  if (player.isHost) labels.push("host");
  if (player.isBot) labels.push("bot");
  if (player.connected === false) labels.push("away");
  if ((view.bustedIds || []).includes(id)) labels.push("bust");
  else if ((view.inactiveIds || []).includes(id)) labels.push("out");
  bits.textContent = labels.join(" · ");
  name.append(bits);
  const stats = document.createElement("span");
  stats.className = "player-stats";
  fillPlayerStats(stats, view, id);
  name.append(stats);
  if (
    role === "host" &&
    view.allowBots &&
    id !== selfId &&
    (player.isBot || id === "host")
  ) {
    const take = document.createElement("button");
    take.type = "button";
    take.className = "ghost seat-control";
    take.textContent = "Play as";
    take.addEventListener("click", (event) => {
      event.stopPropagation();
      session?.setHostSeat?.(id);
    });
    name.append(take);
  }
  box.append(name);
  if (mine) {
    if (els.mySpace) box.append(els.mySpace);
  } else {
    const body = document.createElement("div");
    body.className = "opponent-body";
    const space = document.createElement("div");
    space.className = "opponent-space space-stack space-chip";
    fillSpace(space, (view.personal && view.personal[id]) || [], {
      view,
      ownerId: id,
      spaceKind: "personal",
    }, view.settings?.personalRows);
    body.append(space);
    box.append(body);
  }
  els.playerGrid.append(box);
}

function renderPlayerGrid(view, phase) {
  parkMySpace();
  if (els.playerGrid) els.playerGrid.innerHTML = "";
  if (!personalTableOn(view)) return;
  const order = tableSlotOrder(view);
  const n = order.length;
  const spanLast = n % 2 === 1;
  for (let i = 0; i < n; i++) {
    mountPlayerSlot(view, order[i], { span: spanLast && i === n - 1, phase });
  }
}

function applyTableMode(view) {
  const personal = personalTableOn(view);
  const shared = sharedTableOn(view);
  els.tableGrid?.classList.toggle("is-personal", personal);
  els.tableGrid?.classList.toggle("is-shared", shared);
  els.layoutFreeplay?.classList.toggle("is-personal", personal);
  els.layoutFreeplay?.classList.toggle("is-shared", shared);
}

function renderOpponents(view, phase) {
  renderHandsStrip(view);
  renderPlayerGrid(view, phase);
  applyTableMode(view);
}

function tableActions(view) {
  const game = getGame(view?.gameId);
  return {
    placeShared: true,
    placePersonal: true,
    placeDiscard: true,
    endTurn: true,
    sendCards: false,
    betCoins: false,
    drawCard: false,
    stay: false,
    targetPlayer: false,
    ...(game.tableActions || {}),
  };
}

function playContext(view) {
  const phase = view?.phase || "lobby";
  const acts = tableActions(view);
  const game = getGame(view?.gameId);
  const myTurn =
    phase === "playing" &&
    view.currentPlayerId === selfId &&
    !(view.inactiveIds || []).includes(selfId);
  const lobbyPass = phase === "lobby" && acts.sendCards;
  const needTarget = Boolean(game.needsTarget?.(view, selfId));
  const needTargetAny = Object.keys(view?.players || {}).some((id) =>
    game.needsTarget?.(view, id)
  );
  return {
    phase,
    acts,
    game,
    myTurn,
    lobbyPass,
    needTarget,
    needTargetAny,
    canSelectHand: myTurn || lobbyPass,
    canPlace: myTurn && !needTargetAny,
    canDraw: myTurn && acts.drawCard && !needTargetAny,
    canTarget: phase === "playing" && acts.targetPlayer && needTarget,
  };
}

function updateDropTargets(view) {
  if (!view) return;
  const ctx = playContext(view);
  const hasSel = selectedCardIds.size > 0;
  const setDrop = (name, on) => {
    for (const el of document.querySelectorAll(`[data-drop="${name}"]`)) {
      el.classList.toggle("is-drop", on);
    }
  };
  setDrop("shared", ctx.canPlace && ctx.acts.placeShared && hasSel && sharedTableOn(view));
  setDrop("personal", ctx.canPlace && ctx.acts.placePersonal && hasSel && personalTableOn(view));
  setDrop("discard", ctx.canPlace && ctx.acts.placeDiscard && hasSel && spaceVisible(view, "discard"));
  setDrop("deck", ctx.canDraw && spaceVisible(view, "deck"));
  setDrop("special", false);
  for (const box of document.querySelectorAll('.player-slot[data-pile="personal"][data-player-id]')) {
    const sendOk = ctx.lobbyPass && hasSel && ctx.acts.sendCards && box.dataset.playerId !== selfId;
    const targetOk = ctx.canTarget;
    box.classList.toggle("is-drop", sendOk || targetOk);
  }
  els.youArea?.classList.toggle("is-drop", ctx.canTarget);
  els.youArea?.classList.toggle("has-selection", hasSel);
  if (els.handHint) {
    els.handHint.textContent = hasSel
      ? "· tap a highlighted space"
      : ctx.canTarget
        ? "· tap a player"
        : "· tap cards, then a space";
  }
}

function updateOverflowVisibility() {
  const bar = els.freeplayBar;
  if (!bar || !els.btnOverflow) return;
  const visible = [...bar.querySelectorAll("[data-act], select, input")].some(
    (el) => !el.classList.contains("hidden")
  );
  els.btnOverflow.classList.toggle("hidden", !visible);
  if (!visible) bar.classList.add("hidden");
  if (els.playerDock) {
    const stayHidden = Boolean(
      els.playerDock.querySelector('[data-act="stay"]')?.classList.contains("hidden")
    );
    const endHidden = Boolean(
      els.playerDock.querySelector('[data-act="endTurn"]')?.classList.contains("hidden")
    );
    els.playerDock.classList.toggle("hidden", stayHidden && endHidden && !visible);
  }
}

let overlayKind = null;
let overlayPlayerId = null;

function fillInspectCards(el, cards, view, ownerId, rowCount) {
  if (!el) return;
  el.innerHTML = "";
  const list = cards || [];
  if (!list.length) {
    el.textContent = "Empty";
    return;
  }
  for (const rowCards of splitSpaceRows(list, rowCount)) {
    const row = document.createElement("div");
    row.className = "card-row";
    for (const card of rowCards) {
      const btn = makePlayingCard(card);
      delete btn.dataset.cardId;
      btn.disabled = true;
      const seat = seatClass(view || lastView, card.playedBy || ownerId);
      if (seat) btn.classList.add(seat);
      row.append(btn);
    }
    el.append(row);
  }
}

function closeSpaceOverlay() {
  overlayKind = null;
  overlayPlayerId = null;
  els.spaceOverlay?.close?.();
}

function openSpaceOverlay(kind, playerId = null) {
  overlayKind = kind;
  overlayPlayerId = playerId;
  els.freeplayBar?.classList.add("hidden");
  refreshSpaceOverlay(lastView);
  if (els.spaceOverlay && !els.spaceOverlay.open) els.spaceOverlay.showModal();
}

function refreshSpaceOverlay(view) {
  if (!els.spaceOverlay?.open && !overlayKind) return;
  if (!view || !overlayKind) return;
  const title = els.spaceOverlayTitle;
  const body = els.spaceOverlayBody;
  if (overlayKind === "shared") {
    if (title) title.textContent = "Table";
    fillInspectCards(body, view.shared, view, null, view.settings?.sharedRows);
    return;
  }
  if (overlayKind === "personal") {
    const id = overlayPlayerId || selfId;
    const name = id === selfId ? "Your space" : `${view.players?.[id]?.name || "Player"}'s space`;
    if (title) title.textContent = name;
    fillInspectCards(
      body,
      (view.personal && view.personal[id]) || [],
      view,
      id,
      view.settings?.personalRows
    );
    return;
  }
  if (overlayKind === "discard") {
    if (title) title.textContent = "Discard";
    fillInspectCards(body, view.discard, view, null, 1);
    return;
  }
  if (overlayKind === "special") {
    if (title) title.textContent = "Special";
    fillInspectCards(body, view.special, view, null, 1);
    return;
  }
  if (overlayKind === "deck") {
    if (title) title.textContent = "Deck";
    if (body) body.textContent = `${view.deckCount ?? 0} cards`;
  }
}

function inspectDrop(drop, playerId) {
  if (drop === "shared") openSpaceOverlay("shared");
  else if (drop === "personal") openSpaceOverlay("personal", selfId);
  else if (drop === "discard") openSpaceOverlay("discard");
  else if (drop === "special") openSpaceOverlay("special");
  else if (drop === "deck") openSpaceOverlay("deck");
  else if (drop === "player") openSpaceOverlay("personal", playerId);
}

function handlePlayerTap(playerId) {
  const view = lastView;
  if (!view || !playerId) return;
  const ctx = playContext(view);
  if (ctx.canTarget) {
    sendAction("targetPlayer", { playerId });
    return;
  }
  if (ctx.lobbyPass && selectedCardIds.size) {
    sendAction("sendCards", { cardIds: [...selectedCardIds], playerId });
    clearHandSelection();
    return;
  }
  inspectDrop("player", playerId);
}

function handleDropTap(drop, playerId) {
  const view = lastView;
  if (!view || !drop) return;
  const ctx = playContext(view);
  const hasSel = selectedCardIds.size > 0;
  if (drop === "deck") {
    if (ctx.canDraw) sendAction("drawCard", { count: 1 });
    else inspectDrop("deck");
    return;
  }
  if (drop === "shared") {
    if (ctx.canPlace && ctx.acts.placeShared && hasSel) {
      placeSelected({ type: "shared" });
      return;
    }
    inspectDrop("shared");
    return;
  }
  if (drop === "personal") {
    if (ctx.canPlace && ctx.acts.placePersonal && hasSel) {
      placeSelected({ type: "personal", playerId: selfId });
      return;
    }
    if (ctx.canTarget) {
      sendAction("targetPlayer", { playerId: selfId });
      return;
    }
    inspectDrop("personal");
    return;
  }
  if (drop === "discard") {
    if (ctx.canPlace && ctx.acts.placeDiscard && hasSel) {
      placeSelected({ type: "discard" });
      return;
    }
    inspectDrop("discard");
    return;
  }
  if (drop === "special") {
    inspectDrop("special");
    return;
  }
  if (drop === "player") handlePlayerTap(playerId);
}

function feltIgnoreTarget(target) {
  return Boolean(
    target.closest(
      "#hand-cards, #player-dock, #hand-peek, #hand-sort, #bot-control, #hands-strip, .seat-control, .stat-adj"
    )
  );
}

function onFeltClick(event) {
  if (suppressFeltClick) {
    suppressFeltClick = false;
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (feltIgnoreTarget(target)) return;
  if (target.closest("#hand-cards")) return;

  const dropEl = target.closest("[data-drop]");
  if (dropEl && dropEl.dataset.drop !== "player") {
    handleDropTap(dropEl.dataset.drop, dropEl.dataset.playerId);
    return;
  }
  const playerBox = target.closest('.player-slot[data-pile="personal"][data-player-id]');
  if (playerBox) {
    handlePlayerTap(playerBox.dataset.playerId);
    return;
  }
  if (dropEl) {
    handleDropTap(dropEl.dataset.drop, dropEl.dataset.playerId);
    return;
  }
  if (target.closest("#you-area") && playContext(lastView).canTarget) {
    handlePlayerTap(selfId);
    return;
  }
  if (selectedCardIds.size) clearHandSelection();
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onFeltPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element) || feltIgnoreTarget(target)) return;
  const dropEl = target.closest("[data-drop]");
  if (!dropEl) return;
  const startX = event.clientX;
  const startY = event.clientY;
  clearLongPress();
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    suppressFeltClick = true;
    inspectDrop(dropEl.dataset.drop, dropEl.dataset.playerId);
    setTimeout(() => {
      suppressFeltClick = false;
    }, 400);
  }, LONG_PRESS_MS);
  const cancel = (moveEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (dx * dx + dy * dy > 144) {
      clearLongPress();
      cleanup();
    }
  };
  const cleanup = () => {
    clearLongPress();
    window.removeEventListener("pointermove", cancel);
    window.removeEventListener("pointerup", cleanup);
    window.removeEventListener("pointercancel", cleanup);
  };
  window.addEventListener("pointermove", cancel);
  window.addEventListener("pointerup", cleanup);
  window.addEventListener("pointercancel", cleanup);
}

function openTableMenu() {
  if (els.tableMenu && !els.tableMenu.open) els.tableMenu.showModal();
}

function closeTableMenu() {
  els.tableMenu?.close?.();
}

function toggleOverflow(event) {
  event?.stopPropagation();
  els.freeplayBar?.classList.toggle("hidden");
}

function toggleHandPeek() {
  const on = !els.youArea?.classList.contains("is-peek");
  els.youArea?.classList.toggle("is-peek", on);
  els.handPeek?.setAttribute("aria-pressed", on ? "true" : "false");
}

function renderState(view) {
  if (!view) return;
  const prev = lastView;
  const origins =
    prev && prev !== view ? captureCardOrigins(els.viewTable) : { cards: {}, players: {}, zones: {} };
  lastView = view;
  if (view.viewerId) selfId = view.viewerId;
  applyCardVariants(view);
  const phase = view.phase || "lobby";
  els.lobbyTools.classList.add("hidden");
  els.handHint.classList.remove("hidden");
  els.handHint.textContent = "· tap cards, then a space";
  if (view.gameName) els.gameNameLabel.textContent = view.gameName;
  if (view.message) {
    els.roundMessage.textContent = view.message;
    els.roundMessage.classList.remove("hidden");
  } else {
    els.roundMessage.classList.add("hidden");
    els.roundMessage.textContent = "";
  }

  const turnName = view.players?.[view.currentPlayerId]?.name;
  els.turnLabel.textContent = turnName ? `Turn: ${turnName}` : "";
  setSeatClass(els.turnLabel, view, view.currentPlayerId);

  setSeatClass(els.mySpace, view, selfId);
  setSeatClass(els.youArea, view, selfId);
  setSeatClass(els.seatSouth, view, selfId);
  const myTurnSeat = phase === "playing" && view.currentPlayerId === selfId;
  els.youArea?.classList.toggle("is-turn", myTurnSeat);
  els.seatSouth?.classList.toggle("is-turn", myTurnSeat);
  const sittingBot = Boolean(view.players?.[selfId]?.isBot);
  if (els.handOwnerLabel) {
    els.handOwnerLabel.textContent = sittingBot
      ? `${view.players[selfId].name || "Bot"}'s hand`
      : "Your hand";
  }
  if (els.botControl) {
    els.botControl.classList.toggle(
      "hidden",
      role !== "host" || !sittingBot || !view.allowBots
    );
    if (els.botControlName) {
      els.botControlName.textContent = view.players?.[selfId]?.name || "bot";
    }
  }

  els.layoutFreeplay.classList.remove("hidden");
  els.freeplayBar?.classList.add("hidden");
  els.btnStart?.classList.toggle("hidden", role !== "host");
  els.hostTools.classList.toggle("hidden", role !== "host");
  els.gameSettings.classList.toggle("hidden", role !== "host");
  applySpaceVisibility(view);
  const ctx = playContext(view);
  const { acts, myTurn, lobbyPass, needTargetAny, canSelectHand, canTarget } = ctx;
  const showCoins = Boolean(view.settings?.showCoins);
  const canBet = phase === "playing" && acts.betCoins && showCoins;
  const actionRoot = [els.playerActions, els.playerDock].filter(Boolean);
  for (const root of actionRoot) {
    for (const btn of root.querySelectorAll("button[data-act]")) {
      const act = btn.dataset.act;
      if (act === "sendCards") btn.disabled = !lobbyPass;
      else if (act === "betCoins") btn.disabled = !canBet;
      else if (act === "targetPlayer") btn.disabled = !canTarget;
      else btn.disabled = !myTurn || needTargetAny;
    }
  }
  if (els.sendTarget) els.sendTarget.disabled = !(lobbyPass || canTarget);
  if (els.betCount) els.betCount.disabled = !canBet;
  if (els.potPile) {
    els.potPile.classList.toggle("hidden", !showCoins);
    if (els.potValue) els.potValue.textContent = String(view.pot ?? 0);
  }
  const undoBtn = els.hostTools.querySelector('[data-act="undo"]');
  if (undoBtn) undoBtn.disabled = !view.canUndo;

  renderColorPicks(view);
  renderOpponents(view, phase);
  fillPlayerStats(els.youStats, view, selfId);

  renderDeck(els.fpDeck, view.deckCount ?? 0);
  fillSpace(els.sharedCards, view.shared, { view, spaceKind: "shared" }, view.settings?.sharedRows);
  fillSpace(els.myPersonal, (view.personal && view.personal[selfId]) || [], {
    view,
    ownerId: selfId,
    spaceKind: "personal",
  }, view.settings?.personalRows);
  renderCardStack(els.discardCards, view.discard, view);
  renderCardStack(els.specialCards, view.special, view);

  if (role === "host") fillHostControls(view);
  fillSendTarget(view);
  if (role === "host") fillGameSettings(view);

  const sortSpec = handSortSpec(view);
  renderHandSort(sortSpec);
  const hand = sortHand(view.hand || [], sortSpec);
  const handIds = new Set(hand.map((card) => card.id));
  for (const id of [...selectedCardIds]) {
    if (!handIds.has(id)) selectedCardIds.delete(id);
  }

  els.handCards.innerHTML = "";
  els.handCards.style.removeProperty("--fan-step");
  for (const card of hand) {
    appendCardButton(els.handCards, card, {
      selectable: canSelectHand,
      view,
      ownerId: selfId,
      fan: true,
    });
  }
  if (!(view.hand || []).length) {
    els.handCards.textContent = phase === "lobby" ? "—" : "No cards";
  } else {
    layoutFan(els.handCards);
  }

  ensureSpaceLayoutObserver();
  void els.tableGrid?.offsetHeight;
  layoutTableSpaces();

  updateDropTargets(view);
  if (els.spaceOverlay?.open) refreshSpaceOverlay(view);

  playTableMoves(prev, view, {
    selfId,
    origins,
    deckEl: els.fpDeck,
    feltEl: els.layoutFreeplay,
    root: els.viewTable,
  });
}

function renderColorPicks(view) {
  const mine = view.players?.[selfId]?.color;
  const taken = new Set(
    Object.entries(view.players || {})
      .filter(([id, player]) => id !== selfId && Number.isInteger(player.color))
      .map(([, player]) => player.color)
  );
  els.colorPicks.classList.toggle("hidden", Number.isInteger(mine));
  fillColorSwatches(els.colorSwatches, mine, taken);
  fillColorSwatches(els.menuColorSwatches, mine, taken);
}

function fillColorSwatches(host, mine, taken) {
  if (!host) return;
  host.innerHTML = "";
  for (let i = 0; i < SEAT_COUNT; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `color-swatch seat-${i}`;
    btn.setAttribute("aria-label", `Color ${i + 1}`);
    if (mine === i) btn.classList.add("selected");
    if (taken.has(i)) {
      btn.disabled = true;
      btn.title = "Taken";
    }
    btn.addEventListener("click", () => sendAction("setColor", { color: i }));
    host.append(btn);
  }
}

function fillVariantPicks(host, variants, current, key) {
  if (!host) return;
  host.innerHTML = "";
  for (const item of variants) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost sort-btn" + (item.id === current ? " selected" : "");
    btn.textContent = item.label;
    btn.addEventListener("click", () => patchSettings({ [key]: item.id }));
    host.append(btn);
  }
}

function fillHostControls(view) {
  if (role !== "host") return;
  const players = view.players || {};
  const prevDeal = els.dealTarget.value;
  const prevDiscard = els.discardTarget.value;
  const fillPlayers = (select) => {
    select.innerHTML = "";
    for (const [id, player] of Object.entries(players)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent =
        player.name +
        (id === "host" ? " (host)" : "") +
        (player.isBot ? " (bot)" : "");
      select.append(opt);
    }
  };
  fillPlayers(els.dealTarget);
  fillPlayers(els.discardTarget);
  if ([...els.dealTarget.options].some((o) => o.value === prevDeal)) {
    els.dealTarget.value = prevDeal;
  }
  if ([...els.discardTarget.options].some((o) => o.value === prevDiscard)) {
    els.discardTarget.value = prevDiscard;
  }
  const startBtn = els.btnHostStart;
  if (startBtn) startBtn.textContent = "Start";
  fillActionLog(view);
}

function fillActionLog(view) {
  const el = els.actionLog;
  if (!el) return;
  const rows = view.actionLog || [];
  el.innerHTML = "";
  if (!rows.length) {
    el.textContent = "No actions yet.";
    return;
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const line = document.createElement("div");
    line.className = "action-log-row" + (row.error ? " error" : "");
    const bits = [`#${row.n} ${row.actor} ${row.action}`];
    const prefix = document.createElement("span");
    prefix.textContent = bits[0];
    line.append(prefix);
    if (row.card) {
      const card = document.createElement("span");
      card.className = "action-log-card";
      card.textContent = ` ${row.card}`;
      line.append(card);
    }
    const rest = [];
    if (row.detail) rest.push(row.detail);
    if (row.error) rest.push("✕ " + row.error);
    else if (row.result) rest.push("→ " + row.result);
    if (rest.length) {
      const tail = document.createElement("span");
      tail.textContent = " " + rest.join(" ");
      line.append(tail);
    }
    el.append(line);
  }
}

function fillSendTarget(view) {
  const select = els.sendTarget;
  if (!select) return;
  const prev = select.value;
  const includeSelf = tableActions(view).targetPlayer && view.phase === "playing";
  select.innerHTML = "";
  for (const [id, player] of Object.entries(view.players || {})) {
    if (!includeSelf && id === selfId) continue;
    if ((view.inactiveIds || []).includes(id)) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent =
      (id === selfId ? "You" : player.name) + (id === "host" ? " (host)" : "");
    select.append(opt);
  }
  if ([...select.options].some((o) => o.value === prev)) select.value = prev;
}

function spaceVisible(view, id) {
  const spaces = view?.settings?.spaces;
  if (!spaces) return true;
  return spaces[id] !== false;
}

function applySpaceVisibility(view) {
  for (const el of document.querySelectorAll("[data-space]")) {
    const id = el.dataset.space;
    let on = spaceVisible(view, id);
    if (id === "table") on = sharedTableOn(view);
    if (id === "personal") on = personalTableOn(view);
    el.classList.toggle("hidden", !on);
  }
  const acts = tableActions(view);
  const map = {
    "place-shared": { space: "table", flag: acts.placeShared },
    "place-personal": { space: "personal", flag: acts.placePersonal },
    "place-discard": { space: "discard", flag: acts.placeDiscard },
    endTurn: { flag: acts.endTurn && view.phase === "playing" },
    stay: { flag: acts.stay && view.phase === "playing" },
    sendCards: { flag: acts.sendCards && view.phase === "lobby" },
    targetPlayer: { flag: acts.targetPlayer && view.phase === "playing" },
    betCoins: { flag: acts.betCoins && Boolean(view.settings?.showCoins) },
    drawCard: { flag: acts.drawCard },
    drawToShared: { space: "table", flag: true },
    drawToSpecial: { space: "special", flag: true },
  };
  for (const btn of document.querySelectorAll("[data-act]")) {
    const rule = map[btn.dataset.act];
    if (!rule) continue;
    const hideSpace =
      rule.space === "table"
        ? !sharedTableOn(view)
        : rule.space === "personal"
          ? !personalTableOn(view)
          : rule.space && !spaceVisible(view, rule.space);
    btn.classList.toggle("hidden", hideSpace || rule.flag === false);
  }
  if (els.sendTarget) {
    const showTarget =
      (acts.sendCards && view.phase === "lobby") ||
      (acts.targetPlayer && view.phase === "playing");
    els.sendTarget.classList.toggle("hidden", !showTarget);
  }
  if (els.betCount) {
    els.betCount.classList.toggle(
      "hidden",
      !acts.betCoins || !view.settings?.showCoins
    );
  }
  updateOverflowVisibility();
}

function patchSettings(patch) {
  const current = lastView?.settings;
  if (!current) return;
  sendAction("setSettings", { settings: { ...current, ...patch } });
}

function setOrderEditButtons(changeBtn, saveBtn, cancelBtn, editing) {
  changeBtn.classList.toggle("hidden", editing);
  saveBtn.classList.toggle("hidden", !editing);
  cancelBtn.classList.toggle("hidden", !editing);
}

function toggleOrderPick(picks, id) {
  const next = picks.slice();
  const index = next.indexOf(id);
  if (index >= 0) next.splice(index, 1);
  else next.push(id);
  return next;
}

function renderOrderChips(container, items, { editing, picks, onPick, view }) {
  container.innerHTML = "";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "order-chip";
    if (item.playerId) setSeatClass(btn, view, item.playerId);
    const pickIndex = editing ? picks.indexOf(item.id) : items.indexOf(item);
    if (editing && pickIndex >= 0) {
      btn.classList.add("order-picked");
      const index = document.createElement("span");
      index.className = "order-index";
      index.textContent = String(pickIndex + 1);
      btn.append(index, document.createTextNode(item.label));
    } else if (!editing) {
      btn.textContent = `${items.indexOf(item) + 1}. ${item.label}`;
      btn.disabled = true;
    } else {
      btn.textContent = item.label;
    }
    if (editing) btn.addEventListener("click", () => onPick(item.id));
    container.append(btn);
  }
}

function fillTurnOrder(view) {
  const players = view.players || {};
  const order = view.playerOrder?.length
    ? view.playerOrder.filter((id) => players[id])
    : Object.keys(players);
  const editing = turnOrderPicks !== null;
  const items = order.map((id) => ({
    id,
    playerId: id,
    label: (players[id]?.name || id) +
      (id === "host" ? " (host)" : "") +
      (players[id]?.isBot ? " (bot)" : ""),
  }));
  renderOrderChips(els.orderList, items, {
    editing,
    picks: turnOrderPicks || [],
    view,
    onPick: (id) => {
      turnOrderPicks = toggleOrderPick(turnOrderPicks || [], id);
      fillTurnOrder(lastView);
    },
  });
  setOrderEditButtons(els.btnTurnChange, els.btnTurnSave, els.btnTurnCancel, editing);
}

function fillRankOrder(view) {
  const ranks = view.settings?.ranks || [];
  const editing = rankOrderPicks !== null;
  const items = ranks.map((rank) => ({ id: rank, label: rank }));
  renderOrderChips(els.rankOrder, items, {
    editing,
    picks: rankOrderPicks || [],
    view,
    onPick: (id) => {
      rankOrderPicks = toggleOrderPick(rankOrderPicks || [], id);
      fillRankOrder(lastView);
    },
  });
  setOrderEditButtons(els.btnRankChange, els.btnRankSave, els.btnRankCancel, editing);
}

function fillPlayerRoster(view) {
  const el = els.playerRoster;
  if (!el) return;
  const focused = document.activeElement;
  if (focused && el.contains(focused) && focused.matches("input")) return;
  el.innerHTML = "";
  const players = view.players || {};
  const order = view.playerOrder?.length
    ? view.playerOrder.filter((id) => players[id])
    : Object.keys(players);
  for (const id of order) {
    const player = players[id];
    const row = document.createElement("div");
    row.className = "player-row";
    setSeatClass(row, view, id);
    const name = document.createElement("span");
    name.className = "player-row-name";
    name.textContent =
      (player.name || id) +
      (player.isHost ? " · host" : "") +
      (player.isBot ? " · bot" : "") +
      ((view.bustedIds || []).includes(id)
        ? " · bust"
        : (view.inactiveIds || []).includes(id)
          ? " · out"
          : "");
    const stats = document.createElement("span");
    stats.className = "player-stats";
    appendStatBadge(stats, view, id, "points", playerStat(player, "points"));
    appendStatBadge(stats, view, id, "lives", playerStat(player, "lives"));
    appendStatBadge(stats, view, id, "coins", playerStat(player, "coins"));
    const coinField = document.createElement("label");
    coinField.className = "muted player-coin-field";
    coinField.append("Set coins");
    const coinInput = document.createElement("input");
    coinInput.type = "number";
    coinInput.min = "0";
    coinInput.max = "999";
    coinInput.className = "num";
    coinInput.value = String(playerStat(player, "coins"));
    coinInput.addEventListener("change", () => {
      sendAction("setPlayerStat", {
        playerId: id,
        stat: "coins",
        value: Number(coinInput.value),
      });
    });
    coinField.append(coinInput);
    row.append(name, stats, coinField);
    if (view.allowBots && (player.isBot || id === "host")) {
      const actions = document.createElement("div");
      actions.className = "player-row-actions";
      if (id === selfId) {
        const mark = document.createElement("span");
        mark.className = "muted";
        mark.textContent = "playing";
        actions.append(mark);
      } else {
        const take = document.createElement("button");
        take.type = "button";
        take.textContent = "Play as";
        take.addEventListener("click", () => session?.setHostSeat?.(id));
        actions.append(take);
      }
      if (player.isBot) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost";
        remove.textContent = "Remove";
        remove.addEventListener("click", () =>
          sendAction("removeBot", { playerId: id })
        );
        actions.append(remove);
      }
      row.append(actions);
    }
    el.append(row);
  }
}

function fillGameSettings(view) {
  const s = view.settings;
  if (!s || role !== "host") return;
  const focused = document.activeElement;
  if (focused !== els.settingDecks) els.settingDecks.value = String(s.decks);
  if (focused !== els.settingMin) els.settingMin.value = String(s.minPlayers);
  if (focused !== els.settingMax) els.settingMax.value = String(s.maxPlayers);
  if (focused !== els.settingPersonalRows && els.settingPersonalRows) {
    els.settingPersonalRows.value = String(s.personalRows || 1);
  }
  if (focused !== els.settingSharedRows && els.settingSharedRows) {
    els.settingSharedRows.value = String(s.sharedRows || 1);
  }
  els.settingSpaceViewGrid?.classList.toggle("selected", (s.spaceView || "grid") === "grid");
  els.settingSpaceViewStack?.classList.toggle("selected", s.spaceView === "stacked");

  els.settingSkipEmpty.classList.toggle("selected", Boolean(s.skipEmptyHands));
  els.settingHandView.classList.toggle("selected", s.opponentHandView === "collapsed");
  els.settingShowPoints.classList.toggle("selected", s.showPoints !== false);
  els.settingShowLives.classList.toggle("selected", Boolean(s.showLives));
  els.settingShowCoins.classList.toggle("selected", Boolean(s.showCoins));

  const customCatalog = Boolean(s.catalog?.length);
  els.settingDecksField?.classList.toggle("hidden", customCatalog);
  els.settingFrenchShoe?.classList.toggle("hidden", customCatalog);

  els.spaceToggles.innerHTML = "";
  for (const space of SPACE_VISIBILITY) {
    const btn = document.createElement("button");
    btn.type = "button";
    const personalOn = personalTableOn(view);
    let on = s.spaces?.[space.id] !== false;
    if (space.id === "table") on = sharedTableOn(view);
    if (space.id === "personal") on = personalOn;
    btn.className = "ghost sort-btn" + (on ? " selected" : "");
    btn.textContent = space.label;
    btn.addEventListener("click", () => {
      const spaces = { ...s.spaces };
      if (space.id === "table") {
        const next = !sharedTableOn(view);
        spaces.table = next;
        if (next) spaces.personal = false;
      } else if (space.id === "personal") {
        const next = !personalOn;
        spaces.personal = next;
        if (next) spaces.table = false;
      } else {
        spaces[space.id] = !on;
      }
      patchSettings({ spaces });
    });
    els.spaceToggles.append(btn);
  }

  fillVariantPicks(els.faceVariants, FACE_VARIANTS, s.faceVariant || "default", "faceVariant");
  fillVariantPicks(els.backVariants, BACK_VARIANTS, s.backVariant || "default", "backVariant");

  fillPlayerRoster(view);
  fillTurnOrder(view);
  fillRankOrder(view);
  if (els.botTools) {
    els.botTools.classList.toggle("hidden", !view.allowBots);
  }

  els.banRanks.innerHTML = "";
  els.banGrid.innerHTML = "";
  if (customCatalog) return;

  for (const rank of RANKS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost sort-btn" + (s.banished.includes(rank) ? " selected" : "");
    btn.textContent = rank;
    btn.title = s.banished.includes(rank) ? "Unban this rank" : "Ban this rank";
    btn.addEventListener("click", () => toggleRankBan(s, rank));
    els.banRanks.append(btn);
  }

  els.banGrid.innerHTML = "";
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = faceKey(rank, suit.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "playing-card ban-card" +
        (suit.color === "red" ? " red" : "") +
        (isBanished(rank, suit.id, s.banished) ? " banned" : "");
      btn.textContent = cardLabel({ rank, symbol: suit.symbol });
      btn.addEventListener("click", () => toggleFaceBan(s, rank, suit.id, key));
      els.banGrid.append(btn);
    }
  }
}

function toggleRankBan(settings, rank) {
  let banished = settings.banished.slice();
  const faces = SUITS.map((suit) => faceKey(rank, suit.id));
  if (banished.includes(rank)) {
    banished = banished.filter((item) => item !== rank && !faces.includes(item));
  } else {
    banished = banished.filter((item) => !faces.includes(item));
    banished.push(rank);
  }
  patchSettings({ banished });
}

function toggleFaceBan(settings, rank, suitId, key) {
  let banished = settings.banished.slice();
  if (banished.includes(rank)) {
    banished = banished.filter((item) => item !== rank);
    for (const suit of SUITS) {
      const other = faceKey(rank, suit.id);
      if (other !== key && !banished.includes(other)) banished.push(other);
    }
  } else if (banished.includes(key)) {
    banished = banished.filter((item) => item !== key);
  } else {
    banished.push(key);
  }
  patchSettings({ banished });
}

function placeSelected(dest) {
  const cardIds = [...selectedCardIds];
  if (!cardIds.length) {
    setLobbyStatus({ text: "Select cards in your hand first.", error: true });
    return;
  }
  sendAction("placeCard", { cardIds, dest });
  clearHandSelection();
}

function refreshResumeUi() {
  const saved = loadHostSession();
  if (saved?.roomCode) {
    els.resumeRow.classList.remove("hidden");
    els.btnResume.textContent = `Resume room ${saved.roomCode}`;
    if (!els.nickname.value.trim()) els.nickname.value = saved.name || "";
  } else {
    els.resumeRow.classList.add("hidden");
  }
  const guest = loadGuestSession();
  if (guest?.roomCode && !els.joinCode.value.trim()) {
    els.joinCode.value = guest.roomCode;
    if (!els.nickname.value.trim()) els.nickname.value = guest.name || "";
  }
}

function stopGuestRetry() {
  if (guestRetryTimer) {
    clearInterval(guestRetryTimer);
    guestRetryTimer = null;
  }
}

async function beginHost({ resume }) {
  if (!isFirebaseConfigured()) return;
  els.btnHost.disabled = true;
  els.btnResume.disabled = true;
  setHomeStatus(resume ? "Resuming room…" : "Creating room…");
  const saved = resume ? loadHostSession() : null;
  const name = nickname();
  try {
    initFirebase();
    const host = createHost({
      name,
      initialState: saved
        ? lobbyStateForResume(saved.lobbyState, name)
        : undefined,
      initialSecret: saved ? secretForResume(saved.secret) : undefined,
      gameId: saved ? undefined : selectedGameId,
      onState: renderState,
      onStatus: setLobbyStatus,
      onPersist: saveHostSession,
    });
    session = host;
    role = "host";
    selfId = host.hostId;
    const code = await host.start(saved?.roomCode);
    showTable(code);
    setLobbyStatus({ text: "connected" });
  } catch (err) {
    console.error(err);
    setHomeStatus(err.message || String(err), true);
    session = null;
  } finally {
    els.btnHost.disabled = false;
    els.btnResume.disabled = false;
  }
}

async function beginGuest(code, { fromRetry = false } = {}) {
  if (!isFirebaseConfigured() || joiningGuest) return;
  joiningGuest = true;
  els.btnJoin.disabled = true;
  if (!fromRetry) setHomeStatus("Joining…");
  if (fromRetry && session) {
    try {
      await session.stop();
    } catch {
      /* ignore */
    }
    session = null;
  }
  const playerId = getOrCreatePlayerId();
  let guest = null;
  try {
    initFirebase();
    guest = createGuest({
      name: nickname(),
      playerId,
      onState: renderState,
      onStatus: onGuestStatus,
    });
    session = guest;
    role = "guest";
    selfId = playerId;
    await guest.join(code);
    saveGuestSession({ roomCode: code, name: nickname(), playerId });
    showTable(code);
    setLobbyStatus({ text: "connected" });
    stopGuestRetry();
  } catch (err) {
    console.error(err);
    if (fromRetry) {
      setLobbyStatus({ text: "reconnecting… waiting for host", error: false });
    } else {
      setHomeStatus(err.message || String(err), true);
    }
    if (guest) {
      try {
        await guest.stop();
      } catch {
        /* ignore */
      }
    }
    if (!fromRetry) session = null;
  } finally {
    joiningGuest = false;
    els.btnJoin.disabled = false;
  }
}

function onGuestStatus(status) {
  setLobbyStatus(status);
  if (leaving) return;
  if (status.error && status.text === "host gone") {
    scheduleGuestRetry();
  }
}

function scheduleGuestRetry() {
  if (guestRetryTimer || !currentRoom) return;
  setLobbyStatus({ text: "reconnecting… waiting for host", error: false });
  guestRetryTimer = setInterval(() => {
    beginGuest(currentRoom, { fromRetry: true });
  }, 2500);
}

async function leave({ endTable = false } = {}) {
  leaving = true;
  stopGuestRetry();
  if (role === "guest" && session?.sendIntent) {
    session.sendIntent("leaveSeat");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (session) {
    await session.stop();
    session = null;
  }
  if (role === "host" || endTable) clearHostSession();
  if (role === "guest" || endTable) clearGuestSession();
  role = null;
  selfId = null;
  leaving = false;
  showHome();
  setHomeStatus("");
}

function fillGameSelect() {
  els.gameType.innerHTML = "";
  for (const game of gameList()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-pick";
    btn.dataset.gameId = game.id;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", game.id === selectedGameId ? "true" : "false");
    btn.textContent = game.name;
    btn.addEventListener("click", () => selectGame(game.id));
    els.gameType.append(btn);
  }
  selectGame(selectedGameId);
}

function selectGame(id) {
  selectedGameId = id;
  const game = gameList().find((g) => g.id === id);
  els.gameBlurb.textContent = game?.blurb || "";
  for (const btn of els.gameType.querySelectorAll(".game-pick")) {
    const on = btn.dataset.gameId === id;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
}

els.btnHost.addEventListener("click", () => beginHost({ resume: false }));
els.btnResume.addEventListener("click", () => beginHost({ resume: true }));
els.btnDiscard.addEventListener("click", () => {
  clearHostSession();
  refreshResumeUi();
  setHomeStatus("Saved lobby discarded.");
});

els.btnJoin.addEventListener("click", () => {
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length < 4) {
    setHomeStatus("Enter the room code from the host.", true);
    return;
  }
  beginGuest(code);
});

els.joinCode.addEventListener("input", () => {
  els.joinCode.value = els.joinCode.value.toUpperCase();
});

els.btnLeave.addEventListener("click", () => leave({ endTable: true }));

function hostStart() {
  if (role !== "host" || !session) return;
  session.hostIntent("startGame");
}

els.btnStart.addEventListener("click", hostStart);

function onSettingNumber() {
  patchSettings({
    decks: Number(els.settingDecks.value),
    minPlayers: Number(els.settingMin.value),
    maxPlayers: Number(els.settingMax.value),
    personalRows: Number(els.settingPersonalRows.value),
    sharedRows: Number(els.settingSharedRows.value),
  });
}
els.settingDecks.addEventListener("change", onSettingNumber);
els.settingMin.addEventListener("change", onSettingNumber);
els.settingMax.addEventListener("change", onSettingNumber);
els.settingPersonalRows.addEventListener("change", onSettingNumber);
els.settingSharedRows.addEventListener("change", onSettingNumber);
els.settingSpaceViewGrid?.addEventListener("click", () => {
  patchSettings({ spaceView: "grid" });
});
els.settingSpaceViewStack?.addEventListener("click", () => {
  patchSettings({ spaceView: "stacked" });
});
els.settingSkipEmpty.addEventListener("click", () => {
  patchSettings({ skipEmptyHands: !lastView?.settings?.skipEmptyHands });
});
els.settingHandView.addEventListener("click", () => {
  const collapsed = lastView?.settings?.opponentHandView === "collapsed";
  patchSettings({ opponentHandView: collapsed ? "expanded" : "collapsed" });
});
els.settingShowPoints.addEventListener("click", () => {
  patchSettings({ showPoints: lastView?.settings?.showPoints === false });
});
els.settingShowLives.addEventListener("click", () => {
  patchSettings({ showLives: !lastView?.settings?.showLives });
});
els.settingShowCoins.addEventListener("click", () => {
  patchSettings({ showCoins: !lastView?.settings?.showCoins });
});
els.btnSetCoinsAll.addEventListener("click", () => {
  sendAction("setPlayerStat", {
    playerId: "all",
    stat: "coins",
    value: Number(els.settingCoins.value),
  });
});
els.btnAddBot?.addEventListener("click", () => sendAction("addBot"));
els.btnBotSelf?.addEventListener("click", () => session?.setHostSeat?.("host"));

els.btnTurnChange.addEventListener("click", () => {
  turnOrderPicks = [];
  if (lastView) fillTurnOrder(lastView);
});
els.btnTurnCancel.addEventListener("click", () => {
  turnOrderPicks = null;
  if (lastView) fillTurnOrder(lastView);
});
els.btnTurnSave.addEventListener("click", () => {
  const n = Object.keys(lastView?.players || {}).length;
  if (!turnOrderPicks || turnOrderPicks.length !== n) {
    setLobbyStatus({ text: "Select every player in the new order.", error: true });
    return;
  }
  sendAction("setOrder", { playerIds: turnOrderPicks.slice() });
  turnOrderPicks = null;
});

els.btnRankChange.addEventListener("click", () => {
  rankOrderPicks = [];
  if (lastView) fillRankOrder(lastView);
});
els.btnRankCancel.addEventListener("click", () => {
  rankOrderPicks = null;
  if (lastView) fillRankOrder(lastView);
});
els.btnRankSave.addEventListener("click", () => {
  const n = lastView?.settings?.ranks?.length || 0;
  if (!rankOrderPicks || rankOrderPicks.length !== n) {
    setLobbyStatus({ text: "Select every rank in the new order.", error: true });
    return;
  }
  patchSettings({ ranks: rankOrderPicks.slice() });
  rankOrderPicks = null;
});

function onTableAction(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn || !session || btn.disabled) return;
  const act = btn.dataset.act;
  if (act === "place-shared") {
    placeSelected({ type: "shared" });
    return;
  }
  if (act === "place-personal") {
    placeSelected({ type: "personal", playerId: selfId });
    return;
  }
  if (act === "place-discard") {
    placeSelected({ type: "discard" });
    return;
  }
  if (act === "drawCard") {
    sendAction("drawCard", { count: 1 });
    return;
  }
  if (act === "stay") {
    sendAction("stay");
    return;
  }
  if (act === "sendCards") {
    const cardIds = [...selectedCardIds];
    if (!cardIds.length) {
      setLobbyStatus({ text: "Select cards in your hand first.", error: true });
      return;
    }
    const playerId = els.sendTarget.value;
    if (!playerId) {
      setLobbyStatus({ text: "Pick a player to send to.", error: true });
      return;
    }
    sendAction("sendCards", { cardIds, playerId });
    clearHandSelection();
    return;
  }
  if (act === "targetPlayer") {
    const playerId = els.sendTarget.value;
    if (!playerId) {
      setLobbyStatus({ text: "Pick a player.", error: true });
      return;
    }
    sendAction("targetPlayer", { playerId });
    return;
  }
  if (act === "betCoins") {
    sendAction("betCoins", { amount: Number(els.betCount.value) });
    return;
  }
  if (act === "deal") {
    sendAction("deal", {
      count: Number(els.dealCount.value),
      playerId: els.dealTarget.value,
    });
    return;
  }
  if (act === "dealAll") {
    sendAction("dealAll", { count: Number(els.dealCount.value) });
    return;
  }
  if (act === "hostStart") {
    hostStart();
    return;
  }
  if (act === "drawToSpecial") {
    sendAction("drawToSpecial", { count: Number(els.dealCount.value) });
    return;
  }
  if (act === "drawToShared") {
    sendAction("drawToShared", { count: Number(els.dealCount.value) });
    return;
  }
  if (act === "discardShared") {
    sendAction("clearSpace", { dest: { type: "shared" } });
    return;
  }
  if (act === "discardAllPersonal") {
    sendAction("discardAllPersonal");
    return;
  }
  if (act === "discardPlayer") {
    sendAction("clearSpace", {
      dest: { type: "personal", playerId: els.discardTarget.value },
    });
    return;
  }
  sendAction(act);
}

els.freeplayBar.addEventListener("click", onTableAction);
els.playerDock?.addEventListener("click", onTableAction);
els.hostTools.addEventListener("click", onTableAction);
els.gameSettings.addEventListener("click", onTableAction);

els.layoutFreeplay?.addEventListener("click", onFeltClick);
els.layoutFreeplay?.addEventListener("pointerdown", onFeltPointerDown);

els.btnMenu?.addEventListener("click", openTableMenu);
els.btnMenuClose?.addEventListener("click", closeTableMenu);
els.tableMenu?.addEventListener("click", (event) => {
  if (event.target === els.tableMenu) closeTableMenu();
});
els.spaceOverlayClose?.addEventListener("click", closeSpaceOverlay);
els.spaceOverlay?.addEventListener("click", (event) => {
  if (event.target === els.spaceOverlay) closeSpaceOverlay();
});
els.spaceOverlay?.addEventListener("close", () => {
  overlayKind = null;
  overlayPlayerId = null;
});
els.btnOverflow?.addEventListener("click", toggleOverflow);
els.handPeek?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleHandPeek();
});
document.addEventListener("click", (event) => {
  if (!els.freeplayBar || els.freeplayBar.classList.contains("hidden")) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#freeplay-bar, #btn-overflow")) return;
  els.freeplayBar.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selectedCardIds.size) clearHandSelection();
});

window.addEventListener("pagehide", () => {
  if (session) session.stop();
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#home" && session) {
    /* stay at table unless they Leave */
    location.hash = "table";
  }
});

window.addEventListener("resize", () => {
  if (!lastView) return;
  layoutFan(els.handCards);
  layoutTableSpaces();
});

fillGameSelect();
refreshResumeUi();
if (location.hash === "#table" && !session) location.hash = "home";

if (!isFirebaseConfigured()) {
  els.configError.classList.remove("hidden");
  els.configError.textContent =
    "Firebase is not configured. See docs/SETUP.md for local keys.";
  els.btnHost.disabled = true;
  els.btnJoin.disabled = true;
  els.btnResume.disabled = true;
}
