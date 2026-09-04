import { isFirebaseConfigured } from "../js/config.js";
import { initFirebase } from "../js/signaling.js";
import { createGuest } from "../js/guest.js";
import { createCountHost } from "./host.js";
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
import { MIN_PLAYERS, ROUND_CHOICES, MIX, DIFFICULTY_IDS } from "./rules.js";
import { createStage } from "./render.js";

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
  scoreStrip: document.getElementById("score-strip"),
  stage: document.getElementById("stage"),
  stageCaption: document.getElementById("stage-caption"),
  lobbyPanel: document.getElementById("lobby-panel"),
  endedPanel: document.getElementById("ended-panel"),
  guessDock: document.getElementById("guess-dock"),
  guessHint: document.getElementById("guess-hint"),
  guessReadout: document.getElementById("guess-readout"),
  guessPad: document.getElementById("guess-pad"),
  linkHome: document.getElementById("link-home"),
};

const stage = createStage(els.stage);

let session = null;
let role = null;
let currentRoom = "";
let leaving = false;
let joiningGuest = false;
let guestRetryTimer = 0;
let lastState = null;
let draft = "";
let draftRound = "";
let padBuilt = false;

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

function renderScores(state) {
  els.scoreStrip.replaceChildren();
  if (state.phase === "lobby") return;
  const winners = new Set(state.roundWinners || state.winnerIds || []);
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p) continue;
    const chip = document.createElement("span");
    const color = Number.isInteger(p.color) ? p.color : 0;
    chip.className = `score-chip c${color}`;
    if (p.hasGuessed && state.phase !== "ended") chip.classList.add("locked");
    if (winners.has(id) && (state.phase === "reveal" || state.phase === "ended")) {
      chip.classList.add("winner");
    }
    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    const you = id === state.viewerId ? " (you)" : "";
    const guess =
      state.phase === "reveal" && p.hasGuessed ? ` · ${p.guess}` : "";
    label.textContent = `${p.name}${you} ${p.score}${guess}`;
    if (!p.connected) label.textContent += " · away";
    chip.append(dot, label);
    els.scoreStrip.append(chip);
  }
}

function settingLabel(text) {
  const p = document.createElement("p");
  p.className = "setting-label";
  p.textContent = text;
  return p;
}

function pickRow(options, current, sendKey) {
  const row = document.createElement("div");
  row.className = "round-picks";
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opt.label;
    if (opt.id == current) btn.classList.add("active");
    btn.addEventListener("click", () => send("setSettings", { [sendKey]: opt.id }));
    row.append(btn);
  }
  return row;
}

function settingsSummary(state) {
  const s = state.settings || {};
  const game =
    s.miniGame === MIX
      ? "mix"
      : (state.catalog || []).find((g) => g.id === s.miniGame)?.name || s.miniGame;
  const ramp = s.miniGame && s.miniGame !== MIX ? " · eases in" : "";
  return `${s.rounds || 8} rounds · ${s.difficulty || "easy"} · ${game}${ramp}`;
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
  blurb.textContent = `${state.connectedCount}/${state.maxPlayers} connected · need ${MIN_PLAYERS} ready`;
  els.lobbyPanel.replaceChildren(title, blurb);

  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p) continue;
    const row = document.createElement("div");
    row.className = "player-row";
    const dot = document.createElement("span");
    dot.className = "dot";
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

  if (state.youAreHost) {
    els.lobbyPanel.append(settingLabel("Rounds"));
    els.lobbyPanel.append(
      pickRow(
        ROUND_CHOICES.map((n) => ({ id: n, label: `${n}` })),
        state.settings?.rounds,
        "rounds"
      )
    );
    els.lobbyPanel.append(settingLabel("Difficulty"));
    els.lobbyPanel.append(
      pickRow(
        DIFFICULTY_IDS.map((id) => ({
          id,
          label: id[0].toUpperCase() + id.slice(1),
        })),
        state.settings?.difficulty,
        "difficulty"
      )
    );
    const games = [
      { id: MIX, label: "Mix" },
      ...(state.catalog || []).map((g) => ({ id: g.id, label: g.name })),
    ];
    els.lobbyPanel.append(settingLabel("Mini-game"));
    els.lobbyPanel.append(pickRow(games, state.settings?.miniGame || MIX, "miniGame"));
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent =
      state.settings?.miniGame && state.settings.miniGame !== MIX
        ? "One game: round 1 is easy, later rounds climb toward the difficulty you picked."
        : "Mix: a random game each round, all at this difficulty.";
    els.lobbyPanel.append(hint);
  } else {
    const info = document.createElement("p");
    info.className = "muted";
    info.textContent = settingsSummary(state);
    els.lobbyPanel.append(info);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const readyBtn = document.createElement("button");
  readyBtn.type = "button";
  const me = state.players[state.viewerId];
  readyBtn.textContent = me?.ready ? "Unready" : "Ready";
  readyBtn.className = me?.ready ? "ghost" : "";
  readyBtn.addEventListener("click", () => send("setReady"));
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
  const winners = (state.winnerIds || [])
    .map((id) => state.players[id]?.name)
    .filter(Boolean);
  const title = document.createElement("h2");
  title.textContent =
    winners.length === 1
      ? `${winners[0]} wins`
      : winners.length
        ? `Tie: ${winners.join(", ")}`
        : "Game over";
  const blurb = document.createElement("p");
  blurb.className = "muted";
  blurb.textContent = "Highest score after the last round.";
  els.endedPanel.replaceChildren(title, blurb);

  const list = document.createElement("div");
  const ranked = state.playerOrder
    .map((id) => state.players[id])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  for (const p of ranked) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.textContent = `${p.name} · ${p.score}`;
    list.append(row);
  }
  els.endedPanel.append(list);

  if (state.youAreHost) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Play again";
    again.addEventListener("click", () => send("playAgain"));
    actions.append(again);
    els.endedPanel.append(actions);
  }
}

