import { isFirebaseConfigured } from "../js/config.js";
import { initFirebase } from "../js/signaling.js";
import { createGuest } from "../js/guest.js";
import { playingCard, cardBack } from "../js/feltCard.js";
import { createPresidenteHost } from "./host.js";
import {
  getOrCreatePlayerId,
  loadNickname,
  saveNickname,
  saveHostSession,
  loadHostSession,
  clearHostSession,
  saveGuestSession,
  loadGuestSession,
  clearGuestSession,
} from "./persist.js";
import { isLegalSet, comboLabel } from "./cards.js";
import { MIN_PLAYERS, TITLE_LABEL, WIN_POINTS } from "./rules.js";

const els = {
  configError: document.getElementById("config-error"),
  viewGate: document.getElementById("view-gate"),
  viewTable: document.getElementById("view-table"),
  nickname: document.getElementById("nickname"),
  joinCode: document.getElementById("join-code"),
  btnHost: document.getElementById("btn-host"),
  btnJoin: document.getElementById("btn-join"),
  btnResume: document.getElementById("btn-resume"),
  btnDiscard: document.getElementById("btn-discard"),
  resumeRow: document.getElementById("resume-row"),
  gateStatus: document.getElementById("gate-status"),
  btnLeave: document.getElementById("btn-leave"),
  roomCode: document.getElementById("room-code"),
  tableStatus: document.getElementById("table-status"),
  roundMessage: document.getElementById("round-message"),
  opponents: document.getElementById("opponents"),
  lobbyPanel: document.getElementById("lobby-panel"),
  endedPanel: document.getElementById("ended-panel"),
  metaRow: document.getElementById("meta-row"),
  trick: document.getElementById("trick"),
  scoreStrip: document.getElementById("score-strip"),
  playDock: document.getElementById("play-dock"),
  playHint: document.getElementById("play-hint"),
  btnPass: document.getElementById("btn-pass"),
  btnPlay: document.getElementById("btn-play"),
  selfBar: document.getElementById("self-bar"),
  handHint: document.getElementById("hand-hint"),
  hand: document.getElementById("hand"),
  linkHome: document.getElementById("link-home"),
};

let session = null;
let role = null;
let currentRoom = "";
let leaving = false;
let joiningGuest = false;
let guestRetryTimer = 0;
let lastState = null;
let selected = new Set();

function nickname() {
  const name = (els.nickname.value || "").trim() || "Player";
  saveNickname(name);
  return name.slice(0, 24);
}

function setGateStatus(text, error = false) {
  els.gateStatus.textContent = text || "";
  els.gateStatus.style.color = error ? "var(--danger)" : "";
}

function setTableStatus(status) {
  const text = typeof status === "string" ? status : status?.text || "";
  const error = typeof status === "object" && status?.error;
  if (!text || text === "connected") {
    els.tableStatus.classList.add("hidden");
    els.tableStatus.textContent = "";
    return;
  }
  els.tableStatus.classList.remove("hidden");
  els.tableStatus.textContent = text;
  els.tableStatus.style.color = error ? "var(--danger)" : "";
}

function showGate() {
  els.viewGate.classList.remove("hidden");
  els.viewTable.classList.add("hidden");
}

function showTable(code) {
  currentRoom = code || currentRoom;
  els.roomCode.textContent = currentRoom || "————";
  els.viewGate.classList.add("hidden");
  els.viewTable.classList.remove("hidden");
}

function send(action, extra = {}) {
  if (!session) return;
  if (role === "host") session.hostIntent(action, extra);
  else session.sendIntent(action, extra);
}

function selectedCards(state) {
  return (state.hand || []).filter((c) => selected.has(c.id));
}

function titleLabel(title) {
  return TITLE_LABEL[title] || "";
}

function opponentOrder(state) {
  const order = state.playerOrder || [];
  const i = order.indexOf(state.viewerId);
  if (i < 0) return order.filter((id) => id !== state.viewerId);
  return [...order.slice(i + 1), ...order.slice(0, i)];
}

