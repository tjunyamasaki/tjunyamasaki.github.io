import { isFirebaseConfigured } from "../js/config.js";
import { initFirebase } from "../js/signaling.js";
import { BACKUP_APP, loadBackup, writeBackup } from "../js/backup.js";
import { createGuest } from "../js/guest.js";
import { createTableTennisHost } from "./host.js";
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
  saveEditorSession,
  loadEditorSession,
  clearEditorSession,
} from "./persist.js";
import { matchesToCsv } from "./rules.js";
import { EDITOR_USER, verifyEditorCredentials } from "./editorAuth.js";

const els = {
  configError: document.getElementById("config-error"),
  viewGate: document.getElementById("view-gate"),
  viewBoard: document.getElementById("view-board"),
  nickname: document.getElementById("nickname"),
  joinCode: document.getElementById("join-code"),
  btnHost: document.getElementById("btn-host"),
  btnJoin: document.getElementById("btn-join"),
  btnRestore: document.getElementById("btn-restore"),
  btnResume: document.getElementById("btn-resume"),
  btnDiscard: document.getElementById("btn-discard"),
  resumeRow: document.getElementById("resume-row"),
  gateStatus: document.getElementById("gate-status"),
  btnLeave: document.getElementById("btn-leave"),
  btnSaveCloud: document.getElementById("btn-save-cloud"),
  btnExport: document.getElementById("btn-export"),
  roomCode: document.getElementById("room-code"),
  tableStatus: document.getElementById("table-status"),
  roundMessage: document.getElementById("round-message"),
  watchers: document.getElementById("watchers"),
  groupTabs: document.getElementById("group-tabs"),
  formGroup: document.getElementById("form-group"),
  groupName: document.getElementById("group-name"),
  groupMeta: document.getElementById("group-meta"),
  ranking: document.getElementById("ranking"),
  gridWrap: document.getElementById("grid-wrap"),
  focusPanel: document.getElementById("focus-panel"),
  focusTitle: document.getElementById("focus-title"),
  focusBody: document.getElementById("focus-body"),
  focusClose: document.getElementById("focus-close"),
  hostPanel: document.getElementById("host-panel"),
  formMatch: document.getElementById("form-match"),
  matchId: document.getElementById("match-id"),
  matchAName: document.getElementById("match-a-name"),
  matchASets: document.getElementById("match-a-sets"),
  matchBName: document.getElementById("match-b-name"),
  matchBSets: document.getElementById("match-b-sets"),
  btnSaveMatch: document.getElementById("btn-save-match"),
  btnDeleteMatch: document.getElementById("btn-delete-match"),
  btnCancelEdit: document.getElementById("btn-cancel-edit"),
  formPlayer: document.getElementById("form-player"),
  playerName: document.getElementById("player-name"),
  rosterList: document.getElementById("roster-list"),
  matchList: document.getElementById("match-list"),
  formRenameGroup: document.getElementById("form-rename-group"),
  renameGroup: document.getElementById("rename-group"),
  btnRemoveGroup: document.getElementById("btn-remove-group"),
  playerSuggest: document.getElementById("player-suggest"),
  editorUser: document.getElementById("editor-user"),
  editorPass: document.getElementById("editor-pass"),
  btnEditorLogin: document.getElementById("btn-editor-login"),
  btnEditorLogout: document.getElementById("btn-editor-logout"),
  editorStatus: document.getElementById("editor-status"),
  editorGate: document.getElementById("editor-gate"),
  btnBoardEditor: document.getElementById("btn-board-editor"),
  editorDialog: document.getElementById("editor-dialog"),
  dlgEditorUser: document.getElementById("dlg-editor-user"),
  dlgEditorPass: document.getElementById("dlg-editor-pass"),
  dlgEditorStatus: document.getElementById("dlg-editor-status"),
  formEditorDialog: document.getElementById("form-editor-dialog"),
  btnDialogCancel: document.getElementById("btn-dialog-cancel"),
};

