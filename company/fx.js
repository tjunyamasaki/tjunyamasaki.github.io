let canvas;
let ctx;
let particles = [];
let shocks = [];
let running = false;
let reduced = false;
let look = "a";

export function prefersReduced() {
  return reduced;
}

export function setFxLook(id) {
  look = id === "b" || id === "c" ? id : "a";
}

export function initFx(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener("change", (ev) => {
    reduced = ev.matches;
  });
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
    ctx.strokeStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === "pixel") {
      const s = p.size * (0.7 + t * 0.5);
      ctx.fillRect(-s, -s, s * 2, s * 2);
    } else if (p.kind === "ink") {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.4 * t, p.size * t, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "shard") {
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.45, p.size);
      ctx.lineTo(-p.size * 0.45, p.size);
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

  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i];
    s.life -= 1;
    if (s.life <= 0) {
      shocks.splice(i, 1);
      continue;
    }
    const t = s.life / s.max;
    s.r += s.grow;
    ctx.globalAlpha = Math.max(0, t * 0.85);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * t;
    ctx.beginPath();
    if (look === "c") {
      const side = s.r * 1.4;
      ctx.strokeRect(s.x - side / 2, s.y - side / 2, side, side);
    } else {
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(tick);
}

function addParticle(p) {
  p.max = p.life;
  particles.push(p);
}

const PALETTES = {
  a: {
    coral: ["#d24a24", "#ef9a3c", "#e6dcc8", "#d24a24"],
    mix: ["#ef9a3c", "#4a6a38", "#e6dcc8", "#d24a24", "#8a8070"],
    shock: "#ef9a3c",
    ring: "#e6dcc8",
  },
  b: {
    coral: ["#7a2830", "#b08a3c", "#24180e", "#f0e4c0"],
    mix: ["#24180e", "#b08a3c", "#7a2830", "#5a4030", "#f0e4c0"],
    shock: "#24180e",
    ring: "#b08a3c",
  },
  c: {
    coral: ["#d03050", "#f8d848", "#f0ece0", "#d03050"],
    mix: ["#f0ece0", "#58c060", "#f8d848", "#d03050", "#4060b0"],
    shock: "#f0ece0",
    ring: "#58c060",
  },
};

function palette(name) {
  const pack = PALETTES[look] || PALETTES.a;
  return pack[name] || pack.mix;
}

function particleKind(i) {
  if (look === "c") return i % 2 === 0 ? "pixel" : "dot";
  if (look === "b") return i % 3 === 0 ? "ink" : "dot";
  return i % 3 === 0 ? "shard" : "ember";
}

export function bloom(x, y, key = "mix") {
  const colors = palette(key === "coral" ? "coral" : "mix");
  const pack = PALETTES[look] || PALETTES.a;
  const n = reduced ? 6 : 22;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.4 + Math.random() * 4.6;
    const kind = particleKind(i);
    addParticle({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.8,
      g: kind === "pixel" ? 0.03 : 0.08,
      drag: 0.96,
      size: kind === "pixel" ? 3 + Math.random() * 3.5 : 2.4 + Math.random() * 4.2,
      color: colors[i % colors.length],
      life: 26 + Math.random() * 22,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.22,
      kind,
    });
  }
  shocks.push({
    x,
    y,
    r: 8,
    grow: reduced ? 4 : 7,
    width: 6,
    color: key === "coral" ? pack.coral[0] : pack.shock,
    life: reduced ? 12 : 22,
    max: reduced ? 12 : 22,
  });
  if (!reduced) {
    shocks.push({
      x,
      y,
      r: 4,
      grow: 11,
      width: 3,
      color: pack.ring,
      life: 16,
      max: 16,
    });
  }
}

export function chewWell(well, wrap) {
  well.classList.remove("is-chew");
  wrap.classList.remove("is-ripple");
  void well.offsetWidth;
  well.classList.add("is-chew");
  wrap.classList.add("is-ripple");
  window.setTimeout(() => {
    well.classList.remove("is-chew");
    wrap.classList.remove("is-ripple");
  }, reduced ? 80 : 340);
}

export function popTrait(el, trait) {
  const cls = `pop-${trait}`;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), reduced ? 80 : 450);
}

export function clash(pit, ms) {
  pit.classList.add("is-clash");
  const dur = reduced ? Math.min(ms, 180) : ms;
  return wait(dur).then(() => {
    pit.classList.remove("is-clash");
  });
}

export function stampSlam(stampEl) {
  stampEl.hidden = false;
  stampEl.classList.add("is-on");
  const ms = reduced ? 180 : 720;
  return wait(ms).then(() => {
    stampEl.classList.remove("is-on");
    stampEl.hidden = true;
  });
}

export function shake(el, px = 8) {
  if (reduced) return Promise.resolve();
  return el
    .animate(
      [
        { transform: "translate(0, 0)" },
        { transform: `translate(${px}px, ${-px * 0.4}px)` },
        { transform: `translate(${-px * 0.7}px, ${px * 0.3}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: 280, easing: "ease-out" }
    )
    .finished.catch(() => {});
}

export function wait(ms) {
  return new Promise((r) => window.setTimeout(r, reduced ? Math.min(ms, 90) : ms));
}
