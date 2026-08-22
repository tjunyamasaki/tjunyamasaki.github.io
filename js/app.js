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
import { faceKey, isBanished, TABLE_SPACES } from "./gameSettings.js";

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
  myPersonal: document.getElementById("my-personal"),
  discardCards: document.getElementById("discard-cards"),
  fpDeck: document.getElementById("fp-deck"),
  turnLabel: document.getElementById("turn-label"),
  dealCount: document.getElementById("deal-count"),
  dealTarget: document.getElementById("deal-target"),
  drawCount: document.getElementById("draw-count"),
  clearTarget: document.getElementById("clear-target"),
  orderList: document.getElementById("order-list"),
  gameSettings: document.getElementById("game-settings"),
  settingDecks: document.getElementById("setting-decks"),
  settingMin: document.getElementById("setting-min"),
  settingMax: document.getElementById("setting-max"),
  rankOrder: document.getElementById("rank-order"),
  banRanks: document.getElementById("ban-ranks"),
  banGrid: document.getElementById("ban-grid"),
  spaceToggles: document.getElementById("space-toggles"),
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

const HAND_SORT_KEY = "lobby.handSort.v1";

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
  els.btnStart.classList.toggle("hidden", !isHost);
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
  btn.className = "playing-card" + (card.color === "red" ? " red" : "");
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
    btn.addEventListener("click", () => sendAction("playCard", { cardId: card.id }));
  } else {
    btn.disabled = true;
  }
  parent.append(btn);
}

