# Game design and balance — MVP v1

## 1. Experience

The scene is the main attraction. Interface elements explain what can happen next without covering the slimes. The player alternates between brief care interactions, watching slimes move, improving the habitat, and returning after a break.

The central loop is:

**Berries regenerate → feed a slime → see a happy reaction and temporary Glow bonus → earn Glow automatically → improve production or habitat capacity → meet companion requirements → welcome another slime → care for a growing colony.**

Keep feeding tactile, but never require rapid clicking. Food is inventory, not a survival meter. A slime whose bonus expires returns to its normal cheerful idle; it does not become ill, sad, or unproductive. Glow is collected automatically; particles are feedback, not pickups the player must chase.

The visual population is the principal reward. Six similar mint slimes interacting peacefully are sufficient for this test. Species, color variants, hats, rarity, and shape changes would test additional assumptions and are deferred.

## 2. First five minutes

On a fresh save, one slime is visible, with 6 berries, 0 Glow, and capacity for 2 residents. A compact hint says “Select your slime, then offer a berry.” Selection can happen in the scene or through its accessible resident button.

The first feed consumes one berry immediately and starts a short feeding reaction. A visible line changes to “Cozy bonus: 2× for 2:00.” The currency display already grows without a click. A quiet milestone line shows “A companion: 6 feeds · 12 lifetime Glow · space for 2.”

After the first feed, the next hint points to berry regeneration. After meeting the companion conditions, show a persistent “Welcome companion” button. Do not replace it with a timed popup. Activating it creates a resident immediately and plays a short arrival animation. The next hint introduces upgrades.

Tutorial sequence: first feed → see a regenerated berry → welcome the second slime → buy any upgrade → complete. It is nonmodal and never disables normal actions. Store completed step IDs, or derive eligible steps from persistent counters and keep only dismissed hints; use the contract's explicit completed-ID list for v1. A skipped or reloaded animation must not block the tutorial.

## 3. Setting decision

**Provisional recommendation: tiny sheltered garden.** A compact floor patch, a low curved boundary, a berry shrub at the rear, a food basket at the front edge, and resident resting pads around the perimeter. The scene should look safe and inhabited without requiring a building interior or glass rendering.

**Alternative: tabletop terrarium.** Strong containment and scale cues, but glass transparency, refraction, and occlusion create extra rendering and interaction work. If chosen, model only a base and minimal frame for the MVP; avoid physical glass shaders.

**Alternative: cozy room corner.** Furniture and indoor lighting increase prop work and can change the approved slime's appearance. It is viable later, but not necessary to test this loop.

The default garden is a temporary implementation choice until the user decides. Maintain one ground plane and the approved lighting first. Add five or fewer prop families: boundary, shrub, basket, resting pads, and a welcome marker. No free-placement system, inventory of furniture, terrain editing, day/night cycle, or weather in v1.

## 4. Companion arrival decision

Separate **eligibility** from **presentation**. Eligibility is always a deterministic milestone in the MVP. The user can therefore compare arrival fiction without the economy changing.

**Provisional visitor animation:** a new resident walks from a visible sheltered entrance to an available landing pad in about 2.5 seconds. The existing slimes remain intact. Use the label “Welcome companion.”

**Budding alternative:** a short affectionate wobble near a parent, a small occluding puff or leaf, and an independently created new actor. Never pretend a true mesh split is already supplied by the handoff. A convincing split or growing bud requires a separate approved animation task. Keep adult proportions unchanged once the new resident appears.

**Other alternative:** gentle emergence behind a plant, from a dew drop, or at a resting pad. It can reuse the same spawn event and final resident actor.

Do not implement random arrival rolls, missable visitors, breeding timers, a second reproduction currency, or multiple arrival systems. Do not describe duplication as finalized. Save a neutral `arrivalStyleId`, and use a small presenter registry or switch. Only `visitor-v1` needs a working presenter in the default build.

## 5. Starting state and numerical constants

All numbers below are v1 tuning, centralized in `core/balance.mjs`. Never duplicate numeric costs or thresholds in UI code.

