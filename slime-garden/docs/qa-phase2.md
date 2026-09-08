# Slime garden — P2-01 ten-actor stress

Recorded 8 September 2026 on branch `feat/slime`. Measured revision:
`f5b1de28d48c798465837dfd36922efd9039aa49`. This file is the phase-2
performance evidence log required by
`slime/slime-phase-2-plan/06-verification-and-release.md` §9 and packet P2-01.
It is **not** a playable-garden change and **not** a device certification.

**Do not treat SwiftShader frame times as a passed desktop or mobile
performance gate.** P2-15 must not inherit a false pass from this packet.

Historical six-actor SwiftShader numbers in `docs/qa-results.md` (75 calls,
127,118 triangles, short-sample p95 hundreds of ms) are a complexity warning
only. They are not today’s ten-actor result. A same-GPU six-actor comparison
was collected again below.

## Hardware availability (honest)

| Item | This environment |
| --- | --- |
| Device / CPU | Cloud agent KVM VM: 4× Intel(R) Xeon(R) Processor, `Linux cursor 6.12.94+ x86_64` |
| GPU | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| Physical phone | **None available** |
| Named desktop GPU | **None available** |
| Browser | HeadlessChrome 148.0.7778.96 (`/usr/local/bin/google-chrome`) |
| Actual vs emulated | Emulated GPU (software SwiftShader). Not a real device pass. |
| Viewport / DPR | 1100×496 CSS px stage in a 1280×800 window, DPR 1 |

Targets from document 03 §11 / verification §9:

- Desktop p95 ≤ 20 ms in **high** after 10 s warmup and ≥60 s sampling — **failed
  on SwiftShader** (n=10 high p95 **283 ms**). **Unmeasured on a real desktop.**
- Real phone p95 ≤ 40 ms in **low** — **not measured**; no phone GPU. SwiftShader
  n=10 low p95 **117 ms** is not a phone substitute.
- World step p95 ≤ 2 ms desktop — **not applicable** in P2-01 (no world step;
  `comparisonTravelEnabled` is false).

The population cap was **not** lowered. The approved actor was **not** changed.
`layout.mjs` and `quality.mjs` were **not** edited. Local stress-only shadow
frustum overrides apply after `applyQuality` for n=10 / graybox.

## How to reproduce (extensionless `serve` paths)

`serve` 301s `stress.html?…` to `/slime-garden/dev/stress` and **drops the query
string**. Never use `.html?`. Confirmed this run: `stress.html?n=10&autotest=1`
→ `Location: /slime-garden/dev/stress` with no query.

```sh
npx --yes serve .
node --test slime-garden/tests/*.test.mjs
```

- Default ten-actor autotest: `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&autotest=1`
- Six-actor v1-slot comparison autotest: `http://127.0.0.1:3000/slime-garden/dev/stress?n=6&autotest=1`
- 60 s warmed high record: `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&quality=high&sample=60`
- 60 s warmed low record: `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&quality=low&sample=60`
- Combined autotest + 60 s: `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&quality=high&autotest=1&sample=60`
- One-resident baseline: `http://127.0.0.1:3000/slime-garden/dev/stress?n=1`
- Graybox farm diagnostics only: `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&scenario=graybox-farm`
- Crowded inert placeholders (not food): `http://127.0.0.1:3000/slime-garden/dev/stress?n=10&scenario=crowded-placeholders`

Default population is **10**. `n=6` uses v1 `HOME_SLOTS` from `layout.mjs`
unchanged. `n=10` uses a local `PHASE2_HOME_SLOTS` copy of document 03 §2
(min pair distance 3). Camera `fitDistanceForSlots` uses the active slot list.

Node tests this run: **136 passed, 0 failed**
(`node --test slime-garden/tests/*.test.mjs`).

## Samples

Headless Chrome 148, SwiftShader, 1280×800 viewport, stage 1100×496 CSS px,
DPR 1, hardwareConcurrency 4. Food count 0. World step n/a. No context loss.
Dispose/remount cycles did not leak canvases (1→0→1 ×10).

### Autotest (short sample; not a 60 s record)

Default autotest does **not** wait 60 s. It mounts, asserts travel off, runs 10
dispose/remounts, independent buffers, idle/walk/mixed, select, max stretch,
body raycast, click-each, then a short ≥30-frame sample.

| Field | n=10 `?n=10&autotest=1` | n=6 `?n=6&autotest=1` |
| --- | --- | --- |
| Commit | `f5b1de2` | `f5b1de2` |
| Date | 2026-09-08 | 2026-09-08 |
| Result | **PASS** (~13.5 s) | **PASS** (~11.5 s) |
| Actors / slots | 10 / PHASE2_HOME_SLOTS | 6 / v1 HOME_SLOTS |
| Min pair distance | 3.000 | 2.800 (v1) |
| Travel | off | off |
| Dispose/remount ×10 canvases | 1→0→1 every cycle, 10 actors | 1→0→1 every cycle, 6 actors |
| Independent buffers | sharedRef=false, differ=true | sharedRef=false, differ=true |
| Mixed | 5 idle + 5 walk in place | 3 idle + 3 walk in place |
| Max stretch | all ten r≤1.037 vs body radius | all six ok (same bound) |
| Body raycast + click-each | all 10 on-screen, body only | all 6 on-screen, body only |
| Draw calls / triangles | 123 / 211,734 (selected) | 75 / 127,118 (selected) |
| Frame interval | n=31 over 4.2 s after 2.5 s warmup: median 150, p90 250, p95 275 ms | n=31 over 3.3 s: median 100, p90 200, p95 208 ms |
| Quality | auto → applied high | auto → applied high |
| GPU | SwiftShader Subzero as above | same |
| Sample kind | short sample (labeled on page) | short sample (labeled on page) |

