# Balance experiment and limits

## Executed planning model

`balance-lab.mjs` was executed during this planning pass. It writes `balance-results.json`; it does not modify game source. Run with `node balance-lab.mjs` from this pack. It uses integer micro-Glow and one-second steps, the proposed extension prices/milestones, automatic joining, and a two-active-second favorable food delivery approximation.

| Policy | Resident 2 | Resident 6 | Resident 10 | Interpretation |
| --- | --- | --- | --- | --- |
| Attentive, offer whenever food permits | 1:01 | 36:40 | 2:10:08 | Optimistic frequent feeding and greedy buying |
| Leisurely, offer at most every 10 s | 1:01 | 36:36 | 2:10:04 | Similar completion under this model; beds/Glow dominate |
| 60 s visit every 30 min | 1:01 | 3:30:42 | 8:30:20 | Meals/space managed only during visits; automatic Glow crossing can join between visits |
| Never interacts, eight hours | No companion | — | — | One resident, 2,880 Glow, full basket; care gates still matter |

Times are elapsed model time from a fresh state, not advertised player guarantees. Resident 2 in the short-visit scenario qualifies at 1:01 just after the initial visit closes; automatic joining is intentional. That is a changed behavior from the original manual-Welcome policy.

Full purchase cost across the four tracks is 22,525 Glow, including 19,380 for all eight bed levels. Under the attentive model, resident 10 arrives after 952 completed meals even though only 500 are required; the policy continues offering while waiting for Glow. This does NOT mean the player must perform 952 throws. The leisurely model reaches ten with 777 meals. The result suggests there is little value in frantic input under the chosen economy, but actual playtests must establish whether a two-hour content arc is enjoyable.

## Important limitations

The model has no positions, gate paths, collisions, camera/UI friction, rendering, persistence failure, or writer locks. It deliberately offers near an available least-boosted resident and assumes a fixed two-second delivery. Actual game allocation prefers nearest feasible route and can wait for movement reservations. Far-field throws, crowded paths, and ignored ground food may materially change pacing.

The model does not implement the proposed 1.5-second post-meal rest or the complete world FSM; it approximates delivery availability through one pending meal per resident. Do not use its numerical output as a spatial or timing test oracle.

Short visits freeze pending meal delays outside visits but let economy time run as a simple long session; it does not validate actual offline cap/checkpoint behavior. One-second crossing rounding is not the production millisecond calculation. No human reaction delay or sound/animation engagement is modeled.

## Required implementation follow-up

In P2-14, run a second harness against the REAL pure phase-2 modules. Policies must issue real THROW_FOOD and BUY_UPGRADE commands, advance active/passive time explicitly, and record accepted/rejected throws, actual meals, pending-food age, blockages, arrival timestamps and purchased upgrades. Keep developer setup helpers separate from normal game commands; do not insert a player-facing debug spawn button.

Compare three placement policies: near least-boosted resident, nine spread-out farm regions, and repeated far-corner throws. Measure first meal time, 90th-percentile throw-to-meal duration, time to six/ten, and whether one resident monopolizes meals. The intended bounds are first nearby meal ≤6 s, typical nearby food ≤15 s, and the declared crowded legal placements resolved within 60 active seconds. These are acceptance targets, not measured results.

If repeated throwing feels like a chore, the coordinator can reduce only the new feed thresholds first, or revise final bed prices if the late game is mostly waiting. Keep the first six thresholds/prices unchanged during the first integration to preserve a clean comparison. Any retune changes document 01, centralized game constants, balanceVersion policy if released, experiment output, and acceptance fixtures together. Do not let separate agents tune different copies of a number.