- Starting residents: 1; absolute cap: 6.
- Base capacity: 2; four extra-capacity purchases add one each.
- Starting berries: 6; base berry capacity: 12.
- Base regeneration: one whole berry every 15,000 ms, while inventory is below capacity.
- Starting spendable Glow and lifetime Glow: 0.
- Base passive production: 0.1 Glow per second per resident.
- A successful feed costs 1 berry, increments total and individual feed counters by 1, and grants or extends that resident's production bonus by 120,000 ms.
- Bonus multiplier: exactly 2; maximum remaining bonus: 300,000 ms.
- Feed input cooldown: 4,000 ms **globally**, independent of target resident.
- Offline earning limit: 28,800,000 ms, equivalent to 8 hours.
- Maximum resource storage: 9,000,000,000,000 micro-Glow, or 9,000,000 Glow, for both wallet and lifetime counter. Clamp and show “Max” at the wallet cap. Counters must not wrap.
- Currency precision: 1 Glow = 1,000,000 integer micro-Glow. Display one decimal below 1,000; use a compact format above that, but always show precise purchase costs.

Feeding rule at simulation time `t`:

```js
boostUntilMs = Math.min(t + 300_000, Math.max(t, oldBoostUntilMs) + 120_000);
nextFeedAllowedAtMs = t + 4_000;
```

A feed remains valid even if it extends the bonus by less than two minutes. It still counts as care and contributes to companion milestones. UI wording should show the resulting remaining bonus rather than promise that every feed adds two full minutes. There is no instant Glow reward and no random drop.

Selection, petting as a separate action, and feeding all residents at once are not separate economic mechanics in v1. Clicking a resident selects it; the labeled button feeds it. Optional visual petting can wait.

## 6. Production and upgrades

For resident `i` at time `t`:

```text
bloomMultiplier = 1 + 0.25 × bloomLevel
cozyMultiplier(i,t) = 2 when t < boostUntilMs(i), otherwise 1
rateMicroPerSecond = sum over residents of
                    100,000 × bloomMultiplier × cozyMultiplier
```

Bloom level is 0–5, so every possible rate is an integer in micro-Glow per second. At full upgrades, six unboosted residents produce 1.35 Glow/s; six boosted residents produce 2.7 Glow/s. Apply the Bloom multiplier once, additively by level. Do not compound 1.25 per purchase.

**Berry shrub:** three purchases costing 15, 60, and 180 Glow. Berry intervals by level 0–3 are 15, 12, 10, and 8 seconds. Purchasing a level restarts the current incomplete berry interval at the new duration. Make that rule explicit in the tooltip and tests. It does not refill inventory.

**Pantry basket:** two purchases costing 30 and 100 Glow. Capacities by level 0–2 are 12, 18, and 24 berries. This increases capacity without granting berries. If the inventory was full and regeneration stopped, restart the timer using the current shrub interval. Otherwise preserve the timer already in progress.

**Glow bloom:** five purchases costing 20, 70, 220, 650, and 1,800 Glow. Each adds 25 percentage points to production for every resident. Settle earned currency through the purchase timestamp before raising the level.

**Resting pads:** four purchases costing 40, 140, 400, and 1,000 Glow. Capacity becomes 3, 4, 5, and 6. Buying space does not create a resident; it enables a subsequent welcome action once the milestone is complete. Show a new empty pad as visible feedback.

All tracks are available from the start, with clear costs and effects. Disable purchases that cannot be afforded or are maxed. Never add hidden prerequisites. Economy affordability always uses integer micro-Glow, not rounded display values.

When berries reach capacity, stop the regeneration timer and set `nextBerryAtMs = null`; do not accumulate an invisible reserve. Spending from a full basket starts a fresh interval. A partially filled basket has exactly one next-berry timestamp. This rule makes capacity useful and offline behavior predictable.

## 7. Companion milestones

The next resident has the following cumulative requirements:

- Resident 2: 6 total successful feeds and 12 lifetime Glow; capacity at least 2.
- Resident 3: 24 feeds and 90 lifetime Glow; capacity at least 3.
- Resident 4: 60 feeds and 300 lifetime Glow; capacity at least 4.
- Resident 5: 120 feeds and 900 lifetime Glow; capacity at least 5.
- Resident 6: 200 feeds and 2,200 lifetime Glow; capacity at least 6.

Requirements use **lifetime earned Glow**, not current wallet balance. Spending must not erase progress toward a companion. Feeds can be distributed however the player likes. Milestones are sequential; a welcome command can create exactly one resident. There is no additional fee when pressing Welcome.

The UI always shows all three conditions, including the specific missing capacity upgrade. If feed and Glow goals are met but capacity is full, show “Ready when you add a resting pad.” If all are met, show “A companion is ready.” Readiness cannot expire.

