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
import { cardLabel, HAND_SORT_MODES, resolveHandSort, sortHand, RANKS, SUITS } from "./cards.js";
import { gameList, getGame } from "./games.js";
import { faceKey, isBanished, SPACE_VISIBILITY } from "./gameSettings.js";

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
  roleLabel: document.getElementById("role-label"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  phaseLabel: document.getElementById("phase-label"),
  lobbyTools: document.getElementById("lobby-tools"),
  colorPicks: document.getElementById("color-picks"),
  colorSwatches: document.getElementById("color-swatches"),
  tableCards: document.getElementById("table-cards"),
  handCards: document.getElementById("hand-cards"),
  handHint: document.getElementById("hand-hint"),
  handSort: document.getElementById("hand-sort"),
  opponents: document.getElementById("opponents"),
  deckPile: document.getElementById("deck-pile"),
  gameType: document.getElementById("game-type"),
  gameBlurb: document.getElementById("game-blurb"),
  gameNameLabel: document.getElementById("game-name-label"),
  roundMessage: document.getElementById("round-message"),
  layoutHighcard: document.getElementById("layout-highcard"),
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
  settingMin: document.getElementById("setting-min"),
  settingMax: document.getElementById("setting-max"),
  settingPersonalRows: document.getElementById("setting-personal-rows"),
  settingSharedRows: document.getElementById("setting-shared-rows"),
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
};

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

function compactLayout(view) {
  return (view?.layout || (view?.gameId === "highcard" ? "compact" : "table")) === "compact";
}

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

function setLobbyStatus({ text, error }) {
  els.lobbyStatus.textContent = text || "";
  els.lobbyStatus.classList.toggle("error", Boolean(error));
}

function nickname() {
  const value = els.nickname.value.trim();
  return value || "Player";
}

function showHome() {
  els.viewTable.classList.add("hidden");
  els.viewHome.classList.remove("hidden");
  currentRoom = "";
  if (location.hash !== "#home") location.hash = "home";
  refreshResumeUi();
}

function showTable(code, isHost) {
  els.viewHome.classList.add("hidden");
  els.viewTable.classList.remove("hidden");
  els.roomCodeDisplay.textContent = code;
  currentRoom = code;
  els.roleLabel.textContent = isHost ? "You are the host" : "You are a guest";
  els.lobbyTools.classList.add("hidden");
  els.btnStart.classList.add("hidden");
  if (location.hash !== "#table") location.hash = "table";
}

function sendAction(action, extra = {}) {
  if (!session) return;
  if (role === "host") session.hostIntent(action, extra);
  else session.sendIntent(action, extra);
}

function appendCardButton(parent, card, { playable, selectable, view, ownerId }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "playing-card" + ((card.color ?? card.face?.color) === "red" ? " red" : "");
  const seat = seatClass(view || lastView, card.playedBy || ownerId);
  if (seat) btn.classList.add(seat);
  if (selectable && selectedCardIds.has(card.id)) btn.classList.add("selected-card");
  btn.textContent = cardLabel(card);
  if (selectable) {
    btn.addEventListener("click", () => {
      if (selectedCardIds.has(card.id)) selectedCardIds.delete(card.id);
      else selectedCardIds.add(card.id);
      if (lastView) renderState(lastView);
    });
  } else if (playable) {
    btn.addEventListener("click", () =>
      sendAction("placeCard", { cardIds: [card.id], dest: { type: "shared" } })
    );
  } else {
    btn.disabled = true;
  }
  parent.append(btn);
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

function fillSpace(el, cards, opts, rowCount) {
  if (!el) return;
  el.innerHTML = "";
  for (const rowCards of splitSpaceRows(cards, rowCount)) {
    const row = document.createElement("div");
    row.className = "card-row";
    for (const card of rowCards) appendCardButton(row, card, opts);
    el.append(row);
  }
}

function renderCardStack(el, cards, view) {
  if (!el) return;
  el.innerHTML = "";
  const list = cards || [];
  const top = list[list.length - 1];
  if (top) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "playing-card stack-card" + (top.color === "red" ? " red" : "");
    const seat = seatClass(view || lastView, top.playedBy);
    if (seat) btn.classList.add(seat);
    btn.textContent = cardLabel(top);
    btn.disabled = true;
    el.append(btn);
  }
  const count = document.createElement("div");
  count.className = "deck-count";
  count.textContent = String(list.length);
  el.append(count);
}

