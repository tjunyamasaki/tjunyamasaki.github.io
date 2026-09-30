// Harvest pulse ring and strike input (rhythm.mjs).
// While the local wanderer chops or mines, a pulse shrinks onto a ring at the node's foot; tapping as
// it lands is a clean strike. Taps come from the main action button (#context-0), E or Space, or a
// tap on the node itself. The client judges the tap against the beat it drew and tells the host
// {type:'strike', nodeId, beat, offset}; the host rechecks it (rhythm.mjs rhythmStrike).
// The ring lives in #world-labels (screen-space, above the world, under the HUD) and never takes input.

import {SAVE_KEYS} from '../serialization.mjs?v=harvest-18';
import {beatOffset, nearestBeat} from '../rhythm.mjs?v=harvest-18';

const HARVEST_ACTIONS = new Set(['chop', 'mine', 'gather']);
const FLASH_MS = 280;

let live = null;              // the latest HUD context (frame() runs every frame while playing)
let frameAt = 0;              // performance.now() of that frame
let clock = 0, seenTime = -1, seenAt = 0;
let ring = null, pulse = null, note = null, combo = null, button = null;
let shown = false, flashUntil = 0, flashKind = '', sig = '';
let struck = {key: '', last: -1};
let nodeCache = {world: null, id: '', node: null};
let audio = null;

// ------------------------------------------------------------------ clock
/**
 * A smooth estimate of the host's world time. The world clock moves in 20 Hz ticks (host) or in
 * snapshot steps (guests); the pulse and the judgement both read this estimate, so what the player
 * sees and what the client measures always agree. Guests run one link behind the host, which the
 * host allows for when it checks a claim.
 */
function syncClock(world, now){
  if(world.time !== seenTime){seenTime = world.time; seenAt = now;}
  const estimate = seenTime + Math.min(.25, (now - seenAt)/1000);
  const step = frameAt ? Math.min(.1, (now - frameAt)/1000) : 0;
  clock += step;
  const error = estimate - clock;
  if(Math.abs(error) > .3) clock = estimate; else clock += error*.2;
}
function clockNow(){return clock + Math.min(.1, Math.max(0, (performance.now() - frameAt)/1000));}

// ------------------------------------------------------------------ state
function beatNode(world, id){
  if(nodeCache.world !== world || nodeCache.id !== id) nodeCache = {world, id, node: world.nodes.find(n => n.id === id) || null};
  return nodeCache.node;
}
/** The local wanderer's live beat, or null. `input` also requires a frame in the last quarter second. */
function liveBeat(ctx, input = false){
  const world = ctx?.world, p = ctx?.me;
  const beat = p?.beat;
  if(!beat || !world || world.arena || p.down || p.ghost || ctx.sheet) return null;
  if(input && performance.now() - frameAt > 250) return null;
  if(p.action !== 'gather' || !(p.actionUntil > world.time - .15)) return null;
  const node = beatNode(world, beat.node);
  if(!node || node.ready > world.time) return null;
  return {world, p, beat, node};
}

// ------------------------------------------------------------------ sound
function soundOn(){try{return JSON.parse(localStorage.getItem(SAVE_KEYS.profile) || '{}').sound !== false;}catch{return true;}}
const CUES = {
  clean: [[988, 1480, .09, 'triangle', .075], [1976, 2400, .06, 'sine', .03]],
  miss: [[170, 95, .09, 'triangle', .05]],
  ward: [[520, 780, .2, 'sine', .06], [1040, 1560, .12, 'sine', .02]],
};
/** A short synthesized cue, played at once (world events reach the HUD a beat later). */
export function cue(kind){
  const parts = CUES[kind];
  if(!parts || !soundOn()) return;
  try{
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if(audio.state !== 'running') void audio.resume();
    const t = audio.currentTime;
    parts.forEach(([from, to, duration, wave, volume], i) => {
      const at = t + i*.025, osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = wave; osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + duration);
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(at); osc.stop(at + duration + .02);
    });
  }catch{}
}

// ------------------------------------------------------------------ strike
function flash(kind, text = ''){
  flashKind = kind; flashUntil = performance.now() + FLASH_MS;
  if(ring){ring.dataset.flash = kind; ring.classList.remove('is-flash'); void ring.offsetWidth; ring.classList.add('is-flash');}
  if(note) note.textContent = text;
}
/** A tap while harvesting. Returns true when a strike was sent. */
export function strike(){
  const ctx = live, state = liveBeat(ctx, true);
  if(!state) return false;
  const {beat} = state, now = clockNow();
  const index = nearestBeat(beat, now);
  if(index < 0) return false; // before the first beat: the tap that started the swing
  const key = `${beat.node}@${beat.at}`;
  if(struck.key !== key) struck = {key, last: -1};
  if(index <= beat.last || index <= struck.last) return false; // one strike per beat
  const offset = Math.round(beatOffset(beat, index, now));
  struck.last = index;
  const clean = Math.abs(offset) <= (beat.window || .12)*1000;
  flash(clean ? 'clean' : 'miss', clean ? '' : offset < 0 ? 'early' : 'late');
  cue(clean ? 'clean' : 'miss');
  void ctx.send({type: 'strike', nodeId: beat.node, beat: index, offset}, {quiet: true});
  return true;
}

