# Bloom — Cell Arena

A vanilla ES-module / Canvas 2D cell game at `/ball-game/`. No build step or game dependencies. Open `/links/` to find it.

## Play

- Mouse or arrow keys to move; touch and drag anywhere on the arena for a floating joystick.
- Space / Split launches half of each eligible cell. W / Feed ejects mass; hold to repeat.
- Eat pellets and sufficiently smaller cells. Larger cells move more slowly and gradually lose mass.
- Up to 16 fragments; fragments converge and merge once their 30-second-plus-mass cooldown expires.
- Spiky viruses hide smaller cells and burst larger cells. Feed one seven ejected pellets to launch another virus.
- Death shows peak mass and eliminations, then allows a fresh spawn.
- Solo or host-controlled 0, 4, 8, or 16 bots. Bots forage, evade threats and viruses, chase prey, occasionally split, and respawn.

This is an independent implementation of classic free-for-all mechanics, not Miniclip's proprietary physics or modern monetized modes. Balance constants live in `engine.mjs`.

## Multiplayer

Host friends, copy the invitation (or share the five-character code), and have friends choose Join room. Maximum: 8 humans plus 16 bots. Guests may join an ongoing game. Host keeps their tab foregrounded; hiding it pauses simulation. Guest departure removes their cells; a disconnected player can rejoin as a fresh player. There is no host migration or saved match state.

`network.mjs` reuses `../js/signaling.js`: the existing Firebase database, room registration, SDP offer/answer exchange, ICE buffering, and STUN configuration. Firebase only establishes connections. Gameplay travels over WebRTC in a host-authoritative star. Channel identity rejects rooms belonging to the repository's other games. Host assigns identity from the connection, validates normalized input, limits action rates, and owns all physics, consumption, bots, and scores. Do not use public competitive matches that require an untrusted-host anti-cheat model.

- Simulation: fixed 60 Hz with bounded catch-up.
- Unordered, zero-retransmit state channel: 15 Hz; old snapshots are ignored.
- Reliable control channel: inputs at 30 Hz, actions, welcome, latency pings, and food generations twice a second.
- Seeded pellets keep synchronization small. Clients reconstruct positions from seed, index and generation.
- Client movement extrapolation is bounded to 100 ms, followed by smoothing toward host positions. Remote cells smooth between authoritative positions.
- Backpressure drops updates above a 64 KiB send queue. Frames self-heal on the next snapshot.
- Spatial buckets narrow pellet and cell collisions. Bot decisions run at 5 Hz. Renderer culls offscreen items, batches pellet paths, caches cell/virus textures, caps pixel ratio at 1.75, and updates DOM HUD at about 8 Hz.

The repository currently has STUN only, **no TURN relay**. Restrictive NAT/firewall combinations may not establish WebRTC; the UI times out with a retry message. Hosting requires the existing deployed Firebase config and external Firebase SDK access; solo does not import them. Changing shared ICE configuration or Firebase rules is outside this feature.

## Validation

Run `node --test ball-game/tests/*.test.mjs`.

Engine tests cover eating thresholds, split/merge including convergence, ejection, viruses, seeded food, movement sanitization, bounds, bots, capacity, respawn, frame size, and a one-minute simulation. Transport tests connect two production network endpoints through in-memory signaling/data-channel fakes, verify identity binding, movement/actions, state/food exchange, and cleanup. Those tests do not validate public Firebase permissions, real ICE negotiation or phone rendering/performance.

Device smoke test: host on one device, join from another, verify both move/split/feed, try 0 and 16 bots, respawn, rotate the phone, leave/rejoin, and close the host. Test Wi-Fi and mobile data to check the STUN-only connection limitation.

## Deployment

`.github/workflows/deploy-pages.yml` runs tests, writes the existing Firebase config from repository secrets, includes this directory in the Pages artifact, and deploys on pushes to `feat/ball-game`. This branch replaces the production Pages site while active; the branch's copy of the workflow does not alter triggers in other branches. GitHub's `github-pages` environment must permit this branch. No changes to other games' networking or rules.