let session = null;
let role = null;
let currentRoom = "";
let leaving = false;
let joiningGuest = false;
let guestRetryTimer = 0;
let lastState = null;
let selectedGroupId = "";
let selectedPlayerId = "";
let editingMatchId = "";
let editorCreds = null;
let editorClaimSent = false;

function canHost() {
  return Boolean(editorCreds);
}

function fillEditorUserFields(user) {
  const value = user || EDITOR_USER;
  if (els.editorUser) els.editorUser.value = value;
  if (els.dlgEditorUser) els.dlgEditorUser.value = value;
}

function syncEditorUi() {
  const signedIn = Boolean(editorCreds);
  const editing = Boolean(lastState?.youCanEdit);
  if (els.editorStatus) {
    els.editorStatus.textContent = signedIn
      ? "Signed in. You can host, restore, and edit."
      : "Shared account. Sign in to host or to edit a live board.";
  }
  if (els.btnEditorLogin) els.btnEditorLogin.classList.toggle("hidden", signedIn);
  if (els.btnEditorLogout) els.btnEditorLogout.classList.toggle("hidden", !signedIn);
  if (els.editorUser) els.editorUser.disabled = signedIn;
  if (els.editorPass) {
    els.editorPass.disabled = signedIn;
    if (signedIn) els.editorPass.value = "";
  }
  if (els.btnBoardEditor) {
    const onBoard = Boolean(role && lastState);
    const showUnlock = onBoard && !editing;
    const showStop = onBoard && editing && role === "guest";
    els.btnBoardEditor.classList.toggle("hidden", !showUnlock && !showStop);
    if (showStop) els.btnBoardEditor.textContent = "Stop editing";
    else if (showUnlock) els.btnBoardEditor.textContent = "Editor login";
  }
  syncHostButtons();
}

function maybeClaimEditor(state) {
  if (
    role !== "guest" ||
    !session ||
    !editorCreds ||
    !state ||
    state.youCanEdit ||
    editorClaimSent
  ) {
    return;
  }
  editorClaimSent = true;
  send("claimEditor", {
    user: editorCreds.user,
    password: editorCreds.password,
  });
}

async function signInEditor(user, password, { silent = false, statusEl = null } = {}) {
  const name = (user || "").trim() || EDITOR_USER;
  const pass = String(password || "");
  const setStatus = (text, error) => {
    if (statusEl) {
      statusEl.textContent = text || "";
      statusEl.style.color = error ? "var(--loss)" : "";
      return;
    }
    if (role && lastState) setTableStatus({ text, error });
    else setGateStatus(text, error);
  };
  if (!pass) {
    if (!silent) setStatus("Enter the editor password.", true);
    return false;
  }
  if (!isFirebaseConfigured()) {
    if (!silent) setStatus("Firebase is not configured.", true);
    return false;
  }
  try {
    initFirebase();
    const ok = await verifyEditorCredentials(name, pass);
    if (!ok) {
      if (!silent) setStatus("Wrong editor user or password.", true);
      return false;
    }
  } catch (err) {
    console.error(err);
    if (!silent) setStatus(err.message || String(err), true);
    return false;
  }
  editorCreds = { user: name, password: pass };
  editorClaimSent = false;
  saveEditorSession(editorCreds);
  fillEditorUserFields(name);
  syncEditorUi();
  if (role === "guest" && lastState) maybeClaimEditor(lastState);
  if (!silent) setStatus("Editor signed in.");
  return true;
}

function signOutEditor() {
  editorCreds = null;
  editorClaimSent = false;
  clearEditorSession();
  if (els.editorPass) els.editorPass.value = "";
  if (els.dlgEditorPass) els.dlgEditorPass.value = "";
  if (role === "guest") send("dropEditor");
  syncEditorUi();
  setGateStatus("");
}

