// Everything around the critters: sky, glass jar, moss and plants, wandering
// visitors and particles. Jar-space helpers draw in jar units (jar is 100 wide).
import {createRng,mixHex} from './sim.mjs';
import {heart,star,shade} from './creatures.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const FLOWERS=['#ff8fab','#ffd166','#cdb4ff','#ffffff','#ff9e6d','#8ecae6'];
const CONFETTI=['#ff8fab','#ffd166','#8fdcab','#8ecae6','#cdb4ff','#ff9e6d'];

export function createScene(seed){
  const rng=createRng(seed);
  const plants=[];
  const xs=[7,17,29,44,58,71,83,93];
  for(const x of xs){
    const kind=rng()<.3?'fern':rng()<.4?'grass':'stem';
    plants.push({x:x+(rng()-.5)*5,kind,h:kind==='grass'?5+rng()*4:13+rng()*22,lean:(rng()-.5)*.5,phase:rng()*TAU,
      leaves:3+Math.floor(rng()*4),flower:kind==='stem'&&rng()<.75?FLOWERS[Math.floor(rng()*FLOWERS.length)]:null,flowerAt:rng()*.6});
  }
  const pebbles=Array.from({length:16},()=>({x:rng()*100,y:5+rng()*14,r:1+rng()*2.2,c:['#c9b8a6','#a89584','#e2d4c3','#8f9aa8','#d9c2b0'][Math.floor(rng()*5)]}));
  const fireflies=Array.from({length:7},()=>({a:rng()*TAU,b:rng()*TAU,sx:.2+rng()*.4,sy:.25+rng()*.4,ph:rng()*TAU}));
  const clouds=Array.from({length:3},(_,i)=>({x:rng(),y:.08+i*.07+rng()*.05,s:.7+rng()*.6,speed:.004+rng()*.006}));
  return {plants,pebbles,fireflies,clouds,stars:[],particles:[],snail:null,butterfly:null,golden:null,rain:null,rainbow:0,
    meteors:[],meteorShower:0,mushrooms:[],cel:null,rng:Math.random};
}

export function layoutStars(scene,vw,vh){
  const rng=createRng(Math.round(vw*7+vh));
  scene.stars=Array.from({length:Math.round(vw*vh/5200)},()=>({x:rng()*vw,y:rng()*vh*.75,r:.4+rng()*1.3,ph:rng()*TAU}));
}

// ── Particles (jar units) ─────────────────────────────────────────────────
export function burst(scene,x,y,kind,n,o={}){
  const rng=scene.rng;
  for(let i=0;i<n;i++){
    const a=o.angle??(rng()*TAU), sp=(o.speed??20)*(.4+rng()*.8);
    scene.particles.push({x:x+(rng()-.5)*(o.spread??0),y:y+(rng()-.5)*(o.spreadY??0),vx:Math.cos(a)*sp+(o.vx??0),vy:Math.sin(a)*sp+(o.vy??0),life:0,max:(o.life??1)*(.7+rng()*.6),
      kind,color:o.color??CONFETTI[Math.floor(rng()*CONFETTI.length)],size:(o.size??1.4)*(.7+rng()*.6),rot:rng()*TAU,vr:(rng()-.5)*8,g:o.g??30,text:o.text});
  }
  if(scene.particles.length>420)scene.particles.splice(0,scene.particles.length-420);
}

function updateParticles(scene,s,dt){
  for(const p of scene.particles){
    p.life+=dt;p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
    if(p.kind==='drop'&&p.y>s.floor){p.life=p.max;burst(scene,p.x,s.floor-.5,'ring',1,{speed:0,g:0,life:.4,size:1.2,color:'rgba(190,225,255,A)'});}
    if(p.kind==='leaf'){p.vx*=1-dt*1.5;p.vy=Math.min(p.vy,9);}
  }
  scene.particles=scene.particles.filter(p=>p.life<p.max);
}

