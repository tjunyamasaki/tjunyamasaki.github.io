import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {NODES, RULES} from '../src/content.mjs';
import {RARE_FINDS, RHYTHM, beatOffset, beatPeriod, harvestLoot, harvestScore, nearestBeat, strikeWindow, yieldShare} from '../src/rhythm.mjs';
import {setupArena} from '../src/arena.mjs';
import {createActionSession} from '../src/transactions.mjs';

const T = RULES.tick;
function camp(seed = 402){
  const w = new World(seed); const p = w.addPlayer('host', 'Jun'); w.start();
  w.ambient = false; w.enemies = []; p.regions = ['meadow', 'woods', 'graveyard', 'mire', 'crags', 'barrow'];
  return {w, p};
}
function floorQty(w, itemId){return w.drops.filter(drop => drop.stack.itemId === itemId).reduce((total, drop) => total+drop.stack.quantity, 0);}
function spot(w, type){
  const node = w.nodes.find(n => n.type === type && !(n.ready > w.time));
  assert.ok(node, `a ${type} to work`);
  return node;
}
function stand(p, node, side = 1){p.x = node.x+(side-1)*.6; p.z = node.z+1;}
function strike(w, p, node, beat, offset){p.cooldown = 0; return w.action(p.id, {type: 'strike', nodeId: node.id, beat, offset});}
/**
 * Work `node` with `rows` ({p, play}) until it is done or `limit` seconds pass. A wanderer whose
 * `play` is 'clean' strikes on the tick nearest each beat; 'none' just holds on.
 */
function work(w, node, rows, limit = 8){
  const sent = new Map();
  const start = w.time;
  while(!(node.ready > w.time) && w.time-start < limit){
    for(const row of rows) w.input(row.p.id, {x: 0, z: 0, act: true, attack: false, target: node.id});
    w.tick(T);
    for(const row of rows){
      const beat = row.p.beat;
      if(row.play !== 'clean' || !beat || beat.node !== node.id) continue;
      const k = nearestBeat(beat, w.time), offset = beatOffset(beat, k, w.time);
      if(k < 0 || k <= (sent.get(row.p.id) ?? -1) || Math.abs(offset) > T*500+1e-6) continue;
      sent.set(row.p.id, k);
      assert.equal(strike(w, row.p, node, k, Math.round(offset)).ok, true);
    }
  }
  assert.ok(node.ready > w.time, 'the node finished');
  return w.time-start;
}
/** A wanderer mid-swing on `node`, with a beat clock; returns that clock. */
function begin(w, p, node, seconds = .1){
  for(let t = 0; t < seconds-1e-9; t += T){w.input(p.id, {x: 0, z: 0, act: true, attack: false, target: node.id}); w.tick(T);}
  assert.ok(p.beat && p.beat.node === node.id, 'a beat started');
  return p.beat;
}
/** Hold on until world time reaches `time` (keeps the swing going). */
function until(w, p, node, time){while(w.time < time-1e-9){w.input(p.id, {x: 0, z: 0, act: true, attack: false, target: node.id}); w.tick(T);}}

// ------------------------------------------------------------------ beats
test('chopped and mined nodes beat; hand-gathered ones stay beat-free', () => {
  for(const type of ['tree', 'rock', 'ore', 'grave', 'shardrock', 'bones']){
    const period = beatPeriod(type);
    assert.ok(period >= .7 && period <= .9, `${type} beats every ${period}s`);
  }
  assert.ok(beatPeriod('rock') > beatPeriod('tree'), 'stone swings slower than wood');
  for(const type of ['grass', 'berry', 'pumpkin', 'glowsprout', 'gravewisp', 'crate', 'ironchest']) assert.equal(beatPeriod(type), 0);
  const {w, p} = camp();
  const grass = spot(w, 'grass'); stand(p, grass);
  w.input(p.id, {x: 0, z: 0, act: true, attack: false, target: grass.id}); w.tick(T);
  assert.equal(p.beat ?? null, null);
  // Hand loot is untouched by the rhythm.
  assert.deepEqual(harvestLoot(w, grass, {contributors: new Map()}, NODES.grass.loot), NODES.grass.loot);
});