function renderOpponents(state) {
  els.opponents.replaceChildren();
  const others = opponentOrder(state);
  if (!others.length) {
    els.opponents.classList.add("hidden");
    return;
  }
  els.opponents.classList.remove("hidden");
  for (const id of others) {
    const p = state.players[id];
    if (!p) continue;
    const seat = document.createElement("div");
    const color = Number.isInteger(p.color) ? p.color : 0;
    seat.className = `seat c${color}`;
    if (state.toAct === id) seat.classList.add("to-act");

    const name = document.createElement("div");
    name.className = "seat-name";
    const dot = document.createElement("span");
    dot.className = "dot";
    name.append(dot, document.createTextNode(p.name || "Player"));
    seat.append(name);

    if (p.title) {
      const chip = document.createElement("div");
      chip.className = `title-chip ${p.title}`;
      chip.textContent = titleLabel(p.title);
      seat.append(chip);
    }

    const pts = document.createElement("div");
    pts.className = "seat-points";
    pts.textContent = `${p.points} pts`;
    seat.append(pts);

    const bid = document.createElement("div");
    bid.className = "seat-bid";
    if (state.phase === "lobby") bid.textContent = p.ready ? "ready" : "…";
    else if (state.passed?.[id]) bid.textContent = "pass";
    else if ((state.handCounts?.[id] || 0) === 0 && state.phase === "playing") {
      bid.textContent = "out";
    } else bid.textContent = `${state.handCounts?.[id] || 0} cards`;
    if (!p.connected) bid.textContent += " · away";
    seat.append(bid);

    const mini = document.createElement("div");
    mini.className = "mini-hand";
    const n = Math.min(state.handCounts?.[id] || 0, 8);
    for (let i = 0; i < n; i++) mini.append(cardBack());
    seat.append(mini);
    els.opponents.append(seat);
  }
}

function renderMeta(state) {
  els.metaRow.replaceChildren();
  if (state.phase === "lobby" || state.phase === "ended") {
    els.metaRow.classList.add("hidden");
    return;
  }
  els.metaRow.classList.remove("hidden");
  const goal = document.createElement("div");
  goal.className = "badge";
  goal.innerHTML = `First to <strong>${WIN_POINTS}</strong>`;
  els.metaRow.append(goal);
  if (state.pile) {
    const pile = document.createElement("div");
    pile.className = "badge";
    pile.innerHTML = `Pile &nbsp;<strong>${comboLabel(state.pile.cards)}</strong>`;
    els.metaRow.append(pile);
  } else if (state.phase === "playing") {
    const lead = document.createElement("div");
    lead.className = "badge";
    lead.innerHTML = "<strong>Lead</strong> any set";
    els.metaRow.append(lead);
  }
}

function renderPile(state) {
  els.trick.replaceChildren();
  const cards = state.pile?.cards || [];
  els.trick.classList.toggle("hidden", !cards.length && state.phase !== "playing");
  if (!cards.length) {
    if (state.phase === "playing") {
      const empty = document.createElement("p");
      empty.className = "pile-empty";
      empty.textContent = "Empty pile — lead any number of the same rank.";
      els.trick.append(empty);
    }
    return;
  }
  for (const card of cards) {
    const wrap = document.createElement("div");
    wrap.className = "trick-seat";
    if (state.lastPlayId && state.pile.playerId === state.lastPlayId) {
      wrap.classList.add("winner");
    }
    wrap.append(playingCard(card));
    els.trick.append(wrap);
  }
}

function renderScore(state) {
  const rows = state.lastHandResult;
  if (!rows?.length || (state.phase !== "reveal" && state.phase !== "ended")) {
    els.scoreStrip.classList.add("hidden");
    els.scoreStrip.replaceChildren();
    return;
  }
  els.scoreStrip.classList.remove("hidden");
  els.scoreStrip.replaceChildren();
  for (const row of rows) {
    const chip = document.createElement("span");
    chip.className = "score-chip";
    chip.textContent = `${row.name} ${titleLabel(row.title)} ${row.points} pts`;
    els.scoreStrip.append(chip);
  }
}

