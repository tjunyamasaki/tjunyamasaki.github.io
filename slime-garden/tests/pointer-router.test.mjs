import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DRAG_THRESHOLD_PX } from '../src/scene/layout.mjs';
import { createPointerRouter } from '../src/input/pointer-router.mjs';

const GROUND = Object.freeze({
  kind: 'ground',
  point: Object.freeze({ x: 1.1, z: 2 }),
  valid: true,
});
const SLIME = Object.freeze({ kind: 'slime', slimeId: 'slime-1' });

function freezeEconomy() {
  return Object.freeze({
    berries: 5,
    totalFeeds: 1,
    foods: Object.freeze([{ id: 'food-1' }]),
  });
}

function createCollector(overrides = {}) {
  /** @type {object[]} */
  const intents = [];
  /** @type {object[]} */
  const camera = [];
  let mode = overrides.mode ?? 'care';
  let tool = overrides.tool ?? 'berry';
  let over = overrides.over ?? true;
  let hud = overrides.hud ?? false;
  const hit = overrides.hit ?? GROUND;
  const economy = overrides.economy ?? freezeEconomy();
  const router = createPointerRouter({
    getMode: () => mode,
    getTool: () => tool,
    pick: () => hit,
    onIntent: (intent) => {
      intents.push(intent);
    },
    onCamera: (intent) => {
      camera.push(intent);
    },
    isOverPlaySurface: () => over,
    isHudHit: () => hud,
    ...overrides.extra,
  });
  return {
    router,
    intents,
    camera,
    economy,
    setMode(next) {
      mode = next;
    },
    setTool(next) {
      tool = next;
    },
    setOver(next) {
      over = next;
    },
    setHud(next) {
      hud = next;
    },
    types() {
      return intents.map((i) => i.type);
    },
    camTypes() {
      return camera.map((i) => i.type);
    },
  };
}

function pointer(partial = {}) {
  return {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 100,
    clientY: 100,
    button: 0,
    buttons: 1,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {},
    ...partial,
  };
}

function tap(router, x = 100, y = 100, id = 1) {
  router.handlePointerDown(pointer({ pointerId: id, clientX: x, clientY: y }));
  router.handlePointerUp(pointer({ pointerId: id, clientX: x, clientY: y }));
}