export function drawParticles(ctx,scene,glow=false){
  for(const p of scene.particles){
    const isGlow=p.kind==='spore'||p.kind==='spark';
    if(isGlow!==glow)continue;
    const a=1-p.life/p.max;
    ctx.save();ctx.globalAlpha=clamp(a*1.4,0,1);ctx.translate(p.x,p.y);
    switch(p.kind){
      case 'heart':heart(ctx,0,0,p.size*(1.2-a*.3));ctx.fillStyle=p.color;ctx.fill();break;
      case 'spark':ctx.fillStyle=p.color;ctx.rotate(p.rot*.3);star(ctx,0,0,p.size*(.5+a*.6));break;
      case 'confetti':ctx.rotate(p.rot);ctx.scale(1,Math.cos(p.rot*2));ctx.fillStyle=p.color;ctx.fillRect(-p.size*.6,-p.size*.35,p.size*1.2,p.size*.7);break;
      case 'leaf':ctx.rotate(p.rot);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,p.size,p.size*.45,0,0,TAU);ctx.fill();break;
      case 'dirt':ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,p.size*.5,0,TAU);ctx.fill();break;
      case 'spore':ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,p.size*(.4+a*.4),0,TAU);ctx.fill();break;
      case 'drop':ctx.strokeStyle='rgba(200,230,255,.75)';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-p.vx*.02,-2.4);ctx.stroke();break;
      case 'ring':ctx.strokeStyle=p.color.replace('A',a.toFixed(2));ctx.lineWidth=.4;ctx.beginPath();ctx.ellipse(0,0,p.size*(2.2-a*1.6),p.size*(.8-a*.55),0,0,TAU);ctx.stroke();break;
      case 'text':ctx.fillStyle=p.color;ctx.font=`600 ${p.size*2}px Fredoka, ui-rounded, system-ui, sans-serif`;ctx.textAlign='center';ctx.fillText(p.text,0,0);break;
    }
    ctx.restore();
  }
}

// ── Visitors ──────────────────────────────────────────────────────────────
export function spawnVisitor(scene,s,name,night){
  const rng=scene.rng;
  switch(name){
    case 'snail':if(scene.snail)return false;{const dir=rng()<.5?1:-1;scene.snail={x:dir>0?2:s.w-2,dir,hat:0,t:0,say:0};}return true;
    case 'butterfly':if(scene.butterfly)return false;
      scene.butterfly={x:20+rng()*60,y:-14,tx:30+rng()*40,ty:s.floor*.4,t:0,phase:'roam',until:4+rng()*3,on:null,color:FLOWERS[Math.floor(rng()*4)]};return true;
    case 'golden':if(scene.golden)return false;scene.golden={t:0,a:rng()*TAU,b:rng()*TAU,trail:[],x:50,y:s.floor*.4};return true;
    case 'rain':if(scene.rain)return false;scene.rain={t:0,dur:9+rng()*4,x:50};return true;
    case 'meteors':scene.meteorShower=12;return true;
    case 'mushrooms':{
      const count=1+Math.floor(rng()*3);
      for(let i=0;i<count&&scene.mushrooms.length<5;i++)scene.mushrooms.push({x:8+rng()*84,grow:0,life:0,max:50+rng()*30,size:3.2+rng()*1.8,color:['#ff6b6b','#ffb4a2','#cdb4ff','#8ecae6'][Math.floor(rng()*4)],delay:i*.5});
      return true;}
  }
  return false;
}