function fillRow(el, cards, opts) {
  el.innerHTML = "";
  for (const card of cards || []) appendCardButton(el, card, opts);
  if (!(cards || []).length) el.textContent = "—";
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

function renderOpponents(view, phase) {
  els.opponents.innerHTML = "";
  const players = view.players || {};
  const counts = view.handCounts || {};
  for (const [id, player] of Object.entries(players)) {
    if (id === selfId) continue;
    const box = document.createElement("div");
    box.className = "opponent" + (player.connected === false ? " offline" : "");
    setSeatClass(box, view, id);
    if (phase === "playing" && view.currentPlayerId === id) box.classList.add("is-turn");
    const name = document.createElement("div");
    name.className = "opponent-name";
    const bits = [player.name || "Player"];
    if (player.isHost) bits.push("host");
    if (player.connected === false) bits.push("away");
    name.textContent = bits.join(" · ");
    const row = document.createElement("div");
    row.className = "card-row";
    const personal = (view.personal && view.personal[id]) || [];
    if (view.usesZones && spaceVisible(view, "personal")) {
      const space = document.createElement("div");
      space.className = "opponent-space";
      const spaceLabel = document.createElement("span");
      spaceLabel.className = "muted";
      spaceLabel.textContent = "space";
      space.append(spaceLabel);
      if (personal.length) {
        for (const card of personal) {
          appendCardButton(space, card, { playable: false, view, ownerId: id });
        }
      } else {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = " —";
        space.append(empty);
      }
      row.append(space);
    }
    const n = spaceVisible(view, "hand") ? counts[id] ?? 0 : 0;
    for (let i = 0; i < n; i++) {
      const back = document.createElement("span");
      back.className = "face-down " + (seatClass(view, id) || "");
      row.append(back);
    }
    if (!view.usesZones && !n && !personal.length) {
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
    ...(game.tableActions || {}),
  };
}

function renderState(view) {
  if (!view) return;
  lastView = view;
  if (view.viewerId) selfId = view.viewerId;
  const phase = view.phase || "lobby";
  const zoned = Boolean(view.usesZones);
  els.phaseLabel.textContent = phase;
  els.lobbyTools.classList.toggle(
    "hidden",
    zoned || role !== "host" || phase === "playing"
  );
  els.btnStart.classList.toggle(
    "hidden",
    zoned || role !== "host" || phase === "playing"
  );
  els.btnStart.textContent = zoned
    ? "Start game"
    : phase === "ended"
      ? "Deal again"
      : "Start deal";
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
  els.hostTools.classList.toggle("hidden", !zoned || role !== "host");
  els.gameSettings.classList.toggle("hidden", role !== "host");
  applySpaceVisibility(view);
  const acts = tableActions(view);
  const myTurn =
    phase === "playing" &&
    (role === "host" || view.currentPlayerId === selfId);
  const lobbyPass = phase === "lobby" && acts.sendCards;
  const canSelectHand = zoned && (myTurn || lobbyPass);
  for (const btn of els.playerActions.querySelectorAll("button")) {
    const act = btn.dataset.act;
    if (act === "sendCards") btn.disabled = !lobbyPass;
    else btn.disabled = !myTurn;
  }
  if (els.sendTarget) els.sendTarget.disabled = !lobbyPass;
  const undoBtn = els.hostTools.querySelector('[data-act="undo"]');
  if (undoBtn) undoBtn.disabled = !view.canUndo;

  renderColorPicks(view);
  renderOpponents(view, phase);

  if (zoned) {
    renderDeck(els.fpDeck, view.deckCount ?? 0);
    fillRow(els.sharedCards, view.shared, { playable: false, view });
    fillRow(els.myPersonal, (view.personal && view.personal[selfId]) || [], {
      playable: false,
      view,
      ownerId: selfId,
    });
    els.discardCards.innerHTML = "";
    if (view.discardTop) {
      appendCardButton(els.discardCards, view.discardTop, {
        playable: false,
        view,
      });
    }
    const dc = document.createElement("span");
    dc.className = "muted";
    dc.textContent = ` ${view.discardCount ?? 0}`;
    els.discardCards.append(dc);
    fillHostControls(view);
    fillSendTarget(view);
  } else {
    renderDeck(els.deckPile, view.deckCount ?? 0);
    fillRow(els.tableCards, view.table || view.shared, { playable: false, view });
  }

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
      playable: !zoned && phase === "playing",
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
  const prevClear = els.clearTarget.value;
  const fillSelect = (select, withShared) => {
    select.innerHTML = "";
    if (withShared) {
      const opt = document.createElement("option");
      opt.value = "shared";
      opt.textContent = "Shared space";
      select.append(opt);
    }
    for (const [id, player] of Object.entries(players)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = player.name + (id === "host" ? " (host)" : "");
      select.append(opt);
    }
  };
  fillSelect(els.dealTarget, false);
  fillSelect(els.clearTarget, true);
  if ([...els.dealTarget.options].some((o) => o.value === prevDeal)) {
    els.dealTarget.value = prevDeal;
  }
  if ([...els.clearTarget.options].some((o) => o.value === prevClear)) {
    els.clearTarget.value = prevClear;
  }
  const order = view.playerOrder?.length
    ? view.playerOrder
    : Object.keys(players);
  els.orderList.innerHTML = "";
  order.forEach((id, index) => {
    const li = document.createElement("li");
    li.dataset.playerId = id;
    setSeatClass(li, view, id);
    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${players[id]?.name || id}`;
    const up = document.createElement("button");
    up.type = "button";
    up.className = "ghost";
    up.textContent = "Up";
    up.addEventListener("click", () => moveOrder(index, -1));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "ghost";
    down.textContent = "Down";
    down.addEventListener("click", () => moveOrder(index, 1));
    li.append(label, up, down);
    els.orderList.append(li);
  });
}

function orderIds() {
  return [...els.orderList.querySelectorAll("li")].map((li) => li.dataset.playerId);
}

function moveOrder(index, delta) {
  const items = [...els.orderList.children];
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  const a = items[index];
  const b = items[next];
  if (delta < 0) els.orderList.insertBefore(a, b);
  else els.orderList.insertBefore(b, a);
}

function fillSendTarget(view) {
  const select = els.sendTarget;
  if (!select) return;
  const prev = select.value;
  select.innerHTML = "";
  for (const [id, player] of Object.entries(view.players || {})) {
    if (id === selfId) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = player.name + (id === "host" ? " (host)" : "");
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
    "place-shared": { space: "shared", flag: acts.placeShared },
    "place-personal": { space: "personal", flag: acts.placePersonal },
    "place-discard": { space: "discard", flag: acts.placeDiscard },
    endTurn: { flag: acts.endTurn },
    sendCards: { flag: acts.sendCards && view.phase === "lobby" },
    drawToShared: { space: "shared", flag: true },
  };
  for (const btn of document.querySelectorAll("[data-act]")) {
    const rule = map[btn.dataset.act];
    if (!rule) continue;
    const hideSpace = rule.space && !spaceVisible(view, rule.space);
    btn.classList.toggle("hidden", hideSpace || rule.flag === false);
  }
  if (els.sendTarget) {
    els.sendTarget.classList.toggle(
      "hidden",
      !acts.sendCards || view.phase !== "lobby"
    );
  }
}

function patchSettings(patch) {
  const current = lastView?.settings;
  if (!current) return;
  sendAction("setSettings", { settings: { ...current, ...patch } });
}

function fillGameSettings(view) {
  const s = view.settings;
  if (!s || role !== "host") return;
  const focused = document.activeElement;
  if (focused !== els.settingDecks) els.settingDecks.value = String(s.decks);
  if (focused !== els.settingMin) els.settingMin.value = String(s.minPlayers);
  if (focused !== els.settingMax) els.settingMax.value = String(s.maxPlayers);

  els.spaceToggles.innerHTML = "";
  for (const space of TABLE_SPACES) {
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

  els.rankOrder.innerHTML = "";
  s.ranks.forEach((rank, index) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${rank}`;
    const up = document.createElement("button");
    up.type = "button";
    up.className = "ghost";
    up.textContent = "Up";
    up.addEventListener("click", () => moveRank(s.ranks, index, -1));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "ghost";
    down.textContent = "Down";
    down.addEventListener("click", () => moveRank(s.ranks, index, 1));
    li.append(label, up, down);
    els.rankOrder.append(li);
  });

  els.banRanks.innerHTML = "";
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

function moveRank(ranks, index, delta) {
  const next = index + delta;
  if (next < 0 || next >= ranks.length) return;
  const copy = ranks.slice();
  [copy[index], copy[next]] = [copy[next], copy[index]];
  patchSettings({ ranks: copy });
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

els.btnStart.addEventListener("click", () => {
  if (role !== "host" || !session) return;
  if (lastView?.usesZones) session.hostIntent("startGame");
  else session.hostIntent("start");
});

function onSettingNumber() {
  patchSettings({
    decks: Number(els.settingDecks.value),
    minPlayers: Number(els.settingMin.value),
    maxPlayers: Number(els.settingMax.value),
  });
}
els.settingDecks.addEventListener("change", onSettingNumber);
els.settingMin.addEventListener("change", onSettingNumber);
els.settingMax.addEventListener("change", onSettingNumber);

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
  if (act === "drawToShared") {
    sendAction("drawToShared", { count: Number(els.drawCount.value) });
    return;
  }
  if (act === "clearSpace") {
    const value = els.clearTarget.value;
    const dest =
      value === "shared"
        ? { type: "shared" }
        : { type: "personal", playerId: value };
    sendAction("clearSpace", { dest });
    return;
  }
  if (act === "setOrder") {
    sendAction("setOrder", { playerIds: orderIds() });
    return;
  }
  sendAction(act);
}

els.freeplayBar.addEventListener("click", onTableAction);
els.hostTools.addEventListener("click", onTableAction);

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
