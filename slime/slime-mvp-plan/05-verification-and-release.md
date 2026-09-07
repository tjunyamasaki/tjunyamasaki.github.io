# Verification and release criteria

## 1. What was verified while writing this plan

- The specified original handoff was read in full and copied unchanged into this pack.
- The existing repository package file and Pages staging workflow were inspected.
- The Three.js r180 module's dependency on `three.core.js` was checked against the release source.
- The balance experiment was executed with Node 24.19.0, and its output was saved.

The game has not been implemented by this planning task. No gameplay browser test, GPU benchmark, save integration test, or human playtest has passed yet. Everything below is an implementation acceptance requirement, not a claim of completed validation.

## 2. Pure simulation test runner

Use Node's built-in runner and assertions. Once implementation files exist, the intended command is:

```sh
node --test "slime-garden/tests/*.test.mjs"
```

If the local shell/runtime does not expand that pattern as expected, pass the explicit test paths or use a narrowly scoped test script; do not change production packaging to make the runner work. Tests must import pure modules without a DOM or WebGL.

Use fresh factories for every fixture. Freeze inputs in tests to catch mutation. Inject clock and storage behavior into persistence tests rather than changing the real system clock. No test should sleep for eight hours or require a live internet connection after dependencies are obtained.

## 3. Numerical golden cases

These use independent hand calculations and integer micro-Glow, not copied production logic.

**Fresh idle, 15 seconds:** one resident at 0.1 Glow/s earns 1,500,000 micro-Glow. Berries increase from 6 to 7, and next berry time is 30,000 ms. No feed, upgrade, or new resident appears automatically.

**Fresh idle, one hour:** 360,000,000 micro-Glow; 12 berries, full timer null; one resident and zero feeds.

**Fresh feed at zero, then 120 seconds:** feed leaves 5 berries and boosts the resident until 120,000 ms. Earnings are 24,000,000 micro-Glow; berries fill to 12. The rate evaluated at 120,000 ms is 100,000 micro/s. After another 60 seconds, cumulative earnings are 30,000,000 micro-Glow.

**One feed at zero, then one hour:** 120 × 0.2 + 3,480 × 0.1 = 372 Glow, or 372,000,000 micro-Glow. This catches the bug of applying the boosted rate to the whole absence.

**Exact bonus boundary:** advance 119,999 ms after the initial feed; the resident is still boosted. Advance 1 ms; time is exactly expiry, and the next rate is base. Total first-120-second earnings remain exactly 24 Glow.

**Global cooldown:** first feed at 0 succeeds. A second at 3,999 ms fails even if it targets a different resident. At 4,000 ms, it may succeed if a berry exists. Rejection does not spend a berry or increase feeds.

**Bonus extension:** feeds at 0, 4,000, and 8,000 ms produce expiry values 120,000, 240,000, and 308,000 ms. The third expiry is 300 seconds ahead of current time, not 360 seconds from the first feed.

**Full inventory:** with 12 berries and null timer, a feed at time 50,000 leaves 11 berries and next berry time 65,000 with base shrub. Waiting while full before that feed grants no hidden extra berry.

**Shrub timer reset:** with next berry at 15,000 and current time 14,000, buy shrub level 1. New next berry is 26,000, not 15,000 or an immediate berry. Inventory does not change on purchase.

**Pantry timer:** buy pantry level 1 while full at 12 berries at time 10,000; inventory remains 12 of 18, next berry becomes 25,000 with base shrub. If the previous basket was not full, preserve its in-progress timer.

**Upgrade affordability:** wallet exactly 15,000,000 micro-Glow buys shrub level 1 and becomes zero. Wallet 14,999,999 cannot. A display rounded to “15.0” does not override the underlying check.

**Lifetime independence:** start with lifetime 100 Glow, current wallet 20, total feeds 24, capacity 3, and population 2. Resident 3 is eligible despite wallet being below 90. Spending the wallet on an upgrade does not revoke the lifetime condition.

**All residents, full Bloom:** six unboosted residents yield 1,350,000 micro/s. All boosted yield 2,700,000 micro/s. At that maximum rate for eight hours, the arithmetic intermediate before dividing milliseconds is 77,760,000,000,000, below `Number.MAX_SAFE_INTEGER`.

**Income remainder:** start with a valid remainder of 999 and advance 1 ms at base rate; earn 100 micro-Glow and retain 999. Advancing multiple partitions preserves the remainder. Legal v1 production rates happen to divide cleanly at millisecond precision, but stored remainder handling must still be correct.

