// Planning experiment, NOT the production simulation or its test oracle.
// Run: node balance-lab.mjs
// Deterministic one-second steps. No offline cap: these are visible-session policies.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export const balance = {
  berryIntervalsSec: [15, 12, 10, 8],
  berryCaps: [12, 18, 24],
  costs: { shrub: [15, 60, 180], pantry: [30, 100], bloom: [20, 70, 220, 650, 1800], beds: [40, 140, 400, 1000] },
  milestones: [
    { count: 2, feeds: 6, lifetimeGlow: 12 },
    { count: 3, feeds: 24, lifetimeGlow: 90 },
    { count: 4, feeds: 60, lifetimeGlow: 300 },
    { count: 5, feeds: 120, lifetimeGlow: 900 },
    { count: 6, feeds: 200, lifetimeGlow: 2200 },
  ],
};

function run(name, durationSec, visitEverySec = 0, visitLengthSec = 0) {
  const s = { t: 0, glowMicro: 0, lifetimeMicro: 0, berries: 6, nextBerry: 15,
    levels: { shrub: 0, pantry: 0, bloom: 0, beds: 0 },
    slimes: [{ boostUntil: 0, feeds: 0 }], feeds: 0, lastFeed: -4 };
  const log = [];
  const record = (event) => log.push({ atSec: s.t, event, glow: s.glowMicro / 1e6, totalFeeds: s.feeds });
  const active = () => name === 'attentive' || (name === 'short-visits' && s.t % visitEverySec < visitLengthSec);
  function buy(id) {
    const cost = balance.costs[id][s.levels[id]];
    if (cost === undefined || s.glowMicro < cost * 1e6) return false;
    const wasFull = s.berries === balance.berryCaps[s.levels.pantry];
    s.glowMicro -= cost * 1e6;
    s.levels[id]++;
    if (id === 'shrub') s.nextBerry = wasFull ? null : s.t + balance.berryIntervalsSec[s.levels.shrub];
    if (id === 'pantry' && wasFull) s.nextBerry = s.t + balance.berryIntervalsSec[s.levels.shrub];
    record(`${id} level ${s.levels[id]}`);
    return true;
  }
  for (let t = 0; t <= durationSec; t++) {
    s.t = t;
    if (t > 0) {
      const rate = s.slimes.reduce((a, x) => a + 100_000 * (1 + 0.25 * s.levels.bloom) * (x.boostUntil > t - 1 ? 2 : 1), 0);
      s.glowMicro += rate;
      s.lifetimeMicro += rate;
      if (s.nextBerry !== null && t >= s.nextBerry) {
        s.berries = Math.min(balance.berryCaps[s.levels.pantry], s.berries + 1);
        s.nextBerry = s.berries === balance.berryCaps[s.levels.pantry] ? null : t + balance.berryIntervalsSec[s.levels.shrub];
      }
    }
    if (!active()) continue;
    if (s.berries > 0 && t - s.lastFeed >= 4) {
      // Lowest remaining boost; tie-break by list order. Active input once / 4 sec at most.
      const x = [...s.slimes].sort((a, b) => a.boostUntil - b.boostUntil)[0];
      const wasFull = s.berries === balance.berryCaps[s.levels.pantry];
      s.berries--; s.feeds++; x.feeds++; s.lastFeed = t;
      x.boostUntil = Math.min(t + 300, Math.max(t, x.boostUntil) + 120);
      if (wasFull) s.nextBerry = t + balance.berryIntervalsSec[s.levels.shrub];
    }
    const next = balance.milestones[s.slimes.length - 1];
    if (next && s.feeds >= next.feeds && s.lifetimeMicro >= next.lifetimeGlow * 1e6 && s.slimes.length < 2 + s.levels.beds) {
      s.slimes.push({ boostUntil: 0, feeds: 0 }); record(`slime ${s.slimes.length} welcomed`);
    }
    // Greedy demonstration policy: buy a needed bed as soon as feed gate is met;
    // otherwise first affordable shrub, bloom, or pantry. One purchase per second.
    const afterWelcome = balance.milestones[s.slimes.length - 1];
    const needsBed = afterWelcome && s.feeds >= afterWelcome.feeds && s.slimes.length >= 2 + s.levels.beds;
    if (needsBed && s.levels.beds < 4) buy('beds');
    else if (!buy('shrub') && !buy('bloom')) buy('pantry');
    assert(s.berries >= 0 && s.berries <= balance.berryCaps[s.levels.pantry]);
    assert(Number.isSafeInteger(s.glowMicro) && s.glowMicro >= 0);
    assert(s.slimes.length <= 6 && s.slimes.length <= 2 + s.levels.beds);
  }
  return { policy: name, durationSec, visitEverySec, visitLengthSec,
    summary: { slimes: s.slimes.length, feeds: s.feeds, glow: s.glowMicro / 1e6,
      lifetimeGlow: s.lifetimeMicro / 1e6, berries: s.berries, upgrades: s.levels }, log };
}

const results = [run('attentive', 7200), run('short-visits', 86400, 1800, 60), run('never-interacts', 28800)];
const report = { kind: 'design-estimate', timestepSec: 1,
  caveats: ['Not a real playtest.', 'Short-visits stays logically open; it models behavior, not browser suspension.', 'Visits every 30 minutes last 60 seconds.', 'No human reaction or animation delay.'],
  balance, results };
writeFileSync(new URL('./balance-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
for (const r of results) console.log(JSON.stringify({ policy: r.policy, summary: r.summary, milestones: r.log.filter(x => x.event.includes('welcomed')) }));
