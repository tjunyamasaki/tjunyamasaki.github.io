// Homestead HUD: the blessings running on you (buffs.mjs), each with the dish it came from and the time
// it has left, and a room chip while you stand inside a closed room (homestead.mjs roomAt), which also
// says when you are asleep in it (sleep.mjs). Lives in #feature-hud under the vitals.

import {ITEMS} from '../content.mjs?v=harvest-18';
import {buffList} from '../buffs.mjs?v=harvest-18';
import {cellAt, roomAt} from '../homestead.mjs?v=harvest-18';

const DISH = {};
for(const [id, item] of Object.entries(ITEMS)) if(item.buff && !DISH[item.buff]) DISH[item.buff] = id;
let row = null, sig = '';

function ensure(){
  if(row?.isConnected) return true;
  const host = document.getElementById('feature-hud');if(!host) return false;
  row = document.createElement('div');row.className = 'home-row';row.setAttribute('aria-live', 'polite');host.append(row);sig = '';
  return true;
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function paint(ctx){
  const {world, me} = ctx;
  if(!ensure()) return;
  const p = typeof me === 'function' ? me() : me;
  if(!world || !p || world.dungeon || world.arena){if(sig){row.innerHTML = '';sig = '';}return;}
  const buffs = buffList(world, p);
  const [i, j] = cellAt(p.x, p.z), room = world.tiles ? roomAt(world, i, j) : null;
  const next = buffs.map(b => `${b.id}:${Math.ceil(b.left)}`).join(',') + `|${room?.size || 0}|${p.sleep ? 1 : 0}`;
  if(next === sig) return;
  sig = next;
  const chips = buffs.map(b => `<div class="home-chip home-buff${b.left < 20 ? ' is-ending' : ''}" style="--buff:${b.color}" title="${esc(`${b.name}: ${b.text}`)}"><span class="home-icon">${ctx.icon?.(DISH[b.id]) || ''}</span><span class="home-text"><b>${esc(b.name)}</b><small>${clock(b.left)}</small></span></div>`);
  if(room) chips.push(`<div class="home-chip home-room${p.sleep ? ' is-asleep' : ''}" title="A closed room: sleep in a bed here to skip the night"><span class="home-glyph" aria-hidden="true">${p.sleep ? 'z' : '⌂'}</span><span class="home-text"><b>${p.sleep ? 'Asleep' : 'Room'}</b><small>${room.size} tiles</small></span></div>`);
  row.innerHTML = chips.join('');
}
