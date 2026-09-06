import {
  initFx,
  setFxLook,
  bloom,
  chewWell,
  popTrait,
  clash,
  stampSlam,
  shake,
  wait,
} from "./fx.js";

const AIR_MAX = 8;
const IDLE_MS = 4000;
const STORE = "company.familiar.v1";
const LOOK_STORE = "company.look.v1";
const LOOKS = ["a", "b", "c"];
const TRAIT_CAP = 3;
const BEATS = ["eat", "freeze", "fuse"];
const DROPS = {
  scrap: { kicker: "iron from below", name: "Scrap", trait: "horn" },
  egg: { kicker: "a monster egg", name: "Egg", trait: "eye" },
  relic: { kicker: "dungeon brass", name: "Relic", trait: "ribbon" },
  event: { kicker: "a ghost stirs", name: "Event", trait: "glow" },
};
const LOOK_META = {
  a: { kicker: "Torch dungeon", well: "Delve the pit", plate: "Imp-slime" },
  b: { kicker: "Bestiary plate", well: "Scratch the circle", plate: "Pit-spawn" },
  c: { kicker: "JRPG dungeon", well: "Descend the stairs", plate: "Fam." },
};

let air = 0;
let traits = [];
let busy = false;
let lastInput = Date.now();

const scene = document.querySelector("#scene");
const well = document.querySelector("#well");
const wellWrap = document.querySelector("#well-wrap");
const familiar = document.querySelector("#familiar");
const airHud = document.querySelector("#air");
const airFill = document.querySelector("#air-fill");
const ensoFill = document.querySelector("#enso-fill");
const toastEl = document.querySelector("#toast");
const toastKicker = document.querySelector("#toast-kicker");
const toastName = document.querySelector("#toast-name");
const surfaceBtn = document.querySelector("#surface");
const pit = document.querySelector("#pit");
const pitHero = document.querySelector("#pit-hero");
const pitGhost = document.querySelector("#pit-ghost");
const pitCall = document.querySelector("#pit-call");
const stampEl = document.querySelector("#stamp");
const canvas = document.querySelector("#fx");
const kickerEl = document.querySelector("#kicker");
const plateEl = document.querySelector("#familiar-plate");
const lookBtns = [...document.querySelectorAll(".look-btn")];

initFx(canvas);
restoreLook();
restore();
paintAir();
paintFamiliar();

well.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  lastInput = Date.now();
  tapWell();
});

surfaceBtn.addEventListener("click", () => {
  lastInput = Date.now();
  surface();
});

for (const btn of lookBtns) {
  btn.addEventListener("click", () => {
    lastInput = Date.now();
    applyLook(btn.dataset.look);
  });
}

document.addEventListener("pointerdown", () => {
  lastInput = Date.now();
});

window.setInterval(idleTick, 900);

function restoreLook() {
  let stored = "a";
  try {
    stored = localStorage.getItem(LOOK_STORE) || "a";
  } catch {
    stored = "a";
  }
  applyLook(stored, { persist: false });
}

function applyLook(id, opts = {}) {
  const next = LOOKS.includes(id) ? id : "a";
  document.documentElement.classList.remove("look-a", "look-b", "look-c");
  document.documentElement.classList.add(`look-${next}`);
  const meta = LOOK_META[next];
  kickerEl.textContent = meta.kicker;
  well.setAttribute("aria-label", meta.well);
  plateEl.textContent = meta.plate;
  setFxLook(next);
  for (const btn of lookBtns) {
    btn.setAttribute("aria-pressed", btn.dataset.look === next ? "true" : "false");
  }
  if (opts.persist === false) return;
  try {
    localStorage.setItem(LOOK_STORE, next);
  } catch {
    /* ignore quota / private mode */
  }
}

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || "null");
    if (Array.isArray(data?.traits)) {
      traits = data.traits
        .filter((t) => ["horn", "eye", "ribbon", "glow"].includes(t))
        .slice(0, TRAIT_CAP);
    }
  } catch {
    traits = [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ traits }));
  } catch {
    /* ignore quota / private mode */
  }
}

