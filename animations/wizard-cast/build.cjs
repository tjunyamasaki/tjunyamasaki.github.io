// Wizard cast/attack: nearest-neighbor rig of the canonical 45×38 base.
// Does not modify source images. Run from animations/: `npm run build`
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = __dirname;
const out = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(root, 'generated');
const sourcePng = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'source', 'wizard.png');
const mapPath = path.join(root, 'source', 'wizard.json');
const palettePath = path.join(root, 'source', 'palette.json');
const repoRoot = path.join(root, '..');

fs.mkdirSync(out, { recursive: true });

const SW = 45, SH = 38, SCALE = 6;
const W = 64, H = 48, OX = 8, OY = 8;
const STAFF_PIVOT = { x: 27, y: 25 };
const HAT_PIVOT = { x: 15, y: 11 };
const STAR_PIVOT = { x: 7, y: 7 };
const ORB = { x: 30, y: 18 };

// Ready → brace → lift → charge → release → follow through → recover → settle.
// Timing stays uneven like the cleric: long rest, held charge, snappy release.
const poses = [
  { name: 'Ready', ms: 480, a: 0, dx: 0, dy: 0, ay: 0, ha: 0, sa: 0 },
  { name: 'Brace', ms: 150, a: -24, dx: -1, dy: 1, ay: 1, ha: 0, sa: -28 },
  { name: 'Lift', ms: 140, a: -30, dx: 0, dy: 0, ay: -4, ha: 0, sa: -18 },
  { name: 'Charge', ms: 230, a: -14, dx: 0, dy: 0, ay: -5, ha: 0, sa: -10, fx: 1 },
  { name: 'Release', ms: 80, a: 32, dx: 1, dy: 0, ay: 0, ha: 0, sa: 20, fx: 2 },
  { name: 'Follow through', ms: 130, a: 38, dx: 1, dy: 1, ay: 0, ha: 0, sa: 26, fx: 3 },
  { name: 'Recover', ms: 150, a: 16, dx: 0, dy: 0, ay: 0, ha: 0, sa: 12, fx: 4 },
  { name: 'Settle', ms: 160, a: 0, dx: 0, dy: 0, ay: 0, ha: 0, sa: 0 }
];

const C = [36, 190, 207, 255];
const Q = [112, 226, 224, 255];
const L = [253, 232, 178, 255];
const Y = [227, 169, 59, 255];
const G = [217, 156, 44, 255];
const WOOD = [58, 37, 20, 255];

function keyOf(c) { return c.join(','); }
function rot(deg) {
  const t = deg * Math.PI / 180;
  return { co: Math.cos(t), si: Math.sin(t) };
}

function layerName(x, y, ch) {
  if (y <= 9 && x <= 8 && 'GYL'.includes(ch)) return 'star';
  if (y >= 34) return 'feet';
  if (x >= 26 && y >= 15) return 'staff';
  if (y <= 11) return 'hat';
  return 'body';
}

function forwardPoint(x, y, dx, dy, angle, pivot) {
  const { co, si } = rot(angle);
  const xx = x - pivot.x, yy = y - pivot.y;
  return {
    x: Math.round(OX + dx + pivot.x + co * xx - si * yy),
    y: Math.round(OY + dy + pivot.y + si * xx + co * yy)
  };
}

