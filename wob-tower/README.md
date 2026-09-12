# Wob. — Wobbly Tower

A mobile-first 2D physics stacking game at `/wob-tower/`, linked from `/links/`.

## Play

Drag horizontally across the play area or use the bottom slider to aim. Rotate in 15° steps, then tap Drop. The dotted landing silhouette is a guide, not a guarantee: blocks can slide, bounce and topple. Wait for the tower to settle before the next turn.

- **Solo climb:** untimed practice; best balanced-block count stays on this device.
- **Pass & play:** 2–4 builders take turns on one device.
- **Online rooms:** up to 6 people. Host opens a lobby and shares its invitation/code. The host starts the round. New connections are admitted only in the lobby.
- A multiplayer turn has 45 seconds; expiry drops the block at the current aim.
- If any block falls off the plinth, the player who dropped most recently loses. Fault stays with that drop even if the next player has started aiming. A tower that cannot settle within 10 seconds also ends the round.
- Balance 80 blocks to complete a tower. Height records only confirmed balanced placements.
- Rematches rotate the starting builder. Online rematches return everyone to the lobby.
- Optional synthesized sound starts only after tapping the sound button. Reduced-motion preferences suppress particle bursts.
- Keyboard: arrows to aim, A/D to rotate, Space to drop.

## Implementation

Vanilla ES modules and Canvas 2D, no build step. `game.mjs` owns the fixed 60 Hz simulation and turn state. The vendored Matter.js 0.20.0 comes from the official `liabru/matter-js` release, with its MIT license in `vendor/LICENSE`. Irregular shapes use compound rectangle bodies without a polygon-decomposition dependency.

`view.mjs` renders cached interpolated positions, a following camera, height ruler, landing guide and bounded particles. Canvas pixel ratio is capped at 1.75; the DOM HUD and projection update at roughly 10/8 Hz. Up to 80 bodies bounds the workload. Guests reconstruct outlines for the landing guide but do not run competing physics.

`network.mjs` reuses the repository's `js/signaling.js` Firebase rooms, offer/answer exchange and ICE configuration. The host alone simulates physics and validates turn ownership. Normalized/bounded aim and drop intent travel over a reliable control channel. Drop intents include a placement counter to reject delayed duplicates. Complete state snapshots travel over an unordered, zero-retransmit channel at 20 Hz; sequence numbers discard old frames. Starts and lobby transitions also send reliable snapshots. Backpressure drops queued frames instead of building lag. Heartbeats, handshake timeout, protocol labels, admission limits and cleanup are covered by tests.

The existing STUN-only configuration has no TURN relay, so some NAT/firewall combinations cannot connect. Keep the host tab open: hiding it pauses physics and tells guests; closing it ends the room. Disconnecting a guest skips their turn. There is no host migration. Solo/pass-and-play do not import Firebase and work without that service.

## Test and serve

- `node --test wob-tower/tests/*.test.mjs`
- Serve the repository root over HTTP (for example `python3 -m http.server 8765`).
- Test the phone layout, rotate/drag/drop, collapse, pause/resume, rematch, and pass-and-play turn changes.
- `/wob-tower/responsive-check.html` is a small developer test bench for 390×844, 360×640, landscape and desktop layouts. Its source lives in `tests/responsive.html`; the deploy workflow stages it separately.
- Online device check: host and guest in two foreground devices, start in the lobby, verify only the active player can drop, complete both turns, leave a guest, then try a rematch. Test across Wi-Fi/mobile data to assess STUN-only connectivity.

Physics tests exercise actual Matter.js, not stubs. Transport tests use in-memory signaling and paired channel fakes; they do not establish public Firebase/ICE connectivity.

## Deployment

This branch's Pages workflow deploys pushes to `feat/wob-tower`, runs the existing Bloom tests and Wobbly Tower tests, and stages both games plus the repository's other existing pages. It uses the existing Firebase secrets. The branch deploys the production GitHub Pages URL for testing; it is not merged into master by this change.
