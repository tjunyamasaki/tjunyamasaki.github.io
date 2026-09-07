import { ITEM_META } from '../data/items.mjs';

function addButton(parent, label, options, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.primary ? 'gather station-action' : 'quiet station-action';
  button.textContent = label;
  button.disabled = Boolean(options.disabled);
  if (!options.disabled) button.addEventListener('click', onClick);
  parent.append(button);
  return button;
}

export function renderHandRecipes(root, recipes, inventory, onCraft) {
  for (const recipe of recipes || []) {
    const block = document.createElement('div');
    block.className = 'recipe-block';
    const title = document.createElement('p');
    title.className = 'recipe-title';
    title.textContent = recipe.title;
    const detail = document.createElement('p');
    detail.className = 'small';
    const bag = Object.entries(recipe.cost || {})
      .map(([id, amount]) => `${inventory?.[id] || 0}/${amount} ${ITEM_META[id]?.short || id}`)
      .join(' · ');
    detail.textContent = `${recipe.detail}${bag ? ` · bag ${bag}` : ''}${recipe.hint ? `. ${recipe.hint}` : ''}`;
    block.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'recipe-actions';
    addButton(actions, recipe.owned ? 'Owned' : 'Craft', { primary: true, disabled: !recipe.canCraft }, () => onCraft(recipe.id));
    block.append(actions);
    root.append(block);
  }
}

export function seedStripKey(view) {
  return [
    view?.seedsOwned ? '1' : '0',
    view?.selectedSeed || '-',
    (view?.seeds || []).map(seed => `${seed.species}:${seed.have}`).join(','),
  ].join('|');
}

export function renderSeedStrip(root, view, onSelect) {
  root.replaceChildren();
  if (!view?.seedsOwned) {
    const note = document.createElement('p');
    note.className = 'small';
    note.textContent = view?.emptySeedsHint || 'Harvest wild carrots or potatoes to find seeds.';
    root.append(note);
  }
  const list = document.createElement('div');
  list.className = 'seed-strip-list';
  for (const seed of view?.seeds || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet seed-choice';
    button.setAttribute('aria-pressed', String(Boolean(seed.selected)));
    button.textContent = `${seed.label} · ${seed.have}`;
    button.addEventListener('click', () => onSelect(seed.species));
    list.append(button);
  }
  root.append(list);
}
