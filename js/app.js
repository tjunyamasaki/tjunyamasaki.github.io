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
import { cardLabel } from "./cards.js";
import { gameList } from "./games.js";

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
  btnBump: document.getElementById("btn-bump"),
  btnReady: document.getElementById("btn-ready"),
  btnStart: document.getElementById("btn-start"),
  homeStatus: document.getElementById("home-status"),
  lobbyStatus: document.getElementById("lobby-status"),
  roleLabel: document.getElementById("role-label"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  counterValue: document.getElementById("counter-value"),
  phaseLabel: document.getElementById("phase-label"),
  lobbyTools: document.getElementById("lobby-tools"),
  tableCards: document.getElementById("table-cards"),
  handCards: document.getElementById("hand-cards"),
  handHint: document.getElementById("hand-hint"),
  opponents: document.getElementById("opponents"),
  deckPile: document.getElementById("deck-pile"),
  gameType: document.getElementById("game-type"),
  gameBlurb: document.getElementById("game-blurb"),
  gameNameLabel: document.getElementById("game-name-label"),
  roundMessage: document.getElementById("round-message"),
  layoutHighcard: document.getElementById("layout-highcard"),
  layoutFreeplay: document.getElementById("layout-freeplay"),
  freeplayBar: document.getElementById("freeplay-bar"),
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
};

let session = null;
let role = null;
let selfId = null;
let currentRoom = "";
let guestRetryTimer = null;
let leaving = false;
let joiningGuest = false;
let selectedGameId = "highcard";
let lastView = null;
let selectedCardId = null;

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

function appendCardButton(parent, card, { playable, selectable }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "playing-card" + (card.color === "red" ? " red" : "");
  if (selectable && card.id === selectedCardId) btn.classList.add("selected-card");
  btn.textContent = cardLabel(card);
  if (selectable) {
    btn.addEventListener("click", () => {
      selectedCardId = card.id;
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
    const name = document.createElement("div");
    name.className = "opponent-name";
    const bits = [player.name || "Player"];
    if (player.isHost) bits.push("host");
    if (player.connected === false) bits.push("away");
    if (phase === "lobby") bits.push(player.ready ? "ready" : "not ready");
    name.textContent = bits.join(" · ");
    const row = document.createElement("div");
    row.className = "card-row";
    const personal = (view.personal && view.personal[id]) || [];
    if (view.usesZones) {
      const space = document.createElement("div");
      space.className = "opponent-space";
      const spaceLabel = document.createElement("span");
      spaceLabel.className = "muted";
      spaceLabel.textContent = "space";
      space.append(spaceLabel);
      if (personal.length) {
        for (const card of personal) {
          appendCardButton(space, card, { playable: false });
        }
      } else {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = " —";
        space.append(empty);
      }
      row.append(space);
    }
    const n = counts[id] ?? 0;
    for (let i = 0; i < n; i++) {
      const back = document.createElement("span");
      back.className = "face-down";
      row.append(back);
    }
    if (!view.usesZones && !n && !personal.length) {
      row.textContent = phase === "lobby" ? "—" : "empty";
    }
    box.append(name, row);
    els.opponents.append(box);
  }
}

function renderState(view) {
  if (!view) return;
  lastView = view;
  if (view.viewerId) selfId = view.viewerId;
  const phase = view.phase || "lobby";
  const zoned = Boolean(view.usesZones);
  els.phaseLabel.textContent = phase;
  els.counterValue.textContent = String(view.counter ?? 0);
  els.lobbyTools.classList.toggle("hidden", phase === "playing" && !zoned);
  els.btnStart.classList.toggle("hidden", role !== "host" || (phase === "playing" && !zoned));
  els.btnStart.textContent = zoned
    ? "Start game"
    : phase === "ended"
      ? "Deal again"
      : "Start deal";
  els.handHint.classList.toggle("hidden", phase !== "playing");
  els.handHint.textContent = zoned
    ? "· tap a card, then Place"
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

  els.layoutHighcard.classList.toggle("hidden", zoned);
  els.layoutFreeplay.classList.toggle("hidden", !zoned);
  els.freeplayBar.classList.toggle("hidden", !zoned);
  els.hostTools.classList.toggle("hidden", !zoned || role !== "host");
  const undoBtn = els.freeplayBar.querySelector('[data-act="undo"]');
  if (undoBtn) undoBtn.disabled = !view.canUndo;

  renderOpponents(view, phase);

  if (zoned) {
    renderDeck(els.fpDeck, view.deckCount ?? 0);
    fillRow(els.sharedCards, view.shared, { playable: false });
    fillRow(els.myPersonal, (view.personal && view.personal[selfId]) || [], {
      playable: false,
    });
    els.discardCards.innerHTML = "";
    if (view.discardTop) {
      appendCardButton(els.discardCards, view.discardTop, { playable: false });
    }
    const dc = document.createElement("span");
    dc.className = "muted";
    dc.textContent = ` ${view.discardCount ?? 0}`;
    els.discardCards.append(dc);
    fillHostControls(view);
  } else {
    renderDeck(els.deckPile, view.deckCount ?? 0);
    fillRow(els.tableCards, view.table || view.shared, { playable: false });
  }

  els.handCards.innerHTML = "";
  for (const card of view.hand || []) {
    appendCardButton(els.handCards, card, {
      playable: !zoned && phase === "playing",
      selectable: zoned,
    });
  }
  if (!(view.hand || []).length) {
    els.handCards.textContent = phase === "lobby" ? "—" : "No cards";
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

function placeSelected(dest) {
  if (!selectedCardId) {
    setLobbyStatus({ text: "Select a card in your hand first.", error: true });
    return;
  }
  sendAction("placeCard", { cardId: selectedCardId, dest });
  selectedCardId = null;
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

els.btnBump.addEventListener("click", () => {
  if (!session) return;
  if (role === "host") session.hostIntent("bump");
  else session.sendIntent("bump");
});

els.btnReady.addEventListener("click", () => {
  if (!session) return;
  if (role === "host") session.hostIntent("ready");
  else session.sendIntent("ready");
});

els.btnStart.addEventListener("click", () => {
  if (role !== "host" || !session) return;
  if (lastView?.usesZones) session.hostIntent("startGame");
  else session.hostIntent("start");
});

els.freeplayBar.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn || !session) return;
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
  if (act === "deal") {
    sendAction("deal", {
      count: Number(els.dealCount.value),
      playerId: els.dealTarget.value,
    });
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