export function updateScene(scene,s,dt,t,night,on){
  const rng=scene.rng;
  updateParticles(scene,s,dt);
  const sn=scene.snail;
  if(sn){
    sn.t+=dt;sn.hat=Math.max(0,sn.hat-dt);sn.say=Math.max(0,sn.say-dt);
    if(sn.hat<=0)sn.x+=sn.dir*2.2*dt;
    if(sn.x<-6||sn.x>s.w+6)scene.snail=null;
  }
  const bf=scene.butterfly;
  if(bf){
    bf.t+=dt;bf.until-=dt;
    if(bf.phase==='land'){
      const b=s.bodies.find(x=>x.id===bf.on);
      if(!b||b.held||Math.hypot(b.vx,b.vy)>60||bf.until<=0){bf.phase='out';bf.tx=bf.x+(rng()-.5)*30;bf.ty=-30;}
      else{bf.tx=b.x;bf.ty=b.y-b.r*1.25;bf.x+=(bf.tx-bf.x)*Math.min(1,dt*10);bf.y+=(bf.ty-bf.y)*Math.min(1,dt*10);}
    }else{
      if(bf.phase==='roam'&&Math.hypot(bf.tx-bf.x,bf.ty-bf.y)<4){bf.tx=8+rng()*84;bf.ty=8+rng()*(s.floor-30);}
      if(bf.phase==='roam'&&bf.until<=0){
        const awake=s.bodies.filter(b=>b.mode!=='sleep'&&!b.held);
        if(awake.length){const b=awake[Math.floor(rng()*awake.length)];bf.phase='land';bf.on=b.id;bf.until=6+rng()*6;on.emote(b.id,'🦋');}
        else{bf.phase='out';bf.ty=-30;}
      }
      const dx=bf.tx-bf.x, dy=bf.ty-bf.y, d=Math.hypot(dx,dy)||1, sp=bf.phase==='out'?26:16;
      bf.x+=dx/d*sp*dt+Math.sin(bf.t*3.1)*4*dt;bf.y+=dy/d*sp*dt+Math.sin(bf.t*5.3)*7*dt;
      if(bf.phase==='out'&&bf.y<-24)scene.butterfly=null;
    }
  }
  const gf=scene.golden;
  if(gf){
    gf.t+=dt;
    gf.x=50+Math.sin(gf.t*.62+gf.a)*36+Math.sin(gf.t*1.7)*6;
    gf.y=s.floor*.42+Math.sin(gf.t*.91+gf.b)*s.floor*.3+Math.cos(gf.t*2.3)*4;
    gf.trail.push([gf.x,gf.y]);if(gf.trail.length>18)gf.trail.shift();
    if(gf.t>24){burst(scene,gf.x,gf.y,'spark',8,{color:'#ffe08a',g:0,speed:10});scene.golden=null;}
  }
  const rain=scene.rain;
  if(rain){
    rain.t+=dt;rain.x=50+Math.sin(rain.t*.4)*10;
    const fade=Math.min(1,rain.t,rain.dur-rain.t);
    if(fade>.3&&rng()<dt*34)burst(scene,rain.x+(rng()-.5)*40,-13,'drop',1,{angle:Math.PI/2,speed:70,g:60,life:2,spread:0});
    if(rng()<dt*.35){const b=s.bodies[Math.floor(rng()*s.bodies.length)];if(b.mode!=='sleep')on.emote(b.id,rng()<.5?'☔':'💧');}
    if(rain.t>=rain.dur){scene.rain=null;if(night<.5){scene.rainbow=14;on.toast?.('A rainbow! The moss is very pleased.');}}
  }
  scene.rainbow=Math.max(0,scene.rainbow-dt);
  for(const m of scene.mushrooms){m.life+=dt;m.grow=clamp((m.life-m.delay)/1.6,0,1);}
  scene.mushrooms=scene.mushrooms.filter(m=>m.life<m.max);
  scene.meteorShower=Math.max(0,scene.meteorShower-dt);
  if(scene.meteorShower>0&&rng()<dt*1.6)scene.meteors.push({u:rng(),v:rng()*.3,life:0,max:.9+rng()*.5,dir:rng()<.5?-1:1});
  for(const m of scene.meteors)m.life+=dt;
  scene.meteors=scene.meteors.filter(m=>m.life<m.max);
}

export function hitVisitor(scene,s,x,y){
  const gf=scene.golden;
  if(gf&&Math.hypot(x-gf.x,y-gf.y)<9)return 'golden';
  const bf=scene.butterfly;
  if(bf&&Math.hypot(x-bf.x,y-bf.y)<7)return 'butterfly';
  const sn=scene.snail;
  if(sn&&Math.hypot(x-sn.x,y-(s.floor-2.5))<6)return 'snail';
  const i=scene.mushrooms.findIndex(m=>m.grow>.5&&Math.hypot(x-m.x,y-(s.floor-m.size*1.6))<m.size*2+2);
  return i>=0?'mushroom:'+i:null;
}

