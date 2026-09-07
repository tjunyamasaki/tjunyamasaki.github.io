import { beginFieldAction, advanceFieldAction, isFieldAction } from './garden.mjs';
import {
  advanceAction as advanceResourceAction,
  beginAction as beginResourceAction,
  cancelAction,
} from './resources.mjs';

export { cancelAction, isFieldAction };

export function beginAction(state, command) {
  if (!command || typeof command !== 'object') return { ok: false, reason: 'invalid-command', events: [] };
  const type = command.action;
  if (isFieldAction(type)) return beginFieldAction(state, command);
  if (type && type !== 'harvest' && type !== 'clear') {
    return { ok: false, reason: 'unknown-action', events: [] };
  }
  return beginResourceAction(state, command.targetId, type);
}

export function advanceAction(state, dt, moving, events) {
  if (!state.action) return;
  if (isFieldAction(state.action.type)) {
    advanceFieldAction(state, dt, moving, events);
    return;
  }
  advanceResourceAction(state, dt, moving, events);
}