**Counter cap:** set lifetime to its cap and wallet slightly below it; earning raises wallet to the cap without changing capped lifetime. Once both are capped, earning never overflows and the remainder is zero. Reject impossible wallet > lifetime saves rather than treating them as valid fixtures.

## 4. Structural and property tests

- Chunk equivalence: for a valid state and elapsed duration, `advance(s,a+b).state` equals `advance(advance(s,a).state,b).state`. Compare state, not transient event timestamps or number of summary events.
- Include random partitions generated by a seeded test-only RNG, different boost expiries, berry boundaries, and states near caps. The production core remains nonrandom.
- Input immutability: commands and advance do not alter frozen input objects or arrays.
- Resource invariants hold after every step of several deterministic action sequences.
- No negative quantities, NaN, Infinity, fractions in integer fields, duplicate IDs, or out-of-range home slots survive validation.
- Total feed count equals resident feed-count sum, including at the maximum counter rule.
- A stale expected upgrade level or population fails without changing state.
- After six residents, all further welcome commands fail with `POPULATION_CAP`.
- Invalid action types, unknown targets, strings where numbers belong, and null command payloads fail safely.
- Deriving a view model does not change state.
- Each supported upgrade cost and milestone appears only in centralized balance data; UI labels derive from it.

## 5. Persistence test matrix expressed as scenarios

**Repeated reload:** reconcile a one-hour-old fresh save at fixed now, install it, then reconcile the installed save at the same now. First gain is 360 Glow; second gain is zero. Advance the clock ten seconds and gain exactly 1 Glow.

**Long absence:** ten-hour-old unboosted fresh save gains 2,880 Glow, fills berries, and advances logical time by ten hours. Summary says eight hours credited. No new resident arrives until a valid welcome command.

**Backward clock:** a checkpoint 60 seconds in the future gains zero. Preserve resources, rebase the checkpoint, and show a nonfatal notice. A subsequent normal minute earns normal progress.

**Live-to-hidden transition:** settle five visible seconds, hide for one minute, resume, then run a first frame. The hidden minute is credited once. It is not added again through the resumed frame delta.

**Long visible sleep:** simulate a wall gap of ten hours with a suspended loop. At resume, use the cap and reset visual baselines. No multi-hour animation delta reaches actor deformation.

**Fractional frames:** repeated visible deltas of 1000/144 ms should advance 1,000 ms over 144 callbacks, subject to a tiny floating clock tolerance handled by the controller's carry; do not lose about a second per several seconds through truncation. Compare at a final explicit settlement timestamp rather than asserting binary floating sums are exact.

**Bad primary:** malformed JSON primary plus valid backup restores the backup. It does not discard the game or splice fields from two checkpoints.

**Both corrupted:** recovery UI appears; original raw values remain until a chosen import/reset. Ordinary page startup does not overwrite them.

**Newer schema:** importing or loading schema version 2 in the v1 game is refused without overwriting either primary or backup. Message distinguishes “newer version” from arbitrary corruption.

**Storage unavailable/quota exhausted:** all get/set operations are wrapped; the game enters unsaved or session-only mode, remains playable, and can export a valid JSON file.

**Interrupted backup/write:** simulate successful backup plus failed primary. Next startup picks a complete valid checkpoint. A failed primary cannot report “Saved.”

**Newer backup:** when valid backup revision exceeds primary revision, load backup and preserve it while attempting the next primary write. Simulating a primary failure must not leave only the older checkpoint because backup was overwritten prematurely.

**Import/reset:** invalid import leaves current state unchanged; valid replacement requires a reviewable summary and confirmation; reset changes only this game's keys, preserving unrelated site's storage.

**Two tabs:** one holds the writer lock; the other cannot earn/reconcile/write as a second active game. Close the first, retry in the second, and restore the latest checkpoint. Repeat with a hidden first tab and browser back/forward cache.

**Unsupported locks:** force API absence and verify clearly labeled session-only behavior with no localStorage writes. Do not pretend this is a persistent multi-tab implementation.

## 6. Browser interaction checks

Start with cleared **game-specific** keys and load the route through HTTP. Never clear all origin storage while testing this game in the shared repository.

Follow a fresh game through first feed, first upgrade, and second resident. The feed button updates within the input/next DOM update; it never waits 1.1 seconds for animation completion. A selected slime remains selected through resource ticks. Disabled controls provide the reason in readable text.