n=6 selected draw-call/triangle counts match the historical P10 QA row
(75 / 127,118). That comparability is why `n=6` still uses v1 slots. It is
**not** a ten-actor number.

### 60-second warmed records (10 s warmup, then ≥60 s)

Idle, actors-only, travel off, no selection ring. `STATS_CAP` is 4500; none of
these records truncated (417–558 samples).

| Field | n=10 high idle | n=10 low idle | n=6 high idle (same GPU) |
| --- | --- | --- | --- |
| Commit | `f5b1de2` | `f5b1de2` | `f5b1de2` |
| Date | 2026-09-08 | 2026-09-08 | 2026-09-08 |
| Device / OS | 4× Xeon, Linux 6.12.94+ KVM | same | same |
| GPU | SwiftShader Subzero | same | same |
| Actual vs emulated | emulated (VM) | emulated (VM) | emulated (VM) |
| Browser | HeadlessChrome/148 | HeadlessChrome/148 | HeadlessChrome/148 |
| Viewport / DPR | 1100×496 / 1 | 1100×496 / 1 | 1100×496 / 1 |
| Quality requested / applied | high / high | low / low | high / high |
| Warmup / sample | 10 s / 60.11 s (n=417) | 10 s / 60.06 s (n=558) | 10 s / 60.01 s (n=547) |
| Population / food / moving | 10 / 0 / in-place idle | 10 / 0 / in-place idle | 6 / 0 / in-place idle |
| Median / p90 / p95 (ms) | **149.9 / 266.7 / 283.3** | **100.1 / 116.7 / 116.7** | **116.6 / 200.0 / 216.6** |
| Calls / triangles | 121 / 211,542 | 121 / 211,542 | 73 / 126,926 |
| World step | n/a (P2-01; travel off) | n/a | n/a |
| Desktop ≤20 ms high | **FAIL** (SwiftShader) | n/a | **FAIL** (SwiftShader) |
| Phone ≤40 ms low | not a phone | **not a phone**; also >40 ms | n/a |
| Notes | Honest 60s warmed record. Camera far 80, fitDistance ~15.85. Local ten-pad shadow frustum only. | Low: contact shadows only, 30 Hz pose/render. Still SwiftShader. | Same GPU/day as n=10. Unselected; two fewer calls than the selected autotest row. |

One-resident short high baseline (`?n=1&quality=high`, 2.5 s warmup, ~3.6 s
sample): 1 actor, 13 calls, 21,156 triangles, median 50 / p90 67 / p95 67 ms.
Still SwiftShader. Not a 60 s record.

Graybox-farm and crowded-placeholders were opened as diagnostics only (not
60 s records). Graybox added the 24×20 fence (124 calls / 211,566 triangles).
Crowded mode added 12 inert labeled markers (141 calls / 211,866 triangles).
Neither throws, claims, or eats food.

Food objects, meal effects, orbit-while-busy, and three reserved travel paths
are **not in this packet**. Mixed in-place walk/idle is a diagnostics control
and was exercised in autotest; a separate 60 s mixed record was not collected.

## Character fidelity

No actor geometry, material, or scale change was made in P2-01. The approved
source and inspection page were not edited. Stress actors still use
`createSlimeActor` with `comparisonTravelEnabled: false`. Independent typed
arrays are asserted in autotest (actor 0 vs 1). Max-stretch conservative bounds
matched the six-actor historical maxDist 1.037 on all ten bodies.

Unselected triangle counts scale with actor count (≈21,154 triangles per
resident plus shared floor): 1 → 21,156; 6 → 126,926; 10 → 211,542. That is
the same mesh, not a reduced LOD.

## Narrowest next optimization proposal (not implemented)

Recorded because SwiftShader p95 misses desktop/phone targets, and because a
future real-device miss must not trigger model replacement.

Do **not** lower the cap or change the slime. Smallest likely wins, in order:

1. **Stress-page / hidden work first:** per-frame diagnostic DOM string rebuild
   and `renderer.info` reads are included in these samples. Throttle diagnostics
   off the hot path before touching actors.
2. **Shadow casters:** directional 1024 maps over ten pads (and any later farm
   props) dominate fill. Keep contact shadows; bound who casts; do not enlarge
   `HABITAT_SHADOW_CAMERA` for the live six-slime garden as a silent global fix.
   P2-01 already overrides the sun shadow camera locally in `stress.mjs` after
   `applyQuality`.
3. **Allocations / pose CPU:** each actor deforms unique lathe buffers and
   recomputes normals on the pose cadence. Profile allocation churn and
   duplicate bounds work before any geometry reduction.
4. **Decorative draw calls:** share/instance later farm statics (P2-10). Do not
   add per-blade plant meshes to “make ten fit.”

P2-15 still needs a named desktop high sample and a named phone low sample.
Until those exist, performance remains **unverified** on real hardware.
