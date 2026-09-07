import * as THREE from '../vendor/three/three.module.js';

const game = document.getElementById('game');
const loading = document.getElementById('loading');
const errorRegion = document.getElementById('error');
const errorMessage = document.getElementById('error-message');

function showError(error) {
  if (loading) loading.hidden = true;
  if (errorRegion) errorRegion.hidden = false;
  const text = error && error.message ? String(error.message) : String(error);
  if (errorMessage) errorMessage.textContent = text;
  else if (errorRegion) errorRegion.textContent = text;
}

try {
  if (!game) throw new Error('Missing game root (#game).');
  if (typeof THREE.WebGLRenderer !== 'function') {
    throw new Error('Local Three.js module did not export WebGLRenderer.');
  }
  if (String(THREE.REVISION) !== '180') {
    throw new Error(`Unexpected Three.js revision ${THREE.REVISION}; expected 180.`);
  }

  const status = document.createElement('p');
  status.id = 'boot-status';
  status.textContent = `Local Three.js r${THREE.REVISION} loaded.`;
  game.appendChild(status);
  if (loading) loading.hidden = true;
} catch (error) {
  console.error(error);
  showError(error);
}
