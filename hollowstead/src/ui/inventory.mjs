// RPG inventory surface. Renders slots and reports taps, drags, and quantities.
// It never writes player inventories, equipment, or chest contents.

import {EQUIPMENT, ITEMS} from '../content.mjs?v=harvest-18';
import {equipmentSlotFor} from '../inventory.mjs?v=harvest-18';
import {itemDefinition} from '../contracts.mjs?v=harvest-18';

export const SOCKET_LABELS = Object.freeze({
  chop: 'Chop', mine: 'Mine', weapon: 'Weapon', body: 'Armor', light: 'Light', head: 'Head', back: 'Back', trinket: 'Trinket', charm: 'Trinket II', bag: 'Bag',
});

const OP_LABELS = Object.freeze({
  equip: 'Equip', unequip: 'Unequip', eat: 'Eat', heal: 'Heal', drop: 'Drop',
  transfer: 'Transfer', take: 'Take', dismantle: 'Dismantle', use: 'Absorb', read: 'Read',
});

export function adjustQuantity(total, current, op) {
  const all = Math.max(1, total | 0);
  const now = Math.min(all, Math.max(1, current | 0));
  if (op === 'all') return all;
  if (op === 'half') return Math.ceil(all / 2);
  if (op === 'one') return 1;
  if (op === 'inc') return Math.min(all, now + 1);
  if (op === 'dec') return Math.max(1, now - 1);
  return now;
}

export function gridStep(index, count, columns, key) {
  if (count <= 0) return 0;
  const cols = Math.max(1, columns | 0);
  if (key === 'arrowright') return Math.min(count - 1, index + 1);
  if (key === 'arrowleft') return Math.max(0, index - 1);
  if (key === 'arrowdown') return Math.min(count - 1, index + cols);
  if (key === 'arrowup') return Math.max(0, index - cols);
  return index;
}

export function slotLabel({empty = false, name = '', quantity = 1, durability = null, maxDurability = null, equipped = false, index = 0, kind = 'pack'} = {}) {
  if (empty) {
    if (kind === 'socket') return `Empty ${name} socket`;
    const place = kind === 'chest' ? 'chest' : kind === 'recovery' || kind === 'overflow' ? 'saved' : 'pack';
    return `Empty ${place} slot ${index + 1}`;
  }
  const parts = [name];
  if (quantity > 1) parts.push(String(quantity));
  if (maxDurability) parts.push(`condition ${Math.ceil(durability)} of ${maxDurability}`);
  if (equipped) parts.push('equipped');
  return parts.join(', ');
}

const ITEM_ACTIONS = new Set(['equip', 'unequip', 'swap', 'eat', 'heal', 'drop', 'confirm-drop', 'transfer', 'take', 'store', 'dismantle']);
/** Ops that ask once more before they happen (the second press confirms). */
const CONFIRM_ACTIONS = new Set(['dismantle']);
const COUNT_ACTIONS = new Set(['drop', 'transfer', 'take']);

/** Per-item actions clear the UI selection when they are issued. Quantity and inspect do not. */
export function itemActionClearsSelection(op) {
  return ITEM_ACTIONS.has(op);
}

/** Drop, transfer, and take ask for 1 / half / all only when the stack can split. */
export function actionNeedsCount(op, quantity) {
  return COUNT_ACTIONS.has(op) && quantity > 1;
}

/** Dismantle asks for a second press, showing what it gives back. */
export function actionNeedsConfirm(op) {
  return CONFIRM_ACTIONS.has(op);
}

export function operationsFor({itemId, where, chestOpen = false} = {}) {
  if (where === 'recovery') return ['take'];
  if (where === 'overflow') return chestOpen ? ['transfer'] : [];
  if (where === 'chest') return chestOpen ? ['transfer'] : [];
  const ops = [];
  const item = ITEMS[itemId];
  if (where === 'equipment') ops.push('unequip');
  else if (equipmentSlotFor(itemId)) ops.push('equip');
  if (where === 'pack' && item?.food) ops.push('eat');
  else if (where === 'pack' && item?.heal) ops.push('heal');
  // Keepsakes used up for good (a heartstone: +max health).
  else if (where === 'pack' && item?.boost) ops.push('use');
  // A Homeward scroll (vigil.mjs WARP): read it to go home.
  else if (where === 'pack' && item?.warp) ops.push('read');
  if (where !== 'chest') ops.push('drop');
  if (chestOpen) ops.push('transfer');
  else if ((where === 'pack' || where === 'equipment') && equipmentSlotFor(itemId)) ops.push('dismantle');
  return ops;
}

