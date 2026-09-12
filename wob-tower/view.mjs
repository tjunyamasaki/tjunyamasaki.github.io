import {COLORS,SHAPES,RULES,shapeRects,clamp} from './game.mjs';
export class TowerView {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.positions=new Map();this.scale=1;this.originX=0;this.bottom=0;this.cameraBottom=560;this.particles=[];this.dpr=1;this.resize();}
  resize(){this.w=innerWidth;this.h=innerHeight;this.dpr=Math.min(devicePixelRatio||1,1.75);this.canvas.width=this.w*this.dpr;this.canvas.height=this.h*this.dpr;}
  worldX(screenX){return (screenX-this.originX)/this.scale;}
  burst(x,y,color){if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;for(let i=0;i<18;i++)this.particles.push({x,y,vx:(Math.random()-.5)*140,vy:-40-Math.random()*120,life:1,color});}
  rounded(x,y,w,h,r){this.ctx.beginPath();this.ctx.roundRect(x,y,w,h,r);}
  block(shape,x,y,angle,color,{ghost=false,alpha=1,face=true}={}){
    const g=this.ctx;g.save();g.translate(x,y);g.rotate(angle);g.globalAlpha=alpha;
    const rects=shapeRects(shape);
    if(ghost){g.setLineDash([5,5]);g.strokeStyle='#29435664';g.lineWidth=1.5/this.scale;for(const r of rects){this.rounded(r.x-r.w/2,r.y-r.h/2,r.w,r.h,4);g.stroke();}g.restore();return;}
    // Cache-free flat fills keep the small number of tactile shapes cheap.
    for(const r of rects){g.fillStyle='#27384928';this.rounded(r.x-r.w/2+2,r.y-r.h/2+5,r.w,r.h,4);g.fill();}
    for(const r of rects){g.fillStyle=color;this.rounded(r.x-r.w/2,r.y-r.h/2,r.w,r.h,3);g.fill();g.strokeStyle='#26395224';g.lineWidth=1;g.stroke();g.strokeStyle='#fff9e750';g.beginPath();g.moveTo(r.x-r.w/2+6,r.y-r.h/2+3);g.lineTo(r.x+r.w/2-6,r.y-r.h/2+3);g.stroke();}
    if(face){const r=rects[0],fx=r.x,fy=r.y;g.fillStyle='#263952b0';g.beginPath();g.ellipse(fx-5,fy-1,1.7,2.2,0,0,Math.PI*2);g.ellipse(fx+5,fy-1,1.7,2.2,0,0,Math.PI*2);g.fill();g.strokeStyle='#26395285';g.lineWidth=1.2;g.beginPath();g.arc(fx,fy+2,3,0,Math.PI);g.stroke();}
    g.restore();
  }
  draw(state,{dt=1/60,home=false,localAim=null,landingY=null}={}){
    const g=this.ctx,w=this.w,h=this.h,wide=w>=760,landscape=h<500&&w>h;
    g.setTransform(this.dpr,0,0,this.dpr,0,0);
    const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#f4e4c4');sky.addColorStop(.58,'#f5db9e');sky.addColorStop(1,'#eec879');g.fillStyle=sky;g.fillRect(0,0,w,h);
    // Soft sun and fine ruled paper give the play field depth without textures.
    g.fillStyle='#fff5d966';g.beginPath();g.arc(w*(home&&wide?.78:.78),h*.29,Math.min(w*.20,150),0,Math.PI*2);g.fill();
    g.strokeStyle='#ad946815';g.lineWidth=1;for(let y=20;y<h;y+=42){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
    const top=Math.min(RULES.baseY,...state.blocks.map(b=>b.y-80));const available=Math.max(160,h-(wide?140:210)-(landscape?50:230));
    const fit=clamp(available/(RULES.baseY-top+230),.48,1.1),targetScale=Math.min(wide?1.12:w/450,fit);
    const blend=1-Math.exp(-dt*5);this.scale+=(targetScale-this.scale)*blend;
    const targetBottom=Math.min(RULES.baseY,top-170+available/this.scale);
    this.cameraBottom+=(targetBottom-this.cameraBottom)*blend;this.bottom=h-(home?(wide?80:140):landscape?45:wide?235:220);
    this.originX=home?(wide?w*.72:w*.78):landscape?w*.34:w/2;
    if(home){this.scale=wide?1.45:.9;this.cameraBottom=560;}
    g.save();g.translate(this.originX,this.bottom);g.scale(this.scale,this.scale);g.translate(0,-this.cameraBottom);
    // Height ruler remains legible as the camera follows a growing tower.
    if(!home){g.font=`600 ${10/this.scale}px system-ui`;g.fillStyle='#9a926b';g.textAlign='right';g.strokeStyle='#b8a57850';g.lineWidth=1/this.scale;for(let y=RULES.baseY;y>top-200;y-=100){g.beginPath();g.moveTo(-190,y);g.lineTo(-180,y);g.stroke();g.fillText(`${Math.round((560-y)/20)} m`,-196,y+3/this.scale);}}
    // Small floating stone plinth, part of the actual collision geometry.
    g.fillStyle='#27384915';g.beginPath();g.ellipse(0,RULES.baseY+54,104,13,0,0,Math.PI*2);g.fill();
    g.fillStyle='#c6bda0';this.rounded(-87,RULES.baseY+7,174,31,8);g.fill();g.fillStyle='#f6f0d6';this.rounded(-94,RULES.baseY,188,14,5);g.fill();g.strokeStyle='#928e7955';g.lineWidth=1;g.stroke();
    g.strokeStyle='#a39c853d';for(let i=-60;i<=60;i+=30){g.beginPath();g.moveTo(i,RULES.baseY+24);g.lineTo(i+14,RULES.baseY+24);g.stroke();}
    const active=new Set();
    for(const b of state.blocks){active.add(b.id);let p=this.positions.get(b.id);if(!p){p={x:b.x,y:b.y,angle:b.angle};this.positions.set(b.id,p);}const f=1-Math.exp(-dt*22);p.x+=(b.x-p.x)*f;p.y+=(b.y-p.y)*f;let da=b.angle-p.angle;da=Math.atan2(Math.sin(da),Math.cos(da));p.angle+=da*f;this.block(b.shape,p.x,p.y,p.angle,COLORS[b.color]);}
    for(const id of this.positions.keys())if(!active.has(id))this.positions.delete(id);
    if(state.phase==='aim'&&!home){const p={...state.preview,...localAim};if(landingY!==null){this.block(p.shape,p.x,landingY,p.angle,'',{ghost:true});g.setLineDash([3,8]);g.strokeStyle='#26395235';g.lineWidth=1/this.scale;g.beginPath();g.moveTo(p.x,p.y+35);g.lineTo(p.x,landingY);g.stroke();g.setLineDash([]);}
      const color=COLORS[state.players.find(p=>p.id===state.currentId)?.color||0];this.block(p.shape,p.x,p.y,p.angle,color);
      g.fillStyle='#526973';g.font=`700 ${9/this.scale}px system-ui`;g.textAlign='center';g.fillText('READY WHEN YOU ARE',p.x,p.y-65);
    }
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=190*dt;g.globalAlpha=Math.max(0,p.life);g.fillStyle=p.color;g.fillRect(p.x,p.y,5,3);}g.globalAlpha=1;this.particles=this.particles.filter(p=>p.life>0).slice(-100);
    g.restore();
  }
}
export class Sound {
  constructor(){this.enabled=false;this.ctx=null;}
  enable(){this.enabled=!this.enabled;if(this.enabled){this.ctx??=new (window.AudioContext||window.webkitAudioContext)();void this.ctx.resume();this.play('placed',0);}return this.enabled;}
  play(type,level=0){if(!this.enabled||!this.ctx)return;const c=this.ctx,at=c.currentTime;
    const notes=type==='collapse'?[220,146,98]:type==='placed'?[392+level%8*32,587+level%8*32]:type==='rotate'?[330]:type==='land'?[160]:[260];
    notes.forEach((freq,i)=>{const osc=c.createOscillator(),gain=c.createGain(),t=at+i*.075;osc.type=type==='land'?'sine':'triangle';osc.frequency.setValueAtTime(freq,t);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(type==='land'?.055:.035,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+.25);osc.connect(gain);gain.connect(c.destination);osc.start(t);osc.stop(t+.27);});
  }
}
