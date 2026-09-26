// Session cache for static Hollowstead files. Theme JSON, sprites, icons and
// audio do not change during play; one fetch and one decode are reused.
const files = new Map();
const images = new Map();
const objectUrls = new Map();

function href(url) {
  return String(url);
}

function objectUrl(key, blob) {
  if (objectUrls.has(key)) return objectUrls.get(key);
  const create = globalThis.URL?.createObjectURL;
  if (typeof create !== 'function' || !blob) return key;
  const next = create(blob);
  objectUrls.set(key, next);
  return next;
}

async function fetchBlob(url) {
  const key = href(url);
  let pending = files.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(key, {cache: 'force-cache'});
      if (!response.ok) throw new Error('The harvest art could not be loaded. Please reload.');
      const blob = await response.blob();
      objectUrl(key, blob);
      return blob;
    })();
    files.set(key, pending);
  }
  return pending;
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const ImageType = globalThis.Image;
    if (typeof ImageType !== 'function') {
      reject(new Error('Missing sprite'));
      return;
    }
    const image = new ImageType();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Missing sprite'));
    image.src = src;
  });
}

export function cachedSrc(url) {
  if (!url) return '';
  const key = href(url);
  return objectUrls.get(key) || key;
}

export async function loadBlob(url) {
  return fetchBlob(url);
}

export async function loadJson(url) {
  return JSON.parse(await (await fetchBlob(url)).text());
}

export function loadImage(url) {
  const key = href(url);
  let pending = images.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const blob = await fetchBlob(key);
        return await decodeImage(objectUrl(key, blob));
      } catch (error) {
        if (objectUrls.has(key)) throw error;
        files.delete(key);
        return decodeImage(key);
      }
    })();
    images.set(key, pending);
  }
  return pending;
}

export function themeAssetUrls(theme) {
  const urls = [];
  for (const def of Object.values(theme?.sprites || {})) {
    if (typeof def?.src === 'string') urls.push(def.src);
    if (typeof def?.icon === 'string') urls.push(def.icon);
  }
  for (const src of Object.values(theme?.audio || {})) {
    if (typeof src === 'string') urls.push(src);
  }
  return urls;
}

export function preloadThemeAssets(theme) {
  return Promise.all(themeAssetUrls(theme).map(url => loadImage(url).catch(() => fetchBlob(url))));
}

export function resetAssetCache() {
  files.clear();
  images.clear();
  objectUrls.clear();
}
