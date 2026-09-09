// Four attributes, shared unchanged by all three visual encodings.
const sessions = [
  {name:'First light', note:'Monday · quiet coffee, open windows.', minutes:35, energy:2, discovery:3, mood:35},
  {name:'City rush', note:'Tuesday · a soundtrack for the commute.', minutes:60, energy:5, discovery:2, mood:70},
  {name:'Deep work', note:'Wednesday · headphones on, world off.', minutes:90, energy:1, discovery:1, mood:20},
  {name:'Kitchen disco', note:'Thursday · dinner with a little dancing.', minutes:45, energy:4, discovery:4, mood:95},
  {name:'Blue hour', note:'Friday · taking the long way home.', minutes:65, energy:2, discovery:5, mood:10},
  {name:'After hours', note:'Friday · one more track before sleep.', minutes:70, energy:3, discovery:4, mood:50},
  {name:'Open road', note:'Saturday · nowhere to be in a hurry.', minutes:80, energy:5, discovery:3, mood:85},
  {name:'Slow Sunday', note:'Sunday · letting the afternoon unfold.', minutes:30, energy:1, discovery:2, mood:60},
];
const views = {
  orbit:{kicker:'01 / POLAR CONSTELLATION',title:'A small sound system.',mark:'◉',description:'Longer sessions drift further out. Follow the energy clockwise; look for new discoveries in the larger circles.',legend:[['↗','Duration','Distance from center; rings = 30, 60, 90 min.'],['↻','Energy','Clockwise position; five numbered spokes = levels 1–5.'],['◯','Discovery','Circle area; larger = more discovery (1–5).'],['◐','Mood','Circle color; reflective blue → joyful peach.']]},
  weave:{kicker:'02 / WEIGHTED MOSAIC',title:'The fabric of a week.',mark:'▧',description:'Time becomes space. Each patch takes its share of the week, with energy threads and discovery stitches woven inside.',legend:[['▧','Duration','Patch area is proportional to minutes.'],['≋','Energy','Number of horizontal threads = energy (1–5).'],['⠿','Discovery','Number of dark stitches = discovery (1–5).'],['◐','Mood','Patch color; reflective blue → joyful peach.']]},
  bloom:{kicker:'03 / RADIAL GLYPHS',title:'Let the numbers bloom.',mark:'✳',description:'Each moment grows its own signature. Read the petals, reach, and center to discover what makes it different.',legend:[['↔','Duration','Petal reach from center; guide ring = 90 min.'],['✳','Energy','Petal count = energy + 2 (3–7 petals).'],['●','Discovery','Center circle area; larger = more discovery (1–5).'],['◐','Mood','Petal color; reflective blue → joyful peach.']]},
};
let view='orbit', selected=0;
const $=s=>document.querySelector(s);
const color=m=>{const a=[144,156,232],b=[255,182,125];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*m/100)).join(',')})`;};
const point=(r,a,cx=200,cy=202)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
const circle=(x,y,r,attrs='')=>`<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const label=(x,y,t,attrs='')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="currentColor" ${attrs}>${t}</text>`;
function record(i,body){const s=sessions[i];return `<g class="record ${selected===i?'selected':''}" role="button" tabindex="0" data-record="${i}" aria-pressed="${selected===i}" aria-label="${s.name}: ${s.minutes} minutes, energy ${s.energy} of 5, discovery ${s.discovery} of 5, mood ${s.mood} of 100">${body}</g>`;}
function orbit(){
  let out='';
  [30,60,90].forEach(m=>{out+=circle(200,202,m*1.65,'fill="none" stroke="currentColor" opacity=".16"');out+=label(205,202-m*1.65-5,`${m}′`,'text-anchor="start" opacity=".5" font-size="10"');});
  for(let e=1;e<=5;e++){const a=-Math.PI/2+(e-1)*Math.PI*2/5;const [x,y]=point(162,a),[tx,ty]=point(180,a);out+=`<path d="M200 202 L${x} ${y}" stroke="currentColor" opacity=".12"/>`+label(tx,ty+4,e,'opacity=".65"');}
  out+=circle(200,202,3,'fill="currentColor"');
  sessions.forEach((s,i)=>{const [x,y]=point(s.minutes*1.65,-Math.PI/2+(s.energy-1)*Math.PI*2/5),r=8*Math.sqrt(s.discovery);out+=record(i,circle(x,y,Math.max(23,r+7),'fill="transparent"')+circle(x,y,r+6,'class="selection" fill="none" stroke="currentColor" stroke-dasharray="3 3"')+circle(x,y,r,`class="art" fill="${color(s.mood)}"`)+label(x,y+4,String(i+1).padStart(2,'0'),'style="fill:#182e38;font-weight:700"'));});
  return `<svg viewBox="0 0 400 400" role="group" aria-label="Orbital chart of eight listening sessions">${out}</svg>`;
}
function weave(){
  const total=sessions.reduce((n,s)=>n+s.minutes,0),left=sessions.slice(0,4).reduce((n,s)=>n+s.minutes,0),width=352,height=340,x0=24,y0=24;let out='';
  [sessions.slice(0,4),sessions.slice(4)].forEach((group,col)=>{const sum=group.reduce((n,s)=>n+s.minutes,0),w=width*sum/total,x=x0+(col?width*left/total:0);let y=y0;
    group.forEach((s,j)=>{const i=col*4+j,h=height*s.minutes/sum;let art=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color(s.mood)}"/>`;
      for(let t=0;t<s.energy;t++){const yy=y+9+t*5;art+=`<path d="M${x+8} ${yy} H${x+w-8}" stroke="#31213e" opacity=".25" stroke-width="1.5"/>`;}
      for(let d=0;d<s.discovery;d++)art+=`<path d="M${x+w-13-d*8} ${y+h-14} v6" stroke="#31213e" stroke-width="3"/>`;
      art+=label(x+12,y+h-11,String(i+1).padStart(2,'0'),'text-anchor="start" style="fill:#31213e;font-weight:700"');
      out+=record(i,`<g class="art">${art}</g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#31213e" stroke-width="3"/><rect class="selection" x="${x+4}" y="${y+4}" width="${w-8}" height="${h-8}" rx="2" fill="none" stroke="#fff" stroke-width="2"/>`);y+=h;
    });
  });return `<svg viewBox="0 0 400 388" role="group" aria-label="Weighted mosaic of eight listening sessions">${out}</svg>`;
}
function bloom(){let out='';sessions.forEach((s,i)=>{const x=102+(i%2)*196,y=62+Math.floor(i/2)*116,r=s.minutes/90*44,petals=s.energy+2;let art='';
  for(let p=0;p<petals;p++){const a=p*360/petals;art+=`<ellipse cx="${x}" cy="${y-r/2}" rx="${r*.30}" ry="${r/2}" transform="rotate(${a} ${x} ${y})" fill="${color(s.mood)}" stroke="#293b32" stroke-opacity=".25"/>`;}
  out+=record(i,`<rect x="${x-85}" y="${y-49}" width="170" height="111" rx="12" fill="transparent"/>`+circle(x,y,44,'fill="none" stroke="#293b32" opacity=".14" stroke-dasharray="2 4"')+`<g class="art">${art}`+circle(x,y,3.8*Math.sqrt(s.discovery),'fill="#293b32"')+'</g>'+`<rect class="selection" x="${x-85}" y="${y-49}" width="170" height="111" rx="12" fill="none" stroke="#293b32" stroke-opacity=".6"/>`+label(x,y+59,`${String(i+1).padStart(2,'0')} ${s.name}`));
});return `<svg viewBox="0 0 400 480" role="group" aria-label="Eight botanical glyphs representing listening sessions">${out}</svg>`;}
function inspect(){const s=sessions[selected];$('#selected-name').textContent=s.name;$('#moment-number').textContent=String(selected+1).padStart(2,'0')+' / 08';$('#moment-title').textContent=s.name;$('#moment-note').textContent=s.note;$('#metrics').innerHTML=[['Duration',s.minutes,'min'],['Energy',s.energy,'/ 5'],['Discovery',s.discovery,'/ 5'],['Mood',s.mood,'/ 100']].map(([k,v,u])=>`<div><dt>${k}</dt><dd>${v} <small>${u}</small></dd></div>`).join('');document.querySelectorAll('[data-record]').forEach(el=>{const active=Number(el.dataset.record)===selected;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});}
function render(){const v=views[view];$('.exhibit').dataset.theme=view;$('#view-kicker').textContent=v.kicker;$('#view-title').textContent=v.title;$('#view-description').textContent=v.description;$('#view-mark').textContent=v.mark;$('#legend').innerHTML=v.legend.map(([icon,name,text])=>`<div class="legend-item"><span aria-hidden="true">${icon}</span><span><b>${name}.</b> ${text}</span></div>`).join('');$('#chart').innerHTML=({orbit,weave,bloom})[view]();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));inspect();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
$('#chart').addEventListener('click',e=>{const el=e.target.closest('[data-record]');if(el){selected=Number(el.dataset.record);inspect();}});
$('#chart').addEventListener('keydown',e=>{const el=e.target.closest('[data-record]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selected=Number(el.dataset.record);inspect();}});
$('#records').innerHTML=sessions.map(s=>`<tr><th scope="row">${s.name}</th><td>${s.minutes}</td><td>${s.energy}</td><td>${s.discovery}</td><td>${s.mood}</td></tr>`).join('');
render();
