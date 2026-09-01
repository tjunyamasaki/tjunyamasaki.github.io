import { get, ref, set } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { initFirebase } from "./signaling.js";

export const BACKUP_APP = "table-tennis";

function backupRef(appId, code) {
  const db = initFirebase();
  return ref(db, ["backups", appId, code].join("/"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function toTableTennisBackup(game) {
  return {
    groups: clone(game.groups || []),
    roster: clone(game.roster || []),
    matches: clone(game.matches || []),
    message: game.message || "",
    seq: game.seq || 0,
  };
}

export async function writeBackup(appId, code, game) {
  if (!code || !game) return;
  const payload = toTableTennisBackup(game);
  await set(backupRef(appId, code), {
    app: appId,
    savedAt: Date.now(),
    seq: payload.seq,
    game: payload,
  });
}

export async function loadBackup(appId, code) {
  const snap = await get(backupRef(appId, String(code || "").toUpperCase()));
  if (!snap.exists()) return null;
  const val = snap.val();
  if (!val?.game) return null;
  return val;
}
