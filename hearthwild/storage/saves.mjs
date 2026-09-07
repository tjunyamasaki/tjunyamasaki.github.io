import { serializeSnapshot, parseSaveText, validateSnapshot } from './schema.mjs';
import { normalizeKeeperVariant } from '../data/tuning.mjs';

export const SAVE_KEY = 'hearthwild.slot.1';
export const GOOD_KEY = 'hearthwild.slot.1.good';
export const PREFS_KEY = 'hearthwild.prefs';

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function readParsed(storage, key) {
  const text = storage.getItem(key);
  if (!text) return { ok: false, reason: 'empty' };
  return parseSaveText(text);
}

export function createSaveStore(storage) {
  if (!storage) throw new Error('storage-unavailable');

  function write(descriptor, state) {
    const previous = readParsed(storage, SAVE_KEY);
    const sequence = (previous.ok ? previous.data.sequence : 0) + 1;
    const snapshot = serializeSnapshot(descriptor, state, {
      sequence,
      savedAt: Date.now(),
    });
    const checked = validateSnapshot(snapshot);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    let json;
    try {
      json = JSON.stringify(checked.data);
    } catch {
      return { ok: false, reason: 'serialize-failed' };
    }
    try {
      storage.setItem(SAVE_KEY, json);
    } catch {
      return { ok: false, reason: 'write-failed', bytes: json.length };
    }
    try {
      storage.setItem(GOOD_KEY, json);
    } catch {
      // Primary is stored; backup lag is visible but not treated as a silent wipe.
    }
    return { ok: true, bytes: json.length, sequence, name: snapshot.name, seed: snapshot.seed };
  }

  function read() {
    const primary = readParsed(storage, SAVE_KEY);
    if (primary.ok) return { ok: true, data: primary.data, recovered: false };
    const backup = readParsed(storage, GOOD_KEY);
    if (backup.ok) return { ok: true, data: backup.data, recovered: true, reason: primary.reason };
    return { ok: false, reason: primary.reason === 'empty' && backup.reason === 'empty' ? 'empty' : (primary.reason || backup.reason) };
  }

  function peek() {
    const result = read();
    if (!result.ok) return result;
    return {
      ok: true,
      recovered: Boolean(result.recovered),
      name: result.data.name || result.data.gameplay?.worldName || '',
      seed: result.data.seed,
      elapsed: result.data.gameplay?.elapsed || 0,
    };
  }

  return { write, read, peek };
}

export function readPrefs(storage, fallback = {}) {
  try {
    const text = storage.getItem(PREFS_KEY);
    if (!text) return { ...fallback };
    const parsed = JSON.parse(text);
    return {
      gatherToggle: Boolean(parsed.gatherToggle),
      palette: parsed.palette === 'ember' ? 'ember' : 'moonlit',
      avatar: normalizeKeeperVariant(parsed.avatar ?? fallback.avatar),
    };
  } catch {
    return { ...fallback };
  }
}

export function writePrefs(storage, prefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify({
      gatherToggle: Boolean(prefs.gatherToggle),
      palette: prefs.palette === 'ember' ? 'ember' : 'moonlit',
      avatar: normalizeKeeperVariant(prefs.avatar),
    }));
    return true;
  } catch {
    return false;
  }
}