function openEditorDialog() {
  if (!els.editorDialog) return;
  fillEditorUserFields(editorCreds?.user || EDITOR_USER);
  if (els.dlgEditorUser) els.dlgEditorUser.value = editorCreds?.user || EDITOR_USER;
  if (els.dlgEditorPass) els.dlgEditorPass.value = "";
  if (els.dlgEditorStatus) els.dlgEditorStatus.textContent = "";
  if (typeof els.editorDialog.showModal === "function") els.editorDialog.showModal();
  else els.editorDialog.classList.remove("hidden");
}

function closeEditorDialog() {
  if (!els.editorDialog) return;
  if (typeof els.editorDialog.close === "function" && els.editorDialog.open) {
    els.editorDialog.close();
  } else {
    els.editorDialog.classList.add("hidden");
  }
}

function canEditUi() {
  return Boolean(lastState?.youCanEdit);
}

function syncHostButtons() {
  const allow = isFirebaseConfigured() && canHost();
  els.btnHost.disabled = !allow;
  els.btnResume.disabled = !allow;
  if (els.btnRestore) els.btnRestore.disabled = !allow;
  if (allow) {
    els.btnHost.removeAttribute("disabled");
    els.btnResume.removeAttribute("disabled");
    els.btnRestore?.removeAttribute("disabled");
  } else {
    els.btnHost.setAttribute("disabled", "");
    els.btnRestore?.setAttribute("disabled", "");
  }
}

function nickname() {
  const name = (els.nickname.value || "").trim() || "Player";
  saveNickname(name);
  return name.slice(0, 24);
}

function setGateStatus(text, error = false) {
  els.gateStatus.textContent = text || "";
  els.gateStatus.style.color = error ? "var(--loss)" : "";
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
  els.tableStatus.style.color = error ? "var(--loss)" : "";
}

function showGate() {
  els.viewGate.classList.remove("hidden");
  els.viewBoard.classList.add("hidden");
}

function showBoard(code) {
  currentRoom = code || currentRoom;
  els.roomCode.textContent = currentRoom || "————";
  els.viewGate.classList.add("hidden");
  els.viewBoard.classList.remove("hidden");
}

function send(action, extra = {}) {
  if (!session) return;
  if (role === "host") session.hostIntent(action, extra);
  else session.sendIntent(action, extra);
}

function currentBoard(state) {
  const groups = state.groups || [];
  if (!groups.length) return null;
  if (!groups.some((g) => g.id === selectedGroupId)) {
    selectedGroupId = groups[0].id;
  }
  return state.boards?.[selectedGroupId] || null;
}

function shortName(name) {
  const text = name || "Player";
  return text.length > 8 ? `${text.slice(0, 7)}…` : text;
}

function renderWatchers(state) {
  els.watchers.replaceChildren();
  for (const w of state.watchers || []) {
    const chip = document.createElement("span");
    chip.className = "watcher" + (w.connected ? "" : " away");
    const dot = document.createElement("span");
    dot.className = "dot";
    chip.append(dot, document.createTextNode(w.name));
    if (w.isHost) {
      const tag = document.createElement("span");
      tag.className = "host-chip";
      tag.textContent = "host";
      chip.append(tag);
    } else if (w.isEditor) {
      const tag = document.createElement("span");
      tag.className = "host-chip";
      tag.textContent = "edit";
      chip.append(tag);
    }
    if (!w.connected) chip.append(document.createTextNode(" · away"));
    els.watchers.append(chip);
  }
}

function renderGroups(state) {
  els.groupTabs.replaceChildren();
  for (const group of state.groups || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-tab" + (group.id === selectedGroupId ? " active" : "");
    btn.textContent = group.name;
    btn.addEventListener("click", () => {
      selectedGroupId = group.id;
      selectedPlayerId = "";
      renderState(lastState);
    });
    els.groupTabs.append(btn);
  }
}