// ── Sky (screen px) ───────────────────────────────────────────────────────
export function drawBackdrop(ctx,scene,sky,view,t,hours,jarRect){
  const {vw,vh}=view, night=sky.night;
  const g=ctx.createLinearGradient(0,0,0,vh);
  g.addColorStop(0,sky.top);g.addColorStop(1,sky.bottom);
  ctx.fillStyle=g;ctx.fillRect(0,0,vw,vh);
  if(night>.05){
    ctx.fillStyle='#fff';
    for(const st of scene.stars){ctx.globalAlpha=night*(.35+.65*(.5+.5*Math.sin(t*1.7+st.ph)));ctx.beginPath();ctx.arc(st.x,st.y,st.r,0,TAU);ctx.fill();}
    ctx.globalAlpha=1;
  }
  // Sun by day, moon by night, riding a low arc across the top of the screen.
  const isSun=night<.5, prog=(((hours-(isSun?6:18))%24)+24)%24/12;
  const p=clamp(prog,0,1), cx=vw*(.12+.76*p), cy=72+(1-Math.sin(p*Math.PI))*70, r=isSun?24:19;
  scene.cel={x:cx,y:cy,r:r+14,isSun};
  const halo=ctx.createRadialGradient(cx,cy,r*.5,cx,cy,r*4);
  halo.addColorStop(0,isSun?'rgba(255,236,170,.55)':'rgba(220,230,255,.3)');halo.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,r*4,0,TAU);ctx.fill();
  if(isSun){ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.fill();}
  else{
    ctx.fillStyle='#f4f1ff';ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(180,180,220,.35)';for(const [x,y,s] of [[-.3,-.2,.22],[.25,.3,.16],[.35,-.35,.1]]){ctx.beginPath();ctx.arc(cx+x*r,cy+y*r,s*r,0,TAU);ctx.fill();}
  }
  for(const c of scene.clouds){
    c.x=(c.x+c.speed/60)%1.3;
    const x=-vw*.15+c.x*vw*1.3, y=c.y*vh, s=c.s*Math.min(vw,500)/360;
    ctx.fillStyle=night>.5?`rgba(150,160,220,${.12})`:`rgba(255,255,255,${.75-night*.5})`;
    for(const [dx,dy,rr] of [[0,0,16],[18,-7,19],[38,0,15],[20,5,15]]){ctx.beginPath();ctx.arc(x+dx*s,y+dy*s,rr*s,0,TAU);ctx.fill();}
  }
  for(const m of scene.meteors){
    const a=m.life/m.max, x0=vw*(m.dir>0?.05+m.u*.5:.45+m.u*.5), y0=vh*(.04+m.v*.5);
    const x=x0+m.dir*a*vw*.45, y=y0+a*vh*.22, tail=70;
    const len=Math.hypot(vw*.45,vh*.22), ux=m.dir*vw*.45/len, uy=vh*.22/len;
    const lg=ctx.createLinearGradient(x,y,x-ux*tail,y-uy*tail);
    lg.addColorStop(0,`rgba(255,255,255,${(1-a)*.95})`);lg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.strokeStyle=lg;ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-ux*tail,y-uy*tail);ctx.stroke();
  }
  if(scene.rainbow>0){
    const a=Math.min(1,scene.rainbow/2,(14-scene.rainbow)/2)*.45, cx=jarRect.x+jarRect.w/2, cy=jarRect.y+jarRect.h, R=jarRect.w*.95;
    ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#4dabf7','#9775fa'].forEach((c,i)=>{ctx.strokeStyle=c;ctx.globalAlpha=a;ctx.lineWidth=7;ctx.beginPath();ctx.arc(cx,cy,R-i*7,Math.PI,TAU);ctx.stroke();});
    ctx.globalAlpha=1;
  }
  // The shelf the jar sits on.
  const top=jarRect.y+jarRect.h-6;
  const tg=ctx.createLinearGradient(0,top,0,vh);
  tg.addColorStop(0,mixHex('#f3d3b0','#3b3468',night));tg.addColorStop(1,mixHex('#e2b48a','#211d43',night));
  ctx.fillStyle=tg;ctx.fillRect(0,top,vw,vh-top);
  ctx.fillStyle=`rgba(255,255,255,${.35-night*.25})`;ctx.fillRect(0,top,vw,1.5);
  const sh=ctx.createRadialGradient(0,0,0,0,0,1);
  sh.addColorStop(0,'rgba(40,20,60,.32)');sh.addColorStop(1,'rgba(40,20,60,0)');
  ctx.save();ctx.translate(jarRect.x+jarRect.w/2,top+6);ctx.scale(jarRect.w*.66,13);ctx.fillStyle=sh;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
}