// ------------------------------------------------------------------ HUD hooks
export function bind(ctx){
  const labels = document.getElementById('world-labels');
  if(labels && !document.getElementById('rhythm-ring')){
    ring = document.createElement('div');
    ring.id = 'rhythm-ring'; ring.className = 'rhythm-ring'; ring.hidden = true; ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<i class="rhythm-target"></i><i class="rhythm-pulse"></i><b class="rhythm-combo"></b><small class="rhythm-note"></small>';
    labels.append(ring);
    pulse = ring.querySelector('.rhythm-pulse'); combo = ring.querySelector('.rhythm-combo'); note = ring.querySelector('.rhythm-note');
  }
  button = document.getElementById('context-0');
  // The main action button: a press while the swing is under way is a strike (main.mjs still runs the hold).
  button?.addEventListener('pointerdown', () => {if(HARVEST_ACTIONS.has(button.dataset.action)) strike();});
  // E strikes and keeps the context hold; Space strikes instead of attacking while the pulse runs.
  window.addEventListener('keydown', event => {
    if(event.repeat || ['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) return;
    const key = event.key.toLowerCase();
    if(key !== 'e' && key !== ' ') return;
    if(!liveBeat(live, true)) return;
    if(key === ' '){event.preventDefault(); event.stopImmediatePropagation();}
    strike();
  }, true);
  // Tapping the node being worked.
  document.getElementById('world')?.addEventListener('pointerdown', event => {
    const state = liveBeat(live, true);
    if(!state) return;
    const picked = live.renderer?.pick?.(event.clientX, event.clientY, state.world);
    if(picked && picked.id === state.node.id) strike();
  });
}

export function paint(ctx){live = ctx;}

function hide(){
  if(shown){shown = false; if(ring) ring.hidden = true; button?.classList.remove('rhythm-live'); sig = '';}
}

export function frame(ctx, dt){
  live = ctx;
  const now = performance.now();
  if(ctx?.world) syncClock(ctx.world, now);
  frameAt = now;
  const state = liveBeat(ctx);
  if(!state || !ring || !ctx.renderer?.screenPoint){hide(); return;}
  const {beat, node} = state;
  if(!shown){shown = true; ring.hidden = false; button?.classList.add('rhythm-live');}
  // A ground ellipse at the node's foot, sized from the camera so it follows zoom and tilt.
  const r = ctx.renderer, center = r.screenPoint(node.x, node.z, .05), side = r.screenPoint(node.x + .9, node.z, .05), front = r.screenPoint(node.x, node.z + .9, .05);
  const rx = Math.max(20, Math.min(46, Math.abs(side.x - center.x))), ry = Math.max(.45, Math.min(.9, Math.abs(front.y - center.y)/Math.max(1, Math.abs(side.x - center.x))))*rx;
  // The pulse for the next beat still to come (it holds on the ring through the clean window).
  const t = clockNow(), period = beat.period, win = beat.window || .12;
  const next = Math.max(0, Math.ceil((t - beat.at - win)/period));
  const until = beat.at + next*period - t, u = Math.max(0, until/period);
  const done = next <= beat.last || next <= (struck.key === `${beat.node}@${beat.at}` ? struck.last : -1);
  const onBeat = Math.abs(until) <= win;
  ring.style.transform = `translate(${center.x.toFixed(1)}px,${center.y.toFixed(1)}px)`;
  ring.style.setProperty('--rx', `${rx.toFixed(1)}px`);
  ring.style.setProperty('--ry', `${ry.toFixed(1)}px`);
  pulse.style.transform = `scale(${(1 + 1.5*u).toFixed(3)})`;
  pulse.style.opacity = done ? '0' : (.3 + .7*(1 - u)).toFixed(2);
  ring.classList.toggle('is-now', onBeat && !done);
  ring.classList.toggle('is-heavy', period >= .85);
  button?.style.setProperty('--beat', (1 - u).toFixed(3));
  if(flashUntil && now > flashUntil){flashUntil = 0; ring.classList.remove('is-flash'); if(note) note.textContent = '';}
  const label = beat.streak > 1 ? `×${beat.streak}` : '';
  if(label !== sig){sig = label; combo.textContent = label;}
}
