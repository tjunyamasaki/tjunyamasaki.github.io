// Filmstrip of a weapon in the weapon lab: one tiled PNG per run, at exact moments, for judging
// looks without playing. Frames are stepped by hand (requestAnimationFrame is driven at 30 fps of
// game time), so a time means the same moment every run.
//
//   (serve the repository root first, e.g. `npx --yes serve -l 8765 .` or `python3 -m http.server 8765`)
//   node hollowstead/tools/fx-film.mjs --weapon starfall --ranks 1,5
//   node hollowstead/tools/fx-film.mjs --weapon my-weapon --ranks 5 --skill --times .2,.6,1,1.6 --out /tmp/skill.png
//
// Options: --ranks 1,5  --times .15,.4,.8,1.4 (seconds after the settle)  --settle .6  --skill (fire the
// skill at t=0, skills free)  --move (hold D the whole time)  --foes 6  --formation ahead|around|wall
// --dist 2 (pull the foes this close: melee weapons)  --zoom 1.5  --size 640x440 (crop centred between the wielder and the foes, fixed per rank)  --perf (also print fx cost and geometry)
// --url http://localhost:8765/hollowstead/  --out /tmp/fx-film.png  --canvas (the Canvas fallback renderer).
// Needs Playwright with Chromium: it tries `playwright`, then the global install used by Cowork sessions.
import {writeFileSync} from 'node:fs';

const arg = (name, fallback) => {const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i+1] ?? true;};
const flag = name => process.argv.includes(`--${name}`);
const weapon = arg('weapon');
if(!weapon){console.error('--weapon <id> is required'); process.exit(1);}
const ranks = String(arg('ranks', '1,5')).split(',').map(Number);
const times = String(arg('times', '.15,.4,.8,1.4')).split(',').map(Number);
const settle = +arg('settle', 1.2), dist = +arg('dist', 0), zoom = +arg('zoom', 1.5), foes = +arg('foes', 6), formation = arg('formation', 'ahead');
const [cw, ch] = String(arg('size', '640x440')).split('x').map(Number);
const url = `${arg('url', 'http://localhost:8765/hollowstead/')}?lab`, out = arg('out', '/tmp/fx-film.png');