function renderRanking(board) {
  els.ranking.replaceChildren();
  if (!board?.players?.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No players yet.";
    els.ranking.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "data";
  table.innerHTML =
    "<thead><tr><th>#</th><th>Player</th><th class='num'>P</th><th class='num'>W</th><th class='num'>L</th><th class='num'>Sets</th><th class='num'>Diff</th><th class='num'>Left</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const row of board.ranking) {
    const tr = document.createElement("tr");
    if (row.id === selectedPlayerId) tr.className = "selected";
    tr.innerHTML = `<td>${row.rank}</td><td class="name-cell"></td><td class="num">${row.played}</td><td class="num">${row.wins}</td><td class="num">${row.losses}</td><td class="num">${row.setsFor}–${row.setsAgainst}</td><td class="num">${row.setDiff > 0 ? "+" : ""}${row.setDiff}</td><td class="num">${row.remaining}</td>`;
    tr.querySelector(".name-cell").textContent = row.name;
    tr.addEventListener("click", () => {
      selectedPlayerId = row.id;
      renderState(lastState);
    });
    body.append(tr);
  }
  table.append(body);
  els.ranking.append(table);
}

function renderGrid(board, host) {
  els.gridWrap.replaceChildren();
  if (!board?.players?.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = host
      ? "Add players or save a result to fill the grid."
      : "Waiting for the host to add players.";
    els.gridWrap.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "result-grid";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "";
  hr.append(corner);
  for (const p of board.players) {
    const th = document.createElement("th");
    th.textContent = shortName(p.name);
    th.title = p.name;
    if (p.id === selectedPlayerId) th.classList.add("selected");
    th.addEventListener("click", () => {
      selectedPlayerId = p.id;
      renderState(lastState);
    });
    hr.append(th);
  }
  head.append(hr);
  const body = document.createElement("tbody");
  for (const row of board.players) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = shortName(row.name);
    th.title = row.name;
    if (row.id === selectedPlayerId) th.classList.add("selected");
    th.addEventListener("click", () => {
      selectedPlayerId = row.id;
      renderState(lastState);
    });
    tr.append(th);
    for (const col of board.players) {
      const td = document.createElement("td");
      if (row.id === col.id) {
        td.className = "diag";
        td.textContent = "·";
      } else {
        const cell = board.cells[`${row.id}:${col.id}`];
        td.className = "playable";
        if (row.id === selectedPlayerId || col.id === selectedPlayerId) {
          td.classList.add("hl");
        }
        if (!cell) {
          td.classList.add("open");
          td.textContent = "—";
        } else {
          td.classList.add(cell.won ? "win" : cell.lost ? "loss" : "draw");
          td.textContent = String(cell.sets);
        }
        td.addEventListener("click", () => onCell(row, col, cell));
      }
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
  els.gridWrap.append(table);
}

function onCell(row, col, cell) {
  selectedPlayerId = row.id;
  if (canEditUi()) {
    fillMatchForm({
      matchId: cell?.matchId || "",
      aName: row.name,
      bName: col.name,
      aSets: cell ? cell.sets : "",
      bSets: cell ? cell.against : "",
    });
  }
  renderState(lastState);
}

function renderFocus(board) {
  const player = board?.players?.find((p) => p.id === selectedPlayerId);
  if (!player) {
    els.focusPanel.classList.add("hidden");
    els.focusBody.replaceChildren();
    return;
  }
  els.focusPanel.classList.remove("hidden");
  els.focusTitle.textContent = player.name;
  const played = board.playedByPlayer[player.id] || [];
  const left = board.remainingByPlayer[player.id] || [];
  const wrap = document.createElement("div");

  const done = document.createElement("div");
  done.className = "focus-block";
  const doneH = document.createElement("h3");
  doneH.textContent = played.length ? `Played (${played.length})` : "Played";
  const doneList = document.createElement("ul");
  doneList.className = "focus-list";
  if (!played.length) {
    const li = document.createElement("li");
    li.textContent = "No matches yet.";
    doneList.append(li);
  } else {
    for (const m of played) {
      const li = document.createElement("li");
      const cls = m.won ? "win" : m.for < m.against ? "loss" : "";
      li.innerHTML = `<span class="${cls}">${m.for}–${m.against}</span> vs `;
      li.append(document.createTextNode(m.opponentName));
      if (canEditUi()) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "ghost tiny";
        edit.textContent = "Edit";
        edit.style.marginLeft = "0.5rem";
        edit.addEventListener("click", () => {
          fillMatchForm({
            matchId: m.matchId,
            aName: player.name,
            bName: m.opponentName,
            aSets: m.for,
            bSets: m.against,
          });
        });
        li.append(edit);
      }
      doneList.append(li);
    }
  }
  done.append(doneH, doneList);

  const todo = document.createElement("div");
  todo.className = "focus-block";
  const todoH = document.createElement("h3");
  todoH.textContent = left.length ? `Left to play (${left.length})` : "Left to play";
  const todoList = document.createElement("ul");
  todoList.className = "focus-list";
  if (!left.length) {
    const li = document.createElement("li");
    li.textContent = board.players.length < 2 ? "Need another player." : "Round-robin complete.";
    todoList.append(li);
  } else {
    for (const opp of left) {
      const li = document.createElement("li");
      li.textContent = opp.name;
      if (canEditUi()) {
        const rec = document.createElement("button");
        rec.type = "button";
        rec.className = "ghost tiny";
        rec.textContent = "Record";
        rec.style.marginLeft = "0.5rem";
        rec.addEventListener("click", () => {
          fillMatchForm({
            matchId: "",
            aName: player.name,
            bName: opp.name,
            aSets: "",
            bSets: "",
          });
        });
        li.append(rec);
      }
      todoList.append(li);
    }
  }
  todo.append(todoH, todoList);
  wrap.append(done, todo);
  els.focusBody.replaceChildren(wrap);
}

function fillMatchForm({ matchId, aName, bName, aSets, bSets }) {
  editingMatchId = matchId || "";
  els.matchId.value = editingMatchId;
  els.matchAName.value = aName || "";
  els.matchBName.value = bName || "";
  els.matchASets.value = aSets === "" || aSets == null ? "" : String(aSets);
  els.matchBSets.value = bSets === "" || bSets == null ? "" : String(bSets);
  updateEditButtons();
  els.matchASets.focus();
}

function clearMatchForm() {
  fillMatchForm({ matchId: "", aName: "", bName: "", aSets: "", bSets: "" });
  els.matchAName.focus();
}

function updateEditButtons() {
  const editing = Boolean(editingMatchId);
  els.btnSaveMatch.textContent = editing ? "Update match" : "Save result";
  els.btnDeleteMatch.classList.toggle("hidden", !editing);
  els.btnCancelEdit.classList.toggle("hidden", !editing);
}

function renderHost(state, board) {
  const editor = Boolean(state.youCanEdit);
  document.querySelectorAll(".host-only").forEach((el) => {
    el.classList.toggle("hidden", !editor);
  });
  if (!editor || !board) return;

  if (document.activeElement !== els.renameGroup) {
    els.renameGroup.value = board.groupName || "";
  }
  els.btnRemoveGroup.disabled = (state.groups || []).length <= 1;

  els.rosterList.replaceChildren();
  if (!board.players.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No named players yet.";
    els.rosterList.append(empty);
  } else {
    for (const p of board.players) {
      const row = document.createElement("div");
      row.className = "list-row";
      const name = document.createElement("span");
      name.textContent = p.name;
      const spacer = document.createElement("span");
      spacer.className = "spacer";
      const focus = document.createElement("button");
      focus.type = "button";
      focus.className = "ghost";
      focus.textContent = "View";
      focus.addEventListener("click", () => {
        selectedPlayerId = p.id;
        renderState(lastState);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => send("removeRoster", { playerId: p.id }));
      row.append(name, spacer, focus, remove);
      els.rosterList.append(row);
    }
  }

  els.matchList.replaceChildren();
  if (!board.matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No matches recorded.";
    els.matchList.append(empty);
  } else {
    for (const m of board.matches) {
      const row = document.createElement("div");
      row.className = "list-row";
      const label = document.createElement("span");
      label.textContent = `${m.aName} ${m.aSets}–${m.bSets} ${m.bName}`;
      const spacer = document.createElement("span");
      spacer.className = "spacer";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "ghost";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        fillMatchForm({
          matchId: m.id,
          aName: m.aName,
          bName: m.bName,
          aSets: m.aSets,
          bSets: m.bSets,
        });
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => send("deleteMatch", { matchId: m.id }));
      row.append(label, spacer, edit, del);
      els.matchList.append(row);
    }
  }
  updateEditButtons();
}

function renderState(state) {
  if (!state) return;
  lastState = state;
  showBoard(currentRoom);
  els.roundMessage.textContent = state.message || "";
  const board = currentBoard(state);
  if (board) {
    const n = board.players.length;
    const left = board.remainingPairs;
    els.groupMeta.textContent = `${n} ${n === 1 ? "player" : "players"} · ${board.matches.length} played · ${left} left`;
  } else {
    els.groupMeta.textContent = "";
  }
  renderWatchers(state);
  renderGroups(state);
  renderRanking(board);
  renderGrid(board, state.youCanEdit);
  renderFocus(board);
  renderHost(state, board);
  els.btnExport.disabled = !(state.matches || []).length;
  syncEditorUi();
  maybeClaimEditor(state);
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

async function restoreFromCloud() {
  if (!isFirebaseConfigured() || !canHost()) return;
  const code = els.joinCode.value.trim().toUpperCase();
  els.joinCode.value = code;
  if (!code) {
    setGateStatus("Enter the old room code to restore.", true);
    return;
  }
  if (els.btnRestore) els.btnRestore.disabled = true;
  setGateStatus("Loading backup…");
  try {
    initFirebase();
    const packed = await loadBackup(BACKUP_APP, code);
    if (!packed) {
      setGateStatus("No cloud backup for that code.", true);
      return;
    }
    saveHostSession({
      roomCode: code,
      name: nickname(),
      game: packed.game,
    });
    await beginHost({ resume: true });
  } catch (err) {
    console.error(err);
    setGateStatus(err.message || String(err), true);
  } finally {
    syncHostButtons();
  }
}

async function beginHost({ resume } = {}) {
  if (!isFirebaseConfigured() || !canHost()) return;
  els.btnHost.disabled = true;
  els.btnResume.disabled = true;
  setGateStatus(resume ? "Resuming room…" : "Creating room…");
  const saved = resume ? loadHostSession() : null;
  const name = nickname();
  try {
    initFirebase();
    const host = createTableTennisHost({
      name,
      initialGame: saved?.game,
      onState: renderState,
      onStatus: setTableStatus,
      onPersist: saveHostSession,
    });
    session = host;
    role = "host";
    const code = await host.start(saved?.roomCode);
    showBoard(code);
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
    showBoard(code);
    editorClaimSent = false;
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
  lastState = null;
  selectedGroupId = "";
  selectedPlayerId = "";
  editingMatchId = "";
  editorClaimSent = false;
  leaving = false;
  showGate();
  setGateStatus("");
  refreshResumeUi();
  syncEditorUi();
}

async function saveToCloud() {
  if (!canEditUi() || !currentRoom || !lastState) {
    setTableStatus({ text: "Nothing to save", error: true });
    return;
  }
  if (els.btnSaveCloud) els.btnSaveCloud.disabled = true;
  try {
    initFirebase();
    await writeBackup(BACKUP_APP, currentRoom, lastState);
    setTableStatus({ text: "Cloud backup saved" });
    setTimeout(() => setTableStatus({ text: "connected" }), 1600);
  } catch (err) {
    console.error(err);
    setTableStatus({ text: err.message || String(err), error: true });
  } finally {
    if (els.btnSaveCloud) els.btnSaveCloud.disabled = false;
  }
}

function onNicknameEdit() {
  const name = (els.nickname.value || "").trim();
  if (name) saveNickname(name);
  syncHostButtons();
}

els.nickname.addEventListener("input", onNicknameEdit);
els.nickname.addEventListener("change", onNicknameEdit);
els.nickname.addEventListener("keyup", onNicknameEdit);
els.nickname.addEventListener("paste", () => setTimeout(onNicknameEdit, 0));
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
els.btnRestore?.addEventListener("click", () => restoreFromCloud());
els.joinCode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.btnJoin.click();
});
els.btnLeave.addEventListener("click", () => leave());
els.btnSaveCloud?.addEventListener("click", () => saveToCloud());
els.btnEditorLogin?.addEventListener("click", () => {
  signInEditor(els.editorUser?.value, els.editorPass?.value);
});
els.btnEditorLogout?.addEventListener("click", () => signOutEditor());
els.editorPass?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.btnEditorLogin?.click();
  }
});
els.btnBoardEditor?.addEventListener("click", () => {
  if (lastState?.youCanEdit && role === "guest") {
    signOutEditor();
    return;
  }
  openEditorDialog();
});
els.formEditorDialog?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = await signInEditor(els.dlgEditorUser?.value, els.dlgEditorPass?.value, {
    statusEl: els.dlgEditorStatus,
  });
  if (ok) closeEditorDialog();
});
els.btnDialogCancel?.addEventListener("click", (event) => {
  event.preventDefault();
  closeEditorDialog();
});
els.btnExport.addEventListener("click", () => {
  if (!lastState) return;
  const csv = matchesToCsv(lastState.matches, lastState.roster);
  if (!csv) {
    setTableStatus({ text: "No matches to export", error: true });
    return;
  }
  const blob = new Blob(["\uFEFF" + csv + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentRoom ? `table-tennis-${currentRoom}.csv` : "table-tennis.csv";
  link.click();
  URL.revokeObjectURL(url);
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

function hostApplied() {
  if (role !== "host") return () => true;
  const seq = lastState?.seq;
  return () => lastState?.seq !== seq;
}

els.formMatch.addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = {
    aName: els.matchAName.value,
    bName: els.matchBName.value,
    aSets: els.matchASets.value,
    bSets: els.matchBSets.value,
    groupId: selectedGroupId,
  };
  const ok = hostApplied();
  if (editingMatchId) {
    send("editMatch", { ...payload, matchId: editingMatchId });
  } else {
    send("recordMatch", payload);
  }
  if (ok()) clearMatchForm();
});
els.btnDeleteMatch.addEventListener("click", () => {
  if (!editingMatchId) return;
  const ok = hostApplied();
  send("deleteMatch", { matchId: editingMatchId });
  if (ok()) clearMatchForm();
});
els.btnCancelEdit.addEventListener("click", () => clearMatchForm());
els.formPlayer.addEventListener("submit", (event) => {
  event.preventDefault();
  const ok = hostApplied();
  send("addRoster", { name: els.playerName.value, groupId: selectedGroupId });
  if (ok()) els.playerName.value = "";
});
els.formGroup.addEventListener("submit", (event) => {
  event.preventDefault();
  const ok = hostApplied();
  send("addGroup", { name: els.groupName.value });
  if (ok()) els.groupName.value = "";
});
els.formRenameGroup.addEventListener("submit", (event) => {
  event.preventDefault();
  send("renameGroup", { groupId: selectedGroupId, name: els.renameGroup.value });
});
els.btnRemoveGroup.addEventListener("click", () => {
  send("removeGroup", { groupId: selectedGroupId });
});
els.focusClose.addEventListener("click", () => {
  selectedPlayerId = "";
  renderState(lastState);
});

let comboInput = null;
let comboIndex = -1;

function playerNames() {
  return (currentBoard(lastState)?.players || []).map((p) => p.name);
}

function closeCombo() {
  comboInput = null;
  comboIndex = -1;
  els.playerSuggest.classList.add("hidden");
  els.playerSuggest.replaceChildren();
}

function placeCombo(input) {
  const box = els.playerSuggest;
  const r = input.getBoundingClientRect();
  const gap = 4;
  const maxH = 220;
  const below = window.innerHeight - r.bottom - 8;
  box.style.left = `${Math.round(r.left)}px`;
  box.style.width = `${Math.round(r.width)}px`;
  box.style.top = `${Math.round(r.bottom + gap)}px`;
  box.style.bottom = "auto";
  box.style.maxHeight = `${Math.min(maxH, Math.max(below, 96))}px`;
}

function setComboActive(items, index) {
  comboIndex = index;
  items.forEach((item, i) => {
    item.classList.toggle("active", i === index);
    if (i === index) item.scrollIntoView({ block: "nearest" });
  });
}

function openCombo(input) {
  const names = playerNames();
  const q = (input.value || "").trim().toLowerCase();
  const matches = names.filter((name) => !q || name.toLowerCase().includes(q));
  if (!matches.length) {
    closeCombo();
    return;
  }
  comboInput = input;
  els.playerSuggest.replaceChildren();
  matches.forEach((name, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "combo-item";
    item.setAttribute("role", "option");
    item.textContent = name;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = name;
      closeCombo();
      input.focus();
    });
    els.playerSuggest.append(item);
    if (i === 0) item.classList.add("active");
  });
  comboIndex = 0;
  els.playerSuggest.classList.remove("hidden");
  placeCombo(input);
}