function submitDraft() {
  const state = lastState;
  if (!state?.canGuess) return;
  const value = draft === "" ? null : Number(draft);
  if (value == null || Number.isNaN(value)) return;
  send("guess", { value });
}

function pushDigit(d) {
  if (!lastState?.canGuess) return;
  if (draft.length >= 2) return;
  if (draft === "0") draft = String(d);
  else draft += String(d);
  els.guessReadout.textContent = draft || "—";
}

function clearDraft() {
  if (!lastState?.canGuess) return;
  draft = "";
  els.guessReadout.textContent = "—";
}

function ensurePad() {
  if (padBuilt) return;
  padBuilt = true;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = key === "C" ? "Clear" : key === "OK" ? "Submit" : key;
    btn.addEventListener("click", () => {
      if (key === "C") clearDraft();
      else if (key === "OK") submitDraft();
      else pushDigit(key);
    });
    els.guessPad.append(btn);
  }
}

function renderPad(state) {
  ensurePad();
  if (state.roundId !== draftRound) {
    draft = "";
    draftRound = state.roundId || "";
  }
  const playing = ["watch", "guess", "reveal"].includes(state.phase);
  const me = state.players[state.viewerId];
  if (!playing || state.phase === "reveal") {
    els.guessDock.classList.add("hidden");
    return;
  }
  els.guessDock.classList.remove("hidden");
  if (state.canGuess) {
    els.guessHint.textContent = state.prompt || "How many?";
    els.guessReadout.textContent = draft || "—";
    els.guessPad.querySelectorAll("button").forEach((b) => {
      b.disabled = false;
    });
  } else if (me?.hasGuessed) {
    els.guessHint.textContent = "Locked in";
    els.guessReadout.textContent = String(me.guess ?? (draft || "—"));
    els.guessPad.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });
  } else if (state.phase === "watch" && state.scoring === "timed") {
    els.guessHint.textContent = "Watch…";
    els.guessReadout.textContent = "—";
    els.guessPad.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });
  } else {
    els.guessDock.classList.add("hidden");
  }
}

function renderCaption(state) {
  if (state.phase === "lobby" || state.phase === "ended") {
    els.stageCaption.textContent = "";
    return;
  }
  if (state.phase === "watch") {
    els.stageCaption.textContent = state.miniGameName
      ? `${state.miniGameName} · ${state.roundIndex}/${state.roundTotal}`
      : "";
    return;
  }
  if (state.phase === "guess") {
    els.stageCaption.textContent = state.prompt || "How many?";
    return;
  }
  if (state.phase === "reveal") {
    els.stageCaption.textContent =
      state.answer == null ? "" : `Answer ${state.answer}`;
  }
}

function renderState(state) {
  if (!state) return;
  lastState = state;
  showTable(currentRoom);
  els.roundMessage.textContent = state.message || "";
  renderScores(state);
  renderLobby(state);
  renderEnded(state);
  renderCaption(state);
  renderPad(state);
  stage.sync(state);
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
    const host = createCountHost({
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

window.addEventListener("keydown", (event) => {
  if (!lastState?.canGuess) return;
  if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
  if (event.key >= "0" && event.key <= "9") {
    event.preventDefault();
    pushDigit(event.key);
  } else if (event.key === "Backspace") {
    event.preventDefault();
    draft = draft.slice(0, -1);
    els.guessReadout.textContent = draft || "—";
  } else if (event.key === "Enter") {
    event.preventDefault();
    submitDraft();
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
