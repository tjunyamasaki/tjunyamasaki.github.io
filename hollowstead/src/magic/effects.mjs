// World-space ink strokes, ribbons and motes. Both renderers consume this same
// bounded command list; no particles, animation clocks or random rolls affect damage.
import {MAGIC_PALETTE, GRAVECRAFT} from './art.mjs?v=harvest-14';
import {BELL, waveRadius} from './mourning-bell.mjs?v=harvest-14';

const TAU=Math.PI*2;
const clamp=n=>Math.max(0,Math.min(1,n));
const point=(x,z,y=.08)=>[x,y,z];
const ease=n=>1-(1-clamp(n))**3;
const known = e => GRAVECRAFT[e?.packId || String(e?.id||'').split(':')[0]];

export function usesMagicEffects(entity){return !!known(entity) && entity.type!=='skeleton';}

export function buildMagicEffects(world, frame, theme={}){
  const palette={...MAGIC_PALETTE,...theme.magic?.palette}, commands=[];
  const max=Math.max(8,Math.min(96,theme.magic?.maxEffects||48));
  let budget=max;
  const path=(points,width,color,alpha=1,fill=false)=>{
    if(alpha>.006 && points.length>1) commands.push({kind:'path',points,width,color:palette[color]||color,alpha:clamp(alpha),fill});
  };
  const orb=(x,z,y,r,color,alpha=1,ground=false)=>{
    if(alpha>.006 && r>0) commands.push({kind:'orb',center:point(x,z,y),radius:r,color:palette[color]||color,alpha:clamp(alpha),ground});
  };
  const arc=(x,z,y,r,from=0,to=TAU,steps=32)=>Array.from({length:steps+1},(_,i)=>point(x+Math.cos(from+(to-from)*i/steps)*r,z+Math.sin(from+(to-from)*i/steps)*r,y));
  const ring=(x,z,r,alpha=1,color='spirit',rotation=0)=>{
    path(arc(x,z,.065,r),.09,'ink',alpha*.6);
    path(arc(x,z,.07,r),.032,color,alpha);
    for(let i=0;i<6;i++){
      const a=rotation+i*TAU/6,c=Math.cos(a),s=Math.sin(a),rx=x+c*r,rz=z+s*r;
      path([point(rx-c*.1,rz-s*.1),point(rx-s*.07,rz+c*.07),point(rx+c*.1,rz+s*.1),point(rx+s*.07,rz-c*.07),point(rx-c*.1,rz-s*.1)],.024,'core',alpha*.8);
    }
  };
  const burst=(x,z,age,life=.6,color='spirit',height=.3)=>{
    const t=clamp(age/life),fade=(1-t)**1.5;
    ring(x,z,.2+ease(t)*.9,fade*.8,color,t);
    for(let i=0;i<9;i++){
      const a=i*2.39996,r=.2+t*(.55+(i%3)*.24),lift=height+Math.sin(t*Math.PI)*(.25+(i%4)*.12);
      orb(x+Math.cos(a)*r,z+Math.sin(a)*r,lift,.035+(i%2)*.025,i%3?'core':color,fade);
    }
  };
  const entries=(list,visit)=>{
    if(!Array.isArray(list))return;
    for(let i=list.length-1;i>=0&&budget>0;i--){
      const e=list[i];
      if(!e || !Number.isFinite(e.x) || !Number.isFinite(e.z))continue;
      budget--; visit(e,(e.age||0)+frame.lead);
    }
  };

  entries(world.magicBolts,(e,age)=>{
    if(e.packId!=='cinder-staff')return;
    const speed=Math.hypot(e.vx||0,e.vz||0)||1,dx=e.vx/speed,dz=e.vz/speed;
    const lead=Math.min(frame.lead,Math.max(0,(e.maxRange-e.traveled)/speed));
    const x=e.x+(e.vx||0)*lead,z=e.z+(e.vz||0)*lead;
    const tail=Math.min(1.65,age*speed),trail=[];
    for(let i=0;i<10;i++){
      const t=i/9,swirl=Math.sin(age*22-t*8)*.13*t;
      trail.push(point(x-dx*tail*t-dz*swirl,z-dz*tail*t+dx*swirl,1+.07*Math.sin(t*7-age*16)));
    }
    path(trail,.25,'shade',.42);path(trail,.09,'spirit',.9);path(trail.slice(0,6),.035,'core');
    orb(x,z,1,.32,'shade',.23);orb(x,z,1,.19,'spirit',.9);orb(x,z,1,.075,'core');
    for(let i=0;i<4;i++){
      const t=(age*2.5+i*.25)%1;
      orb(x-dx*tail*t+Math.sin(i*3)*.12,z-dz*tail*t+Math.cos(i*3)*.12,1+t*.35,.045*(1-t),'ember',1-t);
    }
  });
  entries(world.magicPuffs,(e,age)=>{
    if(e.packId!=='cinder-staff')return;
    const t=clamp(age/(e.life||.55));
    orb(e.x,e.z,1,.12+ease(t)*.6,'shade',(1-t)*.35);
    burst(e.x,e.z,age,e.life||.55,'ember',.7);
    path(arc(e.x,e.z,.9,.12+ease(t)*.55),.05,'spirit',1-t);
  });
  entries(world.magicDarts,(e,age)=>{
    if(e.packId!=='widows-needle')return;
    const lead=Math.min(frame.lead,Math.max(0,(e.range-e.traveled)/20));
    const dx=e.dx||0,dz=e.dz||0,x=e.x+dx*20*lead,z=e.z+dz*20*lead,tail=Math.min(2.2,age*20);
    const silk=[];
    for(let i=0;i<14;i++){
      const t=i/13,s=Math.sin(t*12-age*28)*.09*t;
      silk.push(point(x-dx*tail*t-dz*s,z-dz*tail*t+dx*s,.85+Math.sin(t*7)*.04));
    }
    path(silk,.11,'shade',.4);path(silk,.025,'silk',.9);
    const needle=[point(x+dx*.38,z+dz*.38,.85),point(x-dx*.3-dz*.075,z-dz*.3+dx*.075,.85),point(x-dx*.18,z-dz*.18,.85),point(x-dx*.3+dz*.075,z-dz*.3-dx*.075,.85)];
    path(needle,.02,'core',1,true);orb(x,z,.85,.13,'spirit',.6);
  });
  entries(world.magicRoots,(e,age)=>{
    if(e.packId!=='widows-needle')return;
    const fade=clamp((e.remaining-frame.lead)/.3),grow=ease(age/.18);
    ring(e.x,e.z,.58*grow,fade*.75,'silk',.3);
    for(let i=0;i<5;i++){
      const a=i*TAU/5,thread=[];
      for(let j=0;j<12;j++){
        const t=j/11,r=(.55-.27*Math.sin(t*Math.PI))*grow;
        thread.push(point(e.x+Math.cos(a+t*1.4)*r,e.z+Math.sin(a+t*1.4)*r,.06+t*1.45*grow));
      }
      path(thread,.075,'ink',fade*.4);path(thread,.024,'silk',fade*.85);
      orb(e.x+Math.cos(a+1.4)*.54,e.z+Math.sin(a+1.4)*.54,1.48*grow,.05,'spirit',fade);
    }
  });
  entries(world.magicSweeps,(e,age)=>{
    if(!String(e.id).startsWith('spirit-fan:'))return;
    const t=clamp(age/(e.duration||.35)),a=e.facing||0,half=110*Math.PI/360,fade=Math.sin(Math.PI*t)**.5;
    for(let band=0;band<3;band++){
      const r=.45+ease(t)*(4.05-band*.35);
      const outer=arc(e.x,e.z,.25+band*.15,r,a-half,a+half,24);
      const inner=arc(e.x,e.z,.25+band*.15,Math.max(.1,r-.14-band*.08),a+half,a-half,24);
      path([...outer,...inner],.02,band?'shade':'spirit',fade*(band?.25:.6),'ribbon');
      path(outer,.03,band?'spirit':'core',fade*(band?.45:.85));
    }
    for(let i=0;i<9;i++){
      const angle=a-half+2*half*i/8,r=.4+ease(t)*(2.5+(i%3)*.5);
      const x=e.x+Math.cos(angle)*r,z=e.z+Math.sin(angle)*r,y=.35+Math.sin(t*Math.PI)*.45;
      // Etched leaf silhouettes follow the gust; no billboard of a second fan.
      path([point(x-.08,z,y),point(x,z,y+.15),point(x+.08,z,y),point(x,z,y-.1)],.02,i%2?'bronze':'spirit',fade,true);
    }
  });
  entries(world.magicWaves,(e,age)=>{
    if(e.packId!=='mourning-bell')return;
    if(age<BELL.delay){
      const t=age/BELL.delay;
      ring(e.x,e.z,1.05*(1-t)+.16,t,'spirit',t);
      orb(e.x,e.z,.65,.10+t*.15,'core',t*.75);
    }else{
      const t=(age-BELL.delay)/(BELL.travel+BELL.linger),fade=clamp(1-t)**.6;
      const r=waveRadius(age);
      path(arc(e.x,e.z,.09,r),.18,'shade',fade*.35);
      ring(e.x,e.z,r,fade,'spirit',0);
      for(let i=1;i<=2;i++){
        const echo=Math.max(0,r-i*.35);
        path(arc(e.x,e.z,.1+i*.09,echo),.024,i===1?'core':'bronze',fade*(.65-i*.15));
      }
      for(let i=0;i<12;i++){
        const a=i*TAU/12;
        orb(e.x+Math.cos(a)*r,e.z+Math.sin(a)*r,.12+Math.sin(t*Math.PI)*.5,.04,'core',fade*.8);
      }
    }
  });
  entries(world.magicSummons,(e,age)=>{
    if(e.type!=='skeleton')return;
    if(age<.65)burst(e.x,e.z,age,.65);
    if(age>23.5)burst(e.x,e.z,age-23.5,.5);
    if(e.anim==='attack' && e.swingT>.12 && e.swingT<.4){
      const t=clamp((e.swingT+frame.lead-.12)/.28),side=e.facing||1;
      const swipe=[];
      for(let i=0;i<9;i++){const a=-.8+i/8*1.5;swipe.push(point(e.x+side*(.45+Math.cos(a)*.45),e.z+Math.sin(a)*.45,.85));}
      path(swipe,.05,'spirit',Math.sin(t*Math.PI));
    }
  });
  for(const p of world.players||[]){
    const cast=p.magicCast,age=frame.time-(cast?.at??-100);
    if(!cast || !GRAVECRAFT[cast.itemId] || age<0 || age>.55)continue;
    if(cast.itemId==='barrow-rattle')burst(cast.x,cast.z,age,.55);
    else if(cast.itemId!=='mourning-bell' && cast.itemId!=='spirit-fan'){
      const fade=1-age/.55,x=cast.x+(cast.dx||0)*.5,z=cast.z+(cast.dz||0)*.5;
      orb(x,z,1.2,.12+Math.sin(age/.55*Math.PI)*.17,'spirit',fade*.5);
      for(let i=0;i<5;i++){const a=i*TAU/5+age*4;orb(x+Math.cos(a)*(.2+age),z+Math.sin(a)*(.2+age),1.2,.035,'core',fade);}
    }
  }
  return commands;
}

export function drawMagicCanvas(ctx, commands, project){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const cmd of commands){
    ctx.globalAlpha=cmd.alpha;ctx.fillStyle=ctx.strokeStyle=cmd.color;
    if(cmd.kind==='orb'){
      const [x,y,z]=cmd.center,p=project(x,z,y),edge=project(x+cmd.radius,z,y),r=Math.abs(edge.x-p.x);
      ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*(cmd.ground?.72:1),0,0,TAU);ctx.fill();
    }else{
      ctx.beginPath();
      cmd.points.forEach(([x,y,z],i)=>{const p=project(x,z,y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
      if(cmd.fill){ctx.closePath();ctx.fill();}
      else{const [x,y,z]=cmd.points[0],a=project(x,z,y),b=project(x+cmd.width,z,y);ctx.lineWidth=Math.max(.6,Math.abs(b.x-a.x));ctx.stroke();}
    }
  }
  ctx.restore();
}
