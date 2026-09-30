// Region hazard badge and screen effects (regions.mjs regionStatus).
// - A compact badge under the vitals while the local wanderer stands in a hazardous region: the
//   gear that answers it, crossed out in red when missing, amber when carried but not worn (or an
//   unlit lantern), green when it protects them.
// - A first-visit hint per region, once per device.
// - Screen veils: green spore haze (Hollow Mire, unmasked) and a frost edge (Barrow Fields,
//   uncloaked). Pure CSS layers under every HUD control, pointer-events:none. The Crags' darkness
//   comes from lighting (regions.mjs regionDarkness), not from here.
// Everything is derived from the local wanderer's own position and gear, so guests see their own.

import {regionStatus} from '../regions.mjs?v=harvest-18';

const TIP_KEY = 'hollowstead.frontier.tips';
const TIP_DELAY_MS = 2200; // Let the region's "Discovered …" toast show first.
const MARKS = Object.freeze({worn: '✓', missing: '✕', carried: '!', unlit: '!'});

let root = null, icon = null, mark = null, title = null, detail = null, spore = null, frost = null;
let signature = '', region = null, enteredAt = 0, shown = false, tips = null;

function loadTips(){
  if (tips) return tips;
  tips = new Set();
  try { const saved = JSON.parse(localStorage.getItem(TIP_KEY) || '[]'); if (Array.isArray(saved)) for (const id of saved) tips.add(String(id)); } catch {}
  return tips;
}
function rememberTip(id){
  loadTips().add(id);
  try { localStorage.setItem(TIP_KEY, JSON.stringify([...tips])); } catch {}
}

function el(tag, className, parent){const node = document.createElement(tag); if (className) node.className = className; parent?.appendChild(node); return node;}

/** Sit just under the vitals, whatever the viewport's media rules put them. */
function place(){
  if (!root) return;
  const vitals = document.querySelector('#game .vitals');
  const rect = vitals?.getBoundingClientRect();
  if (!rect || !(rect.height > 0)) return;
  root.style.setProperty('--frontier-top', `${Math.round(rect.bottom + 7)}px`);
  root.style.setProperty('--frontier-left', `${Math.round(rect.left)}px`);
}

export function bind(ctx){
  const hud = document.getElementById('feature-hud'), game = document.getElementById('game');
  if (!hud || !game || root) return;
  root = el('div', 'frontier-badge', hud);
  root.id = 'frontier-badge';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const face = el('span', 'frontier-badge__icon', root);
  icon = el('span', 'frontier-badge__img', face);
  mark = el('i', 'frontier-badge__mark', face);
  mark.setAttribute('aria-hidden', 'true');
  const text = el('span', 'frontier-badge__text', root);
  title = el('b', '', text);
  detail = el('small', '', text);
  // The veils go first in #game so every HUD control paints above them.
  spore = el('div', 'frontier-veil frontier-veil--spore');
  frost = el('div', 'frontier-veil frontier-veil--frost');
  for (const veil of [frost, spore]) {veil.setAttribute('aria-hidden', 'true'); game.prepend(veil);}
  addEventListener('resize', place);
  addEventListener('orientationchange', place);
}

export function paint(ctx){
  if (!root) return;
  const status = ctx?.me && ctx.world ? regionStatus(ctx.world, ctx.me) : null;
  const key = status ? `${status.region}|${status.state}` : '';
  if (key !== signature) {
    signature = key;
    if (status) {
      if (!shown) place();
      root.className = `frontier-badge is-shown is-${status.state} is-${status.region}`;
      icon.innerHTML = ctx.icon?.(status.itemId) || '';
      mark.textContent = MARKS[status.state] || '';
      title.textContent = status.hazard;
      detail.textContent = status.label;
      root.setAttribute('aria-label', `${status.name}: ${status.hazard}. ${status.label}.`);
    } else root.className = 'frontier-badge';
    shown = !!status;
    spore.classList.toggle('is-on', status?.region === 'mire' && !status.protected);
    frost.classList.toggle('is-on', status?.region === 'barrow' && !status.protected);
  }
  // First visit to each region without its gear: say what would help, once.
  const here = status?.region || null, now = performance.now();
  if (here !== region) {region = here; enteredAt = now;}
  if (status && !status.protected && now - enteredAt > TIP_DELAY_MS && !loadTips().has(status.region)) {
    rememberTip(status.region);
    ctx.toast?.(status.tip);
  }
}

export function frame(ctx, dt){}