let chromium;
try{({chromium} = await import('playwright'));}
catch{({chromium} = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));}
const browser = await chromium.launch({args: flag('canvas') ? ['--disable-3d-apis']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.stack || e.message}`));
page.on('console', m => {if(m.type() === 'error' && !/WebGL|AudioContext/.test(m.text())) errors.push(m.text());});
await page.addInitScript(() => {
  let queue = [], now = 1000;
  window.requestAnimationFrame = cb => {queue.push(cb); return queue.length;};
  window.__step = (n = 1, ms = 1000/30) => {for(let i = 0; i < n; i++){now += ms; const q = queue; queue = []; for(const cb of q){try{cb(now);}catch(e){console.error(e);}}}};
});
await page.goto(url);
await page.addStyleTag({content: '#announcement,#toast,#lab-sheet{display:none!important}'});
for(let i = 0; i < 120; i++){
  await page.waitForTimeout(80);
  if(await page.evaluate(() => {window.__step(2); return !!window.__HOLLOWSTEAD__?.world?.arena;}) && i > 15) break;
}
const shots = [];
for(const rank of ranks){
  await page.evaluate(({weapon, rank, zoom, foes, formation, skill, dist}) => {
    const H = window.__HOLLOWSTEAD__, a = H.world.arena;
    H.renderer.setZoom(zoom);
    const p = H.world.players[0]; p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
    H.labCommand('clear'); H.labCommand(`rank:${rank}`); H.labCommand(`equip:${weapon}`);
    if(!a.dummies) H.labCommand('toggle:dummies');
    if(!!a.freeSkills !== skill) H.labCommand('toggle:freeSkills');
    H.labCommand(`count:${foes}`); H.labCommand(`formation:${formation}`); H.labCommand('spawn');
    const list = H.world.enemies, n = list.length || 1, cx = list.reduce((a, e) => a+e.x, 0)/n, cz = list.reduce((a, e) => a+e.z, 0)/n, c = Math.hypot(cx, cz);
    if(dist > 0 && c > .1) for(const e of list){e.x = cx/c*dist+(e.x-cx)*.55; e.z = cz/c*dist+(e.z-cz)*.55;}
  }, {weapon, rank, zoom, foes, formation, skill: flag('skill'), dist});
  if(flag('move')) await page.keyboard.down('d');
  await page.evaluate(n => window.__step(n), Math.round(settle*30));
  if(flag('skill')) await page.evaluate(() => window.__HOLLOWSTEAD__.send({type: 'skill'}));
  if(flag('perf')) await page.evaluate(() => {
    const R = window.__HOLLOWSTEAD__.renderer, S = window.__perf = {ms: [], verts: 0};
    for(const name of ['build', 'rig']){const f = R.weaponFx[name].bind(R.weaponFx); R.weaponFx[name] = (...a) => {const t = performance.now(); const r = f(...a); S.ms.push(performance.now()-t); return r;};}
    const up = R.glowMesh.update.bind(R.glowMesh);
    R.glowMesh.update = c => {up(c); let v = R.magicMesh.count+R.glowMesh.count; for(const s of R.rigMeshes?.values() || []) v += s.paint.count+s.light.count; S.verts = Math.max(S.verts, v);};
  });
  let t = 0, box = null;
  for(const at of times){
    const n = Math.max(0, Math.round((at-t)*30)); t += n/30;
    await page.evaluate(n => window.__step(n), n);
    box ||= await page.evaluate(({cw, ch}) => {
      const H = window.__HOLLOWSTEAD__, p = H.world.players[0], near = H.world.enemies.filter(e => Math.hypot(e.x-p.x, e.z-p.z) < 10);
      const fx = near.length ? near.reduce((a, e) => a+e.x, 0)/near.length : p.x, fz = near.length ? near.reduce((a, e) => a+e.z, 0)/near.length : p.z;
      const s = H.renderer.screenPoint?.((p.x+fx)/2, (p.z+fz)/2, 1) || {x: 640, y: 360};
      return {x: Math.max(0, Math.min(1280-cw, s.x-cw/2)), y: Math.max(0, Math.min(720-ch, s.y-ch*.55)), width: cw, height: ch};
    }, {cw, ch});
    shots.push({rank, at, png: (await page.screenshot({clip: box})).toString('base64')});
  }
  if(flag('move')) await page.keyboard.up('d');
  if(flag('perf')){
    const S = await page.evaluate(() => window.__perf), ms = S.ms.slice().sort((a, b) => a-b);
    console.log(`★${rank}: fx ${(ms.reduce((a, b) => a+b, 0)/Math.max(1, ms.length)*2).toFixed(2)} ms/frame (build+rig mean), peak ${S.verts} vertices`);
  }
}
// Tile: one row per rank, one column per time, labelled.
const cols = times.length, rows = ranks.length;
await page.setContent(`<body style="margin:0;background:#1b1622"><canvas id="c" width="${cols*cw}" height="${rows*ch}"></canvas></body>`);
await page.evaluate(async ({shots, cols, cw, ch}) => {
  const g = document.getElementById('c').getContext('2d');
  for(const [i, s] of shots.entries()){
    const img = new Image(); img.src = `data:image/png;base64,${s.png}`; await img.decode();
    const x = (i%cols)*cw, y = Math.floor(i/cols)*ch; g.drawImage(img, x, y);
    g.fillStyle = '#000a'; g.fillRect(x, y, 86, 20); g.fillStyle = '#fff'; g.font = '13px monospace';
    g.fillText(`★${s.rank} t=${s.at}s`, x+5, y+14);
  }
}, {shots, cols, cw, ch});
writeFileSync(out, await page.locator('#c').screenshot());
console.log(`wrote ${out} (${rows} rank row(s) × ${cols} frames)`);
if(errors.length) console.log(errors.slice(0, 8).join('\n'));
await browser.close();
