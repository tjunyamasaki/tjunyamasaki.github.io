# HUD, tools, input and accessible play

## 1. Visual direction

Use a cozy game HUD: warm cream surfaces, dark green text, restrained wood/brown details, rounded corners, soft shadows and consistent icon/text labels. Preserve clear contrasts with the mint slimes. The game viewport is the main content; permanent upgrade tables should not dominate the screen.

Keep true HTML controls over the canvas rather than drawing all text/buttons into WebGL. This satisfies the request for game-like actions while retaining readable text, keyboard navigation, local saves and renderer-failure support. World clicks and the HUD are two entry points into the same commands.

## 2. Screen regions

| Region | Always-visible content | Interaction |
| --- | --- | --- |
| Top-left resources | Glow wallet, rate, berries current/max, berry regen progress | Berry icon selects berry tool; details on focus/tap |
| Top-right utility | Population/capacity, Settings | Population opens resident roster; no tiny ten-avatar row required |
| Farm viewport | Slimes, food, fence, props, selection/target feedback | Ground throws, resident selection/pet, object inspection |
| Bottom-center tool belt | Berry, Hand, Orbit | Single active tool/mode with text and `aria-pressed` |
| Compact camera cluster | +, −, Reset, Focus selected | Buttons ≥44 CSS px, labels available to screen readers |
| Next companion strip | Current/required care, lifetime Glow, missing pad condition | Informational; opens capacity context if needed |
| Context panel | Selected resident OR selected farm object | One panel at a time, dismissible |
| Status notice | Saved/unsaved/secondary-tab/recovery when relevant | Export/retry actions remain reachable |

Resource HUD should occupy roughly one compact row at desktop widths, not four stacked cards. On narrow screens allow two rows instead of illegible condensed numbers. Tool icons must have visible short labels at least on mobile/on focus; do not depend on unlabelled emoji.

## 3. Desktop layout

At ≥900 CSS px, use a centered game shell up to about 1440 px wide. The play frame fills available content width with a scene height around 68–78svh, minimum 480 px when viewport height permits. HUD top/bottom panels overlay only narrow edge bands; reserve enough unoccluded central area for ten residents. Context panel anchored right, 280–320 px, max height with internal scroll. Settings remain a modal dialog.

The resource bar, tool belt and camera cluster use one spacing scale (4/8/12/16/24 px), one control height, and one border/shadow treatment. Resource changes update text without moving widths constantly; use tabular numerals. Faint separators are sufficient; avoid nested cards for every number.

Only the selected resident has a persistent name/activity panel. Others get a small hover/focus label or brief meal reaction. Ten floating permanent stat panels would make the farm unreadable.

## 4. Mobile and small-height layout

At <900 px, the farm is still dominant; top resource HUD, scene, bottom tool belt, then a compact milestone line. Use responsive height in the range 50–65svh with a practical minimum around 320 px, and allow the document to scroll when browser zoom/text scaling needs more room. At 360 px and 200% browser zoom, reflow controls into normal document flow instead of clipping a fixed fullscreen surface.

Context information is a collapsible bottom sheet inside/adjacent to the play frame, maximum about 35% of its height before its content scrolls. On very short screens move expanded details below the scene. The tool belt and Settings must remain reachable without pixel-perfect taps. Respect safe-area insets around the bottom belt.

In Care mode use touch policy allowing vertical document scroll (`pan-y`) and do not capture/prevent all touch gestures. A moved or canceled touch sequence never throws. In Orbit mode opt the canvas into `touch-action:none`, display “Drag to orbit · Two fingers to pan/zoom,” and provide a conspicuous “Back to care” button. Mode is chosen before the gesture; changing CSS mid-drag is insufficient. Page scrolling outside the canvas remains available.

Do not disable browser-level zoom globally or set a restrictive maximum-scale viewport. Pinch support in Orbit must not be the only way to zoom. Tap +/− and keyboard controls are equivalent alternatives.

## 5. Mode and selection model

Maintain transient UI state `{mode:'care'|'orbit', tool:'berry'|'hand', selectedSlimeId, selectedObjectId, openPanel, cameraView}` in controller/UI. No default recreation on each resource update. Selection persists until explicit change or the selected ID disappears after import/reset. It never controls food rewards; food claim does.

Switching to Orbit cancels aim preview and any active pointer candidate. Switching back restores the previous Care tool. Tools are equip buttons; equipping does not spend a berry. Highlight active tool by icon, text and pressed state, not color alone. Berry tool remains usable with no selected resident.

Pointer precedence in Care on a valid click: UI overlay hit → UI handles; solid/interactable prop closest hit → open object context; slime body nearest valid hit → select/pet according to tool; eligible ground → throw if Berry; else no action. Decorative tiny grass and particles are excluded from interactive hit sets. Solid props occlude ground throwing. Slime outlines/faces do not produce separate hit actions.

Hover ground preview appears only in Berry/Care and outside HUD. Use small landing ring with valid/invalid indicator; never imply inventory was spent before command success. Touch shows a brief landing marker after a valid tap, with rejection feedback if invalid. Do not throw through the slime on a click intended to select it.

## 6. One pointer router

`input/pointer-router.mjs` owns down/move/up/cancel/lost-capture/wheel listeners. Camera and scene expose operations/pick results but register no competing gesture listener. Pointer record stores pointer ID/type, start coordinates, start mode/tool, cumulative maximum displacement, and whether any multi-touch occurred.

Click threshold is **6 CSS px** measured from starting point; once exceeded, it stays a drag even if the pointer returns to start. A click candidate requires same pointer, same gesture mode, primary button, no cancellation, no multi-touch, and release on the play surface. `pointercancel`, `lostpointercapture`, window blur, mode changes and dialog open clear it. Orbit captures pointers explicitly; Care leaves ordinary scroll behavior intact. Releasing after drag must not trigger a second generic `click` handler.