test('an abandoned chop leaves no pulse behind once the wanderer gathers grass', () => {
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  begin(w, p, tree, .3);
  const grass = spot(w, 'grass'); stand(p, grass);
  w.input(p.id, {x: 0, z: 0, act: true, attack: false, target: grass.id}); w.tick(T);
  assert.equal(p.beat, null);
});

// ------------------------------------------------------------------ yields
test('plain auto-harvest gives about 60% and never less than one of the main resource', () => {
  assert.equal(yieldShare(0), RHYTHM.auto);
  assert.equal(yieldShare(1), RHYTHM.clean);
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  work(w, tree, [{p, play: 'none'}]);
  assert.equal(floorQty(w, 'wood'), 3); // 5 today
  assert.equal(floorQty(w, 'fiber'), 1);
  // Even a one-resource node gives at least one on a lazy harvest.
  const lazy = {contributors: new Map([[p.id, {beat: {node: 'x', at: w.time-3, period: .8, window: .12, last: -1, clean: 0, streak: 0}}]])};
  assert.equal(harvestLoot(w, {id: 'x', type: 'bones', x: 0, z: 0}, lazy, {bone: 1}).bone, 1);
});

test('an all-clean harvest clearly beats the old yield, and clean strikes speed the channel', () => {
  const lazy = camp();
  const slow = work(lazy.w, (() => {const n = spot(lazy.w, 'tree'); stand(lazy.p, n); return n;})(), [{p: lazy.p, play: 'none'}]);
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  const fast = work(w, tree, [{p, play: 'clean'}]);
  assert.ok(fast < slow-.5, `clean strikes finish sooner (${fast.toFixed(2)}s vs ${slow.toFixed(2)}s)`);
  assert.equal(floorQty(w, 'wood'), 8); // 150% of the old 5
  assert.equal(floorQty(w, 'fiber'), 2);
  assert.ok(w.events.some(ev => ev.type === 'strike' && ev.kind === 'clean' && ev.player === p.id));
  assert.ok(w.events.some(ev => ev.type === 'strike' && ev.kind === 'perfect'));
  assert.equal(p.beat, null, 'the pulse ends with the harvest');
});

test('mixed play lands between the two, and mining keeps its stone share', () => {
  const {w, p} = camp();
  w.grantEquipped(p, 'pick', 70);
  const rock = spot(w, 'rock'); stand(p, rock);
  const beat = begin(w, p, rock);
  // First beat clean, second missed late, third never struck.
  until(w, p, rock, beat.at);
  assert.equal(strike(w, p, rock, 0, Math.round(beatOffset(beat, 0, w.time))).ok, true);
  until(w, p, rock, beat.at+beat.period+.25);
  assert.equal(strike(w, p, rock, 1, 250).ok, true);
  assert.equal(beat.clean, 1);
  assert.equal(beat.streak, 0);
  work(w, rock, [{p, play: 'none'}]);
  const stone = floorQty(w, 'stone');
  assert.ok(stone > 3 && stone < 8, `stone ${stone}`);
});

test('a perfect streak sometimes turns up a rare find that fits the node', () => {
  const {w, p} = camp();
  let finds = 0;
  const seen = new Set();
  for(let i = 0; i < 80; i++){
    w.time = 100+i*.37;
    const node = {id: 'n'+i, type: i%2 ? 'rock' : 'grave', x: 0, z: 0};
    const perfect = {contributors: new Map([[p.id, {beat: {node: node.id, at: w.time-2.2, period: .85, window: .12, last: 2, clean: 3, streak: 3}}]])};
    const out = harvestLoot(w, node, perfect, NODES[node.type].loot);
    const fits = RARE_FINDS[node.type].map(([id]) => id);
    for(const itemId of Object.keys(out)) if(!(itemId in NODES[node.type].loot)){assert.ok(fits.includes(itemId), `${itemId} fits a ${node.type}`); seen.add(itemId);}
    if(w.events.some(ev => ev.type === 'strike' && ev.kind === 'find' && ev.at === w.time)) finds++;
    // A single miss spoils the streak: no find.
    const flawed = {contributors: new Map([[p.id, {beat: {node: node.id, at: w.time-2.2, period: .85, window: .12, last: 2, clean: 2, streak: 1}}]])};
    const before = w.events.filter(ev => ev.kind === 'find').length;
    harvestLoot(w, node, flawed, NODES[node.type].loot);
    assert.equal(w.events.filter(ev => ev.kind === 'find').length, before);
  }
  assert.ok(finds >= 8 && finds <= 45, `finds ${finds}/80`);
  assert.ok(seen.size >= 2);
});

