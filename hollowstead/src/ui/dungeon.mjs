// Dungeon objective badge (dungeon/run.mjs dungeonStatus): what the party should do next on this
// floor, how much of it is cleared, the shrine's blessing, and the descent filling while the party
// gathers at the stairs. Sits under the vitals like the region badge (which never shows down here).
import {DUNGEON, dungeonStatus, BLESSINGS} from '../dungeon/run.mjs?v=harvest-18';

let root = null, glyph = null, title = null, detail = null, bar = null, fill = null, signature = '';

function el(tag, className, parent){const node = document.createElement(tag); if(className) node.className = className; parent?.appendChild(node); return node;}
function place(){
  if(!root) return;
  const rect = document.querySelector('#game .vitals')?.getBoundingClientRect();
  if(!rect || !(rect.height > 0)) return;
  root.style.setProperty('--dungeon-top', `${Math.round(rect.bottom + 7)}px`);
  root.style.setProperty('--dungeon-left', `${Math.round(rect.left)}px`);
}

export function bind(){
  const hud = document.getElementById('feature-hud');
  if(!hud || root) return;
  root = el('div', 'dungeon-badge', hud); root.id = 'dungeon-badge';
  root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  glyph = el('span', 'dungeon-badge__glyph', root); glyph.setAttribute('aria-hidden', 'true');
  const text = el('span', 'dungeon-badge__text', root);
  title = el('b', '', text); detail = el('small', '', text);
  bar = el('i', 'dungeon-badge__bar', root); fill = el('em', '', bar);
  addEventListener('resize', place);
}

/** Pure: the badge's content for a status (tests read this). */
export function badgeView(status, me){
  if(!status) return null;
  const near = (spot, r) => spot && me && Math.hypot(me.x - spot.x, me.z - spot.z) < r;
  const shrine = status.shrine;
  if(shrine && !shrine.used && near(shrine, DUNGEON.shrineRadius + 3))
    return {glyph: '✧', tone: 'shrine', title: 'A shrine', detail: 'Stand by the stone to hear it', progress: shrine.charge};
  if(status.phase === 'open' || status.phase === 'complete')
    return {glyph: '▼', tone: 'open', title: status.objective, detail: status.portal > 0 ? 'Descending…' : `Floor ${status.depth} cleared of its Warden`, progress: status.portal};
  const blessing = shrine?.blessing ? ` · ${BLESSINGS[shrine.blessing]?.name.replace('Shrine of ', '') || ''}` : '';
  return {glyph: status.warden ? '☠' : '✦', tone: status.warden ? 'warden' : 'explore', title: status.objective, detail: `Floor ${status.depth} · ${status.cleared} of ${status.total} chambers${blessing}`, progress: status.warden ? status.warden.hp/Math.max(1, status.warden.maxHp) : null};
}

export function paint(ctx){
  if(!root) return;
  const world = ctx.world, view = world?.dungeon && ctx.me && !ctx.me.ghost ? badgeView(dungeonStatus(world), ctx.me) : null;
  const sig = view ? `${view.tone}|${view.title}|${view.detail}|${view.progress == null ? '' : Math.round(view.progress*50)}` : '';
  if(sig === signature) return;
  signature = sig;
  root.classList.toggle('is-shown', !!view);
  if(!view) return;
  place();
  root.dataset.tone = view.tone;
  glyph.textContent = view.glyph; title.textContent = view.title; detail.textContent = view.detail;
  bar.hidden = view.progress == null;
  if(view.progress != null) fill.style.width = `${Math.round(Math.max(0, Math.min(1, view.progress))*100)}%`;
}
