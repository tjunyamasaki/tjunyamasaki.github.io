// Camera-only state: never persisted in a world or used as gameplay coordinates.
export const DEFAULT_PITCH = Math.atan2(46.8, 56);
export const clampPitch = value => Math.min(1.22, Math.max(0.42, value));
export function viewMovement(x, z, yaw) {
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) };
}
export function createCameraState(options = {}) {
  const panLimit = Number.isFinite(options.panLimit) ? Math.max(8, options.panLimit) : 26;
  const view = { yaw: 0, pitch: DEFAULT_PITCH, panX: 0, panZ: 0 };
  return {
    view,
    orbit(dx, dy) {
      view.yaw = Math.atan2(Math.sin(view.yaw - dx * 0.006), Math.cos(view.yaw - dx * 0.006));
      view.pitch = clampPitch(view.pitch + dy * 0.005);
    },
    pan(dx, dy, unitsPerPixel) {
      const delta = viewMovement(-dx * unitsPerPixel, -dy * unitsPerPixel / Math.sin(view.pitch), view.yaw);
      view.panX = Math.max(-panLimit, Math.min(panLimit, view.panX + delta.x));
      view.panZ = Math.max(-panLimit, Math.min(panLimit, view.panZ + delta.z));
    },
    center() { view.panX = 0; view.panZ = 0; },
    reset() { Object.assign(view, { yaw: 0, pitch: DEFAULT_PITCH, panX: 0, panZ: 0 }); },
  };
}