function renderLobby(state) {
  if (state.phase !== "lobby") {
    els.lobbyPanel.classList.add("hidden");
    els.lobbyPanel.replaceChildren();
    return;
  }
  els.lobbyPanel.classList.remove("hidden");
  const title = document.createElement("h2");
  title.textContent = "Waiting room";
  const blurb = document.createElement("p");
  blurb.className = "muted";
  blurb.textContent = `${state.connectedCount}/${state.maxPlayers} connected · need ${MIN_PLAYERS} ready to start`;
  els.lobbyPanel.replaceChildren(title, blurb);

  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p) continue;
    const row = document.createElement("div");
    row.className = "player-row";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.width = "0.55rem";
    dot.style.height = "0.55rem";
    dot.style.borderRadius = "50%";
    dot.style.background = `var(--seat-${p.color ?? 0})`;
    const name = document.createElement("span");
    name.textContent = p.name;
    row.append(dot, name);
    if (id === state.viewerId) {
      const you = document.createElement("span");
      you.className = "you-chip";
      you.textContent = "you";
      row.append(you);
    }
    if (p.isHost) {
      const host = document.createElement("span");
      host.className = "you-chip";
      host.textContent = "host";
      row.append(host);
    }
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    row.append(spacer);
    if (!p.connected) {
      const away = document.createElement("span");
      away.className = "away";
      away.textContent = "away";
      row.append(away);
    } else {
      const ready = document.createElement("span");
      ready.className = "ready-pill";
      ready.textContent = p.ready ? "ready" : "not ready";
      row.append(ready);
    }
    els.lobbyPanel.append(row);
  }

  const actions = document.createElement("div");
  actions.className = "lobby-actions actions";
  const readyBtn = document.createElement("button");
  readyBtn.type = "button";
  const me = state.players[state.viewerId];
  readyBtn.textContent = me?.ready ? "Unready" : "Ready";
  readyBtn.className = me?.ready ? "ghost" : "";
  readyBtn.addEventListener("click", () => send("ready"));
  actions.append(readyBtn);
  if (state.youAreHost) {
    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start";
    start.disabled = !state.canStart;
    start.addEventListener("click", () => send("startGame"));
    actions.append(start);
  }
  els.lobbyPanel.append(actions);
}

function renderEnded(state) {
  if (state.phase !== "ended") {
    els.endedPanel.classList.add("hidden");
    els.endedPanel.replaceChildren();
    return;
  }
  els.endedPanel.classList.remove("hidden");
  const winner = state.players[state.winnerId];
  const title = document.createElement("h2");
  title.textContent = winner ? `${winner.name} wins` : "Game over";
  const blurb = document.createElement("p");
  blurb.className = "muted";
  blurb.textContent = `First to ${WIN_POINTS} points. Host can deal a rematch.`;
  els.endedPanel.replaceChildren(title, blurb);
  if (state.youAreHost) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const rematch = document.createElement("button");
    rematch.type = "button";
    rematch.textContent = "Rematch";
    rematch.addEventListener("click", () => send("rematch"));
    actions.append(rematch);
    els.endedPanel.append(actions);
  }
}

function renderSelf(state) {
  const me = state.players[state.viewerId];
  els.selfBar.replaceChildren();
  if (!me) return;
  els.selfBar.classList.toggle("to-act", state.toAct === state.viewerId);
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = me.name;
  els.selfBar.append(name);
  if (me.title) {
    const chip = document.createElement("span");
    chip.className = `title-chip ${me.title}`;
    chip.textContent = titleLabel(me.title);
    els.selfBar.append(chip);
  }
  const pts = document.createElement("span");
  pts.textContent = `${me.points} pts`;
  els.selfBar.append(pts);
}