function renderDeck(target, count) {
  const el = target || els.deckPile;
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

function renderOpponents(view, phase) {
  els.opponents.innerHTML = "";
  const players = view.players || {};
  const counts = view.handCounts || {};
  const collapsed = view.settings?.opponentHandView === "collapsed";
  for (const [id, player] of Object.entries(players)) {
    if (id === selfId) continue;
    const box = document.createElement("div");
    box.className =
      "opponent" +
      (player.connected === false ? " offline" : "") +
      (collapsed ? " collapsed" : "");
    setSeatClass(box, view, id);
    if (phase === "playing" && view.currentPlayerId === id) box.classList.add("is-turn");
    const name = document.createElement("div");
    name.className = "opponent-name";
    const bits = document.createElement("span");
    const labels = [player.name || "Player"];
    if (player.isHost) labels.push("host");
    if (player.connected === false) labels.push("away");
    if ((view.bustedIds || []).includes(id)) labels.push("bust");
    else if ((view.inactiveIds || []).includes(id)) labels.push("out");
    bits.textContent = labels.join(" · ");
    name.append(bits);
    const stats = document.createElement("span");
    stats.className = "player-stats";
    fillPlayerStats(stats, view, id);
    name.append(stats);
    const row = document.createElement("div");
    row.className = "card-row";
    const personal = (view.personal && view.personal[id]) || [];
    if (!compactLayout(view) && spaceVisible(view, "personal")) {
      const space = document.createElement("div");
      space.className = "opponent-space space-stack";
      fillSpace(space, personal, { playable: false, view, ownerId: id }, view.settings?.personalRows);
      row.append(space);
    }
    const n = spaceVisible(view, "hand") ? counts[id] ?? 0 : 0;
    if (collapsed) {
      const pile = document.createElement("div");
      pile.className = "mini-pile";
      pile.title = `${n} in hand`;
      const back = document.createElement("div");
      back.className = "deck-back " + (seatClass(view, id) || "");
      pile.append(back);
      const count = document.createElement("div");
      count.className = "deck-count";
      count.textContent = String(n);
      pile.append(count);
      row.append(pile);
    } else {
      for (let i = 0; i < n; i++) {
        const back = document.createElement("span");
        back.className = "face-down " + (seatClass(view, id) || "");
        row.append(back);
      }
    }
    if (compactLayout(view) && !n && !personal.length && !collapsed) {
      row.textContent = phase === "lobby" ? "—" : "empty";
    }
    box.append(name, row);
    els.opponents.append(box);
  }
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

function renderState(view) {
  if (!view) return;
  lastView = view;
  if (view.viewerId) selfId = view.viewerId;
  const phase = view.phase || "lobby";
  const zoned = !compactLayout(view);
  els.phaseLabel.textContent = phase;
  els.lobbyTools.classList.add("hidden");
  els.btnStart.classList.add("hidden");
  els.handHint.classList.toggle("hidden", !zoned && phase !== "playing");
  els.handHint.textContent = zoned
    ? "· tap cards, then an action"
    : "· tap to play";
  if (view.gameName) els.gameNameLabel.textContent = view.gameName;
  if (view.message) {
    els.roundMessage.textContent = view.message;
    els.roundMessage.classList.remove("hidden");
  } else {
    els.roundMessage.classList.add("hidden");
    els.roundMessage.textContent = "";
  }

  const turnName = view.players?.[view.currentPlayerId]?.name;
  els.turnLabel.textContent = zoned && turnName ? `Turn: ${turnName}` : "";
  setSeatClass(els.turnLabel, view, view.currentPlayerId);

  setSeatClass(els.mySpace, view, selfId);
  setSeatClass(els.youArea, view, selfId);

  els.layoutHighcard.classList.toggle("hidden", zoned);
  els.layoutFreeplay.classList.toggle("hidden", !zoned);
  els.freeplayBar.classList.toggle("hidden", !zoned);
  els.hostTools.classList.toggle("hidden", role !== "host");
  els.gameSettings.classList.toggle("hidden", role !== "host");
  applySpaceVisibility(view);
  const acts = tableActions(view);
  const game = getGame(view?.gameId);
  const myTurn =
    phase === "playing" &&
    view.currentPlayerId === selfId &&
    !(view.inactiveIds || []).includes(selfId);
  const lobbyPass = phase === "lobby" && acts.sendCards;
  const needTarget = Boolean(game.needsTarget?.(view, selfId));
  const needTargetAny = Object.keys(view.players || {}).some((id) =>
    game.needsTarget?.(view, id)
  );
  const showCoins = Boolean(view.settings?.showCoins);
  const canBet = zoned && phase === "playing" && acts.betCoins && showCoins;
  const canSelectHand = zoned && (myTurn || lobbyPass);
  const canTarget = zoned && phase === "playing" && acts.targetPlayer && needTarget;
  for (const btn of els.playerActions.querySelectorAll("button")) {
    const act = btn.dataset.act;
    if (act === "sendCards") btn.disabled = !lobbyPass;
    else if (act === "betCoins") btn.disabled = !canBet;
    else if (act === "targetPlayer") btn.disabled = !canTarget;
    else btn.disabled = !myTurn || needTargetAny;
  }
  if (els.sendTarget) els.sendTarget.disabled = !(lobbyPass || canTarget);
  if (els.betCount) els.betCount.disabled = !canBet;
  if (els.potPile) {
    els.potPile.classList.toggle("hidden", !zoned || !showCoins);
    if (els.potValue) els.potValue.textContent = String(view.pot ?? 0);
  }
  const undoBtn = els.hostTools.querySelector('[data-act="undo"]');
  if (undoBtn) undoBtn.disabled = !view.canUndo;

  renderColorPicks(view);
  renderOpponents(view, phase);
  fillPlayerStats(els.youStats, view, selfId);

  if (zoned) {
    renderDeck(els.fpDeck, view.deckCount ?? 0);
    fillSpace(els.sharedCards, view.shared, { playable: false, view }, view.settings?.sharedRows);
    fillSpace(els.myPersonal, (view.personal && view.personal[selfId]) || [], {
      playable: false,
      view,
      ownerId: selfId,
    }, view.settings?.personalRows);
    renderCardStack(els.discardCards, view.discard, view);
    renderCardStack(els.specialCards, view.special, view);
  } else {
    renderDeck(els.deckPile, view.deckCount ?? 0);
    fillSpace(els.tableCards, view.table || view.shared, { playable: false, view }, view.settings?.sharedRows);
  }

  if (role === "host") fillHostControls(view);
  if (zoned) fillSendTarget(view);
  if (role === "host") fillGameSettings(view);

  const sortSpec = handSortSpec(view);
  renderHandSort(sortSpec);
  const hand = sortHand(view.hand || [], sortSpec);
  const handIds = new Set(hand.map((card) => card.id));
  for (const id of [...selectedCardIds]) {
    if (!handIds.has(id)) selectedCardIds.delete(id);
  }

  els.handCards.innerHTML = "";
  for (const card of hand) {
    appendCardButton(els.handCards, card, {
      playable:
        !zoned &&
        phase === "playing" &&
        (role !== "host" || view.currentPlayerId === selfId),
      selectable: canSelectHand,
      view,
      ownerId: selfId,
    });
  }
  if (!(view.hand || []).length) {
    els.handCards.textContent = phase === "lobby" ? "—" : "No cards";
  }
}

function renderColorPicks(view) {
  els.colorPicks.classList.remove("hidden");
  const mine = view.players?.[selfId]?.color;
  const taken = new Set(
    Object.entries(view.players || {})
      .filter(([id, player]) => id !== selfId && Number.isInteger(player.color))
      .map(([, player]) => player.color)
  );
  els.colorSwatches.innerHTML = "";
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
    els.colorSwatches.append(btn);
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
      opt.textContent = player.name + (id === "host" ? " (host)" : "");
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
  if (startBtn) {
    startBtn.textContent = compactLayout(view)
      ? view.phase === "ended"
        ? "Deal again"
        : "Start"
      : "Start";
  }
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
    el.classList.toggle("hidden", !spaceVisible(view, id));
  }
  const acts = tableActions(view);
  const map = {
    "place-shared": { space: "table", flag: acts.placeShared },
    "place-personal": { space: "personal", flag: acts.placePersonal },
    "place-discard": { space: "discard", flag: acts.placeDiscard },
    endTurn: { flag: acts.endTurn },
    stay: { flag: acts.stay },
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
    const hideSpace = rule.space && !spaceVisible(view, rule.space);
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
    label: (players[id]?.name || id) + (id === "host" ? " (host)" : ""),
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
    const on = s.spaces?.[space.id] !== false;
    btn.className = "ghost sort-btn" + (on ? " selected" : "");
    btn.textContent = space.label;
    btn.addEventListener("click", () => {
      patchSettings({
        spaces: { ...s.spaces, [space.id]: !on },
      });
    });
    els.spaceToggles.append(btn);
  }

  fillPlayerRoster(view);
  fillTurnOrder(view);
  fillRankOrder(view);

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
  selectedCardIds.clear();
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
    showTable(code, true);
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
    showTable(code, false);
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
    selectedCardIds.clear();
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
els.hostTools.addEventListener("click", onTableAction);
els.gameSettings.addEventListener("click", onTableAction);

window.addEventListener("pagehide", () => {
  if (session) session.stop();
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#home" && session) {
    /* stay at table unless they Leave */
    location.hash = "table";
  }
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
