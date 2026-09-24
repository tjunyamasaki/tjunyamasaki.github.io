// Compatibility adapter for browsers without WebGL. It projects the same 3D
// coordinates and sprite manifest onto Canvas2D; simulation/networking are shared.
import {ITEMS,NODES,STRUCTURES,RULES} from './content.mjs';
import {biome,distance} from './engine.mjs';
export class CanvasRenderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.ctx=canvas.getContext('2d');if(!this.ctx)throw new Error('Canvas rendering is unavailable.');
    this.images=new Map();this.zoom=1;this.clock=0;this.lastEvent=0;this.seed=null;this.effects=[];this.floaters=[];this.focus={x:0,z:0,set:(x,y,z)=>{this.focus.x=x;this.focus.z=z;}};
    this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize);this.resize();
  }
  async preload(){await Promise.all(Object.entries(this.theme.sprites).map(([key,def])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{this.images.set(key,image);resolve();};image.onerror=()=>reject(new Error(`Missing sprite: ${key}`));image.src=def.src;})));}
  resize(){this.width=innerWidth;this.height=innerHeight;const dpr=Math.min(devicePixelRatio,1.6);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.scale=this.height/(2*(this.width/this.height<.85?12:13)/this.zoom);}
  setZoom(value){this.zoom=Math.max(.65,Math.min(1.6,value));this.resize();}
  screenPoint(x,z,y=0){return{x:(x-this.focus.x)*this.scale+this.width/2,y:(z-this.focus.z)*this.scale*.72-y*this.scale*.694+this.height/2};}
  worldPoint(x,y){return{x:(x-this.width/2)/this.scale+this.focus.x,z:(y-this.height/2)/(this.scale*.72)+this.focus.z};}
  pick(x,y,world){let best=null,dist=44;for(const e of [...world.nodes.filter(n=>!n.ready),...world.buildings,...world.drops,...world.enemies]){const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}}return best;}
  ellipse(x,z,r,color,fill=true){const c=this.ctx,p=this.screenPoint(x,z);c.beginPath();c.ellipse(p.x,p.y,r*this.scale,r*this.scale*.72,0,0,Math.PI*2);if(fill){c.fillStyle=color;c.fill();}else{c.strokeStyle=color;c.lineWidth=1.5;c.stroke();}}
  float(text,x,z,color='#f8dfb3'){if(!text)return;const el=document.createElement('div');el.className='world-label';el.textContent=text;el.style.color=color;document.getElementById('world-labels').append(el);this.floaters.push({el,x,z,life:0});}
  glow(x,z,r,opacity){const c=this.ctx,p=this.screenPoint(x,z);c.save();c.translate(p.x,p.y);c.scale(1,.72);const g=c.createRadialGradient(0,0,0,0,0,r*this.scale);g.addColorStop(0,`rgba(250,190,113,${opacity})`);g.addColorStop(.5,`rgba(250,190,113,${opacity*.4})`);g.addColorStop(1,'rgba(250,190,113,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r*this.scale,0,Math.PI*2);c.fill();c.restore();}
  drawSprite(key,e,kind,world,night,p){
    const c=this.ctx,def=this.theme.sprites[key]||this.theme.sprites.ember,img=this.images.get(key)||this.images.get('ember'),s=this.screenPoint(e.x,e.z);
    const moving=e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=e.down||e.ghost?'down':kind==='enemy'?(e.windup>0?'attack':'walk'):e.action||'idle',clip=def.clips[clipName]||def.clips.idle;
    const frame=clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length],cols=def.columns||1,rows=def.rows||1,sw=img.naturalWidth/cols,sh=img.naturalHeight/rows;
    let w=(kind==='drop'?.85:def.size[0])*this.scale,h=(kind==='drop'?1.28:def.size[1])*this.scale;if(e.down||e.ghost){w*=.8;h*=.65;}
    const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob*this.scale:kind==='enemy'&&key==='wraith'?(Math.sin(this.clock*3)*.1+.2)*this.scale:0;
    c.save();c.globalAlpha=e.ghost?.4:key==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
    c.fillStyle='#211b2b30';c.beginPath();c.ellipse(s.x,s.y,w*.26,w*.10,0,0,Math.PI*2);c.fill();
    c.translate(s.x,s.y-bob);if(kind==='player'&&e.dx<-.1)c.scale(-1,1);let tilt=moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;
    if(['attack','gather'].includes(e.action)&&e.actionUntil>world.time)tilt=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);c.rotate(-tilt);
    if(kind==='building'&&key==='gate'&&e.open)w*=.35;
    if(night)c.filter=`brightness(${world.lit(e)?.95:1-night*.35})`;
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel<=0)c.filter='brightness(.4)';
    c.drawImage(img,(frame%cols)*sw,Math.floor(frame/cols)*sh,sw,sh,-w*def.anchor[0],-h*(1-def.anchor[1]),w,h);c.restore();
    if((kind==='enemy'||kind==='building')&&e.hp<e.maxHp){const y=s.y-h*(key==='hearth'?.62:kind==='enemy'?key==='crawler'?.38:.82:.37);c.fillStyle='#2a2533';c.fillRect(s.x-21,y,42,4);c.fillStyle=kind==='enemy'?'#df9383':'#d2c395';c.fillRect(s.x-20,y+1,40*Math.max(0,e.hp/e.maxHp),2);}
    if(kind==='player'&&e.id!==p.id){c.font='10px Arial';c.textAlign='center';c.fillStyle='#f4e4c8';c.fillText(e.name,s.x,s.y-h-4);}
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel>0){for(let i=0;i<5;i++){const t=(this.clock*.45+i*.23)%1;c.globalAlpha=(1-t)*.8;c.fillStyle='#ffce85';c.beginPath();c.arc(s.x+Math.sin(i*3+this.clock)*10,s.y-h*.4-t*35,1.5,0,Math.PI*2);c.fill();}c.globalAlpha=1;}
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;if(this.seed!==world.seed){this.seed=world.seed;this.lastEvent=0;}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};this.focus.x+=((demo?0:p.x)-this.focus.x)*Math.min(1,dt*6);this.focus.z+=((demo?-1:p.z)-this.focus.z)*Math.min(1,dt*6);
    const c=this.ctx,t=world.time%RULES.cycle,night=t>=180?Math.min(1,(t-180)/7):t>150?(t-150)/30*.7:0;c.clearRect(0,0,this.width,this.height);c.fillStyle=this.theme.palette.background;c.fillRect(0,0,this.width,this.height);
    const halfX=this.width/this.scale/2+3,halfZ=this.height/(this.scale*.72)/2+6;
    for(let z=Math.max(-44,Math.floor((this.focus.z-halfZ)/2)*2);z<Math.min(44,this.focus.z+halfZ);z+=2)for(let x=Math.max(-44,Math.floor((this.focus.x-halfX)/2)*2);x<Math.min(44,this.focus.x+halfX);x+=2){
      const path=Math.abs(x+Math.sin(z*.16)*3)<1.8||Math.abs(z-Math.sin(x*.17)*4)<1.6;c.fillStyle=this.theme.palette[path?'path':biome(x,z)];const a=this.screenPoint(x,z),b=this.screenPoint(x+2,z+2);c.fillRect(a.x-.5,a.y-.5,b.x-a.x+1,b.y-a.y+1);
      const hash=Math.abs(Math.sin(x*13.7+z*4.3+world.seed)*43758)%1;c.fillStyle=`rgba(35,31,42,${hash*.07})`;c.fillRect(a.x,a.y,b.x-a.x+1,b.y-a.y+1);
      for(let i=0;i<2;i++){const s=this.screenPoint(x+hash*1.9,z+(hash+i*.5)%1*2);c.strokeStyle=hash>.5?'#b6996c66':'#354e4866';c.lineWidth=1;c.beginPath();c.moveTo(s.x-2,s.y+1);c.lineTo(s.x,s.y-2);c.lineTo(s.x+3,s.y);c.stroke();}
    }
    c.fillStyle=`rgba(27,28,49,${night*.64})`;c.fillRect(0,0,this.width,this.height);
    for(const b of world.buildings)if(STRUCTURES[b.type].light&&(b.type==='lantern'||b.fuel>0))this.glow(b.x,b.z,STRUCTURES[b.type].light+(b.type==='hearth'?(b.level-1)*1.5:0),.18+night*.26);
    for(const q of world.players)if(q.online&&q.lantern&&q.equipment.torch>0)this.glow(q.x,q.z,4,.18+night*.2);
    if(target&&!placement){c.setLineDash([5,4]);c.lineDashOffset=-this.clock*6;this.ellipse(target.x,target.z,1,'#edc48c',false);c.setLineDash([]);}
    if(p.goal)this.ellipse(p.goal.x,p.goal.z,.2,'#eadaba',false);
    for(const e of world.enemies)if(e.windup>0){this.ellipse(e.tx,e.tz,e.type==='king'?4:1.9,`rgba(240,118,100,${.12+Math.sin(this.clock*12)*.06})`);this.ellipse(e.tx,e.tz,e.type==='king'?4:1.9,'#f1957b',false);}
    const entities=[...world.nodes.filter(n=>!n.ready).map(e=>({e,key:e.type,kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:ITEMS[e.type]?.icon||e.type,kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'}))];
    entities.sort((a,b)=>a.e.z-b.e.z);for(const {e,key,kind}of entities)if(Math.abs(e.x-this.focus.x)<halfX+4&&Math.abs(e.z-this.focus.z)<halfZ+4)this.drawSprite(key,e,kind,world,night,p);
    if(placement){c.globalAlpha=.65;this.drawSprite(placement.key,{x:placement.x,z:placement.z},'preview',world,0,p);c.globalAlpha=1;this.ellipse(placement.x,placement.z,.9,placement.valid?'#bbdca5':'#d67d79',false);}
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2){if(['loot','damage','heal','build','craft'].includes(ev.type))this.float(ev.text,ev.x,ev.z,ev.type==='damage'?'#f5c2a9':ev.type==='heal'?'#b9e2ba':'#fbe1ad');if(['hit','kill','hurt','impact','bolt'].includes(ev.type))this.effects.push({...ev,life:0});}this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;this.ellipse(e.x,e.z,.2+e.life*(e.type==='impact'?8:3),`rgba(246,194,131,${Math.max(0,1-e.life*2)})`,false);return e.life<.5;});
    this.floaters=this.floaters.filter(f=>{f.life+=dt;const s=this.screenPoint(f.x,f.z,1+f.life*.7);f.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;f.el.style.opacity=String(Math.min(1,(1.8-f.life)*2));if(f.life>1.8){f.el.remove();return false;}return true;});
  }
}
