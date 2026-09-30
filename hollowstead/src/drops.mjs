// Shared lifetime and visual treatment for valuable loot in both renderers.
import {DROP_LIFETIME_SECONDS} from './contracts.mjs?v=harvest-18';
import {RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-18';

export const VALUABLE_DROP_LIFETIME_SECONDS = 300;
const valuable = itemId => ['epic', 'legendary'].includes(rarityOf(itemId));

export function dropLifetime(itemId, seconds = DROP_LIFETIME_SECONDS) {
  return valuable(itemId) ? Math.max(seconds, VALUABLE_DROP_LIFETIME_SECONDS) : seconds;
}

export function dropGlow(drop) {
  const itemId = drop?.stack?.itemId;
  return valuable(itemId) ? RARITY_COLORS[rarityOf(itemId)] : null;
}
