// Weapon lab views. Pure markup from plain world data; main.mjs owns the DOM and calls lab.mjs.
import {ENEMIES, label} from '../content.mjs?v=harvest-18';
import {ARENA_GROWTH, RARITIES, rarityOf} from '../progression.mjs?v=harvest-18';
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {LAB, labDps, labWeapons} from '../lab.mjs?v=harvest-18';
import {skillOf} from '../skills.mjs?v=harvest-18';
import {rankStars, weaponBlurb} from './arena.mjs?v=harvest-18';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const compact = n => n >= 10000 ? `${(n/1000).toFixed(1)}k` : String(Math.round(n));

/** The always-on strip: open the panels, spawn, clear. */
export function labStripMarkup({open = ''} = {}){
  return `<button type="button" data-lab="panel:arsenal" aria-pressed="${open === 'arsenal'}">⚔<small>Arsenal</small></button>`
    + `<button type="button" data-lab="panel:foes" aria-pressed="${open === 'foes'}">☠<small>Foes</small></button>`
    + `<button type="button" data-lab="spawn" title="Spawn (N)">＋<small>Spawn</small></button>`
    + `<button type="button" data-lab="clear" title="Clear (X)">✕<small>Clear</small></button>`;
}
/** The damage meter. */
export function labMeterMarkup(world){
  const s = world?.arena?.stats || {};
  const foes = (world?.enemies || []).filter(e => e.hp > 0 && !isMagicAlly(e)).length;
  return `<span><b>${compact(labDps(world))}</b>DPS</span><span><b>${compact(s.dealt || 0)}</b>TOTAL</span><span><b>${compact(s.peak || 0)}</b>PEAK</span><span><b>${s.kills || 0}</b>KILLS</span><span><b>${foes}</b>FOES</span>`;
}

/** Arsenal: every weapon, at a rank, and your level. */
export function arsenalMarkup(p, {rank = 1, icon = () => ''} = {}){
  const held = p?.equipment?.weapon?.itemId || 'fist';
  const heldRank = held === 'fist' ? 1 : (p?.ranks?.[held] || 1);
  const skill = skillOf(held);
  const ranks = Array.from({length: ARENA_GROWTH.maxRank}, (_, i) => i+1)
    .map(r => `<button type="button" class="chip ${r === rank ? 'active' : ''}" data-lab="rank:${r}" aria-pressed="${r === rank}">${rankStars(r)}</button>`).join('');
  const groups = RARITIES.slice().reverse().map(rarity => {
    const ids = labWeapons().filter(id => (id === 'fist' ? 'common' : rarityOf(id)) === rarity);
    if(!ids.length) return '';
    return `<p class="lab-group rarity-${rarity}">${rarity.toUpperCase()}</p><div class="lab-weapons">${ids.map(id => {
      const name = id === 'fist' ? 'Bare hands' : label(id);
      const on = id === held;
      return `<button type="button" class="lab-weapon rarity-${id === 'fist' ? 'common' : rarity} ${on ? 'active' : ''}" data-lab="equip:${escape(id)}" title="${escape(name)} · ${escape(skillOf(id)?.name || '')}" aria-pressed="${on}">`
        + `<span class="lab-icon">${id === 'fist' ? '<span class="fist">✊</span>' : icon(id)}</span><small>${escape(name)}</small>${on && id !== 'fist' ? `<i class="lab-rank">${rankStars(heldRank)}</i>` : ''}</button>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="lab-held"><div><b>${escape(held === 'fist' ? 'Bare hands' : label(held))}</b>${held !== 'fist' ? ` <span class="stars">${rankStars(heldRank)}</span>` : ''}`
    + `<p>${escape(held === 'fist' ? 'Plain punches.' : weaponBlurb(held))}</p>`
    + (skill ? `<p class="lab-skill"><span>SKILL · Q</span> <b>${escape(skill.name)}</b> <em>${skill.cooldown}s</em><br>${escape(skill.blurb)}</p>` : '')
    + `</div></div>`
    + `<div class="lab-row"><span>Rank</span><div class="lab-chips">${ranks}</div></div>`
    + `<div class="lab-row"><span>Level</span><div class="lab-stepper"><button type="button" data-lab="level:-5">−5</button><button type="button" data-lab="level:-1">−</button><b>${p?.level || 1}</b><button type="button" data-lab="level:1">+</button><button type="button" data-lab="level:5">+5</button></div></div>`
    + `<p class="muted small">Tap a weapon to put it in the hotbar slot you are holding, at the rank above.</p>${groups}`;
}

/** Foes: what to spawn, how many, how strong, where; and the lab's switches. */
export function foesMarkup(world, {type = 'mix', count = 10, formation = 'ahead', autoAttack = true} = {}){
  const a = world?.arena || {};
  const chips = (list, key, current, name = v => v) => list.map(v => `<button type="button" class="chip ${v === current ? 'active' : ''}" data-lab="${key}:${v}" aria-pressed="${v === current}">${escape(name(v))}</button>`).join('');
  const foeName = id => id === 'mix' ? 'Mix' : ENEMIES[id]?.name || id;
  const toggle = (key, on, text) => `<button type="button" class="lab-toggle" data-lab="toggle:${key}" aria-pressed="${!!on}"><span>${escape(text)}</span><b>${on ? 'On' : 'Off'}</b></button>`;
  return `<div class="lab-row"><span>Foe</span><div class="lab-chips">${chips(LAB.foes, 'foe', type, foeName)}</div></div>`
    + `<div class="lab-row"><span>Count</span><div class="lab-chips">${chips(LAB.counts, 'count', count)}</div></div>`
    + `<div class="lab-row"><span>Where</span><div class="lab-chips">${chips(LAB.formations, 'formation', formation, v => ({ahead: 'Ahead', around: 'Around you', wall: 'From the wall'}[v]))}</div></div>`
    + `<div class="lab-row"><span>Strength</span><div class="lab-stepper"><button type="button" data-lab="strength:-5">−5</button><button type="button" data-lab="strength:-1">−</button><b>Wave ${a.wave || 1}</b><button type="button" data-lab="strength:1">+</button><button type="button" data-lab="strength:5">+5</button></div></div>`
    + `<div class="lab-actions"><button type="button" class="primary" data-lab="spawn">Spawn now</button><button type="button" data-lab="clear">Clear all</button></div>`
    + `<div class="lab-toggles">${toggle('god', a.god, 'Invulnerable')}${toggle('dummies', a.dummies, 'Foes stand still')}${toggle('freeSkills', a.freeSkills, 'Free skills (no cooldown or stamina)')}${toggle('auto', autoAttack, 'Auto-attack')}</div>`
    + `<div class="lab-actions"><button type="button" data-lab="reset">Reset meter</button></div>`
    + `<p class="muted small">N spawns, X clears foes, summons and effects. The meter counts every point of health foes lose, from any source, averaged over ${LAB.window} seconds.</p>`;
}
