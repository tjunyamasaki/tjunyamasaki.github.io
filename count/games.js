export const MIX = "mix";
export const DIFFICULTY_IDS = ["easy", "normal", "hard"];
export const DEFAULT_DIFFICULTY = "easy";

export const GAMES = {
  iso: {
    id: "iso",
    name: "Hidden cubes",
    scoring: "timed",
    prompt: "How many cubes?",
  },
  flash: {
    id: "flash",
    name: "Snapshot",
    scoring: "timed",
    prompt: "How many dots?",
  },
  grid: {
    id: "grid",
    name: "Lit cells",
    scoring: "timed",
    prompt: "How many lit cells?",
  },
  shapes: {
    id: "shapes",
    name: "Circles only",
    scoring: "timed",
    prompt: "How many circles?",
  },
  crossing: {
    id: "crossing",
    name: "Crossing",
    scoring: "race",
    prompt: "How many crossed?",
  },
  rain: {
    id: "rain",
    name: "Rain",
    scoring: "race",
    prompt: "How many drops?",
  },
};

export const GAME_IDS = Object.keys(GAMES);

const LEVEL_CAP = { easy: 0, normal: 0.55, hard: 1 };

function rand() {
  return Math.random();
}

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rand() * (hi - lo + 1));
}

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpInt(a, b, t) {
  return Math.round(lerp(a, b, t));
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function catalog() {
  return GAME_IDS.map((id) => ({
    id,
    name: GAMES[id].name,
    scoring: GAMES[id].scoring,
  }));
}

export function resolveLevel({ roundIndex, roundTotal, difficulty, miniGame }) {
  const cap = LEVEL_CAP[difficulty] ?? LEVEL_CAP.easy;
  const pinned = miniGame && miniGame !== MIX && GAMES[miniGame];
  if (!pinned) return cap;
  if (roundTotal <= 1) return cap;
  const t = (Math.max(1, roundIndex) - 1) / (roundTotal - 1);
  return cap * t;
}

export function freshBag(exceptId) {
  const pool = GAME_IDS.filter((id) => id !== exceptId);
  return shuffle(pool.length ? pool : GAME_IDS.slice());
}

export function pickGameId(game) {
  const pinned = game.settings?.miniGame;
  if (pinned && pinned !== MIX && GAMES[pinned]) {
    game.lastGameId = pinned;
    return pinned;
  }
  if (!Array.isArray(game.gameBag) || game.gameBag.length === 0) {
    game.gameBag = freshBag(game.lastGameId);
  }
  const id = game.gameBag.pop();
  game.lastGameId = id;
  return id;
}

function countIn(easyLo, easyHi, hardLo, hardHi, level) {
  return randInt(
    lerpInt(easyLo, hardLo, level),
    lerpInt(easyHi, hardHi, level)
  );
}

function watchMs(easyMs, hardMs, level) {
  return lerpInt(easyMs, hardMs, level);
}

function guessMs(level) {
  return lerpInt(12000, 8000, level);
}

function scatter(count, { minDist = 0.1, pad = 0.1 } = {}) {
  const items = [];
  let guard = 0;
  while (items.length < count && guard < 900) {
    guard += 1;
    const x = pad + rand() * (1 - pad * 2);
    const y = pad + rand() * (1 - pad * 2);
    const ok = items.every((it) => {
      const dx = it.x - x;
      const dy = it.y - y;
      return dx * dx + dy * dy >= minDist * minDist;
    });
    if (ok) items.push({ x, y });
  }
  while (items.length < count) {
    items.push({
      x: pad + rand() * (1 - pad * 2),
      y: pad + rand() * (1 - pad * 2),
    });
  }
  return items;
}

function placeNonOverlap(specs) {
  const W = 1000;
  const pad = 90;
  const placed = [];
  for (const spec of specs) {
    const r = Math.max(28, spec.s * W);
    let found = null;
    for (let k = 0; k < 500; k++) {
      const x = pad + rand() * (W - pad * 2);
      const y = pad + rand() * (W - pad * 2);
      const ok = placed.every((p) => {
        const dx = p.px - x;
        const dy = p.py - y;
        const need = p.pr + r + 22;
        return dx * dx + dy * dy >= need * need;
      });
      if (ok) {
        found = { px: x, py: y, pr: r };
        break;
      }
    }
    if (!found) {
      const col = placed.length % 4;
      const row = Math.floor(placed.length / 4);
      found = {
        px: pad + col * ((W - pad * 2) / 3),
        py: pad + row * ((W - pad * 2) / 4),
        pr: r * 0.85,
      };
    }
    placed.push({
      kind: spec.kind,
      s: spec.s,
      x: found.px / W,
      y: found.py / W,
      px: found.px,
      py: found.py,
      pr: found.pr,
    });
  }
  return placed.map(({ kind, s, x, y }) => ({ kind, s, x, y }));
}

function genIso(n, level) {
  const w = level < 0.35 ? 3 : 4;
  const d = w;
  const maxH = level < 0.35 ? 2 : level < 0.75 ? 3 : 4;
  const height = Array.from({ length: w }, () => Array(d).fill(0));
  const cx = Math.floor(w / 2);
  const cy = Math.floor(d / 2);
  height[cx][cy] = 1;
  let count = 1;

  function occupied(x, y) {
    return x >= 0 && y >= 0 && x < w && y < d && height[x][y] > 0;
  }

  function neighbors(x, y) {
    return (
      occupied(x - 1, y) ||
      occupied(x + 1, y) ||
      occupied(x, y - 1) ||
      occupied(x, y + 1)
    );
  }

  const raiseChance = lerp(0.22, 0.5, level);

  while (count < n) {
    const raise = [];
    const grow = [];
    const fresh = [];
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < d; y++) {
        if (height[x][y] > 0 && height[x][y] < maxH) raise.push([x, y]);
        if (height[x][y] === 0 && neighbors(x, y)) grow.push([x, y]);
        if (height[x][y] === 0) fresh.push([x, y]);
      }
    }
    const pool =
      rand() < raiseChance && raise.length
        ? raise
        : grow.length
          ? grow
          : raise.length
            ? raise
            : fresh;
    if (!pool.length) break;
    const [x, y] = pick(pool);
    height[x][y] += 1;
    count += 1;
  }

  const voxels = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < d; y++) {
      for (let z = 0; z < height[x][y]; z++) {
        voxels.push({ x, y, z });
      }
    }
  }
  return { type: "iso", w, d, maxH, voxels };
}

