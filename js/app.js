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
};

let session = null;
let role = null;
let selfId = null;
let currentRoom = "";
let guestRetryTimer = null;
let leaving = false;
let joiningGuest = false;

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

function appendCardButton(parent, card, { playable }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "playing-card" + (card.color === "red" ? " red" : "");
  btn.textContent = cardLabel(card);
  if (playable) {
    btn.addEventListener("click", () => {
      if (!session) return;
      if (role === "host") session.hostIntent("playCard", { cardId: card.id });
      else session.sendIntent("playCard", { cardId: card.id });
    });
  } else {
    btn.disabled = true;
  }
  parent.append(btn);
}

function renderDeck(count) {
  els.deckPile.innerHTML = "";
  const n = Math.min(8, Math.max(0, count));
  for (let i = 0; i < n; i++) {
    const back = document.createElement("div");
    back.className = "deck-back";
    back.style.left = `${i * 2}px`;
    back.style.top = `${-i * 2}px`;
    back.style.zIndex = String(i);
    els.deckPile.append(back);
  }
  const label = document.createElement("div");
  label.className = "deck-count";
  label.textContent = String(count);
  els.deckPile.append(label);
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
    const n = counts[id] ?? 0;
    for (let i = 0; i < n; i++) {
      const back = document.createElement("span");
      back.className = "face-down";
      row.append(back);
    }
    if (!n) {
      row.textContent = phase === "lobby" ? "—" : "empty";
    }
    box.append(name, row);
    els.opponents.append(box);
  }
}

function renderState(view) {
  if (!view) return;
  if (view.viewerId) selfId = view.viewerId;
  const phase = view.phase || "lobby";
  els.phaseLabel.textContent = phase;
  els.counterValue.textContent = String(view.counter ?? 0);
  els.lobbyTools.classList.toggle("hidden", phase === "playing");
  els.btnStart.classList.toggle("hidden", role !== "host" || phase === "playing");
  els.btnStart.textContent = phase === "ended" ? "Deal again" : "Start deal";
  els.handHint.classList.toggle("hidden", phase !== "playing");
  if (view.gameName) els.gameNameLabel.textContent = view.gameName;
  if (view.message) {
    els.roundMessage.textContent = view.message;
    els.roundMessage.classList.remove("hidden");
  } else {
    els.roundMessage.classList.add("hidden");
    els.roundMessage.textContent = "";
  }

  renderDeck(view.deckCount ?? 0);
  renderOpponents(view, phase);

  els.tableCards.innerHTML = "";
  for (const card of view.table || []) {
    appendCardButton(els.tableCards, card, { playable: false });
  }
  if (!(view.table || []).length) {
    els.tableCards.textContent = phase === "lobby" ? "—" : "Empty";
  }

  els.handCards.innerHTML = "";
  for (const card of view.hand || []) {
    appendCardButton(els.handCards, card, { playable: phase === "playing" });
  }
  if (!(view.hand || []).length) {
    els.handCards.textContent = phase === "lobby" ? "—" : "No cards";
  }
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
      gameId: saved ? undefined : els.gameType.value,
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
    const opt = document.createElement("option");
    opt.value = game.id;
    opt.textContent = game.name;
    els.gameType.append(opt);
  }
  els.gameType.value = "highcard";
  els.gameBlurb.textContent = gameList().find((g) => g.id === els.gameType.value)?.blurb || "";
}

els.gameType.addEventListener("change", () => {
  const game = gameList().find((g) => g.id === els.gameType.value);
  els.gameBlurb.textContent = game?.blurb || "";
});

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
  if (role === "host" && session) session.hostIntent("start");
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
