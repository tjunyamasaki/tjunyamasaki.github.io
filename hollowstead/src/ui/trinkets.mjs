// Trinket readout (trinkets.mjs): small chips under the vitals, one per worn trinket (the second socket
// has its own), each with its charge when it has one (boneward's shield, frostanklet's trail,
// moonlocket's might, hellspur's Frenzy, the bell's count to thirteen...). When the two resonate, the
// chips are joined and name the resonance. Tap a chip for the pack.
// Also the inventory tooltip text and the crow's-eye map reveal that main.mjs asks for.

import {label} from '../content.mjs?v=harvest-18';
import {TRINKET, TRINKET_TEXT, charmOf, resonancesFor, resonancesOf, revealsCache, trinketOf, wardCooldown} from '../trinkets.mjs?v=harvest-18';
import {effectLine} from './actions.mjs?v=harvest-18';
import {cue} from './rhythm.mjs?v=harvest-18';

export {revealsCache};

/**
 * Inventory slot tooltip: the name, what it does, and the resonances it belongs to
 * (a live one marked when `wearer` already wears the other half).
 */
export function trinketTip(itemId, wearer = null){
  if(!TRINKET_TEXT[itemId]) return label(itemId);
  const lines = [label(itemId), effectLine(itemId)];
  for(const r of resonancesFor(itemId)){
    const other = r.pair.find(id => id !== itemId), live = wearer && [trinketOf(wearer), charmOf(wearer)].includes(other);
    lines.push(`${live ? '✦' : '◇'} ${r.name}, with ${label(other)}: ${r.text}`);
  }
  return lines.join('\n');
}

const chips = [];
let link = null, live = null, ward = 0;

function makeChip(hud, socket){
  const chip = document.createElement('button');
  chip.type = 'button'; chip.id = socket === 'charm' ? 'trinket-chip-2' : 'trinket-chip'; chip.className = 'trinket-chip'; chip.hidden = true;
  chip.dataset.socket = socket;
  chip.innerHTML = '<span class="trinket-icon"></span><i class="trinket-charge" aria-hidden="true"></i><b class="trinket-count" aria-hidden="true"></b>';
  chip.addEventListener('click', event => {event.stopPropagation(); if(!live?.me) return; live.sheet === 'inventory' ? live.closeSheet?.() : live.openSheet?.('inventory');});
  hud.append(chip);
  return {socket, el: chip, icon: chip.querySelector('.trinket-icon'), count: chip.querySelector('.trinket-count'), sig: '', state: '', text: ''};
}

export function bind(){
  const hud = document.getElementById('feature-hud');
  if(!hud || document.getElementById('trinket-chip')) return;
  chips.push(makeChip(hud, 'trinket'), makeChip(hud, 'charm'));
  link = document.createElement('span'); link.className = 'trinket-link'; link.hidden = true; link.setAttribute('aria-hidden', 'true');
  hud.append(link);
}

export function paint(ctx){
  live = ctx;
  if(!chips.length) return;
  const p = ctx?.me, off = !!ctx?.world?.arena;
  for(const c of chips){
    const id = off ? null : c.socket === 'charm' ? charmOf(p) : trinketOf(p);
    if(!id){if(!c.el.hidden){c.el.hidden = true; c.sig = '';} continue;}
    if(id !== c.sig){
      c.sig = id; c.el.hidden = false; c.el.dataset.trinket = id;
      c.icon.innerHTML = ctx.icon?.(id) || '';
      const text = `${label(id)}: ${TRINKET_TEXT[id] || ''}`;
      c.el.setAttribute('aria-label', `${text}. Open inventory`); c.el.title = text;
      c.state = ''; if(id === 'boneward') ward = p?.wardReady || 0;
    }
  }
  const pairs = off ? [] : resonancesOf(p), both = chips.every(c => !c.el.hidden);
  const text = pairs.map(r => r.name).join(' · ');
  link.hidden = !(pairs.length && both);
  if(link.textContent !== text) link.textContent = text;
  for(const c of chips) c.el.classList.toggle('is-resonant', !!pairs.length && both);
  if(pairs.length && both) chips[1].el.title = `${chips[1].el.getAttribute('aria-label')?.replace('. Open inventory', '')}\nResonance: ${pairs.map(r => `${r.name}: ${r.text}`).join('; ')}`;
}

/** 0..1 charge, a state word and a small count for the trinkets that have one; '' for the rest. */
export function reading(world, p, id){
  if(id === 'boneward'){const left = wardCooldown(world, p); return {charge: 1 - left/TRINKET.wardCooldown, state: left > 0 ? 'cooling' : 'ready', count: ''};}
  if(id === 'frostanklet'){
    let best = 0;
    for(const zone of world.zones || []) if(zone.trail && zone.owner === p.id) best = Math.max(best, 1 - zone.age/zone.life);
    return {charge: best, state: best > 0 ? 'active' : '', count: ''};
  }
  if(id === 'moonlocket' || id === 'gutteringcandle') return {charge: Math.min(1, Math.max(0, ((p.might || 1) - 1)/.4)), state: p.might > 1 ? 'active' : '', count: ''};
  if(id === 'hellspur') return {charge: (p.frenzy || 0)/TRINKET.frenzy.max, state: p.frenzy > 0 ? 'active' : '', count: p.frenzy > 0 ? String(p.frenzy) : ''};
  if(id === 'thirteenthbell'){const n = p.tolls || 0; return {charge: n/TRINKET.bell.every, state: n >= TRINKET.bell.every - 3 ? 'ready' : n > 0 ? 'cooling' : '', count: n ? String(n) : ''};}
  if(id === 'mournersveil') return {charge: p.veil ? 1 : 0, state: p.veil ? 'active' : '', count: ''};
  return {charge: 0, state: '', count: ''};
}

export function frame(ctx){
  live = ctx;
  if(!chips.length || !ctx?.me || !ctx.world) return;
  const p = ctx.me;
  for(const c of chips){
    if(c.el.hidden || !c.sig) continue;
    const now = reading(ctx.world, p, c.sig);
    c.el.style.setProperty('--charge', now.charge.toFixed(3));
    if(now.state !== c.state){c.state = now.state; c.el.dataset.state = now.state;}
    if(c.count.textContent !== now.count) c.count.textContent = now.count;
    // A blow just broke on the ward: flash the chip and chime.
    if(c.sig === 'boneward'){
      if((p.wardReady || 0) > ward + .01){c.el.classList.remove('is-pop'); void c.el.offsetWidth; c.el.classList.add('is-pop'); cue('ward');}
      ward = p.wardReady || 0;
    }
  }
}
