import {
  initFx,
  rockMarkup,
  swingPick,
  impactFlash,
  burst,
  shatter,
  flyOre,
  popCount,
  shake,
  forgeCeremony,
  wait,
} from "./fx.js";

const COLS = 4;
const ROWS = 3;
const HITS = [3, 2, 1];
const TIER_NAME = ["wood", "iron", "gold"];
const FORGE = [
  { need: "iron", cost: 6, label: "Forge iron pick", next: 1 },
  { need: "gold", cost: 5, label: "Forge gold pick", next: 2 },
];
const FOUND = {
  iron: { kicker: "the stone splits colder", name: "Iron vein" },
  gold: { kicker: "the wall runs warm", name: "Gold vein" },
  diamond: { kicker: "light in the dark", name: "Diamond" },
};

const ores = { stone: 0, iron: 0, gold: 0, diamond: 0 };
const seen = { iron: false, gold: false, diamond: false };
let pickTier = 0;
let forging = false;
let lastInput = Date.now();
let cells = [];

const grid = document.querySelector("#grid");
const scene = document.querySelector("#scene");
const shakeEl = document.querySelector("#shake");
const pick = document.querySelector("#pickaxe");
const foundEl = document.querySelector("#found");
const foundKicker = document.querySelector("#found-kicker");
const foundName = document.querySelector("#found-name");
const forgeBtn = document.querySelector("#forge");
const forgeLabel = document.querySelector("#forge-label");
const forgeCost = document.querySelector("#forge-cost");
const anvil = document.querySelector("#anvil");
const canvas = document.querySelector("#fx");

initFx(canvas);

function hitsNeeded() {
  return HITS[pickTier];
}

function rollType() {
  const r = Math.random();
  if (ores.gold >= 2 && r < 0.1) return "diamond";
  if (ores.iron >= 3 && r < 0.22) return "gold";
  if (ores.stone >= 4 && r < 0.4) return "iron";
  return "stone";
}

function labelFor(type) {
  return type[0].toUpperCase() + type.slice(1);
}

function makeCube(index, type, spawnClass = "spawn") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `cube cube-${type} ${spawnClass}`;
  btn.dataset.i = String(index);
  btn.dataset.type = type;
  btn.dataset.cracks = "0";
  btn.style.setProperty("--i", String(index));
  btn.setAttribute("aria-label", labelFor(type));
  btn.innerHTML = rockMarkup(type, index);
  btn.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    lastInput = Date.now();
    strike(index);
  });
  return btn;
}

function fillGrid() {
  grid.innerHTML = "";
  cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const type = "stone";
    const el = makeCube(i, type, "spawn");
    grid.appendChild(el);
    cells[i] = { type, hits: 0, busy: false, el };
  }
}

async function veinFound(type, cube) {
  if (seen[type]) return;
  seen[type] = true;
  const copy = FOUND[type];
  if (!copy) return;
  cube.classList.add("rare-spawn");
  foundKicker.textContent = copy.kicker;
  foundName.textContent = copy.name;
  foundEl.hidden = false;
  foundEl.classList.add("is-on");
  scene.classList.add("is-finding");
  shake(shakeEl, type === "diamond" ? 10 : 6);
  await wait(1400);
  foundEl.classList.remove("is-on");
  foundEl.hidden = true;
  scene.classList.remove("is-finding");
}

async function refill(index) {
  await wait(280);
  const type = rollType();
  const el = makeCube(index, type, type === "stone" ? "spawn" : "spawn rare-spawn");
  el.style.setProperty("--i", "0");
  const old = cells[index].el;
  old.replaceWith(el);
  cells[index] = { type, hits: 0, busy: false, el };
  if (type !== "stone") await veinFound(type, el);
}

async function strike(index) {
  const cell = cells[index];
  if (!cell || cell.busy || forging) return;
  cell.busy = true;
  const { el, type } = cell;
  swingPick(pick, el, TIER_NAME[pickTier]);
  impactFlash(el);
  const box = el.getBoundingClientRect();
  burst(box.left + box.width / 2, box.top + box.height * 0.32, type, -8);
  cell.hits += 1;
  const need = hitsNeeded();

  if (cell.hits < need) {
    el.dataset.cracks = String(Math.min(2, cell.hits));
    cell.busy = false;
    return;
  }

  shatter(el, type);
  if (type === "diamond") shake(shakeEl, 8);
  const hud = document.querySelector(`#ore-${type}`);
  await flyOre(el, hud, type);
  ores[type] += 1;
  const countEl = document.querySelector(`#count-${type}`);
  countEl.textContent = String(ores[type]);
  popCount(hud);
  paintForge();
  await refill(index);
}

function paintForge() {
  if (pickTier >= 2) {
    forgeBtn.disabled = true;
    forgeBtn.classList.add("done");
    forgeLabel.textContent = "Pick complete";
    forgeCost.textContent = "Gold inlay";
    pick.classList.add("tier-gold");
    return;
  }
  const step = FORGE[pickTier];
  const have = ores[step.need];
  const ready = have >= step.cost;
  forgeBtn.disabled = !ready;
  forgeBtn.classList.remove("done");
  forgeLabel.textContent = ready ? step.label : `Need ${step.need}`;
  forgeCost.textContent = `${step.cost} ${step.need}`;
}

forgeBtn.addEventListener("click", async () => {
  if (forging || pickTier >= 2) return;
  const step = FORGE[pickTier];
  if (ores[step.need] < step.cost) return;
  lastInput = Date.now();
  forging = true;
  forgeBtn.disabled = true;
  ores[step.need] -= step.cost;
  document.querySelector(`#count-${step.need}`).textContent = String(ores[step.need]);
  await forgeCeremony(anvil);
  pickTier = step.next;
  pick.setAttribute("class", `pickaxe tier-${TIER_NAME[pickTier]}`);
  forging = false;
  paintForge();
});

function idleTick() {
  if (forging) return;
  if (Date.now() - lastInput < 4000) return;
  const live = cells.filter((c) => c && !c.busy && !c.el.classList.contains("broken"));
  if (!live.length) return;
  const pickCell = live[Math.floor(Math.random() * live.length)];
  strike(Number(pickCell.el.dataset.i));
}

fillGrid();
paintForge();
window.setInterval(idleTick, 900);

document.addEventListener("pointerdown", () => {
  lastInput = Date.now();
});