// ------------------------------------------------------------------ strike validation
test('strikes are judged against the beat the client saw: early, late, double and stale', () => {
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  const beat = begin(w, p, tree);
  assert.ok(Math.abs(beat.period-beatPeriod('tree')) < 1e-9);
  // A beat not yet due (claimed time in the future) is refused.
  assert.equal(strike(w, p, tree, 2, 0).ok, false);
  until(w, p, tree, beat.at-.05);
  // Early by 180 ms: accepted, but not clean.
  assert.equal(strike(w, p, tree, 0, -180).ok, true);
  assert.equal(beat.clean, 0);
  assert.equal(beat.last, 0);
  // Once per beat: a second tap on beat 0 is refused, even a perfect one.
  assert.equal(strike(w, p, tree, 0, 0).ok, false);
  until(w, p, tree, beat.at+beat.period+.03);
  assert.equal(strike(w, p, tree, 1, 30).ok, true);
  assert.equal(beat.clean, 1);
  assert.equal(beat.streak, 1);
  // Offsets beyond half a beat are never the nearest beat: refused.
  assert.equal(strike(w, p, tree, 2, -Math.round(beat.period*600)).ok, false);
  // A stale beat, long gone on the host, is refused.
  until(w, p, tree, beat.at+beat.period*3.2);
  assert.equal(strike(w, p, tree, 2, 20).ok, false);
  // Late by 200 ms (the guest's link): still accepted, still judged as late.
  assert.equal(strike(w, p, tree, 3, 90).ok, true);
  assert.equal(beat.clean, 2);
  assert.equal(beat.streak, 1, 'a skipped beat restarts the streak');
  // Malformed claims, wrong nodes and wanderers not on the node are refused.
  for(const bad of [{beat: 4.5, offset: 0}, {beat: -1, offset: 0}, {beat: 4, offset: NaN}, {beat: 4, offset: '0'}]) assert.equal(w.action(p.id, {type: 'strike', nodeId: tree.id, ...bad}).ok, false);
  assert.equal(w.action(p.id, {type: 'strike', nodeId: 'nope', beat: 4, offset: 0}).ok, false);
  const other = w.addPlayer('guest', 'Ada');
  assert.equal(strike(w, other, tree, 4, 0).ok, false);
});

test('a guest link 200 ms behind still lands clean strikes', () => {
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  const beat = begin(w, p, tree);
  // The guest tapped exactly on beat 0 as it saw it; the claim reaches the host 0.4 s later.
  until(w, p, tree, beat.at+.4);
  assert.equal(strike(w, p, tree, 0, 0).ok, true);
  assert.equal(beat.clean, 1);
});

test('a guest sees its beat in snapshots and its strikes pass the host action session', () => {
  const {w, p} = camp();
  const guest = w.addPlayer('guest', 'Ada');
  const tree = spot(w, 'tree'); stand(guest, tree);
  const beat = begin(w, guest, tree);
  const seen = World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.deepEqual(seen.player(guest.id).beat, JSON.parse(JSON.stringify(beat)));
  assert.equal(seen.player(p.id).beat ?? null, null);
  until(w, guest, tree, beat.at+.02);
  const session = createActionSession({getWorld: () => w, actorId: guest.id});
  const reply = session.execute({type: 'strike', nodeId: tree.id, beat: 0, offset: 0, requestId: `${session.sessionId}:1`, worldId: w.networkId});
  assert.equal(reply.ok, true);
  assert.equal(beat.clean, 1);
});

