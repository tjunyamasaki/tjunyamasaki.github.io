// Harvest rhythm: while chopping or mining, a pulse beats; a strike on the beat is a clean strike.
// Clean strikes raise the yield and may turn up rare finds; plain auto-harvest yields less.
// Pure simulation: import only content/progression/contracts/inventory. Never engine.mjs or the DOM.
//
// Each wanderer working a rhythm node gets their own beat clock, kept on the host in
// work.contributors (meta.beat) and mirrored on the wanderer (p.beat) so guests can draw the pulse:
//   p.beat = {node, at, period, window, last, clean, streak}
// Beat k lands at world time `at + k*period`. A client strikes with the beat it saw and the offset it
// measured ({type:'strike', nodeId, beat, offset(ms)}); the host checks the claim is plausible for
// its own clock (current or previous beat, never twice, never stale) and judges the offset.

import {NODES, label} from './content.mjs?v=harvest-18';
import {trinketOf} from './trinkets.mjs?v=harvest-18';

export const RHYTHM = Object.freeze({
  // Seconds per beat: trees swing steadily, stone is slower and heavier.
  beats: Object.freeze({tree: .75, bones: .8, rock: .85, grave: .85, ore: .9, shardrock: .9}),
  lead: .6,          // the first beat lands this share of a period after the swing starts
  window: .12,       // seconds either side of a beat that still count as clean
  charmWindow: .19,  // the same with a harvest charm worn
  lag: .8,           // oldest claim accepted, in seconds behind host time (50–200 ms links + snapshot spacing)
  ahead: .12,        // a claim may lead host time by this much (20 Hz tick quantisation)
  grace: .4,         // beats this close to the finish only count when struck (a guest's strike may still be in flight)
  auto: .6,          // yield share of a harvest with no clean strikes
  clean: 1.5,        // yield share of a harvest where every beat was clean
  speedup: .25,      // work-seconds (times the wanderer's gather rate) each clean strike adds
  rareMin: 2,        // a perfect streak needs at least this many beats (a tooled chop is only two or three)…
  rareChance: .3,    // …and then turns up a rare find this often
  charmCap: 3,       // harvest charm: +1 main resource per clean strike, at most this many per harvest
});

/** What a perfect streak may turn up, per node: [itemId, count]. */
export const RARE_FINDS = Object.freeze({
  tree: [['seed', 2], ['berry', 3], ['ember', 1]],
  rock: [['ore', 1], ['shard', 1]],
  ore: [['shard', 1], ['shard', 2]],
  grave: [['ember', 2], ['bone', 2]],
  shardrock: [['shard', 2], ['ember', 2]],
  bones: [['bone', 2], ['ember', 1]],
});

/** Seconds per beat for a node type, or 0 when it is gathered without a rhythm (grass, berries, caches…). */
export function beatPeriod(type){return RHYTHM.beats[type] || 0;}

/** The clean-strike window (seconds either side of the beat) for this wanderer. */
export function strikeWindow(p){return trinketOf(p) === 'harvestcharm' ? RHYTHM.charmWindow : RHYTHM.window;}

/** Index of the beat nearest to `time` (may be negative before the first beat). */
export function nearestBeat(beat, time){return Math.round((time - beat.at)/beat.period);}

/** Milliseconds from beat `index` to `time` (negative: early). */
export function beatOffset(beat, index, time){return (time - (beat.at + index*beat.period))*1000;}

/**
 * Called by World.stepHarvest every step: a wanderer who has just started on a rhythm node gets a
 * beat clock of their own. Several wanderers on one node each keep their own beat.
 */
export function rhythmStep(world, node, work){
  const period = beatPeriod(node?.type);
  if(!work?.contributors?.size) return;
  if(!period){
    // Hand-gathering (grass, berries…) has no beat: drop a pulse left over from an abandoned chop.
    for(const id of work.contributors.keys()){const p = world.player(id); if(p?.beat) p.beat = null;}
    return;
  }
  for(const [id, meta] of work.contributors){
    if(meta.beat) continue;
    const p = world.player(id);
    if(!p) continue;
    const start = Number.isFinite(meta.startedAt) ? meta.startedAt : world.time;
    meta.beat = {node: node.id, at: start + period*RHYTHM.lead, period, window: strikeWindow(p), last: -1, clean: 0, streak: 0};
    p.beat = meta.beat;
  }
}

function gatherRateOf(world, p, type){
  const def = NODES[type];
  if(!def) return 0;
  if(def.tool && world.hasTool(p, def.tool)) return def.toolRate || 0;
  return def.required ? 0 : def.handRate || 0;
}