After welcoming, assign a stable sequential ID (`slime-2` through `slime-6`) and a default name. New residents start unboosted with zero individual feeds and immediately contribute the base rate. Their arrival animation must not delay eligibility, saving, selection, or income.

At six residents, replace the milestone strip with “Your little colony is complete.” Keep feeding, upgrades, and passive income working. Completion is a soft endpoint. Do not generate a seventh resident or silently turn this into an endless prestige game.

## 8. Pacing and what the balance experiment establishes

`balance-lab.mjs` runs a one-second approximation. Its attentive policy feeds the resident with the earliest bonus expiry whenever the global cooldown and food permit; welcomes immediately; prioritizes needed capacity once the next feed gate is reached; otherwise buys the first affordable shrub, Bloom, or pantry upgrade.

Under that policy, residents 2–6 arrive at **1:00, 4:24, 11:47, 22:07, and 36:39**. This is a candidate 35–60 minute active MVP arc. It assumes perfect attention and has no animation or human response delays. Do not advertise a guaranteed completion time.

A second policy permits interaction during the first minute of each 30-minute interval. Its arrival times are **0:30:00, 0:30:57, 2:00:21, 4:00:21, and 6:30:41**. Those visits require repeated manual feeding during the minute. The model stays logically open, so it approximates the cadence of visits rather than verifying browser/offline code.

With no interaction, one resident earns 2,880 Glow in eight hours, but companions remain feed-gated. This means patient players can afford upgrades when they return, while active care determines colony growth. That is intentional for this version. The feed count of 200 is a tuning risk: reduce it if playtesters experience feeding as repetitive rather than affectionate.

The mathematical resource ceiling is far above the designed progression. Economy saturation, perfect balance after completion, and weeks of content are not MVP objectives.

## 9. Interface specification

**Wide screen:** habitat occupies roughly two-thirds of the content width; a 300–360 px side panel contains resident details and upgrades. A compact top line shows berries, next berry time, Glow, and current Glow/s. A bottom or side milestone strip presents the next companion.

**Narrow screen:** top resource bar, scene around 42–50 viewport-height units, resident selection/feed controls, then upgrades and milestone content. Use normal page scrolling. The document must remain usable at 360 CSS px width and 200% browser zoom. Avoid a tiny fixed-height game frame containing all controls.

Core controls:

- Resident buttons named “Slime 1,” “Slime 2,” etc.; selection is marked through text/state and an unobtrusive ground ring.
- A selected-resident panel with name, individual feed count, bonus time, and “Offer berry” button.
- Four upgrade rows with current level, next effect, cost, and Buy button.
- A persistent next-companion area with current/required feeds, lifetime Glow, capacity, and Welcome button when ready.
- Settings: sound on/off, reduced motion, animation pause, quality, export save, import save, and reset.

Settings are a small dialog, not a navigation page. Reset requires a clear confirmation and offers export first. Import shows a validated summary before replacing the current save; it never silently resets on an invalid file.

Disabled feed reasons are distinct: “Choose a slime,” “More berries in 0:08,” and “Ready in 0:03.” Upgrade rows state the Glow shortfall. Successful feeding gives a small label and visual reaction; avoid repeated toast clutter. Reserve live-region announcements for user actions and important state changes, not every currency tick.

## 10. Audio, comfort, and accessibility

Sound is optional and off by default for the initial build. If included during polish, use a soft feed pop, a gentle upgrade chime, and one short welcome sound. Initialize audio only following user input. An absent or blocked audio context must not block gameplay. No external audio service or licensed music dependency.

Honor the operating system's reduced-motion preference on first load. A saved explicit setting takes precedence. Reduced motion uses static poses, simple selection feedback, and text confirmation without travel, squash bursts, camera motion, or particles. The separate “Pause animations” toggle also leaves the economy running.

Every economic action must be available through real HTML buttons and keyboard navigation. Scene raycasting is an additional selection route. Provide visible focus, 44 px minimum control targets, adequate text contrast, and state labels that do not rely on color. New arrivals never steal keyboard focus.

## 11. Acceptance of the product concept

The MVP is successful if a new player can feed within 20 seconds, understands that Glow grows automatically, intentionally welcomes a second resident, can explain what one upgrade does, and trusts a save/reload and return-from-away sequence.

Watch three short playtests before adding features. Ask what felt pleasant, what was confusing, whether feeding became repetitive, and whether companion arrivals felt earned. Tune constants and interaction clarity before adding systems.