function bindPlayerCombo(input) {
  input.addEventListener("focus", () => openCombo(input));
  input.addEventListener("input", () => openCombo(input));
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (comboInput === input) closeCombo();
    }, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (els.playerSuggest.classList.contains("hidden") || comboInput !== input) {
      if (event.key === "ArrowDown") openCombo(input);
      return;
    }
    const items = [...els.playerSuggest.querySelectorAll(".combo-item")];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setComboActive(items, Math.min(items.length - 1, comboIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setComboActive(items, Math.max(0, comboIndex - 1));
    } else if (event.key === "Enter" && comboIndex >= 0 && items[comboIndex]) {
      event.preventDefault();
      input.value = items[comboIndex].textContent;
      closeCombo();
    } else if (event.key === "Escape") {
      closeCombo();
    }
  });
}

bindPlayerCombo(els.matchAName);
bindPlayerCombo(els.matchBName);
document.querySelector(".board-scroll")?.addEventListener(
  "scroll",
  () => {
    if (comboInput) placeCombo(comboInput);
  },
  { passive: true }
);
window.addEventListener("resize", () => {
  if (comboInput) placeCombo(comboInput);
});

function hydrateNickname() {
  const saved = loadNickname();
  if (saved) els.nickname.value = saved;
  fillEditorUserFields(EDITOR_USER);
  refreshResumeUi();
  syncEditorUi();
}

async function hydrateEditor() {
  const saved = loadEditorSession();
  fillEditorUserFields(saved?.user || EDITOR_USER);
  if (!saved || !isFirebaseConfigured()) {
    syncEditorUi();
    return;
  }
  await signInEditor(saved.user, saved.password, { silent: true });
}

hydrateNickname();
hydrateEditor();
window.addEventListener("pageshow", () => {
  hydrateNickname();
  hydrateEditor();
});
[50, 200, 500, 1000].forEach((ms) => setTimeout(syncEditorUi, ms));

if (!isFirebaseConfigured()) {
  els.configError.classList.remove("hidden");
  els.configError.textContent =
    "Firebase is not configured. See docs/SETUP.md for local keys.";
  els.btnHost.disabled = true;
  els.btnJoin.disabled = true;
  els.btnResume.disabled = true;
  if (els.btnRestore) els.btnRestore.disabled = true;
}