function renderDock(state) {
  const myTurn = state.toAct === state.viewerId && !state.frozen;
  const tax = state.phase === "tax" && myTurn && state.tax;
  const play = state.phase === "playing" && myTurn;
  if (!tax && !play) {
    els.playDock.classList.add("hidden");
    return;
  }
  els.playDock.classList.remove("hidden");
  const pick = selectedCards(state);
  if (tax) {
    els.playHint.textContent = `Give ${state.tax.count} card${
      state.tax.count > 1 ? "s" : ""
    } to ${state.players[state.tax.receiver]?.name || "them"}`;
    els.btnPass.classList.add("hidden");
    els.btnPlay.textContent = "Give";
    els.btnPlay.disabled = pick.length !== state.tax.count;
    return;
  }
  els.btnPass.classList.toggle("hidden", !state.canPass);
  els.btnPass.disabled = !state.canPass;
  els.btnPlay.textContent = "Play";
  const legal = isLegalSet(pick, state.pile);
  els.btnPlay.disabled = !legal;
  if (!state.pile) {
    els.playHint.textContent = pick.length
      ? `Lead ${comboLabel(pick)}`
      : "Select cards of one rank, then Play";
  } else {
    els.playHint.textContent = `Beat ${comboLabel(state.pile.cards)} with ${state.pile.count} higher`;
  }
}

function rankPlayable(state, rank) {
  const ofRank = (state.hand || []).filter((c) => c.rank === rank);
  if (!state.pile) return ofRank.length > 0;
  return ofRank.length >= state.pile.count && isLegalSet(ofRank.slice(0, state.pile.count), state.pile);
}

function renderHand(state) {
  const inPlay = ["playing", "tax", "reveal"].includes(state.phase);
  if (!inPlay) {
    els.hand.replaceChildren();
    els.handHint.textContent = "";
    els.hand.style.removeProperty("--hand-overlap");
    return;
  }
  const n = (state.hand || []).length;
  const overlap = n > 22 ? "2.2rem" : n > 16 ? "1.8rem" : n > 11 ? "1.45rem" : "1.15rem";
  els.hand.style.setProperty("--hand-overlap", overlap);
  const scrollX = els.hand.scrollLeft;
  const myTurn =
    state.toAct === state.viewerId &&
    !state.frozen &&
    (state.phase === "playing" || state.phase === "tax");
  els.hand.replaceChildren();
  for (const card of state.hand || []) {
    const playable = state.phase === "playing" && rankPlayable(state, card.rank);
    const el = playingCard(card, {
      interactive: myTurn,
      legal: myTurn && (state.phase === "tax" || playable),
      dim: myTurn && state.phase === "playing" && !playable,
      selected: selected.has(card.id),
    });
    if (myTurn) {
      el.addEventListener("click", () => {
        const cur = selectedCards(state);
        if (cur.length && cur[0].rank !== card.rank && !selected.has(card.id)) {
          selected = new Set();
        }
        if (selected.has(card.id)) selected.delete(card.id);
        else selected.add(card.id);
        renderHand(state);
        renderDock(state);
      });
    }
    els.hand.append(el);
  }
  els.hand.scrollLeft = scrollX;
  if (state.phase === "tax" && myTurn) {
    els.handHint.textContent = "Tax: pick the cards you want to dump";
  } else if (state.phase === "playing" && myTurn) {
    els.handHint.textContent = state.pile
      ? "Same count, higher rank — or pass (you're out of this pile)"
      : "Lead singles, pairs, trips, or quads";
  } else if (state.toAct && state.toAct !== state.viewerId) {
    els.handHint.textContent = `Waiting for ${state.players[state.toAct]?.name || "Player"}`;
  } else {
    els.handHint.textContent = "";
  }
}

function renderState(state) {
  if (!state) return;
  if (!lastState || lastState.seq !== state.seq) selected = new Set();
  lastState = state;
  showTable(currentRoom);
  els.roundMessage.textContent = state.message || "";
  renderOpponents(state);
  renderLobby(state);
  renderEnded(state);
  renderMeta(state);
  renderPile(state);
  renderScore(state);
  renderSelf(state);
  renderHand(state);
  renderDock(state);
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
    guestRetryTimer = 0;
  }
}