Track at most two active touch pointers for camera gestures. A third cancels the current gesture until all pointers are released. Use `setPointerCapture` only where the mode permits; ensure cleanup on disposal. Test direct click/tap, drag-return, release outside, cancel, pinch ending with one pointer, and mode switch during touch.

Wheel zoom activates when Orbit is on or the play frame has intentional keyboard focus/desktop engagement; ordinary wheel over unrelated page content scrolls the document. Normalize line/page deltaMode, ignore browser modifier zoom (Ctrl/Meta), and use non-passive listener only on the controlled surface when actually consuming the event. Do not register a global document wheel blocker.

## 7. Resident panel and pet feedback

Selected panel content: default/resident name, current activity, total meals for that resident, cozy bonus remaining, “Focus,” and “Pet.” Compact accessible “Offer near selected” goes in the panel or expanded care controls. Do not label it as guaranteed food delivery. One quiet status sentence reports who actually ate a berry.

Pet button and world-hand input use the same controller event. It neither calls FEED nor changes Glow. Cooldown applies only to feedback spam; explain “Already enjoying a pat” if needed, with no long error toast. During movement/eating, response overlays rather than interrupting authoritative tasks.

Use visible ring + subtle local reaction + optional sound. For offscreen selected resident, provide a clamped edge indicator or “Focus selected” affordance rather than secretly moving the camera on selection. A notification that someone joined cannot steal focus or selection.

## 8. Contextual upgrades

World shrub, basket, Bloom flowers and resting-pad marker each open one small upgrade card. Card shows name, current level, exact next cost, next effect, and one explicit “Upgrade” button. Opening a card is free. Expected-level command guard remains, so stale double-submission does not buy two levels. Do not buy on the first exploratory world click.

| Object | Player copy | Command |
| --- | --- | --- |
| Shrub | Berries grow every 15s → 12s (next level) | BUY_UPGRADE shrub, expectedLevel |
| Basket | Hold 12 → 18 berries | BUY_UPGRADE pantry, expectedLevel |
| Glow flowers | All friends make +25 percentage points more Glow | BUY_UPGRADE bloom, expectedLevel |
| Resting area marker | Room for 6 → 7 friends | BUY_UPGRADE beds, expectedLevel |

All displayed numbers derive from selectors and centralized data, including eight capacity levels. Show Glow shortfall rounded UP to a sensible tenth for ordinary labels, and exact purchase price; avoid “Need 14.6097 Glow” noise while preserving integer affordability. `Max level` is a complete state, not a broken Buy button. The next companion strip links directly to the resting-area context when capacity alone is missing.

An “Farm upgrades” HUD/menu button lists the same four objects for keyboard/no-WebGL use. Those controls share callbacks/commands. The expanded list is optional; it does not reintroduce a permanent management dashboard as the normal view.

After purchase, show a local object flash/small icon and update pad/shrub visual state. Auto-joining can occur in the same transition as beds purchase. Report both without two overlapping toasts or a Welcome button.

## 9. Accessibility and fallback

Keep real buttons, visible focus, ≥44px targets, appropriate contrast and pressed states. Imported names use `textContent`. Do not rebuild focused panels with `innerHTML` on each 4Hz update. Dialog opens with logical initial focus, traps modal focus, closes on Escape for nondestructive views, and restores focus to opener. Import/reset retain existing review/confirmation requirements.

Keyboard path: enter play controls via skip link → choose Berry → use preset/reticle or Offer near selected → observe status → open Farm upgrades → buy → inspect roster/newcomer → camera controls → Settings/export. It must work with a screen reader and with WebGL creation deliberately disabled. No public action requires a triangle raycast.

No-WebGL presentation uses a clearly labeled simplified farm control region, resident list and nine region presets/reticle coordinates. Headless world logic continues the same travel/eating delays, so food still reaches a resident without renderer callbacks. Show pending food count and meal/bonus result. Camera controls may be disabled with explanation; economy and export stay usable.

Announcements: explicit throw accepted/rejected, pet acknowledged, meal recipient/bonus, upgrade, newcomer batch, save failure or recovery. Batch autonomous meal/arrival announcements within 500 ms and do not speak every currency or motion tick. A short activity log can retain recent events without creating a notification pile.

Reduced motion: hide travel interpolation, arc/particles and pet squash; show stable snapshots/status changes. Voluntary camera adjustments respond directly without easing. Paused scene: clearly indicate farm activity continues and keep HUD/roster accurate. Both settings leave simulation outputs identical for the same action/time sequence.

## 10. Copy and error-state matrix

| State | Suggested concise copy | Economic effect |
| --- | --- | --- |
| Valid throw | Berry tossed | One berry reserved on ground |
| No berries | More berries in 0:08 | None |
| Cooldown | Ready to toss in 0:01 | None |
| Food queue full | Let them finish the berries on the grass | None |
| Outside/solid/gate target | Toss onto open grass inside the fence | None |
| Preset cannot find valid target | Choose another patch of grass | None |
| Seeking | Slime 3 is heading to a berry | None yet |
| Meal complete | Slime 3 enjoyed a berry · Cozy bonus 2:00 | Feed/bonus already committed |
| Missing capacity | A new friend needs a resting pad | None until purchase/eligibility |
| Arrival | Slime 7 joined the farm | Already part of state |
| Full colony | All ten friends are home | No further arrivals |
| Unsaved | Progress is not saved · Export a copy | Play continues in memory |
| Secondary tab | This farm is active in another tab | Read-only world/economy |

Wording may be polished without changing mechanics or inventing scarcity/death pressure. Keep developer details (IDs, world ticks, schema versions, rendering counters) in diagnostics, not normal HUD.
