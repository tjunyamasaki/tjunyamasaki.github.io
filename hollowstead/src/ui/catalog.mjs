// One crafting and building catalog. Lists are context filters only.
// A reason string is displayed when the caller already has one. This module
// does not inspect inventories or decide that a recipe may be performed.

import {RECIPES} from '../content.mjs?v=harvest-18';
import {contextRecipeIds} from '../interactions.mjs?v=harvest-18';

const BUILD_CAMP = new Set(['hearth', 'fire', 'bench', 'chest', 'bookshelf', 'lantern', 'toro', 'hokora', 'bed', 'cart', 'glimmer']);
const BUILD_DEFENSE = new Set(['wall', 'gate', 'trap', 'ward', 'fudaward', 'hushstone', 'fence', 'stonewall', 'timberwall', 'masonwall']);
const BUILD_FOOD = new Set(['farm', 'pot', 'till', 'coop', 'barn']);
const BUILD_FLOOR = new Set(['plank', 'roughplank', 'boards', 'fieldstone', 'flagstone', 'cobble', 'slabs']);

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

/** `grid`: the world builds on the grid (homestead.mjs gridWorld): walls, floors and soil join the list. */
/** `satoyama`: where a Satoyama party stands ('farm' or 'wilds'): that mode keeps its own lists (contracts.mjs SATOYAMA_RECIPES). */
export function catalogModel({source = 'field', stationType = null, tab = 'build', grid = false, land, satoyama = null} = {}) {
  const recipeIds = contextRecipeIds({source, stationType, tab, grid, land, satoyama});
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
  const categories = cooking ? [] : grid && (tab === 'build' || source === 'field')
    ? [{id: 'all', label: 'All'}, {id: 'camp', label: 'Camp'}, {id: 'defense', label: 'Walls'}, {id: 'floor', label: 'Floors'}, {id: 'food', label: 'Farm'}]
    : tab === 'build' || source === 'field'
    ? [{id: 'all', label: 'All'}, {id: 'camp', label: 'Camp'}, {id: 'defense', label: 'Defense'}, {id: 'food', label: 'Food'}]
    : [{id: 'all', label: 'All'}, {id: 'tool', label: 'Equipment'}, {id: 'item', label: 'Care'}];
  return {
    title,
    kicker,
    tabs,
    categories,
    recipeIds,
    maintain: !cooking && (source === 'field' || tab === 'build'),
    // Grid worlds: a Remove tool takes walls, gates and floors back down (homestead.mjs TOOLS.clear).
    remove: grid && !cooking && (source === 'field' || tab === 'build'),
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
    if (category === 'floor') return BUILD_FLOOR.has(recipeId);
    return false;
  }
  const recipe = RECIPES[recipeId];
  if (category === 'tool') return recipe?.kind === 'tool';
  if (category === 'item') return recipe?.kind === 'item';
  if (category === 'cook') return recipe?.kind === 'cook';
  return true;
}

/** The recipe the detail pane shows: the kept pick if it is still listed, else the first one that can be made now. */
export function pickRecipe(recipes = [], pickId = '') {
  return recipes.find(recipe => recipe.id === pickId) || recipes.find(recipe => !recipe.reason) || recipes[0] || null;
}

/**
 * Tiles on the left (every recipe at a glance), the picked recipe on the right with its costs and one big
 * action button. `recipes` entries: {id, name, desc, icon, costs:[{have, need, name, short, icon}], reason, action}.
 * `reason` is host-observed text. This function does not invent one.
 */
export function catalogMarkup({recipes = [], maintain = false, remove = '', pendingId = '', pickId = ''} = {}) {
  const picked = pickRecipe(recipes, pickId);
  const tiles = recipes.map(recipe => {
    const ready = !recipe.reason;
    const on = picked?.id === recipe.id;
    return `<button type="button" class="craft-tile${ready ? ' is-ready' : ''}${on ? ' is-picked' : ''}" data-pick="${escape(recipe.id)}" aria-pressed="${on}" aria-label="${escape(recipe.name)}${ready ? '' : `. ${escape(recipe.reason)}`}"><span class="craft-tile__icon">${recipe.icon || ''}</span><span class="craft-tile__name">${escape(recipe.name)}</span>${ready ? '<i class="craft-tile__ok" aria-hidden="true">✓</i>' : ''}</button>`;
  }).join('');
  const maintainTile = maintain
    ? '<button type="button" class="craft-tile craft-tile--maintain" data-command="maintain"><span class="craft-tile__icon" aria-hidden="true">⚒</span><span class="craft-tile__name">Maintain camp</span></button>'
    : '';
  // `remove`: the icon of the Remove tool, when the world builds on the grid.
  const removeTile = remove
    ? `<button type="button" class="craft-tile craft-tile--maintain craft-tile--remove" data-command="remove-tool"><span class="craft-tile__icon" aria-hidden="true">${remove}</span><span class="craft-tile__name">Remove</span></button>`
    : '';
  let detail = '<div class="craft-detail is-empty"><p class="empty">Nothing to make here.</p></div>';
  if (picked) {
    const waiting = pendingId === picked.id;
    const blocked = !!picked.reason || waiting;
    const costs = (picked.costs || []).map(cost =>
      `<li class="${cost.short ? 'missing' : 'met'}">${cost.icon ? `<span class="craft-cost__icon">${cost.icon}</span>` : ''}<span class="craft-cost__name">${escape(cost.name)}</span><b>${escape(cost.have)}/${escape(cost.need)}</b></li>`).join('');
    detail = `<div class="craft-detail">
      <div class="craft-detail__head"><span class="craft-detail__icon">${picked.icon || ''}</span><div><h3>${escape(picked.name)}</h3><p>${escape(picked.desc || '')}</p></div></div>
      <ul class="craft-costs">${costs}</ul>
      <div class="craft-detail__foot">${picked.reason ? `<p class="reason">${escape(picked.reason)}</p>` : '<p class="reason ok">Ready</p>'}<button type="button" class="primary craft-go" data-recipe="${escape(picked.id)}" ${blocked ? 'disabled' : ''}>${escape(waiting ? 'Working…' : (picked.action || 'Craft'))}</button></div>
    </div>`;
  }
  return `<div class="craft-layout"><div class="craft-tiles" role="listbox" aria-label="Recipes">${tiles}${removeTile}${maintainTile}${recipes.length || maintain ? '' : '<p class="empty">Nothing to make here.</p>'}</div>${detail}</div>`;
}
