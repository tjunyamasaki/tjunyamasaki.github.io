import { isFirebaseConfigured } from "./config.js";
import { initFirebase } from "./signaling.js";
import { createHost } from "./host.js";
import { createGuest } from "./guest.js";

const els = {
  configError: document.getElementById("config-error"),
  viewHome: document.getElementById("view-home"),
  viewLobby: document.getElementById("view-lobby"),
  nickname: document.getElementById("nickname"),
  joinCode: document.getElementById("join-code"),
  btnHost: document.getElementById("btn-host"),
  btnJoin: document.getElementById("btn-join"),
  btnLeave: document.getElementById("btn-leave"),
  btnBump: document.getElementById("btn-bump"),
  btnReady: document.getElementById("btn-ready"),
  homeStatus: document.getElementById("home-status"),
  lobbyStatus: document.getElementById("lobby-status"),
  roleLabel: document.getElementById("role-label"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  counterValue: document.getElementById("counter-value"),
  playerList: document.getElementById("player-list"),
};

let session = null;
let role = null;
let selfId = null;

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

function showLobby(code, isHost) {
  els.viewHome.classList.add("hidden");
  els.viewLobby.classList.remove("hidden");
  els.roomCodeDisplay.textContent = code;
  els.roleLabel.textContent = isHost ? "You are the host" : "You are a guest";
}

function showHome() {
  els.viewLobby.classList.add("hidden");
  els.viewHome.classList.remove("hidden");
  els.playerList.innerHTML = "";
  els.counterValue.textContent = "0";
}

function renderState(lobbyState) {
  if (!lobbyState) return;
  els.counterValue.textContent = String(lobbyState.counter ?? 0);
  els.playerList.innerHTML = "";
  const players = lobbyState.players || {};
  for (const [id, player] of Object.entries(players)) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = player.name || "Player";
    if (id === selfId) left.textContent += " (you)";
    const right = document.createElement("span");
    right.className = "tag";
    const bits = [];
    if (player.isHost) bits.push("host");
    bits.push(player.ready ? "ready" : "not ready");
    right.textContent = bits.join(" · ");
    li.append(left, right);
    els.playerList.append(li);
  }
}

async function leave() {
  if (session) {
    await session.stop();
    session = null;
  }
  role = null;
  selfId = null;
  showHome();
  setHomeStatus("");
}

els.btnHost.addEventListener("click", async () => {
  if (!isFirebaseConfigured()) return;
  els.btnHost.disabled = true;
  setHomeStatus("Creating room…");
  try {
    initFirebase();
    const host = createHost({
      name: nickname(),
      onState: renderState,
      onStatus: setLobbyStatus,
    });
    session = host;
    role = "host";
    selfId = host.hostId;
    const code = await host.start();
    showLobby(code, true);
    setLobbyStatus({ text: "connected" });
  } catch (err) {
    console.error(err);
    setHomeStatus(err.message || String(err), true);
    session = null;
  } finally {
    els.btnHost.disabled = false;
  }
});

els.btnJoin.addEventListener("click", async () => {
  if (!isFirebaseConfigured()) return;
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length < 4) {
    setHomeStatus("Enter the room code from the host.", true);
    return;
  }
  els.btnJoin.disabled = true;
  setHomeStatus("Joining…");
  let guest = null;
  try {
    initFirebase();
    guest = createGuest({
      name: nickname(),
      onState: renderState,
      onStatus: setLobbyStatus,
    });
    session = guest;
    role = "guest";
    selfId = guest.guestId;
    await guest.join(code);
    showLobby(code, false);
  } catch (err) {
    console.error(err);
    setHomeStatus(err.message || String(err), true);
    if (guest) {
      try {
        await guest.stop();
      } catch {
        /* ignore */
      }
    }
    session = null;
  } finally {
    els.btnJoin.disabled = false;
  }
});

els.joinCode.addEventListener("input", () => {
  els.joinCode.value = els.joinCode.value.toUpperCase();
});

els.btnLeave.addEventListener("click", () => leave());

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

window.addEventListener("pagehide", () => {
  if (session) session.stop();
});

if (!isFirebaseConfigured()) {
  els.configError.classList.remove("hidden");
  els.configError.textContent =
    "Firebase is not configured. Copy js/config.example.js to js/config.js and paste your web app keys (see README).";
  els.btnHost.disabled = true;
  els.btnJoin.disabled = true;
}
