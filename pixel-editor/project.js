/** Pixel-editor project file. JSON with exact RGBA art + grid settings. */

export const PROJECT_APP = "pixel-editor";
export const PROJECT_VERSION = 1;

export function bytesToB64(bytes) {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(s);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodePixels(pixels) {
  return {
    width: pixels.width,
    height: pixels.height,
    rgba: bytesToB64(pixels.data),
  };
}

export function decodePixels(encoded) {
  if (!encoded || !encoded.rgba) throw new Error("Project has no pixel data");
  const width = encoded.width | 0;
  const height = encoded.height | 0;
  const data = b64ToBytes(encoded.rgba);
  if (width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error("Project pixel data does not match size");
  }
  return { width, height, data };
}

export function isProjectPayload(data) {
  return Boolean(data && data.app === PROJECT_APP && Number(data.v) >= 1 && data.pixels);
}

export function isProjectFile(file) {
  return file.type === "application/json" || /\.json$/i.test(file.name);
}