// ── Jar (jar units) ───────────────────────────────────────────────────────
export function innerPath(ctx,s){ctx.beginPath();ctx.roundRect(0,-7,s.w,s.h+7,[6,6,14,14]);}
function outerPath(ctx,s){ctx.beginPath();ctx.roundRect(-2.6,-8,s.w+5.2,s.h+10.6,[8,8,17,17]);}

export function drawJarBack(ctx,s,night){
  outerPath(ctx,s);
  ctx.fillStyle=night>.5?'rgba(170,190,255,.07)':'rgba(255,255,255,.16)';ctx.fill();
}

export function drawRays(ctx,s,t,night){
  if(night>.7)return;
  ctx.save();ctx.globalAlpha=(1-night)*.09;ctx.fillStyle='#fffbe6';
  for(let i=0;i<4;i++){
    const x=-10+i*28+Math.sin(t*.15+i)*6;
    ctx.beginPath();ctx.moveTo(x,-8);ctx.lineTo(x+10,-8);ctx.lineTo(x+40,s.floor);ctx.lineTo(x+22,s.floor);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

export function drawSoil(ctx,s,scene,night){
  const f=s.floor;
  const sg=ctx.createLinearGradient(0,f,0,s.h);
  sg.addColorStop(0,'#6b4f3f');sg.addColorStop(.45,'#5a3f33');sg.addColorStop(1,'#3e2b25');
  ctx.fillStyle=sg;ctx.fillRect(-1,f,s.w+2,s.h-f+4);
  ctx.fillStyle='#d9c2a0';ctx.beginPath();ctx.moveTo(-1,f+11);
  for(let x=0;x<=s.w+4;x+=5)ctx.quadraticCurveTo(x-2.5,f+10+Math.sin(x*.3)*1.2,x,f+11+Math.sin(x*.17)*1.4);
  ctx.lineTo(s.w+2,f+14.5);for(let x=s.w;x>=-4;x-=5)ctx.lineTo(x,f+14+Math.sin(x*.21)*1.1);ctx.closePath();ctx.fill();
  for(const p of scene.pebbles){ctx.fillStyle=p.c;ctx.beginPath();ctx.ellipse(p.x,f+p.y,p.r,p.r*.75,0,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.25)';ctx.beginPath();ctx.arc(p.x-p.r*.3,f+p.y-p.r*.3,p.r*.3,0,TAU);ctx.fill();}
  const mg=ctx.createLinearGradient(0,f-2,0,f+5);
  mg.addColorStop(0,'#9be08f');mg.addColorStop(1,'#4f9a5a');
  ctx.fillStyle=mg;ctx.beginPath();ctx.moveTo(-1,f+5);ctx.lineTo(-1,f);
  for(let x=0;x<=s.w+4;x+=4)ctx.quadraticCurveTo(x-2,f-1.8-Math.abs(Math.sin(x*1.3))*.8,x,f-.2);
  ctx.lineTo(s.w+2,f+5);ctx.closePath();ctx.fill();
}

export function drawPlants(ctx,s,scene,t,growth,tilt){
  const f=s.floor+.5, boost=scene.rain?1.06:1;
  for(const p of scene.plants){
    const h=p.h*(.45+.55*growth)*boost, sway=Math.sin(t*1.1+p.phase)*.09+p.lean*.35+tilt*.35;
    const tipX=p.x+Math.sin(sway)*h, tipY=f-Math.cos(sway)*h, cx=p.x+Math.sin(sway*.4)*h*.5, cy=f-h*.6;
    if(p.kind==='grass'){
      ctx.strokeStyle='#5fae62';ctx.lineWidth=.7;ctx.lineCap='round';
      for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(p.x+i*.8,f);ctx.quadraticCurveTo(p.x+i*1.4,f-h*.6,p.x+i*2.2+Math.sin(t*1.4+p.phase+i)*.8,f-h*(1-Math.abs(i)*.15));ctx.stroke();}
      continue;
    }
    ctx.strokeStyle=p.kind==='fern'?'#4b9a5b':'#5aa769';ctx.lineWidth=.9;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(p.x,f);ctx.quadraticCurveTo(cx,cy,tipX,tipY);ctx.stroke();
    const n=p.kind==='fern'?9:p.leaves;
    for(let i=1;i<=n;i++){
      const u=i/(n+1), x=(1-u)**2*p.x+2*(1-u)*u*cx+u*u*tipX, y=(1-u)**2*f+2*(1-u)*u*cy+u*u*tipY, side=i%2?1:-1;
      const size=p.kind==='fern'?(1-u*.6)*2.6:2.4+u*.6, ang=sway+side*(p.kind==='fern'?1.2:.9)+Math.sin(t*1.6+p.phase+i)*.08;
      ctx.fillStyle=p.kind==='fern'?'#62b56e':i%2?'#7cc77f':'#6dbb74';
      ctx.save();ctx.translate(x,y);ctx.rotate(ang-Math.PI/2);ctx.beginPath();ctx.ellipse(0,-size*.9,size*.45,size,0,0,TAU);ctx.fill();ctx.restore();
      if(p.kind==='fern'){ctx.save();ctx.translate(x,y);ctx.rotate(-ang-Math.PI/2+sway*2);ctx.beginPath();ctx.ellipse(0,-size*.9,size*.45,size,0,0,TAU);ctx.fill();ctx.restore();}
    }
    if(p.flower&&growth>=p.flowerAt){
      const bloom=clamp((growth-p.flowerAt)*6,.3,1), pr=1.5*bloom;
      ctx.fillStyle=p.flower;
      for(let i=0;i<5;i++){const a=i/5*TAU+t*.2;ctx.beginPath();ctx.arc(tipX+Math.cos(a)*pr,tipY+Math.sin(a)*pr,pr*.8,0,TAU);ctx.fill();}
      ctx.fillStyle='#ffd166';ctx.beginPath();ctx.arc(tipX,tipY,pr*.6,0,TAU);ctx.fill();
    }
  }
}

export function drawMushrooms(ctx,s,scene,night,glow=false){
  for(const m of scene.mushrooms){
    if(m.grow<=0)continue;
    const fade=Math.min(1,(m.max-m.life)/2), h=m.size*1.6*m.grow, w=m.size*m.grow, y=s.floor+.4;
    ctx.globalAlpha=fade;
    if(glow){
      const g=ctx.createRadialGradient(m.x,y-h,0,m.x,y-h,w*3);
      g.addColorStop(0,m.color.length===7?m.color+'88':m.color);g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.globalAlpha=fade*night*.8;ctx.fillStyle=g;ctx.beginPath();ctx.arc(m.x,y-h,w*3,0,TAU);ctx.fill();ctx.globalAlpha=1;continue;
    }
    ctx.fillStyle='#fff4e0';ctx.beginPath();ctx.roundRect(m.x-w*.28,y-h,w*.56,h,w*.2);ctx.fill();
    ctx.fillStyle=m.color;ctx.beginPath();ctx.ellipse(m.x,y-h,w,w*.75,0,Math.PI,TAU);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.85)';for(const [dx,dy,r] of [[-.45,-.35,.15],[.15,-.55,.12],[.5,-.25,.1]]){ctx.beginPath();ctx.arc(m.x+dx*w,y-h+dy*w,r*w,0,TAU);ctx.fill();}
    ctx.globalAlpha=1;
  }
}

export function drawSnail(ctx,s,scene,t){
  const sn=scene.snail;if(!sn)return;
  const y=s.floor-.2, x=sn.x, d=sn.dir, crawl=Math.sin(t*4)*.25, fade=clamp(Math.min(sn.t,(d>0?s.w+6-x:x+6)/4),0,1);
  ctx.save();ctx.globalAlpha=fade;ctx.translate(x,y);ctx.scale(d,1);
  ctx.fillStyle='#c9d6b8';ctx.beginPath();ctx.ellipse(.5,-.9,4.2+crawl,1.1,0,0,TAU);ctx.fill();
  ctx.strokeStyle='#c9d6b8';ctx.lineWidth=.45;ctx.lineCap='round';
  for(const k of [0,1]){ctx.beginPath();ctx.moveTo(3.6,-1.4);ctx.lineTo(4.4+k*.7,-3.8+k*.3);ctx.stroke();ctx.fillStyle='#2b2340';ctx.beginPath();ctx.arc(4.4+k*.7,-3.9+k*.3,.35,0,TAU);ctx.fill();}
  ctx.fillStyle='#e6a57e';ctx.beginPath();ctx.arc(-.6,-3.1,2.6,0,TAU);ctx.fill();
  ctx.strokeStyle='#b46f52';ctx.lineWidth=.4;ctx.beginPath();
  for(let i=0;i<=40;i++){const a=i/40*TAU*2.2, r=2.2*(1-i/46);i?ctx.lineTo(-.6+Math.cos(a)*r,-3.1+Math.sin(a)*r):ctx.moveTo(-.6+r,-3.1);}ctx.stroke();
  const tip=Math.min(1,sn.hat*2);
  ctx.save();ctx.translate(-.4,-5.6-tip*1.6);ctx.rotate(-tip*.5);
  ctx.fillStyle='#2b2340';ctx.fillRect(-1.6,0,3.2,.45);ctx.fillRect(-1.05,-2.2,2.1,2.3);
  ctx.fillStyle='#e05d6f';ctx.fillRect(-1.05,-.6,2.1,.45);ctx.restore();
  ctx.restore();
  if(sn.say>0)drawBubble(ctx,x,y-10,'how do you do',3,Math.min(1,sn.say));
}

export function drawButterfly(ctx,scene,t){
  const bf=scene.butterfly;if(!bf)return;
  const flap=bf.phase==='land'?.55+Math.abs(Math.sin(t*3))*.45:.25+Math.abs(Math.sin(t*15))*.75;
  ctx.save();ctx.translate(bf.x,bf.y);ctx.rotate(Math.sin(t*2)*.15);ctx.scale(1.5,1.5);
  for(const sd of [-1,1]){
    ctx.save();ctx.scale(sd*flap,1);ctx.fillStyle=bf.color;
    ctx.beginPath();ctx.ellipse(1.6,-1.3,1.8,1.4,-.4,0,TAU);ctx.fill();
    ctx.fillStyle=shade(bf.color.length===7?bf.color:'#ffffff',-.15);ctx.beginPath();ctx.ellipse(1.2,1,1.1,.9,.4,0,TAU);ctx.fill();ctx.restore();
  }
  ctx.fillStyle='#2b2340';ctx.beginPath();ctx.ellipse(0,0,.35,1.6,0,0,TAU);ctx.fill();
  ctx.restore();
}

export function drawFireflies(ctx,s,scene,t,night){
  if(night>.15)for(const f of scene.fireflies){
    const x=50+Math.sin(t*f.sx+f.a)*42, y=s.floor*.5+Math.sin(t*f.sy+f.b)*s.floor*.4, a=night*(.5+.5*Math.sin(t*2.2+f.ph));
    glowDot(ctx,x,y,4,'255,240,150',a*.8);
  }
  const gf=scene.golden;
  if(gf){
    gf.trail.forEach(([x,y],i)=>glowDot(ctx,x,y,1.2+i*.12,'255,214,90',i/gf.trail.length*.35));
    glowDot(ctx,gf.x,gf.y,9+Math.sin(t*9)*1.5,'255,205,70',.9);
    ctx.fillStyle='#fff8d6';star(ctx,gf.x,gf.y,1.8+Math.sin(t*12)*.4);
  }
}

function glowDot(ctx,x,y,r,rgb,a){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(.25,`rgba(${rgb},${a*.6})`);g.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
}

export function drawJarFront(ctx,s,t,night,label){
  outerPath(ctx,s);ctx.strokeStyle=`rgba(255,255,255,${.55-night*.25})`;ctx.lineWidth=.7;ctx.stroke();
  innerPath(ctx,s);ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=.5;ctx.stroke();
  const hl=ctx.createLinearGradient(0,4,0,s.h*.7);
  hl.addColorStop(0,'rgba(255,255,255,.5)');hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hl;ctx.beginPath();ctx.roundRect(2.4,2,2.6,s.h*.62,1.3);ctx.fill();
  ctx.beginPath();ctx.roundRect(2.6,s.h*.67,2.2,5,1.1);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.roundRect(s.w-4,6,1.4,s.h*.4,.7);ctx.fill();
  const lip=ctx.createLinearGradient(0,-12,0,-6.5);
  lip.addColorStop(0,`rgba(255,255,255,${.55-night*.35})`);lip.addColorStop(1,`rgba(255,255,255,${.18-night*.1})`);
  ctx.fillStyle=lip;ctx.beginPath();ctx.roundRect(-4.2,-12,s.w+8.4,4.6,2.3);ctx.fill();
  ctx.strokeStyle=`rgba(255,255,255,${.7-night*.35})`;ctx.lineWidth=.5;ctx.stroke();
  // Ribbon, bow and a little tag.
  ctx.fillStyle='#e9738f';ctx.fillRect(-2.6,-6.6,s.w+5.2,2.6);
  ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(-2.6,-6.6,s.w+5.2,.6);
  const bx=s.w*.74, by=-5.3;
  ctx.fillStyle='#d65a79';
  for(const sd of [-1,1]){ctx.beginPath();ctx.ellipse(bx+sd*2.6,by-.4,2.8,1.7,sd*.35,0,TAU);ctx.fill();}
  ctx.beginPath();ctx.moveTo(bx-.6,by);ctx.lineTo(bx-2.4,by+5.5);ctx.lineTo(bx-.9,by+5);ctx.lineTo(bx+.3,by+.5);ctx.fill();
  ctx.beginPath();ctx.moveTo(bx+.6,by);ctx.lineTo(bx+2.8,by+5.2);ctx.lineTo(bx+1.4,by+5);ctx.lineTo(bx-.2,by+.5);ctx.fill();
  ctx.fillStyle='#f28aa4';ctx.beginPath();ctx.arc(bx,by,1.2,0,TAU);ctx.fill();
  const swing=Math.sin(t*1.3)*.07;
  ctx.save();ctx.translate(bx+1.5,by+.5);ctx.rotate(.35+swing);
  ctx.strokeStyle='rgba(255,250,240,.8)';ctx.lineWidth=.25;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,6);ctx.stroke();
  ctx.fillStyle='#fff7e8';ctx.beginPath();ctx.roundRect(-5.5,6,11,5.2,1);ctx.fill();
  ctx.fillStyle='rgba(120,90,70,.25)';ctx.beginPath();ctx.arc(0,7.1,.45,0,TAU);ctx.fill();
  ctx.fillStyle='#7a5a4c';ctx.font='600 2.3px Fredoka, ui-rounded, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(label,0,9.1);ctx.restore();
}

