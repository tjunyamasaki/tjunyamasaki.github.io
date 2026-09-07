const FNV = 2166136261;
const FNV_PRIME = 16777619;

export function normalizeSeed(text) {
  return String(text ?? '').trim().slice(0, 64);
}

export function hashSeed(text) {
  const source = normalizeSeed(text);
  let hash = FNV;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function mixStream(hash, label) {
  let mixed = hash >>> 0;
  const tag = String(label);
  for (let i = 0; i < tag.length; i++) {
    mixed ^= tag.charCodeAt(i);
    mixed = Math.imul(mixed, FNV_PRIME);
  }
  mixed ^= Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

export function streamRng(hash, label) {
  return createRng(mixStream(hash, label));
}

export function rollSeedText(bytes) {
  const source = bytes || (typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(4))
    : null);
  if (!source) throw new Error('No entropy source for a blank seed');
  return `sky-${Array.from(source, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
