// Trinket readout (trinkets.mjs): a small chip under the vitals with the worn trinket's icon and, when
// it matters, its charge (boneward's shield, frostanklet's trail, moonlocket's might). Tap it for the pack.
// Also the inventory tooltip text and the crow's-eye map reveal that main.mjs asks for.

import {label} from '../content.mjs?v=harvest-18';
import {TRINKET, TRINKET_TEXT, revealsCache, trinketOf, wardCooldown} from '../trinkets.mjs?v=harvest-18';
import {effectLine} from './actions.mjs?v=harvest-18';
import {cue} from './rhythm.mjs?v=harvest-18';

export {revealsCache};

/** Inventory slot tooltip: the name, and for a trinket what it does on a second line. */
export function trinketTip(itemId){return TRINKET_TEXT[itemId] ? `${label(itemId)}\n${effectLine(itemId)}` : label(itemId);}

let chip = null, iconEl = null, sig = '', ward = 0, live = null, state = '';

export function bind(ctx){
  const hud = document.getElementById('feature-hud');
  if(!hud || document.getElementById('trinket-chip')) return;
  chip = document.createElement('button');
  chip.type = 'button'; chip.id = 'trinket-chip'; chip.className = 'trinket-chip'; chip.hidden = true;
  chip.innerHTML = '<span class="trinket-icon"></span><i class="trinket-charge" aria-hidden="true"></i>';
  iconEl = chip.querySelector('.trinket-icon');
  chip.addEventListener('click', event => {event.stopPropagation(); if(!live?.me) return; live.sheet === 'inventory' ? live.closeSheet?.() : live.openSheet?.('inventory');});
  hud.append(chip);
}

export function paint(ctx){
  live = ctx;
  if(!chip) return;
  const id = ctx?.world?.arena ? null : trinketOf(ctx?.me);
  if(!id){if(!chip.hidden){chip.hidden = true; sig = '';} return;}
  if(id !== sig){
    sig = id; chip.hidden = false; chip.dataset.trinket = id;
    iconEl.innerHTML = ctx.icon?.(id) || '';
    const text = `${label(id)}: ${TRINKET_TEXT[id] || ''}`;
    chip.setAttribute('aria-label', `${text}. Open inventory`); chip.title = text;
    ward = ctx.me?.wardReady || 0; state = '';
  }
}

/** 0..1 charge and a state word for the trinkets that have one; '' for the rest. */
function reading(world, p, id){
  if(id === 'boneward'){const left = wardCooldown(world, p); return {charge: 1 - left/TRINKET.wardCooldown, state: left > 0 ? 'cooling' : 'ready'};}
  if(id === 'frostanklet'){
    let best = 0;
    for(const zone of world.zones || []) if(zone.trail && zone.owner === p.id) best = Math.max(best, 1 - zone.age/zone.life);
    return {charge: best, state: best > 0 ? 'active' : ''};
  }
  if(id === 'moonlocket') return {charge: 1, state: p.might > 1 ? 'active' : ''};
  return {charge: 0, state: ''};
}

export function frame(ctx, dt){
  live = ctx;
  if(!chip || chip.hidden || !ctx?.me || !ctx.world) return;
  const p = ctx.me, id = trinketOf(p);
  if(!id || id !== sig) return;
  const now = reading(ctx.world, p, id);
  chip.style.setProperty('--charge', now.charge.toFixed(3));
  if(now.state !== state){state = now.state; chip.dataset.state = state;}
  // A blow just broke on the ward: flash the chip and chime.
  if(id === 'boneward' && (p.wardReady || 0) > ward + .01){chip.classList.remove('is-pop'); void chip.offsetWidth; chip.classList.add('is-pop'); cue('ward');}
  ward = p.wardReady || 0;
}
