import { formatActiveTime, ITEM_META } from '../data/items.mjs';
import { formatCost } from '../data/buildings.mjs';

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

export function renderStationPanel(root, view, handlers) {
  root.replaceChildren();
  const note = document.createElement('p');
  note.className = 'small station-pause';
  note.textContent = view.pauseNote || 'This panel pauses the island. Close it to resume smelting even if you walk away.';
  root.append(note);

  const hint = document.createElement('p');
  hint.className = 'small';
  hint.textContent = view.hint || '';
  root.append(hint);

  if (view.queue?.length) {
    const heading = document.createElement('h3');
    heading.textContent = 'Queue';
    root.append(heading);
    for (const batch of view.queue) {
      const row = document.createElement('div');
      row.className = 'station-row';
      const label = document.createElement('span');
      label.textContent = batch.active
        ? `${batch.label} · in the fire · ${formatActiveTime(batch.remaining)}`
        : `${batch.label} · waiting`;
      row.append(label);
      if (batch.canCancel) {
        addButton(row, 'Cancel', {}, () => handlers.cancelBatch(batch.id));
      } else if (batch.active) {
        const lock = document.createElement('span');
        lock.className = 'station-lock';
        lock.textContent = 'Cannot cancel';
        row.append(lock);
      }
      root.append(row);
    }
  }

  const outputCount = Object.values(view.output || {}).reduce((sum, value) => sum + value, 0);
  if (outputCount > 0 || view.structure?.kind === 'furnace') {
    const heading = document.createElement('h3');
    heading.textContent = 'Output';
    root.append(heading);
    const row = document.createElement('div');
    row.className = 'station-row';
    const label = document.createElement('span');
    label.textContent = outputCount
      ? `${formatCost(view.output)} waiting`
      : 'Nothing waiting.';
    row.append(label);
    addButton(row, 'Collect', { primary: true, disabled: !view.canCollect }, () => handlers.collect());
    root.append(row);
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Recipes';
  root.append(heading);
  for (const recipe of view.recipes || []) {
    const block = document.createElement('div');
    block.className = 'recipe-block';
    const title = document.createElement('p');
    title.className = 'recipe-title';
    title.textContent = recipe.title;
    const detail = document.createElement('p');
    detail.className = 'small';
    const bag = Object.entries(recipe.cost || {})
      .map(([id, amount]) => `${handlers.inventory?.[id] || 0}/${amount} ${ITEM_META[id]?.short || id}`)
      .join(' · ');
    detail.textContent = `${recipe.detail}${bag ? ` · bag ${bag}` : ''}${recipe.hint ? `. ${recipe.hint}` : ''}`;
    block.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'recipe-actions';
    if (recipe.batchable) {
      addButton(actions, 'Smelt 1', { primary: true, disabled: !recipe.canCraft }, () => handlers.queue(recipe.id, 1));
      const canFive = recipe.canCraft && handlers.canQueue?.(recipe.id, 5);
      addButton(actions, 'Smelt 5', { disabled: !canFive }, () => handlers.queue(recipe.id, 5));
    } else {
      addButton(actions, recipe.owned ? 'Owned' : 'Craft', { primary: true, disabled: !recipe.canCraft }, () => handlers.craft(recipe.id));
    }
    block.append(actions);
    root.append(block);
  }
}
