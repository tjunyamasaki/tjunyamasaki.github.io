import { get, ref, set } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { initFirebase } from "../js/signaling.js";

/** Shared club login. Plaintext password lives in docs/SETUP.md only. */
export const EDITOR_USER = "host";
export const AUTH_PATH = "auth/table-tennis";

const SEED_SALT = "tt-editor-v1";
const SEED_HASH =
  "e720d490f568b5ccbe4e75f97890b66a9397bfcce0b1cc65c6287b3dbc9dd540";

let cached = null;

function normalizeUser(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authRef() {
  const db = initFirebase();
  return ref(db, AUTH_PATH);
}

export async function loadEditorRecord() {
  if (cached?.passHash && cached?.salt && cached?.user) return cached;
  const snap = await get(authRef());
  if (snap.exists()) {
    const val = snap.val() || {};
    if (val.user && val.salt && val.passHash) {
      cached = {
        user: String(val.user),
        salt: String(val.salt),
        passHash: String(val.passHash),
      };
      return cached;
    }
  }
  const seed = {
    user: EDITOR_USER,
    salt: SEED_SALT,
    passHash: SEED_HASH,
    v: 1,
  };
  try {
    await set(authRef(), seed);
  } catch (err) {
    console.warn("editor credential seed failed", err);
  }
  cached = { user: seed.user, salt: seed.salt, passHash: seed.passHash };
  return cached;
}

export async function verifyEditorCredentials(user, password) {
  const record = await loadEditorRecord();
  if (normalizeUser(user) !== normalizeUser(record.user)) return false;
  const hash = await sha256Hex(record.salt + String(password || ""));
  return hash === record.passHash;
}
