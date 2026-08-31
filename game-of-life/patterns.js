export function parseRle(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  let header = "";
  let body = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (!header && /^x\s*=/i.test(t)) {
      header = t;
      continue;
    }
    body += t;
  }
  let width = 0;
  let height = 0;
  let rule = "B3/S23";
  if (header) {
    const xm = header.match(/x\s*=\s*(-?\d+)/i);
    const ym = header.match(/y\s*=\s*(-?\d+)/i);
    const rm = header.match(/rule\s*=\s*([^,\n]+)/i);
    if (xm) width = Number(xm[1]);
    if (ym) height = Number(ym[1]);
    if (rm) rule = rm[1].trim();
  }
  const bang = body.indexOf("!");
  if (bang >= 0) body = body.slice(0, bang);

  const cells = [];
  let x = 0;
  let y = 0;
  let n = 0;
  const take = () => {
    const v = n || 1;
    n = 0;
    return v;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c >= "0" && c <= "9") {
      n = n * 10 + (c.charCodeAt(0) - 48);
      continue;
    }
    if (c === "b" || c === ".") {
      x += take();
      continue;
    }
    if (c === "o" || c === "A" || c === "*") {
      const run = take();
      for (let j = 0; j < run; j++) cells.push({ x: x + j, y });
      x += run;
      continue;
    }
    if (c === "$") {
      y += take();
      x = 0;
      continue;
    }
  }
  if (!width || !height) {
    if (!cells.length) {
      width = 0;
      height = 0;
    } else {
      let maxX = 0;
      let maxY = 0;
      for (const cell of cells) {
        if (cell.x > maxX) maxX = cell.x;
        if (cell.y > maxY) maxY = cell.y;
      }
      width = maxX + 1;
      height = maxY + 1;
    }
  }
  return { cells, width, height, rule };
}

