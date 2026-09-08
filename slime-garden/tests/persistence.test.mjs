import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { createFreshEnvelope, serializeEnvelope } from '../src/core/validate.mjs';
import {
  BACKUP_KEY,
  PRIMARY_KEY,
  createMemoryStorage,
  importSave,
  loadBest,
  previewImport,
  resetGameKeys,
  serializeEnvelope as serializeFromStore,
  writeCheckpoint,
} from '../src/persistence/save-store.mjs';
import {
  canPersist,
  createMemoryLocks,
  reacquireWriter,
  requestWriter,
} from '../src/persistence/tab-lock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

const validFixtureText = readFileSync(join(fixturesDir, 'valid-v1.json'), 'utf8');
const futureFixtureText = readFileSync(join(fixturesDir, 'schema-v2.json'), 'utf8');

const HOUR_MS = 3_600_000;
const SITE_KEY = 'unrelated-site-key';

/**
 * @param {ReturnType<typeof createMemoryStorage>} inner
 * @param {Iterable<string>} failKeys
 */
function withFailingSet(inner, failKeys) {
  const blocked = new Set(failKeys);
  return {
    getItem(key) {
      return inner.getItem(key);
    },
    setItem(key, value) {
      if (blocked.has(key)) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      inner.setItem(key, value);
    },
    removeItem(key) {
      inner.removeItem(key);
    },
  };
}

/**
 * @param {object} [patch]
 */
function envelope(patch = {}) {
  return createFreshEnvelope({
    nowWallMs: 1_700_000_000_000,
    revision: 0,
    ...patch,
  });
}

describe('loadBest', () => {
  test('bad primary plus valid backup restores the backup without splicing', () => {
    const storage = createMemoryStorage();
    const backup = envelope({ revision: 4 });
    backup.state.glowMicro = 90 * MICRO_PER_GLOW;
    backup.state.lifetimeGlowMicro = 90 * MICRO_PER_GLOW;
    storage.setItem(PRIMARY_KEY, '{not-json');
    storage.setItem(BACKUP_KEY, serializeEnvelope(backup));

    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.source, 'backup');
    assert.equal(loaded.save.revision, 4);
    assert.equal(loaded.save.state.glowMicro, 90 * MICRO_PER_GLOW);
    assert.equal(loaded.save.state.berries, 6);
    assert.equal(loaded.primaryRaw, '{not-json');
    assert.equal(storage.getItem(PRIMARY_KEY), '{not-json');
  });

  test('both corrupt returns CORRUPT, preserves raw, and does not write', () => {
    const storage = createMemoryStorage();
    storage.setItem(PRIMARY_KEY, '{a');
    storage.setItem(BACKUP_KEY, '{b');
    storage.setItem(SITE_KEY, 'keep-me');
    const writes = [];
    const watched = {
      getItem(key) {
        return storage.getItem(key);
      },
      setItem(key, value) {
        writes.push(['set', key, value]);
        storage.setItem(key, value);
      },
      removeItem(key) {
        writes.push(['remove', key]);
        storage.removeItem(key);
      },
    };

    const loaded = loadBest(watched);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'CORRUPT');
    assert.equal(loaded.primaryRaw, '{a');
    assert.equal(loaded.backupRaw, '{b');
    assert.deepEqual(writes, []);
    assert.equal(storage.getItem(PRIMARY_KEY), '{a');
    assert.equal(storage.getItem(BACKUP_KEY), '{b');
    assert.equal(storage.getItem(SITE_KEY), 'keep-me');
  });

  test('future schema in primary is FUTURE_VERSION and does not overwrite', () => {
    const storage = createMemoryStorage();
    storage.setItem(PRIMARY_KEY, futureFixtureText);
    const writes = [];
    const watched = {
      getItem(key) {
        return storage.getItem(key);
      },
      setItem(key, value) {
        writes.push(key);
        storage.setItem(key, value);
      },
      removeItem(key) {
        writes.push(`remove:${key}`);
        storage.removeItem(key);
      },
    };

    const loaded = loadBest(watched);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'FUTURE_VERSION');
    assert.equal(loaded.primaryRaw, futureFixtureText);
    assert.deepEqual(writes, []);
    assert.equal(storage.getItem(PRIMARY_KEY), futureFixtureText);
  });

  test('empty storage is EMPTY, not CORRUPT', () => {
    const loaded = loadBest(createMemoryStorage());
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'EMPTY');
    assert.equal(loaded.primaryRaw, null);
    assert.equal(loaded.backupRaw, null);
  });

  test('newer backup revision is loaded in preference to primary', () => {
    const storage = createMemoryStorage();
    const primary = envelope({ revision: 1 });
    const backup = envelope({ revision: 5 });
    backup.state.glowMicro = 12 * MICRO_PER_GLOW;
    backup.state.lifetimeGlowMicro = 12 * MICRO_PER_GLOW;
    storage.setItem(PRIMARY_KEY, serializeEnvelope(primary));
    storage.setItem(BACKUP_KEY, serializeEnvelope(backup));
    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.source, 'backup');
    assert.equal(loaded.save.revision, 5);
    assert.equal(loaded.save.state.glowMicro, 12 * MICRO_PER_GLOW);
  });
});

