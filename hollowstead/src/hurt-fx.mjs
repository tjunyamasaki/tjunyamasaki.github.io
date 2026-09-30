// Screen feedback for the local wanderer's health (both renderers; DOM overlay #hurt-fx, styles in
// styles/hurt.css). A red flash from the screen edges when you take a hit, stronger for a bigger bite of
// your health, and a pulsing red vignette while you are low or downed that beats faster the closer you are
// to falling. Health is read every frame, so it works for host, solo and guests alike.

export const LOW_HEALTH = 0.35;      // fraction of max health where the danger vignette begins
const FLASH_DECAY = 2.6;             // flash opacity lost per second

/** Flash strength for losing `amount` of `maxHp`: even a scratch shows, a heavy blow fills the edges. */
export function hurtFlash(amount, maxHp){
  if(!(amount > 0) || !(maxHp > 0)) return 0;
  return Math.min(1, .42 + amount / maxHp * 2.4);
}

/** Danger 0..1: nothing above LOW_HEALTH, rising to 1 at zero health; downed is full danger, a ghost none. */
export function dangerLevel(p, maxHp){
  if(!p || p.ghost) return 0;
  if(p.down) return 1;
  const frac = maxHp > 0 ? Math.max(0, p.hp) / maxHp : 1;
  if(frac >= LOW_HEALTH) return 0;
  return .35 + .65 * (1 - frac / LOW_HEALTH);
}

/** A heartbeat: two quick thumps per beat, faster with danger. Returns 0..1. */
export function heartbeat(clock, danger){
  const rate = .9 + danger * 1.1;                      // beats per second
  const t = (clock * rate) % 1;
  const thump = (at, width) => Math.max(0, 1 - Math.abs(t - at) / width);
  return Math.max(thump(.1, .13), thump(.36, .13) * .7);
}

/**
 * Wire the overlay. `update(p, maxHp, dt)` once per frame with the local wanderer (or null when not playing).
 * With `reduceMotion` the danger vignette holds steady instead of beating.
 */
export function createHurtFx(root, {reduceMotion = false} = {}){
  const flashEl = root?.querySelector('.hurt-flash'), dangerEl = root?.querySelector('.hurt-danger');
  let flash = 0, last = null, clock = 0, shownFlash = -1, shownDanger = -1;
  function paint(el, value, shown){
    const v = Math.round(value * 100) / 100;
    if(el && v !== shown) el.style.opacity = String(v);
    return v;
  }
  return {
    update(p, maxHp, dt = .016){
      clock += dt;
      if(!p){last = null; flash = 0;}
      else{
        const id = p.id;
        if(last && last.id === id && !p.ghost && p.hp < last.hp - .01) flash = Math.max(flash, hurtFlash(last.hp - p.hp, maxHp));
        last = {id, hp: p.hp};
      }
      flash = Math.max(0, flash - dt * FLASH_DECAY);
      const danger = p ? dangerLevel(p, maxHp) : 0;
      const beat = reduceMotion ? .5 : heartbeat(clock, danger);
      shownFlash = paint(flashEl, flash, shownFlash);
      shownDanger = paint(dangerEl, danger ? Math.min(1, danger * (.7 + .45 * beat)) : 0, shownDanger);
      return {flash, danger};
    },
    reset(){flash = 0; last = null;},
  };
}