(async () => {
  const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  if (map.rows.length !== SH || map.rows.some((row) => row.length !== SW)) {
    throw new Error('wizard map is not 45×38');
  }

  const logical = Buffer.alloc(SW * SH * 4);
  const symbols = [];
  map.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const rgba = palette[ch] && palette[ch].rgba;
    if (!rgba) throw new Error('Unknown map symbol ' + ch);
    rgba.forEach((v, k) => { logical[(y * SW + x) * 4 + k] = v; });
    symbols.push(ch);
  }));

  const original = await sharp(sourcePng).ensureAlpha().raw().toBuffer();
  const { data, info } = await sharp(sourcePng)
    .resize(SW, SH, { kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== SW || info.height !== SH) throw new Error('Unexpected logical size');
  for (let y = 0; y < SH * SCALE; y++) {
    for (let x = 0; x < SW * SCALE; x++) {
      for (let c = 0; c < 4; c++) {
        if (original[(y * SW * SCALE + x) * 4 + c] !== data[(Math.floor(y / SCALE) * SW + Math.floor(x / SCALE)) * 4 + c]) {
          throw new Error('Nonuniform source pixel');
        }
      }
    }
  }
  for (let i = 0; i < logical.length; i++) {
    if (logical[i] !== data[i]) throw new Error('wizard.png does not match maps/wizard.json');
  }

  const usedPalette = new Set();
  const layers = { star: [], hat: [], body: [], staff: [], feet: [] };
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4;
      const c = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (!c[3]) continue;
      usedPalette.add(keyOf(c));
      layers[layerName(x, y, symbols[y * SW + x])].push({ x, y, c });
    }
  }
  const counts = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length]));
  const assigned = Object.values(counts).reduce((a, b) => a + b, 0);
  if (assigned !== 510) throw new Error('Layer assignment dropped pixels: ' + assigned);

  function drawDebug() {
    const buf = Buffer.alloc(SW * SH * 4);
    const colors = {
      star: [227, 169, 59, 255],
      hat: [43, 75, 116, 255],
      body: [218, 129, 91, 255],
      staff: [36, 190, 207, 255],
      feet: [82, 52, 29, 255]
    };
    for (const [name, pts] of Object.entries(layers)) {
      for (const p of pts) colors[name].forEach((v, k) => { buf[(p.y * SW + p.x) * 4 + k] = v; });
    }
    return buf;
  }

  const frames = [];
  const clipWarnings = [];

  for (let index = 0; index < poses.length; index++) {
    const p = poses[index];
    const buf = Buffer.alloc(W * H * 4);

    function put(x, y, c, kind) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= W || y < 0 || y >= H) {
        if (kind === 'fx') {
          clipWarnings.push('frame ' + (index + 1) + ' fx clipped at ' + x + ',' + y);
          return;
        }
        throw new Error('Clipped ' + kind + ' pixel at ' + x + ',' + y + ' (' + p.name + ')');
      }
      for (let k = 0; k < 4; k++) buf[(y * W + x) * 4 + k] = c[k];
    }

    function draw(layer, dx, dy, angle, pivot, kind) {
      const lookup = new Map(layer.map((v) => [v.x + ',' + v.y, v.c]));
      const { co, si } = rot(angle || 0);
      const px = pivot.x, py = pivot.y;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const xx = x - OX - dx - px;
          const yy = y - OY - dy - py;
          const sx = Math.round(co * xx + si * yy + px);
          const sy = Math.round(-si * xx + co * yy + py);
          const c = lookup.get(sx + ',' + sy);
          if (c) put(x, y, c, kind);
        }
      }
      if (!angle) return;
      // Forward scatter so a thin rotated staff cannot drop source pixels.
      for (const v of layer) {
        const xx = v.x - px, yy = v.y - py;
        put(OX + dx + px + co * xx - si * yy, OY + dy + py + si * xx + co * yy, v.c, kind);
      }
    }

    const bodyDx = p.dx || 0;
    const bodyDy = p.dy || 0;
    const staffDx = bodyDx;
    const staffDy = bodyDy + (p.ay || 0);
    draw(layers.feet, 0, 0, 0, { x: 0, y: 0 }, 'feet');
    draw(layers.body, bodyDx, bodyDy, 0, HAT_PIVOT, 'body');
    draw(layers.hat, bodyDx, bodyDy, p.ha || 0, HAT_PIVOT, 'hat');
    draw(layers.star, bodyDx, bodyDy, (p.ha || 0) + (p.sa || 0), STAR_PIVOT, 'star');
    draw(layers.staff, staffDx, staffDy, p.a || 0, STAFF_PIVOT, 'staff');

    const orb = forwardPoint(ORB.x, ORB.y, staffDx, staffDy, p.a || 0, STAFF_PIVOT);
    const grip = forwardPoint(STAFF_PIVOT.x, STAFF_PIVOT.y, staffDx, staffDy, p.a || 0, STAFF_PIVOT);
    const wrist = { x: OX + bodyDx + 25, y: OY + bodyDy + 25 };

    function stampLine(x0, y0, x1, y1, col, kind) {
      const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col, kind);
      }
    }
    if (p.a || p.ay) {
      const behind = forwardPoint(ORB.x, ORB.y + 4, staffDx, staffDy, p.a || 0, STAFF_PIVOT);
      stampLine(grip.x, grip.y, behind.x, behind.y, WOOD, 'staff');
      stampLine(wrist.x, wrist.y, grip.x, grip.y, WOOD, 'staff');
    }

    function plus(x, y, r, outer, inner) {
      for (let n = -r; n <= r; n++) {
        put(x + n, y, outer, 'fx');
        put(x, y + n, outer, 'fx');
      }
      for (let n = -r + 1; n < r; n++) {
        put(x + n, y, inner, 'fx');
        put(x, y + n, inner, 'fx');
      }
    }
    function diamond(x, y, r, col) {
      for (let dy = -r; dy <= r; dy++) {
        const span = r - Math.abs(dy);
        put(x - span, y + dy, col, 'fx');
        put(x + span, y + dy, col, 'fx');
      }
    }

    if (p.fx === 1) {
      diamond(orb.x, orb.y, 3, C);
      plus(orb.x, orb.y, 2, C, Q);
      put(orb.x, orb.y, L, 'fx');
      put(orb.x - 4, orb.y - 2, L, 'fx');
      put(orb.x + 4, orb.y + 1, Y, 'fx');
      put(orb.x + 2, orb.y - 4, G, 'fx');
    }
    if (p.fx === 2) {
      diamond(orb.x + 1, orb.y, 4, C);
      plus(orb.x + 1, orb.y, 3, C, Q);
      put(orb.x + 1, orb.y, L, 'fx');
      put(orb.x + 6, orb.y - 3, L, 'fx');
      put(orb.x - 4, orb.y + 3, Y, 'fx');
      put(orb.x + 5, orb.y + 4, G, 'fx');
    }
    if (p.fx === 3) {
      const boltY = orb.y - 2;
      plus(orb.x, orb.y, 1, C, Q);
      for (let j = 2; j <= 11; j++) put(orb.x + j, boltY, j % 2 ? C : Q, 'fx');
      put(orb.x + 12, boltY, L, 'fx');
      put(orb.x + 9, boltY - 2, C, 'fx');
      put(orb.x + 8, boltY + 2, C, 'fx');
      put(orb.x + 6, boltY - 3, Y, 'fx');
      diamond(orb.x + 13, boltY, 2, C);
      put(orb.x + 13, boltY, L, 'fx');
    }
    if (p.fx === 4) {
      put(orb.x + 13, orb.y - 3, Q, 'fx');
      put(orb.x + 16, orb.y - 1, L, 'fx');
      put(orb.x + 12, orb.y + 2, C, 'fx');
      put(orb.x + 9, orb.y - 2, G, 'fx');
    }

    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] && !usedPalette.has(keyOf([...buf.slice(i, i + 4)]))) {
        throw new Error('Palette violation in ' + p.name + ': ' + [...buf.slice(i, i + 4)].join(','));
      }
    }
    frames.push(buf);
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toFile(path.join(out, 'frame-' + (index + 1) + '.png'));
  }

  for (const fi of [0, 7]) {
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        for (let c = 0; c < 4; c++) {
          if (data[(y * SW + x) * 4 + c] !== frames[fi][((y + OY) * W + x + OX) * 4 + c]) {
            throw new Error('Rest pose differs from source at ' + x + ',' + y);
          }
        }
      }
    }
  }

  const sheet = Buffer.alloc(W * 4 * H * 2 * 4);
  frames.forEach((b, i) => {
    for (let y = 0; y < H; y++) {
      b.copy(sheet, (((Math.floor(i / 4) * H + y) * W * 4) + (i % 4) * W) * 4, y * W * 4, (y + 1) * W * 4);
    }
  });
  await sharp(sheet, { raw: { width: W * 4, height: H * 2, channels: 4 } })
    .png()
    .toFile(path.join(out, 'wizard-cast-sheet.png'));
  await sharp(sheet, { raw: { width: W * 4, height: H * 2, channels: 4 } })
    .resize(W * 4 * 4, H * 2 * 4, { kernel: 'nearest' })
    .png()
    .toFile(path.join(out, 'contact-sheet.png'));

  const debugLogical = drawDebug();
  await sharp(debugLogical, { raw: { width: SW, height: SH, channels: 4 } })
    .resize(SW * SCALE, SH * SCALE, { kernel: 'nearest' })
    .png()
    .toFile(path.join(out, 'layers-debug.png'));

  const largeFrames = await Promise.all(frames.map((b) =>
    sharp(b, { raw: { width: W, height: H, channels: 4 } })
      .resize(W * SCALE, H * SCALE, { kernel: 'nearest' })
      .raw()
      .toBuffer()
  ));
  await sharp(Buffer.concat(largeFrames), {
    raw: { width: W * SCALE, height: H * SCALE * 8, channels: 4, pageHeight: H * SCALE }
  }).gif({
    loop: 0,
    delay: poses.map((p) => p.ms),
    dither: 0
  }).toFile(path.join(out, 'wizard-cast.gif'));

  fs.copyFileSync(sourcePng, path.join(out, 'wizard-original.png'));
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({
    width: W,
    height: H,
    columns: 4,
    rows: 2,
    palette: [...usedPalette],
    layers: counts,
    pivots: { staff: STAFF_PIVOT, hat: HAT_PIVOT, star: STAR_PIVOT, orb: ORB },
    frames: poses.map(({ name, ms }, i) => ({ file: 'frame-' + (i + 1) + '.png', name, duration: ms }))
  }, null, 2));

  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    name: 'wizard-cast',
    source: { file: 'wizard-original.png', scale: SCALE },
    canvas: { width: W, height: H, origin: { x: OX, y: OY } },
    restFrameIndices: [0, 7],
    frames: poses.map((p, i) => ({
      file: 'frame-' + (i + 1) + '.png',
      durationMs: p.ms,
      phase: p.name.toLowerCase().replace(/\s+/g, '-')
    })),
    sheet: { file: 'wizard-cast-sheet.png', columns: 4, rows: 2 },
    gif: { file: 'wizard-cast.gif', scale: SCALE, loop: 0 }
  }, null, 2));

  const urls = await Promise.all(frames.map((b) =>
    sharp(b, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer()
      .then((png) => 'data:image/png;base64,' + png.toString('base64'))
  ));

  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wizard · casting attack</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#181a1d;color:#eee;font:15px system-ui;padding:24px}
main{max-width:850px;margin:auto}
h1{font-size:20px;font-weight:550}
#stage{height:360px;display:grid;place-items:center;background:#26292e;border:1px solid #444;position:relative}
img{image-rendering:pixelated;image-rendering:crisp-edges}
#sprite,#onion{width:384px;height:288px;max-width:100%;object-fit:contain}
#onion{position:absolute;opacity:0;pointer-events:none}
#stage.onion #onion{opacity:.35}
button,select{font:inherit;color:inherit;background:#34383e;border:1px solid #626770;border-radius:4px;padding:8px 12px;cursor:pointer}
button:focus-visible,select:focus-visible{outline:2px solid #24becf}
nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}
#frames{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}
#frames button{padding:4px 0}
#frames img{width:100%;display:block}
#frames .active{border-color:#24becf;background:#1d3a40}
p{color:#b9bec5;line-height:1.5}
label{display:flex;gap:8px;align-items:center}
small{font-size:11px}
@media(max-width:600px){#frames{grid-template-columns:repeat(4,1fr)}body{padding:12px}}
</style>
<main>
<h1>Wizard · casting attack</h1>
<div id="stage">
  <img id="onion" alt="">
  <img id="sprite" alt="Wizard thrusting a cyan spell from the staff orb">
</div>
<nav>
  <button id="play">Pause</button>
  <button id="step">Next frame</button>
  <label>Speed <select id="speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
  <label>Background <select id="bg"><option value="#26292e">Slate</option><option value="#000000">Black</option><option value="#d6d1c6">Light</option></select></label>
  <label><input type="checkbox" id="onionToggle"> Onion skin</label>
  <span id="status"></span>
</nav>
<div id="frames"></div>
<p>8 frames · 64 × 48 logical pixels · wizard source palette only.<br>
Feet stay planted. Staff, hat, and hanging star are separate layers. Space plays or pauses; arrow keys step.</p>
</main>
<script>
const frames=${JSON.stringify(urls)};
const poses=${JSON.stringify(poses)};
let index=0,playing=true,timer;
const sprite=document.getElementById('sprite');
const onion=document.getElementById('onion');
const status=document.getElementById('status');
const play=document.getElementById('play');
const speed=document.getElementById('speed');
function show(){
  sprite.src=frames[index];
  onion.src=frames[(index+7)%8];
  status.textContent=(index+1)+' / 8 · '+poses[index].name;
  document.querySelectorAll('#frames button').forEach((b,i)=>{
    b.classList.toggle('active',i===index);
    b.setAttribute('aria-pressed',String(i===index));
  });
}
function schedule(){
  clearTimeout(timer);
  if(playing) timer=setTimeout(()=>{index=(index+1)%8;show();schedule()},poses[index].ms/Number(speed.value));
}
function pause(){playing=false;play.textContent='Play';clearTimeout(timer)}
function step(n){pause();index=(index+n+8)%8;show()}
frames.forEach((src,i)=>{
  const b=document.createElement('button');
  b.title=poses[i].name;
  b.setAttribute('aria-label','Frame '+(i+1)+': '+poses[i].name);
  b.innerHTML='<img alt="" src="'+src+'"><small>'+(i+1)+'</small>';
  b.onclick=()=>{pause();index=i;show()};
  document.getElementById('frames').append(b);
});
play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';schedule()};
document.getElementById('step').onclick=()=>step(1);
speed.onchange=schedule;
document.getElementById('bg').onchange=e=>document.getElementById('stage').style.background=e.target.value;
document.getElementById('onionToggle').onchange=e=>document.getElementById('stage').classList.toggle('onion',e.target.checked);
document.addEventListener('keydown',e=>{
  if(['SELECT','BUTTON','INPUT'].includes(e.target.tagName)) return;
  if(e.code==='Space'){e.preventDefault();play.click()}
  if(e.code==='ArrowRight') step(1);
  if(e.code==='ArrowLeft') step(-1);
});
show();schedule();
</script>
</html>`;

  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(repoRoot, 'index.html'), html);

  const report = {
    layers: counts,
    paletteSize: usedPalette.size,
    clipWarnings,
    durationMs: poses.reduce((s, p) => s + p.ms, 0)
  };
  console.log('Wizard cast built.', JSON.stringify(report, null, 2));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