export function bbox(cells) {
  if (!cells.length) return { minX: 0, minY: 0, maxX: -1, maxY: -1, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function normalize(cells) {
  const box = bbox(cells);
  if (!cells.length) return [];
  return cells.map((cell) => ({ x: cell.x - box.minX, y: cell.y - box.minY }));
}

export function rotateCw(cells) {
  const n = normalize(cells);
  const box = bbox(n);
  return normalize(n.map(({ x, y }) => ({ x: box.h - 1 - y, y: x })));
}

export function flipH(cells) {
  const n = normalize(cells);
  const box = bbox(n);
  return normalize(n.map(({ x, y }) => ({ x: box.w - 1 - x, y })));
}

function flushRun(ch, count) {
  if (count <= 0) return "";
  if (count === 1) return ch;
  return String(count) + ch;
}

export function encodeRle(cells, rule = "B3/S23") {
  const n = normalize(cells);
  const box = bbox(n);
  if (!n.length) return `x = 0, y = 0, rule = ${rule}\n!`;
  const live = new Set(n.map((cell) => cell.x + "," + cell.y));
  const rowStrs = [];
  for (let y = 0; y < box.h; y++) {
    let row = "";
    let run = 0;
    let on = null;
    const flush = () => {
      if (on === null || run === 0) return;
      row += flushRun(on ? "o" : "b", run);
    };
    for (let x = 0; x < box.w; x++) {
      const next = live.has(x + "," + y);
      if (on === null) {
        on = next;
        run = 1;
      } else if (next === on) {
        run += 1;
      } else {
        flush();
        on = next;
        run = 1;
      }
    }
    if (on) flush();
    rowStrs.push(row);
  }
  while (rowStrs.length && rowStrs[rowStrs.length - 1] === "") rowStrs.pop();
  let body = "";
  let empty = 0;
  const emitEmpty = () => {
    if (empty === 1) body += "$";
    else if (empty > 1) body += empty + "$";
    empty = 0;
  };
  for (let i = 0; i < rowStrs.length; i++) {
    if (!rowStrs[i]) {
      empty += 1;
      continue;
    }
    emitEmpty();
    body += rowStrs[i];
    if (i < rowStrs.length - 1) empty = 1;
  }
  emitEmpty();
  body += "!";
  const wrapped = [];
  for (let i = 0; i < body.length; i += 70) wrapped.push(body.slice(i, i + 70));
  return `x = ${box.w}, y = ${box.h}, rule = ${rule}\n${wrapped.join("\n")}`;
}

const LIBRARY_RAW = [
  {
    id: "block",
    name: "Block",
    group: "Still lifes",
    blurb: "The smallest still life: every live cell has 3 neighbors, so nothing is born or dies.",
    rle: "x = 2, y = 2, rule = B3/S23\n2o$2o!",
  },
  {
    id: "beehive",
    name: "Beehive",
    group: "Still lifes",
    blurb: "A 6-cell still life. Stable shapes are the ‘wires and bricks’ of bigger circuits.",
    rle: "x = 4, y = 3, rule = B3/S23\nb2o$o2bo$b2o!",
  },
  {
    id: "loaf",
    name: "Loaf",
    group: "Still lifes",
    blurb: "Another common still life. Rotate it with R; it stays dead-stable in every orientation.",
    rle: "x = 4, y = 4, rule = B3/S23\nb2o$o2bo$bobo$2bo!",
  },
  {
    id: "boat",
    name: "Boat",
    group: "Still lifes",
    blurb: "A 5-cell still life. Eatters and boats show up constantly as circuit junk that happens to be useful.",
    rle: "x = 3, y = 3, rule = B3/S23\n2o$obo$bo!",
  },
  {
    id: "blinker",
    name: "Blinker",
    group: "Oscillators",
    blurb: "Period 2: a line of 3 flips between horizontal and vertical. The smallest oscillator.",
    rle: "x = 3, y = 1, rule = B3/S23\n3o!",
  },
  {
    id: "toad",
    name: "Toad",
    group: "Oscillators",
    blurb: "Period 2. Two offset triples take turns being the ‘bar’ — a slightly richer clock than a blinker.",
    rle: "x = 4, y = 2, rule = B3/S23\nb3o$3o!",
  },
  {
    id: "beacon",
    name: "Beacon",
    group: "Oscillators",
    blurb: "Period 2: two blocks share a corner and blink a 2×2 hole. Oscillators are clocks for circuits.",
    rle: "x = 4, y = 4, rule = B3/S23\n2o$2o$2b2o$2b2o!",
  },
  {
    id: "pulsar",
    name: "Pulsar",
    group: "Oscillators",
    blurb: "Period 3, 48 cells at peak. A famous larger clock — stamp it and step to see the pulse.",
    rle: "x = 13, y = 13, rule = B3/S23\n2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!",
  },
  {
    id: "pentadecathlon",
    name: "Pentadecathlon",
    group: "Oscillators",
    blurb: "Period 15. A compact high-period oscillator used as a timing element in some guns.",
    rle: "x = 10, y = 3, rule = B3/S23\n2bo4bo$2ob4ob2o$2bo4bo!",
  },
  {
    id: "glider",
    name: "Glider",
    group: "Spaceships",
    blurb: "Period 4, moves one cell diagonally. In Life computers, a glider is a bit on a wire.",
    rle: "x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!",
  },
  {
    id: "lwss",
    name: "LWSS",
    group: "Spaceships",
    blurb: "Lightweight spaceship: period 4, moves orthogonally at c/2. A fatter, faster ‘bit’ than a glider.",
    rle: "x = 5, y = 4, rule = B3/S23\nb4o$o3bo$4bo$o2bo!",
  },
  {
    id: "gosper",
    name: "Gosper gun",
    group: "Guns",
    blurb: "Period 30 gun: a clock that emits a glider every 30 generations. Unbounded growth — a stream of bits.",
    rle: "x = 36, y = 9, rule = B3/S23\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!",
  },
  {
    id: "eater",
    name: "Eater 1",
    group: "Circuit parts",
    blurb: "A still life that can absorb a glider and return to shape. A sink: it deletes a bit.",
    rle: "x = 4, y = 4, rule = B3/S23\n2o$obo$2bo$2b2o!",
  },
];

export const LIBRARY = LIBRARY_RAW.map((item) => ({
  ...item,
  cells: normalize(parseRle(item.rle).cells),
}));

export const TOUR = [
  {
    title: "Still life",
    blurb: "A block never changes. Every live cell already has 3 neighbors, so the rules produce no births and no deaths. Stable objects are the bricks of later circuits.",
    rle: "x = 2, y = 2, rule = B3/S23\n2o$2o!",
    play: false,
    pad: 10,
  },
  {
    title: "Oscillator",
    blurb: "A blinker is a period-2 clock: the line of 3 flips between horizontal and vertical. Step once to see births (green) and deaths (red).",
    rle: "x = 3, y = 1, rule = B3/S23\n3o!",
    play: false,
    pad: 10,
  },
  {
    title: "Glider",
    blurb: "A glider is a bit that moves. Period 4, one cell diagonally. Hit Play and watch it cruise — this is Life’s wire.",
    rle: "x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!",
    play: true,
    pad: 16,
  },
  {
    title: "Gun",
    blurb: "The Gosper gun is a clock that emits gliders forever (one every 30 generations). A gun is a stream of bits. Play and zoom out as they fly.",
    rle: "x = 36, y = 9, rule = B3/S23\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!",
    play: true,
    pad: 18,
  },
  {
    title: "Eater",
    blurb: "The fishhook eater absorbs a glider and returns to the same 7 cells. A sink: it deletes a bit without wrecking the circuitry.",
    rle: "x = 13, y = 13, rule = B3/S23\nbo$2bo$3o7$9b2o$9bobo$11bo$11b2o!",
    play: true,
    pad: 12,
  },
  {
    title: "A gate",
    blurb: "Two glider-bits collide and become a block. Different angles and timings yield a blinker, a kickback, or nothing — that is how Life builds AND, NOT, and NOR gates.",
    rle: "x = 7, y = 5, rule = B3/S23\n4bo$4bobo$bo2b2o$2bo$3o!",
    play: true,
    pad: 14,
  },
];
