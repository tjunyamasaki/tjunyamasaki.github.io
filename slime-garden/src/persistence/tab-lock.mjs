/**
 * Exclusive writer lock via an injectable Web Locks-like API.
 * Real two-tab coordination needs a browser; Node tests use an in-process fake.
 */

export const WRITER_LOCK_NAME = 'cozy-slime-mvp:writer';

/**
 * @typedef {'held' | 'blocked' | 'unsupported'} WriterLockStatus
 *
 * @typedef {object} WriterLockHandle
 * @property {WriterLockStatus} status
 * @property {() => Promise<void>} release
 *
 * @typedef {object} LockLike
 * @property {string} name
 *
 * @typedef {object} LockManagerLike
 * @property {(
 *   name: string,
 *   options: { ifAvailable: boolean },
 *   callback: (lock: LockLike | null) => unknown,
 * ) => unknown} request
 */

/**
 * Only a held writer lock may persist to localStorage.
 *
 * @param {WriterLockStatus | string | null | undefined} status
 * @returns {boolean}
 */
export function canPersist(status) {
  return status === 'held';
}

/**
 * @param {LockManagerLike | null | undefined} locks
 * @returns {locks is LockManagerLike}
 */
function hasLockRequest(locks) {
  return locks != null && typeof locks.request === 'function';
}

/**
 * Request exclusive writer ownership without waiting in line.
 *
 * `held`: keep the callback promise unresolved until `release()`.
 * `blocked`: another holder; caller shows a secondary-tab retry.
 * `unsupported`: no locks API — session-only; callers must not write storage.
 *
 * @param {object} [options]
 * @param {LockManagerLike | null} [options.locks]
 * @param {() => void} [options.onRelease]
 * @returns {Promise<WriterLockHandle>}
 */
export async function requestWriter(options = {}) {
  const locks = options.locks;
  const onRelease = options.onRelease;

  if (!hasLockRequest(locks)) {
    return {
      status: 'unsupported',
      async release() {},
    };
  }

  /** @type {() => void} */
  let releaseHold = () => {};
  /** @type {Promise<unknown>} */
  let requestDone = Promise.resolve();

  /** @type {WriterLockStatus} */
  let status;
  try {
    status = await new Promise((resolve, reject) => {
      let settled = false;
      /**
       * @param {WriterLockStatus} value
       */
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      try {
        requestDone = Promise.resolve(
          locks.request(WRITER_LOCK_NAME, { ifAvailable: true }, (lock) => {
            if (lock == null) {
              finish('blocked');
              return undefined;
            }
            finish('held');
            return new Promise((releaseResolve) => {
              releaseHold = () => {
                releaseResolve();
                if (typeof onRelease === 'function') {
                  onRelease();
                }
              };
            });
          }),
        );
        requestDone.catch((error) => {
          if (!settled) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch {
    return {
      status: 'unsupported',
      async release() {},
    };
  }

  if (status === 'blocked') {
    return {
      status: 'blocked',
      async release() {},
    };
  }

  let released = false;
  return {
    status: 'held',
    async release() {
      if (released) {
        await requestDone.catch(() => {});
        return;
      }
      released = true;
      releaseHold();
      await requestDone.catch(() => {});
    },
  };
}

/**
 * Drop a leftover holder (pageshow / back-forward cache) and request again.
 *
 * @param {object} [options]
 * @param {LockManagerLike | null} [options.locks]
 * @param {() => void} [options.onRelease]
 * @param {WriterLockHandle | null} [options.previous]
 * @returns {Promise<WriterLockHandle>}
 */
export async function reacquireWriter(options = {}) {
  const previous = options.previous;
  if (previous && typeof previous.release === 'function') {
    await previous.release();
  }
  return requestWriter({
    locks: options.locks,
    onRelease: options.onRelease,
  });
}

/**
 * In-process exclusive lock manager matching the `ifAvailable` Web Locks shape.
 * Demonstrates two-tab blocking in Node; it is not a real browser tab lock.
 *
 * @returns {LockManagerLike & { isHeld(name?: string): boolean }}
 */
export function createMemoryLocks() {
  /** @type {Set<string>} */
  const held = new Set();

  return {
    /**
     * @param {string} name
     * @param {{ ifAvailable?: boolean }} options
     * @param {(lock: LockLike | null) => unknown} callback
     * @returns {Promise<unknown>}
     */
    request(name, options, callback) {
      if (held.has(name)) {
        return Promise.resolve().then(() => callback(null));
      }
      held.add(name);
      let callbackResult;
      try {
        callbackResult = callback({ name });
      } catch (error) {
        held.delete(name);
        return Promise.reject(error);
      }
      return Promise.resolve(callbackResult).finally(() => {
        held.delete(name);
      });
    },
    /**
     * @param {string} [name]
     */
    isHeld(name = WRITER_LOCK_NAME) {
      return held.has(name);
    },
  };
}
