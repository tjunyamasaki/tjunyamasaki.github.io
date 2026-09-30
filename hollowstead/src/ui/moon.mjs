// Moon badge beside the day clock (night.mjs nightStatus): tonight's moon, and a tap card with what it
// means and which moon follows. Under a blood moon a red veil gathers at the screen's edges as night falls.
// The badge lives in .game-top .clock-meta; the card floats under it; the veil sits first in #game, under every HUD control.

import {cachedSrc} from '../assets.mjs?v=harvest-18';
import {phaseAt} from '../content.mjs?v=harvest-18';
import {MOON_LIGHT, MOONS, moonLighting, nightStatus} from '../night.mjs?v=harvest-18';

const CARD_SECONDS = 5.5;
let badge = null, badgeImg = null, card = null, veil = null, sig = '', cardSig = '', cardTimer = 0, veilOpacity = -1, status = null, theme = null, cardAnnounce = '';

/** The announcement line on screen, or '' (a new one closes the card so it is never hidden). */
function announcement(){
  const el = document.getElementById('announcement');
  return el && el.classList.contains('visible') ? el.textContent : '';
}

function iconSrc(moon){
  const sprite = theme?.sprites?.[`moon-${moon}`];
  const src = sprite?.icon || sprite?.src;
  return src ? cachedSrc(src) : '';
}

function ensureDom(){
  if(!badge || !badge.isConnected){
    const meta = document.querySelector('.game-top .clock-meta');
    if(!meta) return false;
    badge = document.createElement('button');
    badge.type = 'button'; badge.className = 'moon-badge'; badge.hidden = true;
    badgeImg = document.createElement('img'); badgeImg.alt = ''; badgeImg.draggable = false;
    badge.append(badgeImg);
    badge.addEventListener('click', event => {event.stopPropagation(); toggleCard();});
    meta.append(badge);
    sig = '';
  }
  if(!card || !card.isConnected){
    const host = document.getElementById('feature-hud') || document.getElementById('game');
    if(!host) return false;
    card = document.createElement('div');
    card.className = 'moon-card'; card.hidden = true; card.setAttribute('role', 'status');
    card.addEventListener('click', () => hideCard());
    host.append(card);
    cardSig = '';
  }
  if(!veil || !veil.isConnected){
    const game = document.getElementById('game');
    if(game){veil = document.createElement('div'); veil.className = 'moon-veil'; veil.setAttribute('aria-hidden', 'true'); game.prepend(veil); veilOpacity = -1;}
  }
  return true;
}

function paintCard(){
  if(!card || !status) return;
  const next = `${status.moon}|${status.next}|${status.day}|${status.visit}`;
  if(next === cardSig) return;
  cardSig = next;
  const king = status.moon === 'blood' ? (status.visit > 1 ? ` The King has come ${status.visit - 1} ${status.visit === 2 ? 'time' : 'times'} before.` : '') : '';
  card.className = `moon-card moon-${status.moon}`;
  card.innerHTML = `<div class="moon-card-head"><img src="${iconSrc(status.moon)}" alt="" draggable="false"><b>${MOONS[status.moon]?.name || 'Moon'}</b><small>NIGHT ${String(status.day).padStart(2, '0')}</small></div>`
    + `<p>${status.detail}${king}</p>`
    + `<p class="moon-next"><img src="${iconSrc(status.next)}" alt="" draggable="false">Next night · ${status.nextName}</p>`;
}

function placeCard(){
  if(!card || !badge) return;
  const r = badge.getBoundingClientRect(), width = Math.min(250, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left + r.width/2 - width/2));
  card.style.width = `${width}px`; card.style.left = `${left}px`; card.style.top = `${Math.round(r.bottom + 10)}px`;
}

function toggleCard(){
  if(!card) return;
  if(!card.hidden){hideCard(); return;}
  paintCard(); placeCard();
  card.hidden = false; cardTimer = CARD_SECONDS; cardAnnounce = announcement();
  badge?.setAttribute('aria-expanded', 'true');
}
function hideCard(){
  if(card) card.hidden = true;
  cardTimer = 0;
  badge?.setAttribute('aria-expanded', 'false');
}

export function bind(ctx){
  theme = ctx.theme || theme;
  ensureDom();
}

export function paint(ctx){
  theme = ctx.theme || theme;
  const world = ctx.world;
  if(!ensureDom() || !badge) return;
  if(!world || world.arena || world.showcase){
    if(!badge.hidden){badge.hidden = true; hideCard(); sig = '';}
    return;
  }
  if(!card.hidden){const line = announcement(); if(line && line !== cardAnnounce) hideCard();}
  status = nightStatus(world);
  const omen = status.moon === 'blood' && phaseAt(world.time || 0) !== 'day';
  const next = `${status.moon}|${status.next}|${status.day}|${omen}`;
  if(next !== sig){
    sig = next;
    badge.hidden = false;
    badge.className = `moon-badge moon-${status.moon}${omen ? ' moon-omen' : ''}`;
    const src = iconSrc(status.moon);
    if(badgeImg.getAttribute('src') !== src) badgeImg.src = src;
    badge.setAttribute('aria-label', `Tonight: ${status.name}. Next night: ${status.nextName}. Tap for details.`);
    badge.title = `${status.name} · ${status.detail}`;
    if(!card.hidden){paintCard(); placeCard();}
  }
}

export function frame(ctx, dt){
  if(cardTimer > 0){cardTimer -= dt; if(cardTimer <= 0) hideCard();}
  if(!veil) return;
  const world = ctx.world;
  const darkness = world && !world.arena && moonLighting(world) === MOON_LIGHT.blood ? Math.max(0, Math.min(1, ctx.renderer?.view?.darkness || 0)) : 0;
  const opacity = Math.round(darkness*50)/50;
  if(opacity !== veilOpacity){veilOpacity = opacity; veil.style.opacity = String(opacity);}
}
