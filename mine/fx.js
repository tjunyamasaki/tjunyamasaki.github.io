const ROCK_OUTLINES = [
  "M12 35 27 16 53 10 76 20 91 43 86 68 69 85 39 89 16 73 8 54Z",
  "M9 44 20 22 42 12 69 15 87 32 94 57 79 79 54 88 28 83 11 65Z",
  "M10 33 33 12 61 14 83 29 91 52 80 78 58 90 29 84 8 61Z"
];

const PALETTES = {
  stone: ["#c4bfb6", "#8a8680", "#5a5650", "#d8d4cc"],
  iron: ["#e8f0f8", "#9eb0c4", "#c0d4e4", "#6a8498"],
  gold: ["#fff3c4", "#e8c547", "#ffd070", "#c49220"],
  diamond: ["#ffffff", "#7ee7f2", "#c4b0ff", "#e8ffff", "#9ef0ff"],
};

let canvas;
let ctx;
let particles = [];
let running = false;
let reduced = false;

export function prefersReduced() {
  return reduced;
}

export function initFx(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resize();
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(canvas);
  }
  requestAnimationFrame(resize);
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

export function rockMarkup(type, index) {
  const outline = ROCK_OUTLINES[index % ROCK_OUTLINES.length];
  return `<svg class="rock-art" viewBox="0 0 100 100" aria-hidden="true">
    <path class="rock-outline" d="${outline}" />
    <path class="rock-wash" d="M17 36 31 23 52 18 69 25 49 29 36 42 19 48Z" />
    <path class="rock-strata" d="m18 58 18-5 13 7 17-5 15 7 M28 73l18-4 15 7 M56 32l17 6 7 12" />
    <g class="mineral-seam">
      <path class="vein-bed" d="m26 65 13-14 14-3 9-15 14-7 M52 49l12 9 12-2" />
      <path class="vein-light" d="m27 64 13-12 13-3 10-15 12-7" />
      <path class="ore-chip" d="m35 49 8-4 3 7-8 5Z m25-18 5-7 6 3-3 9Z m8 26 8-3 3 5-7 4Z" />
    </g>
    <g class="rock-cracks">
      <path class="c1" d="m46 20 5 18-9 12 12 10-5 22" />
      <path class="c2" d="m43 49-16-5-13 7 M54 60l15-12 17 5 M50 38l16-12" />
    </g>
    <path class="rock-flecks" d="m26 32 3-2 m-8 35 3 1 m42 9 3-2 m8-30 2 3" />
  </svg><span class="impact"></span>`;
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { clientWidth: w, clientHeight: h } = canvas;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick() {
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 1;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    p.vx *= p.drag;
    const t = p.life / p.max;
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === "spark") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-p.size * 2, 0);
      ctx.lineTo(p.size * 2, 0);
      ctx.stroke();
    } else if (p.kind === "shard") {
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.7, p.size);
      ctx.lineTo(-p.size * 0.7, p.size);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    p.rot += p.spin;
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(tick);
}

function addParticle(p) {
  p.max = p.life;
  particles.push(p);
}

export function burst(x, y, type, extra = 0) {
  const colors = PALETTES[type] || PALETTES.stone;
  const n = reduced ? 6 : 18 + extra;
  const kind =
    type === "diamond" ? "shard" : type === "iron" ? "spark" : "dust";
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.2 + Math.random() * (type === "iron" ? 6 : 3.4);
    addParticle({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (type === "gold" ? 1.2 : 0.4),
      g: type === "diamond" ? 0.04 : 0.12,
      drag: 0.96,
      size: type === "diamond" ? 3 + Math.random() * 3 : 1.6 + Math.random() * 3.2,
      color: colors[i % colors.length],
      life: 28 + Math.random() * 24,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.18,
      kind: type === "gold" ? "dust" : kind,
    });
  }
}

export function impactFlash(cube) {
  cube.classList.remove("hit");
  void cube.offsetWidth;
  cube.classList.add("hit");
  window.setTimeout(() => cube.classList.remove("hit"), 300);
}

export function swingPick(pick, cube, tier) {
  const r = cube.getBoundingClientRect();
  pick.classList.remove("swing");
  void pick.getBoundingClientRect();
  pick.setAttribute("class", `pickaxe show swing tier-${tier}`);
  pick.style.left = `${r.left + r.width * 0.48}px`;
  pick.style.top = `${r.top + r.height * 0.38 - pick.getBoundingClientRect().height * 0.27}px`;
  window.clearTimeout(pick._hide);
  pick._hide = window.setTimeout(() => {
    pick.classList.remove("swing", "show");
  }, reduced ? 80 : 380);
}

export function shake(el, px = 7) {
  if (reduced) return;
  el.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${px}px, ${-px * 0.4}px)` },
      { transform: `translate(${-px * 0.8}px, ${px * 0.3}px)` },
      { transform: `translate(${px * 0.4}px, ${-px * 0.2}px)` },
      { transform: "translate(0, 0)" },
    ],
    { duration: 320, easing: "ease-out" }
  );
}

export function shatter(cube, type) {
  const origin = cube.getBoundingClientRect();
  // Small flat chips replace the old flying cube faces.
  for (let i = 0; i < (reduced ? 3 : 7); i++) {
    const ghost = document.createElement("span");
    ghost.className = "rock-chip";
    ghost.style.left = `${origin.left + origin.width * (0.3 + Math.random() * 0.4)}px`;
    ghost.style.top = `${origin.top + origin.height * 0.5}px`;
    ghost.style.background = PALETTES[type][i % PALETTES[type].length];
    document.body.appendChild(ghost);
    ghost.animate([
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${(Math.random() - 0.5) * 90}px, ${25 + Math.random() * 45}px) rotate(${i * 43}deg)`, opacity: 0 }
    ], { duration: reduced ? 80 : 420, easing: "ease-out", fill: "forwards" })
      .finished.then(() => ghost.remove()).catch(() => ghost.remove());
  }
  cube.classList.add("broken");
  burst(origin.left + origin.width / 2, origin.top + origin.height * 0.38, type, type === "diamond" ? 10 : 0);
}

export function flyOre(fromEl, toEl, type) {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = `flyer flyer-${type}`;
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height * 0.28;
  const x1 = b.left + b.width / 2;
  const y1 = b.top + b.height / 2;
  el.style.left = `${x0}px`;
  el.style.top = `${y0}px`;
  document.body.appendChild(el);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dur = reduced ? 120 : 640;
  return el
    .animate(
      [
        { transform: "translate(-50%, -50%) scale(0.55)", opacity: 1, offset: 0 },
        {
          transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.25 - 48}px)) scale(1.2)`,
          offset: 0.48,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)`,
          opacity: 0.85,
          offset: 1,
        },
      ],
      { duration: dur, easing: "cubic-bezier(.22,.8,.18,1)" }
    )
    .finished.then(() => el.remove())
    .catch(() => el.remove());
}

export function popCount(oreEl) {
  oreEl.classList.remove("pop");
  void oreEl.offsetWidth;
  oreEl.classList.add("pop");
  window.setTimeout(() => oreEl.classList.remove("pop"), 450);
}

export function forgeCeremony(anvil) {
  anvil.classList.add("forging");
  const ms = reduced ? 200 : 1200;
  return new Promise((resolve) => {
    window.setTimeout(() => {
      anvil.classList.remove("forging");
      resolve();
    }, ms);
  });
}

export function wait(ms) {
  return new Promise((r) => window.setTimeout(r, reduced ? Math.min(ms, 80) : ms));
}
