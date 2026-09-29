// Floating world text (both renderers): damage numbers that pop, arc and fall, and the plain rising
// labels for loot, crafting, level-ups and the rest. DOM elements in #world-labels, positioned each
// frame from world coordinates; styles in styles/floaters.css.
//
// A damage number is sized by how hard the blow was (log scale), coloured by tier, and flung on a small
// arc to one side so a flurry of hits fans out instead of stacking. Critical hits are bigger, gold, and
// burst. Blows landed by other wanderers show smaller and dimmer, so your own read first.
export const MAX_FLOATERS = 48;
const PLAIN_LIFE = 1.8;

function mount(el){
  const layer = typeof document !== 'undefined' && document.getElementById('world-labels');
  if(layer) layer.append(el);
  return !!layer;
}
function trim(list){
  while(list.length > MAX_FLOATERS){const old = list.shift(); old.el.remove();}
}

/** A plain rising label (loot, craft, level up...). */
export function spawnFloater(list, text, x, z, color = '#f8dfb3', opts = {}){
  if(!text || typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.className = opts.className || 'world-label';
  el.textContent = text;
  el.style.color = color;
  if(!mount(el)) return null;
  const f = {el, x, z, life: 0, ttl: PLAIN_LIFE, alwaysVisible: !!opts.alwaysVisible};
  list.push(f); trim(list);
  return f;
}

/** Tier of a blow by its size: 0 chip, 1 solid, 2 heavy, 3 huge. */
export function damageTier(amount){
  return amount >= 150 ? 3 : amount >= 60 ? 2 : amount >= 20 ? 1 : 0;
}
/** Font size in px for a blow: grows with the log of the damage, crits a third bigger. */
export function damageSize(amount, crit = false){
  const base = 17+Math.min(21, Math.log2(1+Math.max(0, amount)/6)*4.6);
  return Math.round(base*(crit ? 1.32 : 1));
}

/**
 * A damage (or hurt) event as a popping number. `kind`: 'hit' for blows on creatures, 'hurt' for a
 * wanderer taking damage.
 */
export function damageFloater(list, ev, localId = null, kind = 'hit'){
  if(typeof document === 'undefined') return null;
  const raw = String(ev.text ?? '').replace(/[^0-9.]/g, '');
  const amount = Number.parseFloat(raw);
  if(!Number.isFinite(amount) || amount <= 0) return null;
  const crit = !!ev.crit && kind === 'hit';
  const other = kind === 'hit' && ev.by && localId && ev.by !== localId;
  const tier = damageTier(amount);
  const el = document.createElement('div');
  el.className = `world-label dmg dmg-${kind} dmg-t${tier}${crit ? ' dmg-crit' : ''}${other ? ' dmg-other' : ''}`;
  el.style.setProperty('--size', `${damageSize(amount, crit)*(other ? .72 : 1)}px`);
  const pop = document.createElement('span');
  pop.className = 'dmg-pop';
  const num = document.createElement('b');
  num.textContent = kind === 'hurt' ? `−${Math.ceil(amount)}` : String(Math.ceil(amount));
  pop.append(num);
  if(crit){const tag = document.createElement('i'); tag.textContent = 'CRIT'; pop.append(tag);}
  el.append(pop);
  if(!mount(el)) return null;
  // A little random fling to one side; hurt numbers drop instead of rising.
  const side = Math.random() < .5 ? -1 : 1;
  const f = {
    el, x: ev.x, z: ev.z, life: 0, ttl: crit ? 1.25 : tier >= 2 ? 1.1 : .95, alwaysVisible: kind === 'hurt',
    arc: true, vx: side*(18+Math.random()*34)*(crit ? 1.3 : 1), vy: kind === 'hurt' ? -60 : -(150+tier*18+(crit ? 40 : 0)), gravity: kind === 'hurt' ? 150 : 330,
    ox: side*(4+Math.random()*10), oy: kind === 'hurt' ? -18 : -10-Math.random()*8,
  };
  list.push(f); trim(list);
  return f;
}

/**
 * Advance and place every floater. `point(x, z, y)` projects to screen pixels; `reveal(x, z)` is the
 * fog-of-darkness visibility (0..1). Returns the list of those still alive.
 */
export function stepFloaters(list, dt, point, reveal){
  return list.filter(f => {
    f.life += dt;
    if(f.life > f.ttl){f.el.remove(); return false;}
    let s, alpha;
    if(f.arc){
      s = point(f.x, f.z, 1.15);
      const t = f.life;
      const px = s.x+f.ox+f.vx*t, py = s.y+f.oy+f.vy*t+.5*f.gravity*t*t;
      f.el.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%)`;
      alpha = Math.min(1, (f.ttl-f.life)/(f.ttl*.35));
    }else{
      s = point(f.x, f.z, 1+f.life*.7);
      f.el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;
      alpha = Math.min(1, (f.ttl-f.life)*2);
    }
    f.el.style.opacity = String(alpha*(f.alwaysVisible ? 1 : reveal(f.x, f.z)));
    return true;
  });
}
