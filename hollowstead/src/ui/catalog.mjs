// One crafting and building catalog. Lists are context filters only.
// A reason string is displayed when the caller already has one. This module
// does not inspect inventories or decide that a recipe may be performed.

import {RECIPES} from '../content.mjs?v=harvest-13';
import {contextRecipeIds} from '../interactions.mjs?v=harvest-13';

const BUILD_CAMP = new Set(['fire', 'bench', 'chest', 'lantern', 'bed']);
const BUILD_DEFENSE = new Set(['wall', 'gate', 'trap', 'ward']);
const BUILD_FOOD = new Set(['farm', 'pot']);

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

export function catalogModel({source = 'field', stationType = null, tab = 'build'} = {}) {
  const recipeIds = contextRecipeIds({source, stationType, tab});
  const cooking = source === 'station' && (stationType === 'fire' || stationType === 'hearth' || stationType === 'pot');
  const bench = source === 'station' && stationType === 'bench';
  let title = 'Build';
  let kicker = 'FIELD';
  let tabs = [];
  if (cooking) {
    title = 'Cooking';
    kicker = stationType === 'pot' ? 'CAULDRON' : 'FIRE';
  } else if (bench) {
    title = tab === 'build' ? 'Build' : 'Craft';
    kicker = 'WORKBENCH';
    tabs = [{id: 'craft', label: 'Craft'}, {id: 'build', label: 'Build'}];
  }
  const categories = cooking ? [] : tab === 'build' || source === 'field'
    ? [{id: 'all', label: 'All'}, {id: 'camp', label: 'Camp'}, {id: 'defense', label: 'Defense'}, {id: 'food', label: 'Food'}]
    : [{id: 'all', label: 'All'}, {id: 'tool', label: 'Equipment'}, {id: 'item', label: 'Care'}];
  return {
    title,
    kicker,
    tabs,
    categories,
    recipeIds,
    maintain: !cooking && (source === 'field' || tab === 'build'),
    action: cooking ? 'Cook' : tab === 'build' || source === 'field' ? 'Place' : 'Craft',
  };
}

/** Category chips only narrow an already context-legal list. */
export function inCategory(recipeId, category, tab) {
  if (!category || category === 'all') return true;
  if (tab === 'build') {
    if (category === 'camp') return BUILD_CAMP.has(recipeId);
    if (category === 'defense') return BUILD_DEFENSE.has(recipeId);
    if (category === 'food') return BUILD_FOOD.has(recipeId);
    return false;
  }
  const recipe = RECIPES[recipeId];
  if (category === 'tool') return recipe?.kind === 'tool';
  if (category === 'item') return recipe?.kind === 'item';
  if (category === 'cook') return recipe?.kind === 'cook';
  return true;
}

/**
 * `recipes` entries: {id, name, desc, icon, costs:[{have, need, name, short}], reason, action}
 * `reason` is host-observed text. This function does not invent one.
 */
export function catalogMarkup({recipes = [], maintain = false, pendingId = ''} = {}) {
  const maintainButton = maintain
    ? '<button type="button" class="maintain-button" data-command="maintain">Maintain camp</button>'
    : '';
  const rows = recipes.map(recipe => {
    const costs = (recipe.costs || []).map(cost =>
      `<span class="${cost.short ? 'missing' : ''}">${escape(cost.have)}/${escape(cost.need)} ${escape(cost.name)}</span>`).join('');
    const waiting = pendingId === recipe.id;
    const blocked = !!recipe.reason || waiting;
    return `<div class="recipe">${recipe.icon || ''}<div><h3>${escape(recipe.name)}</h3><p>${escape(recipe.desc || '')}</p><div class="cost">${costs}</div>${recipe.reason ? `<div class="reason">${escape(recipe.reason)}</div>` : ''}</div><button type="button" data-recipe="${escape(recipe.id)}" ${blocked ? 'disabled' : ''}>${escape(waiting ? 'Working…' : (recipe.action || 'Craft'))}</button></div>`;
  }).join('');
  return `${maintainButton}${rows || '<p class="empty">Nothing to make here.</p>'}`;
}
