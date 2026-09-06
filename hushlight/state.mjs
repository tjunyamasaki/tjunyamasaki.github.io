// The entire game simulation. No renderer, browser, audio, or network dependencies.
export const LEVEL = Object.freeze({
  radius: 8.9, speed: 2.65, collectRadius: 1.05, shrineRadius: 1.95, chargeSeconds: 2.4,
  shrines: Object.freeze([
    Object.freeze({ id: 'fern', name: 'The Fern', x: -5, z: 0 }),
    Object.freeze({ id: 'tide', name: 'The Tide', x: 4.7, z: 1.2 }),
    Object.freeze({ id: 'moon', name: 'The Moon', x: 0, z: -5.4 }),
  ]),
  lights: Object.freeze([
    [0.5, 4.6], [-2.6, 5.3], [-5.7, 3.6],
    [3.2, 5.5], [6.5, 3.8], [6.6, -1.7],
    [3.4, -4.6], [-3.3, -5.5], [-6.3, -2.8],
  ].map(Object.freeze)),
});

export const ALTAR = Object.freeze({ id: 'altar', name: 'The Hearth', x: 0, z: 0 });

export function createState(mode = 'journey') {
  mode = mode === 'endless' ? 'endless' : 'journey';
  return {
    mode, offerings: 0, lastOfferingAt: null,
    phase: 'intro', elapsed: 0, player: { x: 0, z: 6.5, facing: 0, moving: false },
    lights: LEVEL.lights.map(([x, z], id) => ({ id, x, z, status: 'wild' })),
    shrines: (mode === 'endless' ? [ALTAR] : LEVEL.shrines).map(s => ({ ...s, lit: false, charge: 0 })),
    lit: 0, completedAt: null,
  };
}

export const followers = state => state.lights.filter(l => l.status === 'following');
export function nearbyShrine(state) {
  return state.shrines.find(s => !s.lit && Math.hypot(s.x - state.player.x, s.z - state.player.z) < LEVEL.shrineRadius);
}

// Shared visual + collision definitions prevent invisible walls.
export const OBSTACLES = Object.freeze([
  ...LEVEL.shrines.map(s => Object.freeze({ x: s.x, z: s.z, radius: 0.7 })),
  Object.freeze({ x: 0, z: -7.7, radius: 0.95 }),
]);
const ENDLESS_OBSTACLES = Object.freeze([Object.freeze({ x: 0, z: 0, radius: 0.7 }), OBSTACLES[3]]);
export const obstaclesFor = mode => mode === 'endless' ? ENDLESS_OBSTACLES : OBSTACLES;

export function constrainPosition(x, z, mode = 'journey') {
  for (const obstacle of obstaclesFor(mode)) {
    const dx = x - obstacle.x, dz = z - obstacle.z;
    const distance = Math.hypot(dx, dz), radius = obstacle.radius + 0.24;
    if (distance < radius) {
      x = obstacle.x + (distance > 0.0001 ? dx / distance : 1) * radius;
      z = obstacle.z + (distance > 0.0001 ? dz / distance : 0) * radius;
    }
  }
  const distance = Math.hypot(x, z);
  if (distance > LEVEL.radius) { x *= LEVEL.radius / distance; z *= LEVEL.radius / distance; }
  return { x, z };
}

export function step(state, input = {}, seconds = 0) {
  const events = [];
  if (state.phase === 'intro' || input.paused) return events;
  const dt = Math.min(0.05, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  if (state.phase === 'playing') state.elapsed += dt;
  let dx = Number.isFinite(input.x) ? input.x : 0, dz = Number.isFinite(input.z) ? input.z : 0;
  const length = Math.hypot(dx, dz);
  if (length > 1) { dx /= length; dz /= length; }
  const player = state.player;
  player.moving = Math.hypot(dx, dz) > 0.05;
  if (player.moving) {
    const position = constrainPosition(player.x + dx * LEVEL.speed * dt, player.z + dz * LEVEL.speed * dt, state.mode);
    player.x = position.x; player.z = position.z;
    player.facing = Math.atan2(dx, dz);
  }
  if (state.phase === 'complete') return events;
  let carried = followers(state).length;
  for (const light of state.lights) {
    if (carried >= 3) break;
    if (light.status === 'wild' && Math.hypot(light.x - player.x, light.z - player.z) < LEVEL.collectRadius) {
      light.status = 'following'; carried++;
      events.push({ type: 'collected', id: light.id, carried });
    }
  }
  const near = nearbyShrine(state);
  for (const shrine of state.shrines) {
    if (shrine.lit) continue;
    if (shrine !== near || player.moving || carried < 3) { shrine.charge = 0; continue; }
    shrine.charge = Math.max(0, Math.min(1, shrine.charge + (input.kindle ? dt / LEVEL.chargeSeconds : -dt * 0.6)));
    if (shrine.charge >= 1 - 1e-8) {
      if (state.mode === 'endless') {
        state.offerings++; state.lastOfferingAt = state.elapsed; shrine.charge = 0;
        // Reuse the same nine lights at their safe anchors: bounded memory, endless play.
        followers(state).forEach(light => { light.status = 'wild'; });
        events.push({ type: 'offered', id: shrine.id, x: shrine.x, z: shrine.z, offerings: state.offerings });
        carried = 0;
        continue;
      }
      shrine.lit = true; shrine.charge = 1;
      followers(state).forEach(light => { light.status = 'delivered'; });
      carried = 0; state.lit++;
      events.push({ type: 'kindled', id: shrine.id, x: shrine.x, z: shrine.z, lit: state.lit });
      if (state.lit === 3) {
        state.phase = 'complete'; state.completedAt = state.elapsed;
        events.push({ type: 'completed' });
      }
    }
  }
  return events;
}