export function drawRainCloud(ctx,scene,t){
  const rain=scene.rain;if(!rain)return;
  const a=clamp(Math.min(rain.t,rain.dur-rain.t),0,1);
  ctx.globalAlpha=a;ctx.fillStyle='#e8ecf7';
  for(const [dx,dy,r] of [[-14,0,6],[-5,-4,8],[6,-2,7],[14,1,5.5],[0,2,6]]){ctx.beginPath();ctx.arc(rain.x+dx,-18+dy,r,0,TAU);ctx.fill();}
  ctx.fillStyle='rgba(150,160,190,.35)';ctx.beginPath();ctx.ellipse(rain.x,-14,18,2.5,0,0,TAU);ctx.fill();
  ctx.globalAlpha=1;
}

export function drawBubble(ctx,x,y,text,size,alpha=1,pop=1){
  const emoji=!/^[\w\s'!?.,-]+$/.test(text);
  ctx.save();ctx.globalAlpha=clamp(alpha,0,1);ctx.translate(x,y);ctx.scale(pop,pop);
  ctx.font=emoji?`${size*1.25}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`:`600 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
  const w=Math.max(size*2,ctx.measureText(text).width+size*1.2), h=size*2.1;
  ctx.fillStyle='rgba(255,255,255,.96)';ctx.beginPath();ctx.roundRect(-w/2,-h,w,h,h/2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-size*.4,-.2);ctx.lineTo(0,size*.6);ctx.lineTo(size*.4,-.2);ctx.fill();
  ctx.fillStyle='#3a2f4f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,-h/2+size*.08);
  ctx.restore();
}

export function drawNameTag(ctx,x,y,text,alpha){
  ctx.save();ctx.globalAlpha=clamp(alpha,0,1);
  ctx.font='600 3px Fredoka, ui-rounded, system-ui, sans-serif';
  const w=ctx.measureText(text).width+3.4;
  ctx.fillStyle='rgba(40,30,70,.72)';ctx.beginPath();ctx.roundRect(x-w/2,y,w,4.6,2.3);ctx.fill();
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y+2.4);
  ctx.restore();
}

export {CONFETTI};
