// HUD and map marks for the long-haul features: landmarks (the Sunken Stair, the Briar Throne), the great
// bosses and omens (omens.mjs) on the minimap and the full map. Presentation only: reads the snapshot.
import {ENEMIES} from '../content.mjs?v=harvest-18';
import {lairOf} from '../areas.mjs?v=harvest-18';
import {OMENS} from '../omens.mjs?v=harvest-18';

/** Landmarks, bosses and omens on a map canvas. `m`: {sx, sz, vis, known, full, me, size, clock}. */
export function paintMapMarks(ctx, world, m){
  const {sx, sz, vis, known, full, clock} = m, k = full ? 1.15 : 1;
  for(const n of world.nodes){
    if(n.type !== 'delve' && n.type !== 'briarthrone' && n.type !== 'gashamound') continue;
    if(!known(n) || !vis(n.x, n.z)) continue;
    const x = sx(n.x), y = sz(n.z);
    if(n.type === 'gashamound'){
      // The Mound of the Starved: a pale skull in a dark ring, green-eyed while the Gashadokuro walks.
      const G = world.gasha || {}, awake = G.state === 'awake', slain = G.state === 'slain';
      ctx.fillStyle = '#211c22'; ctx.beginPath(); ctx.arc(x, y, 7*k, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = awake ? '#c8ff8a' : slain ? '#6a6458' : '#d8cdb0'; ctx.lineWidth = awake ? 2.5 : 2; ctx.stroke();
      ctx.fillStyle = slain ? '#8a8270' : '#e8dcc0'; ctx.beginPath(); ctx.arc(x, y-.5*k, 3.6*k, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = awake ? '#c8ff8a' : '#211c22'; ctx.fillRect(x-2*k, y-1.2*k, 1.4*k, 1.4*k); ctx.fillRect(x+.6*k, y-1.2*k, 1.4*k, 1.4*k);
      if(full){ctx.font = '10px Georgia'; ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center'; ctx.fillText(slain ? 'MOUND OF THE STARVED · STILL' : 'MOUND OF THE STARVED', x, y+20);}
      continue;
    }
    if(n.type === 'delve'){
      // A stair going down: a violet chevron in a dark ring.
      ctx.fillStyle = '#1d1726'; ctx.beginPath(); ctx.arc(x, y, 7*k, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#b98cff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#d8c1ff'; ctx.beginPath(); ctx.moveTo(x-4*k, y-2*k); ctx.lineTo(x+4*k, y-2*k); ctx.lineTo(x, y+3.5*k); ctx.closePath(); ctx.fill();
      if(full){ctx.font = '10px Georgia'; ctx.fillStyle = '#d8c1ff'; ctx.textAlign = 'center'; ctx.fillText('SUNKEN STAIR', x, y+18);}
    }else{
      const lair = lairOf({lair: world.lair}), awake = lair.state === 'awake', slain = lair.state === 'slain';
      ctx.fillStyle = slain ? '#3a2e2e' : '#3b1f25'; ctx.beginPath(); ctx.arc(x, y, 7*k, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = slain ? '#8a7a6a' : awake ? '#ff7a5c' : '#d9a06b'; ctx.lineWidth = awake ? 2.5 : 2; ctx.stroke();
      // Thorns round a heart.
      for(let i = 0; i < 6; i++){const a = i/6*Math.PI*2+.3; ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*6*k, y+Math.sin(a)*6*k); ctx.lineTo(x+Math.cos(a)*10*k, y+Math.sin(a)*10*k); ctx.stroke();}
      ctx.fillStyle = slain ? '#776' : '#e2604e'; ctx.beginPath(); ctx.arc(x, y, 2.6*k, 0, Math.PI*2); ctx.fill();
      if(full){ctx.font = '10px Georgia'; ctx.fillStyle = '#f0b39a'; ctx.textAlign = 'center'; ctx.fillText(slain ? 'THE BRIAR THRONE · SLEEPING' : 'THE BRIAR THRONE', x, y+20);}
    }
  }
  for(const e of world.enemies){
    if(!(e.hp > 0) || !ENEMIES[e.type]?.boss || !vis(e.x, e.z)) continue;
    const x = sx(e.x), y = sz(e.z), pulse = 1+.2*Math.sin(clock*5);
    ctx.fillStyle = '#ff6a4e'; ctx.strokeStyle = '#2a1416'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5.5*k*pulse, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }
  // Omens (omens.mjs): always marked once they appear, so they can be sought out.
  for(const o of world.omens || []){
    if(o.done) continue;
    const spec = OMENS[o.kind]; if(!spec) continue;
    let x = sx(o.x), y = sz(o.z);
    const on = vis(o.x, o.z);
    if(!on && full) continue;
    if(!on){
      // Off the minimap: an arrow on its rim pointing the way.
      const cx = m.size/2, cy = m.size/2, a = Math.atan2(y-cy, x-cx), r = m.size/2-7;
      x = cx+Math.cos(a)*r; y = cy+Math.sin(a)*r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = spec.color; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill(); ctx.restore();
      continue;
    }
    const pulse = .7+.3*Math.sin(clock*4+o.x);
    ctx.globalAlpha = .35*pulse; ctx.fillStyle = spec.color; ctx.beginPath(); ctx.arc(x, y, 11*k, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#211a28'; ctx.beginPath(); ctx.arc(x, y, 6*k, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = spec.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = spec.color; ctx.font = `${Math.round(9*k)}px Georgia`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(spec.glyph, x, y+.5); ctx.textBaseline = 'alphabetic';
    if(full){ctx.font = '10px Georgia'; ctx.fillText(spec.name.toUpperCase(), x, y+19);}
  }
}