describe('writeCheckpoint', () => {
  test('quota throw on setItem reports saved:false and does not wipe the proposed state', () => {
    const proposed = envelope({ revision: 2 });
    proposed.state.glowMicro = 15 * MICRO_PER_GLOW;
    proposed.state.lifetimeGlowMicro = 15 * MICRO_PER_GLOW;
    const storage = createMemoryStorage({ throwOnSet: true });
    storage.data.set(SITE_KEY, 'keep-me');

    const result = writeCheckpoint(storage, proposed);
    assert.equal(result.saved, false);
    assert.ok(result.error);
    assert.ok(result.envelope);
    assert.equal(result.envelope.state.glowMicro, 15 * MICRO_PER_GLOW);
    assert.equal(proposed.state.glowMicro, 15 * MICRO_PER_GLOW);
    assert.equal(storage.getItem(PRIMARY_KEY), null);
    assert.equal(storage.data.get(SITE_KEY), 'keep-me');
  });

  test('interrupted primary write leaves a complete valid checkpoint', () => {
    const storage = createMemoryStorage();
    const first = envelope({ revision: 0 });
    first.state.glowMicro = 20 * MICRO_PER_GLOW;
    first.state.lifetimeGlowMicro = 20 * MICRO_PER_GLOW;
    const seeded = writeCheckpoint(storage, first);
    assert.equal(seeded.saved, true);
    const previousPrimary = storage.getItem(PRIMARY_KEY);

    const next = envelope({ revision: seeded.envelope.revision });
    next.state.glowMicro = 40 * MICRO_PER_GLOW;
    next.state.lifetimeGlowMicro = 40 * MICRO_PER_GLOW;
    const failing = withFailingSet(storage, [PRIMARY_KEY]);
    const result = writeCheckpoint(failing, next);
    assert.equal(result.saved, false);
    assert.ok(result.error);

    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.save.state.glowMicro, 20 * MICRO_PER_GLOW);
    assert.notEqual(loaded.save.state.glowMicro, 40 * MICRO_PER_GLOW);
    assert.ok(loaded.primaryRaw === previousPrimary || loaded.source === 'backup');
  });

  test('newer backup is not clobbered by an older primary on the next write', () => {
    const storage = createMemoryStorage();
    const olderPrimary = envelope({ revision: 1 });
    olderPrimary.state.glowMicro = 1 * MICRO_PER_GLOW;
    olderPrimary.state.lifetimeGlowMicro = 1 * MICRO_PER_GLOW;
    const newerBackup = envelope({ revision: 5 });
    newerBackup.state.glowMicro = 50 * MICRO_PER_GLOW;
    newerBackup.state.lifetimeGlowMicro = 50 * MICRO_PER_GLOW;
    const backupText = serializeEnvelope(newerBackup);
    storage.setItem(PRIMARY_KEY, serializeEnvelope(olderPrimary));
    storage.setItem(BACKUP_KEY, backupText);

    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.source, 'backup');
    assert.equal(loaded.save.revision, 5);

    const written = writeCheckpoint(storage, olderPrimary);
    assert.equal(written.saved, true);
    assert.equal(written.envelope.revision, 6);
    assert.equal(storage.getItem(BACKUP_KEY), backupText);
    const backupLoaded = loadBest({
      getItem(key) {
        return key === PRIMARY_KEY ? null : storage.getItem(key);
      },
      setItem() {},
      removeItem() {},
    });
    assert.equal(backupLoaded.ok, true);
    if (!backupLoaded.ok) return;
    assert.equal(backupLoaded.save.revision, 5);
    assert.equal(backupLoaded.save.state.glowMicro, 50 * MICRO_PER_GLOW);
  });

  test('increments revision from the caller envelope and serializes a loadable primary', () => {
    const storage = createMemoryStorage();
    const first = writeCheckpoint(storage, envelope({ revision: 0 }));
    assert.equal(first.saved, true);
    assert.equal(first.envelope.revision, 1);
    const second = writeCheckpoint(storage, first.envelope);
    assert.equal(second.envelope.revision, 2);
    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.save.revision, 2);
    assert.equal(loaded.source, 'primary');
  });
});