function genFlash(n, level) {
  const minDist = lerp(0.14, 0.08, level);
  const r0 = lerp(0.038, 0.022, level);
  return {
    type: "flash",
    dots: scatter(n, { minDist, pad: 0.12 }).map((p) => ({
      x: p.x,
      y: p.y,
      r: r0 + rand() * 0.01,
    })),
  };
}

function genGrid(n, level) {
  const cols = level < 0.35 ? 3 : 4;
  const rows = level < 0.2 ? 3 : level < 0.7 ? 3 : 4;
  const total = cols * rows;
  const lit = shuffle([...Array(total).keys()]).slice(0, Math.min(n, total - 1));
  return { type: "grid", cols, rows, lit };
}

function genShapes(n, level) {
  const squares = randInt(lerpInt(2, 4, level), lerpInt(3, 7, level));
  const size = lerp(0.072, 0.048, level);
  const specs = [];
  for (let i = 0; i < n; i++) {
    specs.push({ kind: "circle", s: size + rand() * 0.008 });
  }
  for (let i = 0; i < squares; i++) {
    specs.push({ kind: "square", s: size + rand() * 0.008 });
  }
  return { type: "shapes", items: shuffle(placeNonOverlap(specs)) };
}

function genCrossing(n, level) {
  const lanes = level < 0.4 ? 3 : 4;
  const items = [];
  let t = lerpInt(280, 80, level);
  for (let i = 0; i < n; i++) {
    const delay = t;
    const duration = lerpInt(2600, 1400, level) + Math.floor(rand() * lerpInt(700, 400, level));
    items.push({
      id: i,
      lane: Math.floor(rand() * lanes),
      delay,
      duration,
      kind: i % 3,
    });
    t += lerpInt(520, 160, level) + Math.floor(rand() * lerpInt(280, 160, level));
  }
  const durationMs = Math.max(...items.map((it) => it.delay + it.duration));
  return { type: "crossing", lanes, items, durationMs };
}

function genRain(n, level) {
  const items = [];
  let t = lerpInt(220, 60, level);
  for (let i = 0; i < n; i++) {
    const delay = t;
    const duration = lerpInt(2400, 1100, level) + Math.floor(rand() * lerpInt(600, 400, level));
    items.push({
      id: i,
      x: 0.12 + rand() * 0.76,
      delay,
      duration,
    });
    t += lerpInt(480, 140, level) + Math.floor(rand() * lerpInt(240, 140, level));
  }
  const durationMs = Math.max(...items.map((it) => it.delay + it.duration));
  return { type: "rain", items, durationMs };
}

const GENERATORS = {
  iso: genIso,
  flash: genFlash,
  grid: genGrid,
  shapes: genShapes,
  crossing: genCrossing,
  rain: genRain,
};

export function buildRound(gameId, level = 0) {
  const spec = GAMES[gameId];
  if (!spec || !GENERATORS[gameId]) {
    throw new Error("Unknown mini-game.");
  }
  const t = Math.min(1, Math.max(0, Number(level) || 0));
  let n;
  if (gameId === "iso") n = countIn(3, 6, 8, 14, t);
  else if (gameId === "flash") n = countIn(4, 7, 9, 14, t);
  else if (gameId === "grid") n = countIn(2, 4, 6, 10, t);
  else if (gameId === "shapes") n = countIn(3, 5, 6, 10, t);
  else if (gameId === "crossing") n = countIn(3, 5, 7, 11, t);
  else n = countIn(4, 7, 8, 13, t);

  if (gameId === "grid") {
    const cols = t < 0.35 ? 3 : 4;
    const rows = t < 0.2 ? 3 : t < 0.7 ? 3 : 4;
    n = Math.min(n, cols * rows - 1);
    n = Math.max(2, n);
  }

  const scene = GENERATORS[gameId](n, t);
  let watch = spec.scoring === "race" ? scene.durationMs : 1600;
  if (gameId === "iso") watch = watchMs(2400, 1400, t);
  else if (gameId === "flash") watch = watchMs(2000, 900, t);
  else if (gameId === "grid") watch = watchMs(2400, 1200, t);
  else if (gameId === "shapes") watch = watchMs(2400, 1300, t);

  return {
    gameId,
    name: spec.name,
    scoring: spec.scoring,
    prompt: spec.prompt,
    answer: n,
    scene,
    watchMs: watch,
    guessMs: guessMs(t),
    level: t,
  };
}
