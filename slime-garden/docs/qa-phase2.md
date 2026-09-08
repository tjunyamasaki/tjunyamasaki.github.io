# Slime garden — P2-01 ten-actor stress

Recorded on branch `feat/slime`. This file is the phase-2 performance evidence
log required by `slime/slime-phase-2-plan/06-verification-and-release.md` §9 and
packet P2-01. It is **not** a playable-garden change and **not** a device
certification.

**Do not treat SwiftShader frame times as a passed desktop or mobile
performance gate.** P2-15 must not inherit a false pass from this packet.

Historical six-actor SwiftShader numbers in `docs/qa-results.md` are a
complexity warning only. They are not today’s ten-actor result.

## Hardware availability (honest)

| Item | This environment |
| --- | --- |
| Device / CPU | Cloud agent Linux VM (`uname` recorded with the samples below) |
| GPU | Typically SwiftShader (ANGLE Vulkan Subzero), not a discrete desktop GPU |
| Physical phone | **None available** |
| Named desktop GPU | **None available** |
| Browser | Google Chrome at `/usr/local/bin/google-chrome` |
| Actual vs emulated | Emulated GPU (software). Not a real device pass. |

Targets from document 03 §11 / verification §9:

- Desktop p95 ≤ 20 ms in **high** after 10 s warmup and ≥60 s sampling — **not
  measured on a real desktop**; SwiftShader cannot satisfy this and is not a
  substitute.
- Real phone p95 ≤ 40 ms in **low** — **not measured**; no phone GPU.
- World step p95 ≤ 2 ms desktop — **not applicable** in P2-01 (no world step;
  travel is off).

If those targets fail on a future real device, **do not lower the population
cap and do not change the approved model**. See the optimization note at the
end.

## How to reproduce (extensionless `serve` paths)

`serve` 301s `stress.html?…` to `/slime-garden/dev/stress` and **drops the query
string**. Never use `.html?`.

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
unchanged. `n=10` uses a local `PHASE2_HOME_SLOTS` copy of document 03 §2.

## Samples

Filled after the Chrome pass in this packet. Blank / “pending” rows must not be
read as passes.

### Form fields (verification §9)

Required on every row: commit; date; device model/CPU/GPU; OS/browser; actual vs
emulated; viewport/DPR; requested/applied quality; warmup/sample duration;
population/food/moving count; median/p90/p95 frame intervals; renderer
calls/triangles; world step/pathfinding (n/a here); notes on stutter, context
loss, memory cycles.

### Autotest (short sample; not a 60 s record)

| Field | n=10 `autotest=1` | n=6 `autotest=1` |
| --- | --- | --- |
| Commit | pending | pending |
| Date | pending | pending |
| Result | pending | pending |
| Actors / slots | 10 / PHASE2_HOME_SLOTS | 6 / v1 HOME_SLOTS |
| Travel | off | off |
| Dispose/remount ×10 canvases | pending (expect 1→0→1) | pending |
| Independent buffers | pending | pending |
| Max stretch + body raycast + click-each | pending | pending |
| Draw calls / triangles | pending | pending |
| Frame interval | short sample only | short sample only |
| GPU | pending | pending |

### 60-second warmed records (10 s warmup, then ≥60 s)

| Field | n=10 high idle | n=10 low idle | n=6 high idle (same GPU comparison) |
| --- | --- | --- | --- |
| Commit | pending | pending | pending |
| Date | pending | pending | pending |
| Device / OS | pending | pending | pending |
| GPU | pending | pending | pending |
| Actual vs emulated | emulated (VM) | emulated (VM) | emulated (VM) |
| Browser | pending | pending | pending |
| Viewport / DPR | pending | pending | pending |
| Quality requested / applied | high / high | low / low | high / high |
| Warmup / sample | 10 s / ≥60 s | 10 s / ≥60 s | 10 s / ≥60 s or short if noted |
| Population / food / moving | 10 / 0 / in-place idle | 10 / 0 / in-place idle | 6 / 0 / in-place idle |
| Median / p90 / p95 (ms) | pending | pending | pending |
| Calls / triangles | pending | pending | pending |
| World step | n/a (P2-01; travel off) | n/a | n/a |
| Notes | pending | pending | pending |

Food objects, meal effects, orbit-while-busy, and three reserved travel paths
are **not in this packet**. Mixed in-place walk/idle is a diagnostics control
only. Graybox fence / 12 placeholders are inert and must not be counted as
completed food functionality.

## Character fidelity

No actor geometry, material, or scale change was made in P2-01. The approved
source and inspection page were not edited. Stress actors still use
`createSlimeActor` with `comparisonTravelEnabled: false`. Independent typed
arrays are asserted in autotest (actor 0 vs 1).

## Narrowest next optimization proposal (not implemented)

Recorded because SwiftShader p95 is expected to miss desktop/phone targets, and
because a future real-device miss must not trigger model replacement.

Do **not** lower the cap or change the slime. Smallest likely wins, in order:

1. **Stress-page / hidden work first:** per-frame diagnostic DOM string rebuild
   and `renderer.info` reads are included in these samples. Throttle diagnostics
   off the hot path before touching actors.
2. **Shadow casters:** directional 1024 maps over ten pads (and any later farm
   props) dominate fill. Keep contact shadows; bound who casts; do not enlarge
   `HABITAT_SHADOW_CAMERA` for the live six-slime garden as a silent global fix.
3. **Allocations / pose CPU:** each actor deforms unique lathe buffers and
   recomputes normals on the pose cadence. Profile allocation churn and
   duplicate bounds work before any geometry reduction.
4. **Decorative draw calls:** share/instance later farm statics (P2-10). Do not
   add per-blade plant meshes to “make ten fit.”

P2-15 still needs a named desktop high sample and a named phone low sample.
Until those exist, performance remains **unverified** on real hardware.