function button(op, text) {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.op = op;
  el.textContent = text;
  return el;
}

function columnsOf(grid) {
  if (!grid) return 4;
  const value = getComputedStyle(grid).gridTemplateColumns;
  const count = value.split(' ').filter(part => part && part !== 'none').length;
  return count || 4;
}

/**
 * Square slots sized to fill their box without scrolling: tries every column count and keeps the one
 * with the biggest slot (capped), then the fewest empty cells, then the fewest columns.
 * Pure, so tests can read it: {columns, size}.
 */
export function fitSlots(count, width, height, {gap = 6, max = 76, min = 38} = {}) {
  const n = Math.max(1, count);
  let best = {columns: Math.min(n, 6), size: min, score: -1};
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const raw = Math.floor(Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows));
    const size = Math.min(max, raw);
    if (size < 1) continue;
    const score = size * 1000 - (columns * rows - n) * 10 - columns / 100;
    if (score > best.score) best = {columns, size: Math.max(min, size), score};
  }
  return {columns: best.columns, size: best.size};
}

export function createInventoryPanel(root, hooks) {
  root.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'rpg-panel';
  panel.innerHTML = `
    <div class="rpg-body">
      <section class="equip-column" aria-label="Equipment">
        <p class="section-label equip-label">WORN GEAR</p>
        <div class="doll">
          <div id="inv-portrait" class="character-card"></div>
          <div id="inv-sockets" class="socket-grid"></div>
        </div>
        <p id="inv-charm" class="charm-line"></p>
      </section>
      <section class="bag-column" aria-label="Backpack">
        <div class="storage-heading">
          <div id="inv-meta" class="bag-meta"></div>
          <div class="storage-tools" id="pack-tools">
            <button type="button" id="pack-sort" data-pack-op="sort">Sort</button>
            <button type="button" id="pack-select" data-pack-op="select" aria-pressed="false" title="Pick several items, then transfer or dismantle them together">Select</button>
            <div id="detail-ops" class="detail-ops"></div>
            <div id="detail-qty" class="qty-row" hidden aria-label="Quantity">
              <button type="button" data-qty="one">1</button>
              <button type="button" data-qty="half">Half</button>
              <button type="button" data-qty="all">All</button>
            </div>
          </div>
        </div>
        <div class="grid-fit"><div id="inv-grid" class="slot-grid" role="grid"></div></div>
        <div id="inv-detail" class="item-detail" aria-live="polite"></div>
        <div id="inv-recovery" class="recovery-block" hidden>
          <p class="section-label">SAVED FROM AN OLDER PACK</p>
          <div id="inv-recovery-grid" class="slot-grid recovery-grid"></div>
        </div>
      </section>
      <section id="inv-chest" class="chest-column" hidden aria-label="Chest">
        <div class="storage-heading">
          <div id="chest-meta" class="bag-meta"></div>
          <div class="storage-tools" id="chest-tools">
            <button type="button" data-chest-op="store">Store all</button>
            <button type="button" data-chest-op="stack">Stack</button>
            <button type="button" data-chest-op="sort">Sort</button>
            <button type="button" data-pack-op="select" aria-pressed="false" title="Pick several items, then transfer them together">Select</button>
          </div>
        </div>
        <div class="grid-fit"><div id="chest-grid" class="slot-grid chest-grid" role="grid"></div></div>
        <div id="chest-overflow" class="recovery-block chest-overflow" hidden>
          <p class="section-label">SAVED FROM A LARGER CHEST</p>
          <div id="chest-overflow-grid" class="slot-grid recovery-grid"></div>
        </div>
      </section>
    </div>
    <p id="inv-pending" class="pending-line" role="status"></p>`;
  root.append(panel);

  const portrait = panel.querySelector('#inv-portrait');
  const sockets = panel.querySelector('#inv-sockets');
  const meta = panel.querySelector('#inv-meta');
  const grid = panel.querySelector('#inv-grid');
  const recoveryWrap = panel.querySelector('#inv-recovery');
  const recoveryGrid = panel.querySelector('#inv-recovery-grid');
  const charm = panel.querySelector('#inv-charm');
  const chestWrap = panel.querySelector('#inv-chest');
  const chestMeta = panel.querySelector('#chest-meta');
  const chestGrid = panel.querySelector('#chest-grid');
  const chestOverflow = panel.querySelector('#chest-overflow');
  const chestOverflowGrid = panel.querySelector('#chest-overflow-grid');
  const packSort = panel.querySelector('#pack-sort');
  const chestTools = panel.querySelector('#chest-tools');
  const qtyRow = panel.querySelector('#detail-qty');
  const ops = panel.querySelector('#detail-ops');
  // Pack and chest grids fill their box (styles/hud.css): refit on resize and when the slot count changes.
  const fitted = new Map();
  function fit(gridEl) {
    const box = gridEl?.parentElement;
    if (!box || !box.isConnected || box.offsetParent === null) return;
    const width = box.clientWidth, height = box.clientHeight, count = gridEl.children.length;
    if (!(width > 0) || !(height > 0)) return;
    const key = `${width}x${height}:${count}`;
    if (fitted.get(gridEl) === key) return;
    fitted.set(gridEl, key);
    const {columns, size} = fitSlots(count, width, height);
    gridEl.style.setProperty('--cols', String(columns));
    gridEl.style.setProperty('--slot', `${size}px`);
  }
  const fitAll = () => { fit(grid); if (!chestWrap.hidden) fit(chestGrid); };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(fitAll) : null;
  for (const box of panel.querySelectorAll('.grid-fit')) resize?.observe(box);
  const pendingLine = panel.querySelector('#inv-pending');
  const detail = panel.querySelector('#inv-detail');
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.hidden = true;
  document.body.append(ghost);
  // The item card: press and hold a slot (right-click with a mouse, or tap the detail line) to read an item in full.
  const card = document.createElement('div');
  card.className = 'item-card-backdrop';
  card.hidden = true;
  document.body.append(card);
  let press = null, cardAt = -1e9;
  function closeCard() { card.hidden = true; card.replaceChildren(); }
  function openCard(key) {
    const data = key && hooks.cardFor?.(key);
    if (!data) return false;
    clearTimeout(press?.timer); press = null;
    card.replaceChildren(itemCardNode(data, closeCard));
    card.hidden = false;
    cardAt = performance.now();
    card.querySelector('.item-card__close')?.focus({preventScroll: true});
    return true;
  }
  card.addEventListener('pointerdown', event => { if (event.target === card) { event.preventDefault(); closeCard(); } });
  card.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); closeCard(); } });

  let drag = null;
  let suppressClick = false;
  let portraitSig = '';
  let metaSig = '';
  let charmSig = '';
  let detailSig = null;

  function paintSlot(el, cell) {
    const stack = cell.stack;
    const tip = stack ? (cell.tip || '') : '';
    const sig = `${cell.aria}|${stack ? `${stack.uid}:${stack.quantity}:${stack.durability}` : 'empty'}|${cell.selected ? 1 : 0}|${cell.iconHTML || ''}|${tip}`;
    el.dataset.empty = stack ? 'false' : 'true';
    el.dataset.uid = stack?.uid || '';
    el.dataset.accept = cell.accept === false ? 'false' : 'true';
    if (tip) { el.dataset.tip = tip; el.title = tip; }
    else { delete el.dataset.tip; el.removeAttribute('title'); }
    el.classList.toggle('is-selected', !!cell.selected);
    el.classList.toggle('is-picked', !!cell.picked);
    el.classList.toggle('is-equipped', !!cell.equipped);
    el.classList.toggle('is-locked', !!cell.locked);
    el.setAttribute('aria-label', cell.aria);
    el.tabIndex = 0;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.replaceChildren();
    if (!stack) {
      const mark = document.createElement('span');
      mark.className = 'slot-mark';
      mark.textContent = cell.mark || '';
      el.append(mark);
      return;
    }
    if (cell.iconHTML) {
      const wrap = document.createElement('span');
      wrap.className = 'slot-icon';
      wrap.innerHTML = cell.iconHTML;
      el.append(wrap);
    }
    if (stack.quantity > 1) {
      const badge = document.createElement('b');
      badge.className = 'qty-badge';
      badge.textContent = String(stack.quantity);
      el.append(badge);
    }
    if (typeof stack.durability === 'number' && cell.maxDurability) {
      const wear = document.createElement('i');
      wear.className = 'wear';
      const fill = document.createElement('em');
      fill.style.width = `${Math.max(0, Math.min(100, stack.durability / cell.maxDurability * 100))}%`;
      wear.append(fill);
      el.append(wear);
    }
  }

  function syncGroup(container, cells) {
    const existing = new Map([...container.children].map(el => [el.dataset.slotKey, el]));
    const ordered = [];
    for (const cell of cells) {
      let el = existing.get(cell.key);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'item-slot';
        el.dataset.slotKey = cell.key;
      }
      paintSlot(el, cell);
      ordered.push(el);
      existing.delete(cell.key);
    }
    for (const el of ordered) container.append(el);
    for (const el of existing.values()) el.remove();
  }

  function update(view) {
    panel.classList.toggle('with-chest', !!view.chest);
    if (view.portraitHTML !== portraitSig) {
      portraitSig = view.portraitHTML || '';
      portrait.innerHTML = portraitSig;
    }
    const metaText = `Pack · ${view.occupied} / ${view.slotMax}`;
    if (metaSig !== metaText) { metaSig = metaText; meta.textContent = metaText; }
    packSort.disabled = !!view.pending;
    const charmText = `Last-chance charm, ${view.charm ? 'available' : 'spent'}`;
    if (charmSig !== charmText) { charmSig = charmText; charm.textContent = charmText; }
    syncGroup(sockets, view.sockets);
    syncGroup(grid, view.slots);
    recoveryWrap.hidden = !view.recovery?.length;
    if (view.recovery?.length) syncGroup(recoveryGrid, view.recovery);
    chestWrap.hidden = !view.chest;
    if (view.chest) {
      const occupied = view.chest.occupied ?? view.chest.slots.filter(cell => cell.stack).length;
      const slotMax = view.chest.slotMax ?? view.chest.slots.length;
      const chestLine = view.chest.pending ? 'Waiting for camp…' : `${view.chest.name || 'Chest'} · ${occupied} / ${slotMax}`;
      if (chestMeta.textContent !== chestLine) chestMeta.textContent = chestLine;
      syncGroup(chestGrid, view.chest.slots);
      chestOverflow.hidden = !view.chest.overflow?.length;
      if (view.chest.overflow?.length) syncGroup(chestOverflowGrid, view.chest.overflow);
      for (const button of chestTools.querySelectorAll('button')) button.disabled = !!view.pending;
    }
    pendingLine.textContent = view.pendingText || '';
    paintDetails(view);
    fitAll();
  }

  /** What the selected item is: its name and the lines of its tooltip (mastery, refinement, trinket text). */
  function paintInfo(selection) {
    const lines = selection ? String(selection.info || '').split('\n').filter(Boolean) : [];
    const name = selection ? (lines.shift() || selection.name) : '';
    const sig = selection ? `${name}|${lines.join('|')}` : '';
    if (detailSig === sig) return;
    detailSig = sig;
    detail.replaceChildren();
    detail.classList.toggle('is-empty', !selection);
    if (!selection) { detail.textContent = 'Tap an item to see it, hold it to read it in full. Drag to move it.'; return; }
    const title = document.createElement('b');
    title.textContent = name;
    detail.append(title);
    for (const line of lines.slice(0, 4)) {
      const row = document.createElement('small');
      row.textContent = line;
      detail.append(row);
    }
  }

  /** Select mode: several items picked at once; the action row works on all of them (main.mjs runMulti). */
  function paintMulti(multi, pending) {
    const text = multi.count ? `${multi.count} selected${multi.hint ? ` · ${multi.hint}` : ''}` : 'Select mode · tap items to pick them';
    if (detailSig !== `multi:${text}`) {
      detailSig = `multi:${text}`;
      detail.replaceChildren();
      detail.classList.remove('is-empty');
      const title = document.createElement('b'); title.textContent = text; detail.append(title);
    }
    qtyRow.hidden = true;
    const sig = `multi|${multi.ops.map(o => `${o.op}:${o.label}:${o.confirm || ''}`).join(',')}`;
    if (ops.dataset.sig !== sig) {
      ops.dataset.sig = sig;
      ops.replaceChildren();
      for (const o of multi.ops) {
        const el = button(o.op, o.label);
        if (o.confirm) {
          el.classList.add('confirm-op');
          el.innerHTML = `<b></b><small></small>`;
          el.querySelector('b').textContent = o.label;
          el.querySelector('small').textContent = o.confirm;
        }
        if (o.danger) el.classList.add('danger-op');
        ops.append(el);
      }
    }
    for (const el of ops.querySelectorAll('button')) el.disabled = !!pending;
  }

  function paintDetails(view) {
    const selection = view.selection;
    panel.classList.toggle('is-multi', !!view.multi);
    for (const el of panel.querySelectorAll('[data-pack-op="select"]')) { el.setAttribute('aria-pressed', String(!!view.multi)); el.textContent = view.multi ? 'Done' : 'Select'; el.disabled = !!view.pending; }
    if (view.multi) { panel.classList.add('has-selection'); paintMulti(view.multi, view.pending); return; }
    paintInfo(selection);
    panel.classList.toggle('has-selection', !!selection);
    if (!selection) {
      ops.replaceChildren();
      ops.dataset.sig = '';
      qtyRow.hidden = true;
      return;
    }
    const confirming = !!selection.pendingOp && CONFIRM_ACTIONS.has(selection.pendingOp);
    qtyRow.hidden = !selection.pendingOp || confirming;
    for (const qty of qtyRow.querySelectorAll('button')) qty.disabled = !!view.pending;
    const shown = selection.pendingOp ? [selection.pendingOp] : selection.ops;
    const sig = `${shown.join(',')}|${confirming ? selection.confirmText || '' : ''}`;
    if (ops.dataset.sig !== sig) {
      ops.dataset.sig = sig;
      ops.replaceChildren();
      for (const op of shown) {
        const el = button(op, OP_LABELS[op] || op);
        if (confirming) {
          el.classList.add('confirm-op');
          el.innerHTML = `<b>Confirm ${OP_LABELS[op] || op}</b><small></small>`;
          el.querySelector('small').textContent = selection.confirmText || '';
        }
        if (op === 'dismantle') el.classList.add('danger-op');
        ops.append(el);
      }
    }
    for (const el of ops.querySelectorAll('button')) el.disabled = !!view.pending;
  }

  function slotFromEvent(event) {
    return event.target.closest?.('[data-slot-key]') || null;
  }

  function endDrag(commit, event) {
    if (!drag) return;
    const state = drag;
    drag = null;
    ghost.hidden = true;
    ghost.replaceChildren();
    hooks.onDragChange?.(false);
    if (!state.active) return;
    suppressClick = true;
    if (!commit) return;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const dest = under?.closest?.('[data-slot-key]');
    if (!dest || dest.dataset.accept === 'false' || dest.dataset.slotKey === state.key) return;
    hooks.onMove(state.key, dest.dataset.slotKey);
  }

  panel.addEventListener('pointerdown', event => {
    // A long press that never produced its click must not swallow the next tap.
    if (performance.now() - cardAt > 600) suppressClick = false;
    const slot = slotFromEvent(event);
    if (!slot || slot.dataset.empty === 'true') return;
    if (event.button != null && event.button !== 0) return;
    drag = {pointerId: event.pointerId, key: slot.dataset.slotKey, x: event.clientX, y: event.clientY, active: false, slot};
    clearTimeout(press?.timer);
    const key = slot.dataset.slotKey, pointerId = event.pointerId;
    press = {pointerId, timer: setTimeout(() => { if (drag?.pointerId === pointerId && !drag.active && openCard(key)) { drag = null; suppressClick = true; } }, 450)};
  });
  // Mouse: right-click a slot for its card. Touch: stops the browser's own long-press menu on the icons.
  panel.addEventListener('contextmenu', event => {
    const slot = slotFromEvent(event);
    if (!slot || slot.dataset.empty === 'true') return;
    event.preventDefault();
    if (performance.now() - cardAt > 600) openCard(slot.dataset.slotKey);
  });
  panel.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId || drag.active) {
      if (drag?.active && event.pointerId === drag.pointerId) {
        ghost.style.left = `${event.clientX + 8}px`;
        ghost.style.top = `${event.clientY + 8}px`;
      }
      return;
    }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) return;
    clearTimeout(press?.timer); press = null;
    drag.active = true;
    try { drag.slot.setPointerCapture?.(event.pointerId); } catch { /* Synthetic or cancelled pointers still finish the drag. */ }
    ghost.innerHTML = drag.slot.querySelector('.slot-icon')?.innerHTML || '';
    ghost.hidden = false;
    ghost.style.left = `${event.clientX + 8}px`;
    ghost.style.top = `${event.clientY + 8}px`;
    hooks.onDragChange?.(true);
    event.preventDefault();
  });
  panel.addEventListener('pointerup', event => {
    if (press?.pointerId === event.pointerId) { clearTimeout(press.timer); press = null; }
    if (!drag || event.pointerId !== drag.pointerId) return;
    endDrag(true, event);
  });
  panel.addEventListener('pointercancel', () => { clearTimeout(press?.timer); press = null; endDrag(false); });
  panel.addEventListener('lostpointercapture', () => { if (drag?.active) endDrag(false); });
  panel.addEventListener('click', event => {
    if (suppressClick || performance.now() - cardAt < 600) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
    // The detail line opens the selected item's card.
    if (event.target.closest('#inv-detail') && panel.classList.contains('has-selection')) {
      const picked = panel.querySelector('.item-slot.is-selected');
      if (picked) openCard(picked.dataset.slotKey);
      return;
    }
    const qty = event.target.closest('[data-qty]');
    if (qty) { hooks.onQuantity(qty.dataset.qty); return; }
    const chestOp = event.target.closest('[data-chest-op]');
    if (chestOp) { hooks.onChestOrganize?.(chestOp.dataset.chestOp); return; }
    const packOp = event.target.closest('[data-pack-op]');
    if (packOp) { if (packOp.dataset.packOp === 'select') hooks.onSelectMode?.(); else hooks.onPackSort?.(); return; }
    const op = event.target.closest('[data-op]');
    if (op) { hooks.onOperate(op.dataset.op); return; }
    const slot = slotFromEvent(event);
    if (!slot) return;
    if (event.shiftKey && slot.dataset.empty !== 'true') { hooks.onShift(slot.dataset.slotKey); return; }
    hooks.onSlot(slot.dataset.slotKey, slot.dataset.empty === 'true');
  });
  function cancelDrag() { endDrag(false); }
  function detailsOpen() { return panel.classList.contains('has-selection'); }
  function dragging() { return !!drag?.active; }
  function focusStep(key) {
    const buttons = [...panel.querySelectorAll('.item-slot')];
    if (!buttons.length) return;
    let index = buttons.indexOf(document.activeElement);
    if (index < 0) index = buttons.findIndex(el => el.classList.contains('is-selected'));
    if (index < 0) index = 0;
    const cols = columnsOf(buttons[index].closest('.slot-grid'));
    const next = gridStep(index, buttons.length, cols, key);
    const slotKey = buttons[next].dataset.slotKey;
    hooks.onSelect(slotKey);
    panel.querySelector(`[data-slot-key="${CSS.escape(slotKey)}"]`)?.focus();
  }
  function activateFocused() { hooks.onActivate(); }

  return {root: panel, update, cancelDrag, detailsOpen, dragging, focusStep, activateFocused, cardOpen: () => !card.hidden, closeCard,
    destroy() { resize?.disconnect(); clearTimeout(press?.timer); ghost.remove(); card.remove(); panel.remove(); }};
}

