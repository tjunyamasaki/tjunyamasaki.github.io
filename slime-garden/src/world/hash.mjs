/**
 * Deterministic keyed hashes for world behavior. Pure: no DOM, Three,
 * wall-clock APIs, randomness, or scene. Not a cryptographic hash.
 */

/**
 * FNV-1a 32-bit of a string.
 *
 * @param {string} text
 * @returns {number}
 */
export function fnv1a32(text) {
  let hash = 2166136261;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mix resident id, behavior counter, and a salt into a 32-bit integer.
 *
 * @param {string} id
 * @param {number} counter
 * @param {string | number} salt
 * @returns {number}
 */
export function mixHash(id, counter, salt) {
  let hash = fnv1a32(String(id));
  const count = Number.isFinite(counter) ? counter >>> 0 : 0;
  hash ^= count;
  hash = Math.imul(hash, 16777619);
  hash ^= fnv1a32(String(salt));
  hash = Math.imul(hash, 16777619);
  hash ^= Math.imul(count + 1, 0x9e3779b9);
  return hash >>> 0;
}

/**
 * Unit interval in [0, 1).
 *
 * @param {string} id
 * @param {number} counter
 * @param {string | number} salt
 * @returns {number}
 */
export function hashUnit(id, counter, salt) {
  return mixHash(id, counter, salt) / 4294967296;
}

/**
 * Inclusive integer in `min..max`.
 *
 * @param {string} id
 * @param {number} counter
 * @param {string | number} salt
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function hashIntInclusive(id, counter, salt, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo + 1;
  return lo + (mixHash(id, counter, salt) % span);
}