/** World.action(id, {type:'strike', nodeId, beat, offset}). */
export function rhythmStrike(world, p, cmd){
  if(world.arena) return {ok: false, code: 'unavailable'};
  const index = cmd?.beat, offset = cmd?.offset;
  if(typeof cmd?.nodeId !== 'string' || !Number.isInteger(index) || index < 0 || typeof offset !== 'number' || !Number.isFinite(offset)) return {ok: false, code: 'rejected'};
  const work = world.harvestWork?.get(cmd.nodeId), meta = work?.contributors?.get(p.id), beat = meta?.beat;
  // Not (or no longer) working that node: the harvest finished, or never began.
  if(!beat) return {ok: false, code: 'rejected'};
  // One strike per beat, in order.
  if(index <= beat.last) return {ok: false, code: 'rejected'};
  // The client names the beat nearest its tap, so the offset can never exceed half a beat.
  if(Math.abs(offset) > beat.period*500) return {ok: false, code: 'rejected'};
  // The tap must fit the host's own clock: not in the future, not stale, current or previous beat.
  const claimed = beat.at + index*beat.period + offset/1000;
  if(claimed > world.time + RHYTHM.ahead || claimed < world.time - RHYTHM.lag) return {ok: false, code: 'rejected'};
  const current = nearestBeat(beat, world.time);
  if(index > current + 1 || index < current - 1) return {ok: false, code: 'rejected'};
  const skipped = index > beat.last + 1;
  beat.last = index;
  beat.window = strikeWindow(p);
  const node = world.nodes.find(n => n.id === cmd.nodeId);
  if(Math.abs(offset) > beat.window*1000){
    beat.streak = 0;
    return {ok: true, code: 'ok'};
  }
  beat.clean++;
  beat.streak = skipped ? 1 : beat.streak + 1;
  // A clean strike bites deeper: the channel runs a little faster.
  const def = NODES[node?.type];
  if(def) work.elapsed = Math.min(def.workSeconds - 1e-6, work.elapsed + RHYTHM.speedup*gatherRateOf(world, p, node.type));
  if(node) world.event('strike', node.x, node.z, beat.streak > 1 ? `Clean ×${beat.streak}` : 'Clean!', {player: p.id, kind: 'clean', streak: beat.streak});
  return {ok: true, code: 'ok'};
}

/** Deterministic 0..1 from the seed, the node and the moment: no shared RNG stream is disturbed. */
function chance(world, node, salt){
  const text = `${world.seed}:${node.id}:${Math.floor(world.time*20)}:${salt}`;
  let h = 2166136261;
  for(let i = 0; i < text.length; i++){h ^= text.charCodeAt(i); h = Math.imul(h, 16777619);}
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0)/4294967296;
}

/** How a finished harvest went: clean strikes and counted beats, summed over every wanderer on it. */
export function harvestScore(world, work){
  let clean = 0, beats = 0;
  const rows = [];
  for(const [id, meta] of work?.contributors || []){
    const beat = meta.beat;
    if(!beat) continue;
    // Beats that landed while this wanderer worked. The last moments before the finish count only
    // if struck, so a guest whose strike is still in flight is not marked down for it.
    const due = Math.max(0, Math.floor((world.time - RHYTHM.grace - beat.at)/beat.period) + 1);
    const count = Math.max(due, beat.last + 1);
    clean += beat.clean; beats += count;
    rows.push({id, clean: beat.clean, beats: count});
  }
  return {clean, beats, quality: beats > 0 ? Math.min(1, clean/beats) : 0, rows};
}

/** Yield share for a harvest quality 0 (all auto) .. 1 (every beat clean). */
export function yieldShare(quality){return RHYTHM.auto + (RHYTHM.clean - RHYTHM.auto)*Math.max(0, Math.min(1, quality));}

/**
 * Loot for a finished (non-cache) harvest. `loot` is NODES[type].loot ({itemId:count});
 * returns the {itemId:count} to hand out. Nodes without a beat keep their loot unchanged.
 */
export function harvestLoot(world, node, work, loot){
  if(!beatPeriod(node?.type) || !loot) return loot;
  const score = harvestScore(world, work);
  const share = yieldShare(score.quality);
  const out = {};
  let main = null;
  for(const [itemId, count] of Object.entries(loot)){
    // Every harvest still gives at least one of the main resource.
    const amount = main ? Math.round(count*share) : Math.max(1, Math.round(count*share));
    if(!main) main = itemId;
    if(amount > 0) out[itemId] = amount;
  }
  let salt = 0;
  for(const row of score.rows){
    const p = world.player(row.id);
    if(p && trinketOf(p) === 'harvestcharm' && main) out[main] += Math.min(RHYTHM.charmCap, row.clean);
    // A perfect streak may turn up something rare that fits the node.
    const finds = RARE_FINDS[node.type];
    if(finds && row.beats >= RHYTHM.rareMin && row.clean >= row.beats && chance(world, node, salt++) < RHYTHM.rareChance){
      const [itemId, count] = finds[Math.floor(chance(world, node, 'pick'+salt)*finds.length)];
      out[itemId] = (out[itemId] || 0) + count;
      world.event('strike', node.x, node.z, `Rare find · ${label(itemId)}`, {player: row.id, kind: 'find', itemId});
    }
    if(p?.beat && p.beat === work.contributors.get(row.id)?.beat) p.beat = null;
  }
  // Drawn a little in front of the node so it does not sit on the last 'Clean ×n'.
  if(score.beats >= 2 && score.quality >= 1) world.event('strike', node.x, node.z + .8, 'Perfect harvest!', {kind: 'perfect', player: score.rows[0]?.id});
  return out;
}