describe('import and reset', () => {
  test('invalid import leaves storage unchanged; valid import reconciles and installs', () => {
    const storage = createMemoryStorage();
    const existing = envelope({ revision: 0, nowWallMs: 1_700_000_000_000 });
    existing.state.glowMicro = 7 * MICRO_PER_GLOW;
    existing.state.lifetimeGlowMicro = 7 * MICRO_PER_GLOW;
    const seeded = writeCheckpoint(storage, existing);
    assert.equal(seeded.saved, true);
    const beforePrimary = storage.getItem(PRIMARY_KEY);
    const beforeBackup = storage.getItem(BACKUP_KEY);

    const invalid = importSave(storage, '{nope', 1_700_000_000_000);
    assert.equal(invalid.ok, false);
    assert.equal(storage.getItem(PRIMARY_KEY), beforePrimary);
    assert.equal(storage.getItem(BACKUP_KEY), beforeBackup);

    const future = importSave(storage, futureFixtureText, 1_700_000_000_000);
    assert.equal(future.ok, false);
    assert.equal(future.reason, 'FUTURE_VERSION');
    assert.equal(storage.getItem(PRIMARY_KEY), beforePrimary);

    const now = 1_700_000_000_000 + HOUR_MS;
    const incoming = serializeEnvelope(
      createFreshEnvelope({ nowWallMs: now - HOUR_MS, revision: 8 }),
    );
    const preview = previewImport(incoming);
    assert.equal(preview.ok, true);
    if (preview.ok) {
      assert.equal(preview.preview.population, 1);
      assert.equal(preview.preview.glowMicro, 0);
      assert.equal(preview.preview.savedWallMs, now - HOUR_MS);
      assert.equal(typeof preview.preview.savedAt, 'string');
    }

    const imported = importSave(storage, incoming, now);
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(imported.saved, true);
    assert.equal(imported.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.equal(imported.envelope.state.glowMicro, 360 * MICRO_PER_GLOW);
    const loaded = loadBest(storage);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.save.state.glowMicro, 360 * MICRO_PER_GLOW);
    assert.notEqual(loaded.save.state.glowMicro, 7 * MICRO_PER_GLOW);
  });

  test('resetGameKeys removes only the two game keys', () => {
    const storage = createMemoryStorage();
    storage.setItem(PRIMARY_KEY, validFixtureText);
    storage.setItem(BACKUP_KEY, validFixtureText);
    storage.setItem(SITE_KEY, 'leave-this');
    resetGameKeys(storage);
    assert.equal(storage.getItem(PRIMARY_KEY), null);
    assert.equal(storage.getItem(BACKUP_KEY), null);
    assert.equal(storage.getItem(SITE_KEY), 'leave-this');
  });

  test('serializeEnvelope from the store matches core serialization', () => {
    const save = envelope({ revision: 3 });
    assert.equal(serializeFromStore(save), serializeEnvelope(save));
  });
});

describe('tab lock', () => {
  test('fake two-tab lock: holder A blocks B; A release; B acquires', async () => {
    const locks = createMemoryLocks();
    const a = await requestWriter({ locks });
    assert.equal(a.status, 'held');
    assert.equal(canPersist(a.status), true);

    const b = await requestWriter({ locks });
    assert.equal(b.status, 'blocked');
    assert.equal(canPersist(b.status), false);

    await a.release();
    const bRetry = await requestWriter({ locks });
    assert.equal(bRetry.status, 'held');
    assert.equal(canPersist(bRetry.status), true);
    await bRetry.release();
  });

  test('locks undefined is unsupported and canPersist is false so writes are skipped', async () => {
    const missing = await requestWriter({ locks: undefined });
    assert.equal(missing.status, 'unsupported');
    assert.equal(canPersist(missing.status), false);

    const empty = await requestWriter({});
    assert.equal(empty.status, 'unsupported');
    assert.equal(canPersist(empty.status), false);

    const storage = createMemoryStorage();
    if (canPersist(missing.status)) {
      writeCheckpoint(storage, envelope());
    }
    assert.equal(storage.getItem(PRIMARY_KEY), null);
    assert.equal(loadBest(storage).reason, 'EMPTY');
  });

  test('reacquire releases a leftover holder then holds again', async () => {
    const locks = createMemoryLocks();
    const first = await requestWriter({ locks });
    assert.equal(first.status, 'held');
    const again = await reacquireWriter({ locks, previous: first });
    assert.equal(again.status, 'held');
    const other = await requestWriter({ locks });
    assert.equal(other.status, 'blocked');
    await again.release();
  });
});
