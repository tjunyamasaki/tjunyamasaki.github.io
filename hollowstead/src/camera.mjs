// Shared framing for the WebGL and canvas cameras.
// Portrait keeps a vertical half-extent of 12 world units.
// Landscape used to keep 13 for every width. On a phone held sideways
// (about 390 CSS pixels tall) that showed ~15 pixels per world unit,
// while portrait at 844 pixels tall shows ~35. Short landscape views
// use the portrait pixel size. Tall desktop views stay at 13.

const PORTRAIT_HALF = 12;
const LANDSCAPE_HALF = 13;
const PORTRAIT_REFERENCE_HEIGHT = 844;
const MIN_LANDSCAPE_HALF = 5.25;

export function orthographicHalf(width, height){
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  if(w / h < 0.85) return PORTRAIT_HALF;
  const readable = h * PORTRAIT_HALF / PORTRAIT_REFERENCE_HEIGHT;
  return Math.min(LANDSCAPE_HALF, Math.max(MIN_LANDSCAPE_HALF, readable));
}

export function viewSize(canvas){
  const rect = canvas?.getBoundingClientRect?.();
  const viewport = globalThis.visualViewport;
  let width = rect?.width || 0;
  let height = rect?.height || 0;
  if(width < 2 || height < 2){
    width = viewport?.width || globalThis.innerWidth || 1;
    height = viewport?.height || globalThis.innerHeight || 1;
  }
  return {width, height};
}

export function watchViewport(onResize){
  const schedule = () => {
    onResize();
    requestAnimationFrame(() => onResize());
  };
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  document.addEventListener('fullscreenchange', schedule);
  document.addEventListener('webkitfullscreenchange', schedule);
  return schedule;
}