async function beginHost({ resume } = {}) {
  if (!isFirebaseConfigured()) return;
  els.btnHost.disabled = true;
  els.btnResume.disabled = true;
  setGateStatus(resume ? "Resuming room…" : "Creating room…");
  const saved = resume ? loadHostSession() : null;
  const name = nickname();
  try {
    initFirebase();
    const host = createPresidenteHost({
      name,
      initialGame: saved?.game,
      onState: renderState,
      onStatus: setTableStatus,
      onPersist: saveHostSession,
    });
    session = host;
    role = "host";
    const code = await host.start(saved?.roomCode);
    showTable(code);
    setTableStatus({ text: "connected" });
    setGateStatus("");
  } catch (err) {
    console.error(err);
    setGateStatus(err.message || String(err), true);
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
  if (!fromRetry) setGateStatus("Joining…");
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
    await guest.join(code);
    saveGuestSession({ roomCode: code, name: nickname(), playerId });
    showTable(code);
    setTableStatus({ text: "connected" });
    setGateStatus("");
    stopGuestRetry();
  } catch (err) {
    console.error(err);
    if (fromRetry) {
      setTableStatus({ text: "reconnecting… waiting for host", error: false });
    } else {
      setGateStatus(err.message || String(err), true);
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
  setTableStatus(status);
  if (leaving) return;
  if (status.error && status.text === "host gone") scheduleGuestRetry();
}

function scheduleGuestRetry() {
  if (guestRetryTimer || !currentRoom) return;
  setTableStatus({ text: "reconnecting… waiting for host", error: false });
  guestRetryTimer = setInterval(() => {
    beginGuest(currentRoom, { fromRetry: true });
  }, 2500);
}

async function leave() {
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
  if (role === "host") clearHostSession();
  if (role === "guest") clearGuestSession();
  role = null;
  lastState = null;
  selected = new Set();
  currentRoom = "";
  leaving = false;
  showGate();
  setGateStatus("");
  refreshResumeUi();
}

els.btnHost.addEventListener("click", () => beginHost({ resume: false }));
els.btnResume.addEventListener("click", () => beginHost({ resume: true }));
els.btnDiscard.addEventListener("click", () => {
  clearHostSession();
  refreshResumeUi();
});
els.btnJoin.addEventListener("click", () => {
  const code = els.joinCode.value.trim().toUpperCase();
  els.joinCode.value = code;
  if (!code) {
    setGateStatus("Enter a room code.", true);
    return;
  }
  beginGuest(code);
});
els.joinCode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.btnJoin.click();
});
els.btnLeave.addEventListener("click", () => leave());
els.linkHome.addEventListener("click", (event) => {
  if (session) {
    event.preventDefault();
    leave().then(() => {
      location.href = "/links/";
    });
  }
});
els.roomCode.addEventListener("click", async () => {
  if (!currentRoom) return;
  try {
    await navigator.clipboard.writeText(currentRoom);
    setTableStatus({ text: "Room code copied" });
    setTimeout(() => setTableStatus({ text: "connected" }), 1200);
  } catch {
    setTableStatus({ text: currentRoom });
  }
});
els.btnPass.addEventListener("click", () => send("pass"));
els.btnPlay.addEventListener("click", () => {
  if (!lastState) return;
  const ids = selectedCards(lastState).map((c) => c.id);
  if (lastState.phase === "tax") send("giveTax", { cardIds: ids });
  else send("playCards", { cardIds: ids });
  selected = new Set();
});

els.nickname.value = loadNickname();
refreshResumeUi();

if (!isFirebaseConfigured()) {
  els.configError.classList.remove("hidden");
  els.configError.textContent =
    "Firebase is not configured. See docs/SETUP.md for local keys.";
  els.btnHost.disabled = true;
  els.btnJoin.disabled = true;
  els.btnResume.disabled = true;
}
