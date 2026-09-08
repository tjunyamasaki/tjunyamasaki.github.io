# Slime garden — P10 QA results

Recorded 8 September 2026 on the `feat/slime` branch. This is an implementation
acceptance log, not a claim that every device class has been certified.

Environment for this pass:

- Node 22.14.0 — `node --test slime-garden/tests/*.test.mjs`
- Local static server: `npx serve .` at `http://127.0.0.1:3000/slime-garden/`
- Browser: HeadlessChrome 148 on Linux x86_64, plus a headed Chrome session on
  the same VM
- GPU: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`
- No physical phone, no discrete GPU, no recruited playtesters

**Do not treat SwiftShader frame times as a passed desktop or mobile
performance gate.** They are emulation samples only.

## Coordinator waivers

These mandatory items from `05-verification-and-release.md` are **not passed**.
They are waived for this MVP packet with the reasons below.

| Requirement | Status | Reason |
| --- | --- | --- |
| Three unfamiliar-player playtests (§8) | **Not run** | This environment cannot recruit three people. No scripted answers were invented. |
| Named real desktop p95 ≤ ~20 ms high | **Not measured on a real GPU** | Only SwiftShader was available. Sample below. |
| Named real mobile p95 ≤ ~40 ms low | **Not measured** | No phone GPU. Do not label as passed. |
| Cross-GPU pixel equality of the original slime | **Not required** | Spec forbids treating cross-GPU pixel equality as acceptance. Same-browser SwiftShader screenshots were compared qualitatively. |
| Back-forward cache restore of the writer lock | **Not fully exercised** | `pageshow` / `reacquireWriter` exists; a real BFCache round-trip was not captured. |
| Live WebGL context-loss restore on a real GPU | **Not induced** | Startup WebGL2 failure was tested. The restore-once handler was not fired by a live GPU reset. |

Balance constants in `src/core/balance.mjs` were **not changed**.

## 1. Pure simulation tests

Command:

```sh
node --test slime-garden/tests/*.test.mjs
```

Result on this pass: **130 passed, 0 failed**.

Covered goldens and properties from verification §§3–5 include fresh idle 15 s /
1 h, feed-at-zero 120 s / 1 h, exact bonus boundary, global cooldown, bonus
extension, full basket, shrub and pantry timer rules, exact 15 Glow shrub price,
lifetime Glow independence, six-resident Bloom 5 rates, income remainder, counter
cap, seeded chunk equivalence, save load/backup/quota/import/reset, fake and
**real Chromium** writer locks, and offline reconcile (1 h, 10 h cap, backward
clock).

P10 added:

- `tests/clock-carry.test.mjs` — 144 × (1000/144) ms does not drop a second
- `tests/quality.test.mjs` — DPR caps and auto-quality drop after two slow windows
- `tests/ui-copy.test.mjs` — distinct feed-disabled reasons; wallet floors to 14.9
  rather than rounding to a fake 15.0

## 2. Browser interaction checks

Game-specific keys only (`cozy-slime-mvp:primary:v1`,
`cozy-slime-mvp:backup:v1`). Origin `localStorage.clear()` was never used. An
unrelated `unrelated-site-key-p10` key survived reset.

| Check | Result |
| --- | --- |
| Fresh load, Saved, 6/12 berries, one resident, canvas present | Pass |
| First feed: berries 6→5 in 46–71 ms; “Offered a berry to Slime 1.”; “Ready in 0:04”; selection kept | Pass — DOM does not wait for the ~1.1 s presentation |
| Reload during feed presentation | Pass — still 5 berries, one resident, costs not replayed |
| Settings open across a hidden/visible transition | Pass — dialog stayed open |
| Escape closes Settings and restores focus to Settings | Pass |
| Skip link (Tab then Enter) lands on `#play-controls` | Pass after P10 tabindex/focus fix |
| Keyboard Offer berry | Pass |
| Import of a 1-hour-old fresh save | Pass — 360.0 Glow, berries 12/12, offline summary “While away (1h 0m)” / “Glow gained: 360.0” / “Berries gained: 6” |
| First upgrade (Berry shrub) after that import | Pass — “Bought Berry shrub (level 1).” |
| Welcome companion from an eligible imported save | Pass — Slime 2 joins; Slime 1 stays selected |
| Reload during arrival | Pass — still two residents, no second welcome |
| Reset removes only this game’s keys | Pass — unrelated site key kept |
| Pause animations setting | Pass |
| 360 px width, no important horizontal clip (`scrollWidth` 360) | Pass (Puppeteer). Headed Chrome at ~360 CSS px also showed stacked controls without sideways clipping. |
| 200% zoom (`document.body.style.zoom = 2`) | Pass — page scrolls; Offer berry and Settings remain in the document |
| `prefers-reduced-motion: reduce` | Pass — `html[data-reduced-motion=true]` |
| Two Chromium tabs, Web Locks | Pass — second tab “This game is active in another tab”, feed disabled, no command; hidden first tab still blocks; Try again after closing the holder restores Saved |
| Both checkpoints `{a}` / `{b}` | Pass — recovery UI, raw keys unchanged, unrelated key kept |
| Schema v2 fixture | Pass — “This save is from a newer version”; raw v2 text not overwritten |
| `--disable-webgl --disable-webgl2` | Pass — “The 3D garden is unavailable. WebGL2 is unavailable… Feeding and saving still work.” Feed still 6→5. Export still downloads. Zero garden canvases. |
| Sound default | Pass — Settings Sound unchecked |
| `/links/` tile | Pass — “Slime garden” goes to `/slime-garden/` |

First upgrade and second resident in the **browser** were reached by importing
eligible checkpoints (1 h idle for 15 Glow; a command-built welcome-ready save).
The feed→upgrade→welcome **command sequence** itself is covered by unit tests,
including the P05 review-gate transcript to slime-2. A from-zero 150 s wall-clock
wait was not sat through in the headed browser.

## 3. Visual and performance evidence

### Actor vs original (same browser, SwiftShader)

Inspection spec poses captured: idle t=0, t=1.0, blink midpoint 4.775, walk
phases 0, 0.17, 0.29, 0.49, 0.68, 0.80. Original preview captured in the same
Chrome.

Qualitative match: mint body, dark oval eyes, pink blush, small mouth, glossy
highlights, outline, contact shadow. Blink midpoint closes actor A’s eyes while
actor B (other idle phase) stays open. Independence autotest: **PASS**. Dispose +
remount autotest: **PASS** (one canvas).

This is **not** a pixel-diff certification.

### Six residents in the habitat

A valid six-resident checkpoint (beds 4, home slots 0–5) showed all six on pads
inside the circular garden, shrub and basket at the rim, camera covering the
enabled pads, six resident buttons, “Your little colony is complete.” They do not
clip through each other at home in that screenshot. Stress-page max-stretch
conservative bounds: maxDist 1.037 vs body radius, all six **ok**. Body-only
raycast and click-at-stretch: all six **ok**.

### Stress autotest (`/slime-garden/dev/stress?autotest=1`)

Use the **extensionless** path locally. `serve` 301s `stress.html?autotest=1` to
`/slime-garden/dev/stress` and **drops the query string**.

| Field | Sample |
| --- | --- |
| Autotest | PASS (mount 6, travel off, **10 dispose/remount cycles** with 1→0→1 canvases, independent buffers, select, max-stretch, raycast, click) |
| Draw calls | 75 |
| Triangles | 127,118 |
| Viewport | 1068 × 558 CSS px, DPR 1 |
| Quality | auto → applied **high** (directional 1024 + contact) |
| Frame interval | n=30 over 7.7 s after warmup: median **267 ms**, p90 **422 ms**, p95 **467 ms** |
| GPU | SwiftShader Subzero as above |
| User agent | HeadlessChrome/148 Linux x86_64 |

Engineering target “desktop p95 ≤ ~20 ms in high” is **failed on this GPU** and
**unverified on a real desktop**. Auto-quality’s 25 ms p90 trigger would drop this
machine to low if left running; the short autotest snapshot was still on high.

### Headed Chrome notes

A headed pass confirmed skip-link, immediate feed, Settings Escape, Sound off by
default, `/links/` tile, and inspection mint features (oval eyes, blush, outline,
highlights). That session loaded an already-progressed local save (full berries,
~1.3k Glow) because previous QA writes shared the origin. Layout at a narrowed
window did not clip the stacked mobile column.

## 4. Playtests

**Not run.** No three unfamiliar players were available. Desired signals from
§8 (first feed in ~20 s, understanding of passive Glow, no starvation fear) are
**unverified**. Jun’s phone checks remain the only human play signal.

No balance retune was made.

## 5. Focused fixes in this packet

- Skip link now focuses `#play-controls` (`tabindex="-1"` plus a click handler).
  Headless Tab→Enter previously activated the hash without moving focus.
- Visible-session carry extracted to `src/core/clock-carry.mjs` so fractional
  144 Hz frames cannot truncate away about a second.
- Stress autotest performs ten dispose/remount cycles and waits for ≥30 frame
  samples (still a short local sample, labeled as such on the page).
- Garden canvas `tabIndex = -1` is set explicitly with the existing
  `aria-hidden` / `role="presentation"`.
- Root `.gitignore` uses `/docs/` so local handoff docs stay ignored while
  `slime-garden/docs/` can be committed.

## 6. Known limitations

- **Performance:** SwiftShader-only numbers. Real iOS/Android and a discrete
  desktop GPU are untested.
- **Playtest:** no three-person pass; feeding-as-quota / empty-scene feelings
  are unknown.
- **Local `serve`:** `*.html?query` 301s to the extensionless path **without**
  the query. GitHub Pages serves the `.html` file. Autotest links must use
  `/dev/stress?autotest=1` (and the same for inspection) when using `serve`.
- **Favicon:** `/favicon.ico` 404s on this origin; four console 404s during QA.
  Unrelated to gameplay.
- **Shortfall copy:** “Need 14.6097 Glow more” uses exact micro-Glow. Wallet
  display floors to one decimal, so the two strings can disagree in the last
  digits. Purchase still uses integer micro, not the rounded wallet.
- **`validateSave` non-strings** fail as `TOO_LARGE` (no dedicated reason in the
  contract). Documented by existing tests; left unchanged.
- **First write after reset** may have a primary and a null backup until the
  next checkpoint rotates. Subsequent saves fill backup.
- **`/links/` blurb** still says “isolated garden skeleton.” Player-facing copy
  cleanup belongs with P11.
- **Habitat and arrival fiction** remain the provisional garden / visitor-v1
  defaults.
- **Handoff SHA** printed in the planning `START-HERE.md` still does not match
  the copied file; the vendored copy was kept byte-for-byte.
- **BFCache and live context-loss** paths exist in code and were not fully
  reproduced here.
- **Sound** was not audited as audio (off by default; missing `AudioContext`
  already unit-tested as silent).

## 7. MVP definition of done (honest)

| Item | This pass |
| --- | --- |
| Exact supplied slime extracted and visually compared | Qualitative same-browser pass; not pixel-certified |
| One habitat, one through six visible residents | Pass (DOM + scene screenshots) |
| Feeding consumes food and gives bonus + feedback | Pass (core + browser) |
| Passive Glow, four upgrades, five companion milestones | Core pass; browser showed shrub buy + first welcome |
| Companion appearance encapsulated in presentation | Pass — reload does not re-welcome |
| Refresh + 8 h offline cap, reconcile once | Core + 1 h import pass; 10 h cap in unit tests |
| Corrupt / future / quota / no-3D / two tabs | Pass as listed; quota is unit-tested, not a full disk |
| Controls without raycast and with reduced motion | Pass |
| Core tests | 130 pass |
| Performance and playtest evidence recorded | Recorded; devices untested are listed; playtests waived |
| No moving CDN, no third-party runtime service | Pass |
| Pages staging | Already on `feat/slime` deploy; P11 still owns README/blurb polish |
| No combat / breeding / cloud account / monetization / prestige | Pass |

## 8. How to reproduce

```sh
npm start
node --test slime-garden/tests/*.test.mjs
```

Then HTTP only:

- Game: `http://127.0.0.1:3000/slime-garden/`
- Stress autotest: `http://127.0.0.1:3000/slime-garden/dev/stress?autotest=1`
- Inspection autotest: `http://127.0.0.1:3000/slime-garden/dev/inspection?autotest=1`
- Original preview: `http://127.0.0.1:3000/slime-garden/reference/original-preview`

Live Pages (after this branch deploys): `https://tjunyamasaki.github.io/slime-garden/`