Reload during feeding, during arrival, while an offline summary is visible, and immediately after an upgrade. The latest successful checkpoint is restored; events do not reapply their costs or rewards. Test hidden/visible transition while Settings is open.

Use keyboard only for selection, feeding, purchasing, welcoming, settings, export, and import. Dialog focus enters correctly, Escape closes nondestructive dialogs, and focus returns to the opener. Announcements are useful without reading production counters four times each second.

At 360 px wide, nothing important is horizontally clipped. At 200% zoom, normal scrolling exposes all controls. Touch scrolling through the page does not unintentionally select residents or disable scrolling around the scene.

Force WebGL creation failure and context loss. The DOM interface and save export still work. Restoration produces the current resident population exactly once. No UI reads a Three object's state as the economic source of truth.

## 7. Visual and performance evidence

Compare the extracted actor against the original at identical viewport, DPR, camera, lights, and deterministic pose times listed in the scene spec. Save comparison screenshots with enough metadata to reproduce them. Check the original silhouette, eye placement, highlights, outline, material bands, idle sway, and walk phases.

Check six residents at the habitat camera in desktop and mobile layouts. Residents must not clip through each other at home, disappear due to stale bounds, or become too small for selection. Record draw calls, triangles, frame-time median/p90/p95, and active quality after warmup. Report the duration and named device/browser.

Acceptance target: desktop p95 frame interval at or below about 20 ms in high mode; mobile p95 at or below about 40 ms in low mode, with no sustained stutter during feeding/arrival. These are engineering targets to evaluate, not guaranteed capabilities of every device. Auto-mode's 25 ms p90 threshold is a downgrade trigger, not the release performance metric.

Mount and dispose the scene ten times. Confirm one or zero active canvas as appropriate, no duplicate observer/input/RAF callbacks, and no steadily growing renderer-resource counts across warmed cycles. Load/save/export does not mount a second renderer.

## 8. Playtest script

Ask three people unfamiliar with the controls to play individually. Give only: “This is a cozy slime game. Try caring for the slime and getting a companion.” Do not explain the mechanics before observing.

Record time to first successful feed, whether the player recognizes automatic currency growth, whether they find companion requirements, whether they understand capacity, and whether they notice the feeding reaction. Ask them to leave and return once to check trust in offline progress.

After 10–15 minutes, ask:

- What did you think feeding was doing?
- Did any action feel repetitive or compulsory?
- What would make you want to check back?
- Was the companion arrival pleasant and understandable?
- Did you think a slime would be harmed if you left?

Desired signals: first feed in roughly 20 seconds, accurate explanation of passive Glow, no expectation of starvation, and an expressed interest in seeing more residents. A beautiful scene with a confusing loop is not a completed product test.

If feeding feels like a quota, first lower cumulative feed gates or increase the significance/readability of a feed. Do not immediately add automation, another currency, or randomized breeding. If the scene feels empty, improve resident presentation and arrangement before increasing the population beyond the tested rendering budget.

## 9. MVP definition of done

- The exact supplied slime is extracted and visually compared.
- One provisional habitat supports one through six visible residents.
- Feeding consumes regenerating food and gives the specified bonus and feedback.
- Passive currency, four upgrades, and five sequential companion milestones work.
- Companion appearance fiction remains encapsulated in presentation code.
- Game state survives ordinary refresh; offline gains are capped and reconciled once per successful checkpoint.
- Corrupt saves, quota failures, unsupported 3D, and multiple tabs have the stated behavior.
- All economic controls work without raycasting and with reduced motion.
- Core tests and the mandatory browser flows pass.
- Performance and playtest evidence are recorded, with untested devices explicitly listed.
- No production dependency uses a moving version or requires a third-party runtime service.
- The game is staged correctly for the repository's Pages workflow when release integration is requested.
- No combat, breeding simulation, cloud account, monetization, or prestige feature was added to complete the MVP.

## 10. Post-MVP candidates, in priority order

First improve feedback and pacing based on observed players. Next choose the final habitat and arrival fiction, including an independently scoped budding animation if desired. After that, consider one auto-feeding upgrade, cosmetic resident distinctions that preserve the approved original, simple interactions between residents, and a small decoration reward track.

Each addition should answer a measured problem or a user preference. A larger population, GPU deformation rewrite, cloud saves, or mobile packaging is a separate technical project with new acceptance criteria.