test('spamming taps pays nothing: one judgement per beat', () => {
  const {w, p} = camp();
  const tree = spot(w, 'tree'); stand(p, tree);
  const beat = begin(w, p, tree);
  until(w, p, tree, beat.at-.2);
  let accepted = 0;
  for(let i = 0; i < 12; i++) if(strike(w, p, tree, 0, -200).ok) accepted++;
  assert.equal(accepted, 1);
  assert.equal(beat.clean, 0);
});

test('several wanderers on one node each keep their own beat', () => {
  const {w, p} = camp();
  const mate = w.addPlayer('guest', 'Ada');
  const tree = spot(w, 'tree'); stand(p, tree, 1); stand(mate, tree, 2);
  // The guest joins the swing a little later and gets a beat clock of their own.
  const a = begin(w, p, tree, .2);
  w.input(p.id, {x: 0, z: 0, act: true, attack: false, target: tree.id});
  const b = begin(w, mate, tree, T);
  assert.notEqual(a, b);
  assert.ok(b.at > a.at);
  work(w, tree, [{p, play: 'clean'}, {p: mate, play: 'clean'}]);
  assert.ok(a.clean >= 1 && b.clean >= 1);
  // Both played clean: the shared yield is the all-clean one.
  assert.equal(floorQty(w, 'wood'), 8);
  const cleanBy = new Set(w.events.filter(ev => ev.type === 'strike' && ev.kind === 'clean').map(ev => ev.player));
  assert.deepEqual([...cleanBy].sort(), [p.id, mate.id].sort());
});

test('one idle partner halves the bonus, not the base yield', () => {
  const {w, p} = camp();
  const mate = w.addPlayer('guest', 'Ada');
  const tree = spot(w, 'tree'); stand(p, tree, 1); stand(mate, tree, 2);
  work(w, tree, [{p, play: 'clean'}, {p: mate, play: 'none'}]);
  const wood = floorQty(w, 'wood');
  assert.ok(wood >= 4 && wood <= 7, `wood ${wood}`);
});

// ------------------------------------------------------------------ harvest charm
test('a harvest charm widens the window and adds one per clean strike', () => {
  const {w, p} = camp();
  const mate = w.addPlayer('guest', 'Ada');
  assert.equal(strikeWindow(p), RHYTHM.window);
  w.grantEquipped(p, 'harvestcharm');
  assert.equal(strikeWindow(p), RHYTHM.charmWindow);
  assert.equal(strikeWindow(mate), RHYTHM.window, 'only the wearer');
  const tree = spot(w, 'tree'); stand(p, tree);
  const beat = begin(w, p, tree);
  until(w, p, tree, beat.at+.16);
  assert.equal(strike(w, p, tree, 0, 160).ok, true);
  assert.equal(beat.clean, 1, '160 ms late is still clean with the charm');
  work(w, tree, [{p, play: 'clean'}]);
  assert.equal(floorQty(w, 'wood'), 8+Math.min(RHYTHM.charmCap, beat.clean));
  // Without the charm, 160 ms is a miss.
  const bare = camp();
  const pine = spot(bare.w, 'tree'); stand(bare.p, pine);
  const b2 = begin(bare.w, bare.p, pine);
  until(bare.w, bare.p, pine, b2.at+.16);
  assert.equal(strike(bare.w, bare.p, pine, 0, 160).ok, true);
  assert.equal(b2.clean, 0);
});

test('harvestScore counts beats that passed unstruck, but not one still in flight at the finish', () => {
  const {w, p} = camp();
  w.time = 50;
  const meta = {beat: {node: 'n', at: 47, period: 1, window: .12, last: -1, clean: 0, streak: 0}};
  // Beats at 47, 48, 49, 50: the one at 50 is inside the grace and was not struck.
  const score = harvestScore(w, {contributors: new Map([[p.id, meta]])});
  assert.equal(score.beats, 3);
  meta.beat.last = 3; meta.beat.clean = 4;
  assert.equal(harvestScore(w, {contributors: new Map([[p.id, meta]])}).quality, 1);
});

test('the arena has no harvest rhythm', () => {
  const w = new World(9); const p = w.addPlayer('host', 'Jun'); setupArena(w);
  assert.equal(w.action(p.id, {type: 'strike', nodeId: 'n1', beat: 0, offset: 0}).ok, false);
});