describe('phase-2 pointer router', () => {
  test('drag-return: Care move >6px, return to start, release → zero WORLD_CLICK', () => {
    const c = createCollector();
    c.router.handlePointerDown(pointer({ clientX: 100, clientY: 100 }));
    c.router.handlePointerMove(pointer({ clientX: 100, clientY: 100 + DRAG_THRESHOLD_PX + 4 }));
    c.router.handlePointerMove(pointer({ clientX: 100, clientY: 100 }));
    c.router.handlePointerUp(pointer({ clientX: 100, clientY: 100 }));
    assert.deepEqual(c.types(), []);
    assert.equal(c.economy.berries, 5);
  });

  test('direct tap: Care, <6px, primary, on surface → exactly one WORLD_CLICK with stub hit', () => {
    const c = createCollector({ hit: SLIME });
    c.router.handlePointerDown(pointer({ clientX: 40, clientY: 50 }));
    c.router.handlePointerMove(pointer({ clientX: 43, clientY: 52 }));
    c.router.handlePointerUp(pointer({ clientX: 43, clientY: 52 }));
    assert.equal(c.intents.length, 1);
    assert.equal(c.intents[0].type, 'WORLD_CLICK');
    assert.equal(c.intents[0].tool, 'berry');
    assert.deepEqual(c.intents[0].hit, SLIME);
    assert.deepEqual(c.camTypes(), []);
  });

  test('orbit drag over a stub slime/ground hit → ORBIT only, no WORLD_CLICK', () => {
    const c = createCollector({ mode: 'orbit', hit: SLIME });
    c.router.handlePointerDown(pointer({ clientX: 10, clientY: 10 }));
    c.router.handlePointerMove(pointer({ clientX: 40, clientY: 18 }));
    c.router.handlePointerUp(pointer({ clientX: 40, clientY: 18 }));
    assert.ok(c.camTypes().includes('ORBIT'));
    assert.ok(c.camTypes().every((t) => t === 'ORBIT'));
    assert.deepEqual(c.types(), []);
  });

  test('right-drag in orbit → PAN, no WORLD_CLICK', () => {
    const c = createCollector({ mode: 'orbit', hit: GROUND });
    c.router.handlePointerDown(pointer({ button: 2, buttons: 2, clientX: 10, clientY: 10 }));
    c.router.handlePointerMove(pointer({ button: -1, buttons: 2, clientX: 40, clientY: 30 }));
    c.router.handlePointerUp(pointer({ button: 2, buttons: 0, clientX: 40, clientY: 30 }));
    assert.ok(c.camTypes().includes('PAN'));
    assert.ok(c.camTypes().every((t) => t === 'PAN'));
    assert.deepEqual(c.types(), []);
  });

  test('pinch then lift one finger → no WORLD_CLICK on remaining release', () => {
    const c = createCollector({ mode: 'care' });
    c.router.handlePointerDown(pointer({ pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 80 }));
    c.router.handlePointerDown(pointer({ pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 80 }));
    c.router.handlePointerMove(pointer({ pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 90 }));
    c.router.handlePointerMove(pointer({ pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 70 }));
    c.router.handlePointerUp(pointer({ pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 70 }));
    c.router.handlePointerUp(pointer({ pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 90 }));
    assert.deepEqual(c.types(), []);
    assert.deepEqual(c.camTypes(), []);
    assert.equal(c.economy.foods.length, 1);
  });

  test('Care two-finger pinch does not emit camera ZOOM/PAN; Orbit pinch does', () => {
    const care = createCollector({ mode: 'care' });
    care.router.handlePointerDown(pointer({ pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 80 }));
    care.router.handlePointerDown(pointer({ pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 80 }));
    care.router.handlePointerMove(pointer({ pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 80 }));
    care.router.handlePointerMove(pointer({ pointerId: 2, pointerType: 'touch', clientX: 160, clientY: 80 }));
    assert.deepEqual(care.camTypes(), []);
    assert.deepEqual(care.types(), []);

    const orbit = createCollector({ mode: 'orbit' });
    orbit.router.handlePointerDown(pointer({ pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 80 }));
    orbit.router.handlePointerDown(pointer({ pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 80 }));
    orbit.router.handlePointerMove(pointer({ pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 90 }));
    orbit.router.handlePointerMove(pointer({ pointerId: 2, pointerType: 'touch', clientX: 160, clientY: 70 }));
    assert.ok(orbit.camTypes().includes('ZOOM') || orbit.camTypes().includes('PAN'));
    assert.ok(orbit.camTypes().every((t) => t === 'ZOOM' || t === 'PAN'));
    assert.deepEqual(orbit.types(), []);
  });

  test('pointercancel / lostcapture / release-outside / blur / mode switch / dialog-open clear candidates', () => {
    function leftoverUpMustNotClick(setup) {
      const c = createCollector();
      c.router.handlePointerDown(pointer({ clientX: 20, clientY: 20 }));
      setup(c);
      c.router.handlePointerUp(pointer({ clientX: 21, clientY: 21 }));
      assert.deepEqual(c.types(), [], String(setup));
      return c;
    }

    leftoverUpMustNotClick((c) => {
      c.router.handlePointerCancel(pointer({ clientX: 20, clientY: 20 }));
    });
    leftoverUpMustNotClick((c) => {
      c.router.handleLostPointerCapture(pointer({ clientX: 20, clientY: 20 }));
    });
    leftoverUpMustNotClick((c) => {
      c.setOver(false);
    });
    leftoverUpMustNotClick((c) => {
      c.router.handleBlur();
    });
    leftoverUpMustNotClick((c) => {
      c.setMode('orbit');
      c.router.notifyModeChange();
    });
    leftoverUpMustNotClick((c) => {
      c.router.notifyDialogOpen();
    });
  });

  test('third touch cancels until all pointers are released', () => {
    const c = createCollector({ mode: 'orbit' });
    c.router.handlePointerDown(pointer({ pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 }));
    c.router.handlePointerDown(pointer({ pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 10 }));
    c.router.handlePointerDown(pointer({ pointerId: 3, pointerType: 'touch', clientX: 70, clientY: 10 }));
    const afterThird = c.camera.length;
    c.router.handlePointerMove(pointer({ pointerId: 1, pointerType: 'touch', clientX: 18, clientY: 40 }));
    c.router.handlePointerMove(pointer({ pointerId: 2, pointerType: 'touch', clientX: 55, clientY: 44 }));
    assert.equal(c.camera.length, afterThird);
    c.router.handlePointerUp(pointer({ pointerId: 1, pointerType: 'touch' }));
    c.router.handlePointerUp(pointer({ pointerId: 2, pointerType: 'touch' }));
    c.router.handlePointerMove(pointer({ pointerId: 3, pointerType: 'touch', clientX: 90, clientY: 90 }));
    assert.equal(c.camera.length, afterThird);
    c.router.handlePointerUp(pointer({ pointerId: 3, pointerType: 'touch' }));
    assert.deepEqual(c.types(), []);

    c.setMode('care');
    tap(c.router, 15, 15, 9);
    assert.equal(c.intents.length, 1);
    assert.equal(c.intents[0].type, 'WORLD_CLICK');
  });

  test('Ctrl/Meta wheel does not zoom; orbit wheel is consumed and clamped via ZOOM factor', () => {
    const c = createCollector({ mode: 'orbit' });
    let prevented = 0;
    const ctrl = pointer({
      deltaY: 120,
      deltaMode: 0,
      ctrlKey: true,
      preventDefault() {
        prevented += 1;
      },
    });
    assert.equal(c.router.handleWheel(ctrl), false);
    assert.equal(prevented, 0);
    assert.deepEqual(c.camTypes(), []);

    const meta = pointer({
      deltaY: 120,
      deltaMode: 0,
      metaKey: true,
      preventDefault() {
        prevented += 1;
      },
    });
    c.router.handleWheel(meta);
    assert.equal(prevented, 0);

    c.setOver(false);
    c.router.handleWheel({
      deltaY: 80,
      deltaMode: 0,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {
        prevented += 1;
      },
    });
    assert.equal(prevented, 0);

    c.setOver(true);
    const factors = [];
    const orbit = createCollector({ mode: 'orbit' });
    orbit.router.handleWheel({
      deltaY: 1e9,
      deltaMode: 0,
      preventDefault() {
        prevented += 1;
      },
    });
    orbit.router.handleWheel({
      deltaY: 3,
      deltaMode: 1,
      preventDefault() {},
    });
    orbit.router.handleWheel({
      deltaY: 1,
      deltaMode: 2,
      preventDefault() {},
    });
    for (const intent of orbit.camera) factors.push(intent.factor);
    assert.equal(orbit.camera[0].type, 'ZOOM');
    assert.ok(prevented >= 1);
    assert.equal(factors[0], factors[2], 'page-1 and huge pixel share the clamp');
    assert.notEqual(factors[1], factors[0]);
  });

  test('router/camera traces never write berries/feeds on a frozen dummy', () => {
    const economy = freezeEconomy();
    const c = createCollector({ economy, mode: 'care' });
    tap(c.router);
    c.setMode('orbit');
    c.router.notifyModeChange();
    c.router.handlePointerDown(pointer({ clientX: 0, clientY: 0 }));
    c.router.handlePointerMove(pointer({ clientX: 30, clientY: 12 }));
    c.router.handlePointerUp(pointer({ clientX: 30, clientY: 12 }));
    c.router.handleWheel({ deltaY: 40, deltaMode: 0, preventDefault() {} });
    assert.equal(economy.berries, 5);
    assert.equal(economy.totalFeeds, 1);
    assert.equal(economy.foods.length, 1);
  });

  test('dispose then another attach does not double-fire', () => {
    const intents = [];
    function mockTarget() {
      /** @type {Map<string, Function[]>} */
      const map = new Map();
      return {
        map,
        addEventListener(type, fn) {
          const list = map.get(type) || [];
          list.push(fn);
          map.set(type, list);
        },
        removeEventListener(type, fn) {
          const list = map.get(type) || [];
          map.set(
            type,
            list.filter((item) => item !== fn),
          );
        },
        fire(type, event) {
          for (const fn of map.get(type) || []) fn(event);
        },
        count(type) {
          return (map.get(type) || []).length;
        },
      };
    }
    const el = mockTarget();
    const win = mockTarget();
    const router = createPointerRouter({
      getMode: () => 'care',
      getTool: () => 'berry',
      pick: () => GROUND,
      onIntent: (intent) => intents.push(intent),
      onCamera: () => {},
      isOverPlaySurface: () => true,
      getWindow: () => win,
    });
    router.attach(el);
    router.dispose();
    assert.equal(el.count('pointerdown'), 0);
    assert.equal(el.count('wheel'), 0);
    assert.equal(win.count('pointerup'), 0);
    assert.equal(win.count('blur'), 0);
    router.attach(el);
    assert.equal(el.count('pointerdown'), 1);
    assert.equal(win.count('pointerup'), 1);
    el.fire('pointerdown', pointer({ clientX: 8, clientY: 8, target: el }));
    win.fire('pointerup', pointer({ clientX: 8, clientY: 8, target: el }));
    assert.equal(intents.length, 1);
    router.dispose();
    el.fire('pointerdown', pointer({ clientX: 8, clientY: 8, target: el }));
    win.fire('pointerup', pointer({ clientX: 8, clientY: 8, target: el }));
    assert.equal(intents.length, 1);
  });

  test('Care does not capture; Orbit primary down captures when the target allows it', () => {
    const captured = [];
    const target = {
      setPointerCapture(id) {
        captured.push(id);
      },
      releasePointerCapture() {},
    };
    const care = createCollector();
    care.router.handlePointerDown(pointer({ target, pointerId: 4 }));
    care.router.handlePointerUp(pointer({ target, pointerId: 4 }));
    assert.deepEqual(captured, []);

    const orbit = createCollector({ mode: 'orbit' });
    orbit.router.handlePointerDown(pointer({ target, pointerId: 5 }));
    orbit.router.handlePointerUp(pointer({ target, pointerId: 5 }));
    assert.deepEqual(captured, [5]);
  });

  test('releasing after a Care drag does not also emit WORLD_CLICK', () => {
    const c = createCollector();
    c.router.handlePointerDown(pointer({ clientX: 0, clientY: 0 }));
    c.router.handlePointerMove(pointer({ clientX: 20, clientY: 0 }));
    c.router.handlePointerUp(pointer({ clientX: 20, clientY: 0 }));
    assert.deepEqual(c.types(), []);
  });
});
