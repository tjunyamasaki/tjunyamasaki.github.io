import { isFirebaseConfigured } from "../js/config.js";
import { initFirebase } from "../js/signaling.js";
import { createGuest } from "../js/guest.js";
import { createFodinhaHost } from "./host.js";
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
import {
  SUIT_GLYPH,
  isRedSuit,
  isManilha,
  pipLayout,
  cardLabel,
  rankName,
} from "./cards.js";
import { MIN_PLAYERS, START_LIVES } from "./rules.js";

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
  bidDock: document.getElementById("bid-dock"),
  bidHint: document.getElementById("bid-hint"),
  bidPad: document.getElementById("bid-pad"),
  selfBar: document.getElementById("self-bar"),
  handWrap: document.getElementById("hand-wrap"),
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

function playingCard(card, { size = "", interactive = false, dim = false, legal = false, manilha = false } = {}) {
  const el = document.createElement(interactive ? "button" : "div");
  if (interactive) el.type = "button";
  el.className = "playing-card face";
  if (size) el.classList.add(size);
  if (isRedSuit(card.suit)) el.classList.add("red");
  if (manilha) el.classList.add("manilha");
  if (interactive && legal) el.classList.add("legal");
  if (interactive && dim) el.classList.add("illegal");
  el.dataset.cardId = card.id;
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

function cardBack(extraClass = "") {
  const el = document.createElement("div");
  el.className = `playing-card back ${extraClass}`.trim();
  el.setAttribute("aria-hidden", "true");
  return el;
}

function lifeRow(lives, max = START_LIVES) {
  const wrap = document.createElement("div");
  wrap.className = "lives";
  wrap.setAttribute("aria-label", `${lives} lives`);
  const total = Math.max(max, lives, 1);
  for (let i = 0; i < total; i++) {
    const d = document.createElement("span");
    d.className = "life" + (i < lives ? "" : " off");
    wrap.append(d);
  }
  return wrap;
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
    if (p.eliminated) seat.classList.add("eliminated");

    const name = document.createElement("div");
    name.className = "seat-name";
    const dot = document.createElement("span");
    dot.className = "dot";
    name.append(dot, document.createTextNode(p.name || "Player"));
    if (state.dealerId === id) {
      const tag = document.createElement("span");
      tag.className = "dealer-tag";
      tag.textContent = "D";
      tag.title = "Dealer";
      name.append(tag);
    }
    seat.append(name);
    seat.append(lifeRow(p.lives));

    const bid = document.createElement("div");
    bid.className = "seat-bid";
    if (p.eliminated) bid.textContent = "out";
    else if (state.phase === "lobby") bid.textContent = p.ready ? "ready" : "…";
    else if (state.phase === "bidding") {
      bid.textContent = p.hasBid ? (p.bid == null ? "bid" : `bid ${p.bid}`) : "bidding";
    } else if (["playing", "reveal", "ended"].includes(state.phase)) {
      const shown = p.bid == null ? "—" : p.bid;
      bid.textContent = `${p.tricks}/${shown}`;
    } else bid.textContent = "";
    if (!p.connected) bid.textContent = (bid.textContent ? bid.textContent + " · " : "") + "away";
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

  if (state.vira) {
    const badge = document.createElement("div");
    badge.className = "badge";
    const vira = playingCard(state.vira, {
      size: "tiny-vira",
      manilha: false,
    });
    vira.style.pointerEvents = "none";
    const lab = document.createElement("span");
    lab.innerHTML = `Vira &nbsp;<strong>${cardLabel(state.vira)}</strong>`;
    badge.append(vira, lab);
    els.metaRow.append(badge);
  }

  if (state.manilhaRank) {
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.innerHTML = `Manilha &nbsp;<strong>${rankName(state.manilhaRank)}s ${SUIT_GLYPH.clubs} high</strong>`;
    els.metaRow.append(badge);
  }

  const hand = document.createElement("div");
  hand.className = "badge";
  hand.innerHTML = `<strong>${state.handSize}</strong> ${state.handSize === 1 ? "card" : "cards"}${
    state.suddenDeath ? " · sudden death" : ""
  }`;
  els.metaRow.append(hand);
}

function renderTrick(state) {
  els.trick.replaceChildren();
  const plays = state.trick || [];
  els.trick.classList.toggle("hidden", !plays.length);
  for (const play of plays) {
    const wrap = document.createElement("div");
    wrap.className = "trick-seat";
    if (state.pendingTrickWinner === play.playerId) wrap.classList.add("winner");
    const card = playingCard(play.card, {
      manilha: isManilha(play.card, state.manilhaRank),
    });
    const who = document.createElement("span");
    who.className = "who";
    const name =
      play.playerId === state.viewerId
        ? "You"
        : state.players[play.playerId]?.name || "Player";
    who.textContent = name;
    wrap.append(card, who);
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
    chip.className = "score-chip" + (row.delta ? " miss" : "");
    chip.textContent = `${row.name} ${row.tricks}/${row.bid}` + (row.delta ? ` −${row.delta}` : " ✓");
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
    name.textContent = p.name + (id === state.viewerId ? "" : "");
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
  blurb.textContent = "Last player with lives. Host can deal a rematch.";
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
  name.textContent = me.name + (state.dealerId === state.viewerId ? " · dealer" : "");
  els.selfBar.append(name);
  els.selfBar.append(lifeRow(me.lives));
  const meta = document.createElement("span");
  if (state.phase === "lobby") meta.textContent = me.ready ? "ready" : "not ready";
  else if (state.phase === "bidding") {
    meta.textContent = me.hasBid ? `bid ${me.bid}` : "your bid";
  } else if (["playing", "reveal", "ended"].includes(state.phase)) {
    meta.textContent = me.eliminated ? "out" : `tricks ${me.tricks}/${me.bid ?? "—"}`;
  }
  els.selfBar.append(meta);
}

function renderBids(state) {
  const myTurn = state.phase === "bidding" && state.toAct === state.viewerId;
  const me = state.players[state.viewerId];
  if (!myTurn || me?.eliminated) {
    els.bidDock.classList.add("hidden");
    els.bidPad.replaceChildren();
    return;
  }
  els.bidDock.classList.remove("hidden");
  const forbid = state.hookForbidden;
  els.bidHint.textContent =
    forbid == null
      ? `Bid tricks (0–${state.handSize})`
      : `Bid tricks — hook: you cannot bid ${forbid}`;
  els.bidPad.replaceChildren();
  for (let n = 0; n <= state.handSize; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(n);
    if (n === forbid) {
      btn.disabled = true;
      btn.className = "hook";
      btn.title = "Hook: bids cannot add up to the hand size";
    }
    btn.addEventListener("click", () => send("bid", { n }));
    els.bidPad.append(btn);
  }
}

function renderHand(state) {
  const inPlay = ["bidding", "playing", "reveal"].includes(state.phase);
  if (!inPlay) {
    els.hand.replaceChildren();
    els.handHint.textContent = "";
    return;
  }
  const legal = new Set(state.legalCardIds || []);
  const canPlay =
    state.phase === "playing" &&
    !state.trickFrozen &&
    state.toAct === state.viewerId;
  els.hand.replaceChildren();
  for (const card of state.hand || []) {
    const isLegal = canPlay && legal.has(card.id);
    const el = playingCard(card, {
      interactive: canPlay,
      legal: isLegal,
      dim: canPlay && !isLegal,
      manilha: isManilha(card, state.manilhaRank),
    });
    if (canPlay && isLegal) {
      el.addEventListener("click", () => send("playCard", { cardId: card.id }));
    } else if (canPlay) {
      el.disabled = true;
    }
    els.hand.append(el);
  }
  if (state.phase === "playing" && canPlay) {
    els.handHint.textContent = state.ledSuit
      ? `Follow ${SUIT_GLYPH[state.ledSuit]} if you can`
      : "Your lead — play any card";
  } else if (state.phase === "playing" && state.toAct && state.toAct !== state.viewerId) {
    const name = state.players[state.toAct]?.name || "Player";
    els.handHint.textContent = `Waiting for ${name}`;
  } else if (state.phase === "bidding") {
    els.handHint.textContent = "Look at your hand, then bid";
  } else {
    els.handHint.textContent = "";
  }
}

function renderState(state) {
  if (!state) return;
  showTable(currentRoom);
  els.roundMessage.textContent = state.message || "";
  renderOpponents(state);
  renderLobby(state);
  renderEnded(state);
  renderMeta(state);
  renderTrick(state);
  renderScore(state);
  renderSelf(state);
  renderBids(state);
  renderHand(state);
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
    const host = createFodinhaHost({
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
  if (status.error && status.text === "host gone") {
    scheduleGuestRetry();
  }
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
      location.href = "../";
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