function paintAir() {
  const t = air / AIR_MAX;
  const pct = Math.round(t * 100);
  const offset = String(100 * (1 - t));
  scene.style.setProperty("--air", String(t));
  airFill.style.strokeDashoffset = offset;
  ensoFill.style.strokeDashoffset = offset;
  airHud.setAttribute("aria-valuenow", String(pct));
  scene.classList.toggle("is-full", air >= AIR_MAX);
}

function paintFamiliar() {
  familiar.classList.toggle("has-horn", traits.includes("horn"));
  familiar.classList.toggle("has-eye", traits.includes("eye"));
  familiar.classList.toggle("has-ribbon", traits.includes("ribbon"));
  familiar.classList.toggle("has-glow", traits.includes("glow"));
}

function addTrait(id) {
  if (traits.includes(id)) {
    popTrait(familiar, id);
    return;
  }
  if (traits.length >= TRAIT_CAP) traits.shift();
  traits.push(id);
  paintFamiliar();
  persist();
  popTrait(familiar, id);
}

function rollDrop() {
  const r = Math.random();
  if (r < 0.1) return "event";
  if (r < 0.24) return "relic";
  if (r < 0.42) return "egg";
  if (r < 0.62) return "scrap";
  return null;
}

async function showToast(kicker, name, ms = 900) {
  toastKicker.textContent = kicker;
  toastName.textContent = name;
  toastEl.hidden = false;
  toastEl.classList.add("is-on");
  await wait(ms);
  toastEl.classList.remove("is-on");
  toastEl.hidden = true;
}

async function tapWell() {
  if (busy) return;
  chewWell(well, wellWrap);
  const box = well.getBoundingClientRect();
  const next = Math.min(AIR_MAX, air + 1);
  bloom(box.left + box.width / 2, box.top + box.height * 0.55, next >= AIR_MAX ? "coral" : "mix");
  air = next;
  paintAir();

  const full = air >= AIR_MAX;
  if (full) busy = true;

  const drop = rollDrop();
  if (drop) {
    const copy = DROPS[drop];
    addTrait(copy.trait);
    await showToast(copy.kicker, copy.name, 820);
  }

  if (full) await runPit({ auto: true, fill: 1 });
}

async function surface() {
  if (busy) return;
  busy = true;
  await runPit({ auto: false, fill: air / AIR_MAX });
}

async function runPit({ auto, fill }) {
  surfaceBtn.disabled = true;
  mountFighters();
  const beat = BEATS[Math.floor(Math.random() * BEATS.length)];
  pit.hidden = false;
  pitCall.textContent = auto && fill >= 1 ? "Air out" : "Clash";
  const clashMs = 700 + fill * 900;
  await clash(pit, clashMs);
  pit.classList.add(`beat-${beat}`);
  pitCall.textContent = beat === "eat" ? "Chomp" : beat === "freeze" ? "Ice" : "Fuse";
  await wait(fill < 0.4 ? 280 : 520);
  pit.classList.remove(`beat-${beat}`);
  const win = Math.random() < 0.5;
  if (win) {
    await shake(scene, 10);
    await stampSlam(stampEl);
  }
  pit.hidden = true;
  if (!win) await showToast("the ghost kept it", "Kept", 700);
  air = 0;
  paintAir();
  busy = false;
  surfaceBtn.disabled = false;
}

function mountFighters() {
  const svg = familiar.outerHTML;
  pitHero.innerHTML = svg;
  pitGhost.innerHTML = svg;
  pitHero.querySelector(".familiar")?.removeAttribute("id");
  pitGhost.querySelector(".familiar")?.removeAttribute("id");
}

function idleTick() {
  if (busy) return;
  if (!toastEl.hidden) return;
  if (Date.now() - lastInput < IDLE_MS) return;
  tapWell();
}