/**
 * The item card's contents. `data`: {name, rarity, color, iconHTML, kind, effect, note, lines[], facts[], uses[]}
 * (main.mjs itemCard). Text goes in as text; only the icon is markup.
 */
export function itemCardNode(data, close) {
  const box = document.createElement('div');
  box.className = 'item-card';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', data.name || 'Item');
  box.style.setProperty('--rarity', data.color || '#d8d2c2');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const head = el('div', 'item-card__head');
  const art = el('div', 'item-card__icon'); art.innerHTML = data.iconHTML || '';
  const titles = el('div', 'item-card__titles');
  titles.append(el('h3', '', data.name || ''), el('p', 'item-card__kind', [data.rarity, data.kind].filter(Boolean).join(' · ')));
  const shut = el('button', 'item-card__close', '✕'); shut.type = 'button'; shut.setAttribute('aria-label', 'Close'); shut.addEventListener('click', close);
  head.append(art, titles, shut);
  box.append(head);
  if (data.effect) box.append(el('p', 'item-card__effect', data.effect));
  if (data.facts?.length) { const row = el('div', 'item-card__facts'); for (const f of data.facts) row.append(el('span', '', f)); box.append(row); }
  if (data.lines?.length) { const list = el('ul', 'item-card__lines'); for (const line of data.lines) list.append(el('li', '', line)); box.append(list); }
  if (data.note) box.append(el('p', 'item-card__note', data.note));
  if (data.uses?.length) box.append(el('p', 'item-card__uses', `Used to make: ${data.uses.join(', ')}`));
  return box;
}

export function stackMaxDurability(itemId) {
  return itemDefinition(itemId)?.maxDurability || EQUIPMENT[itemId]?.durability || null;
}
