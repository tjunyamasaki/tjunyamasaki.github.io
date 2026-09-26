// Compatibility adapter for browsers without WebGL. It projects the same 3D
// coordinates and sprite manifest onto Canvas2D; simulation/networking are shared.
import {STRUCTURES, RULES} from './content.mjs?v=harvest-16';
import {biome, distance, createDropMotion} from './engine.mjs?v=harvest-16';
import {equippedLanternLit, itemSpriteKey, spriteVariant} from './inventory.mjs?v=harvest-16';
import {magicClipName, magicVisuals} from './magic/registry.mjs?v=harvest-16';
import {MagicClock, heldWeaponPose, skeletonFrame} from './magic/art.mjs?v=harvest-16';
import {buildMagicEffects, drawMagicCanvas, usesMagicEffects} from './magic/effects.mjs?v=harvest-16';
import {orthographicHalf, viewSize, watchViewport} from './camera.mjs?v=harvest-16';
import {RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-16';
import {
  brightnessAt, canInspect, entityBrightness, frameLighting, labelOpacity, shadeHex, warningVisible,
} from './lighting.mjs?v=harvest-16';
export class CanvasRenderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.magicClock=new MagicClock();this.magicActors=new Map();this.ctx=canvas.getContext('2d');if(!this.ctx)throw new Error('Canvas rendering is unavailable.');
    this.images=new Map();this.zoom=1;this.clock=0;this.lastEvent=0;this.seed=null;this.effects=[];this.floaters=[];this.focus={x:0,z:0,set:(x,y,z)=>{this.focus.x=x;this.focus.z=z;}};this.dropMotion=createDropMotion();this.view=null;this.localId=null;
    this.onResize=()=>this.resize();watchViewport(this.onResize);this.resize();
  }
  async preload(){await Promise.all(Object.entries(this.theme.sprites).map(([key,def])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{this.images.set(key,image);resolve();};image.onerror=()=>reject(new Error(`Missing sprite: ${key}`));image.src=def.src;})));}
  resize(){const size=viewSize(this.canvas);this.width=size.width;this.height=size.height;const dpr=Math.min(devicePixelRatio||1,1.6);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);const half=orthographicHalf(this.width,this.height);this.scale=this.height/(2*half/this.zoom);}
  setZoom(value){this.zoom=Math.max(.65,Math.min(1.6,value));this.resize();}
  screenPoint(x,z,y=0){return{x:(x-this.focus.x)*this.scale+this.width/2,y:(z-this.focus.z)*this.scale*.72-y*this.scale*.694+this.height/2};}
  worldPoint(x,y){return{x:(x-this.width/2)/this.scale+this.focus.x,z:(y-this.height/2)/(this.scale*.72)+this.focus.z};}
  pick(x,y,world){
    const viewer=this.localId&&world.player?world.player(this.localId):null;
    let best=null,dist=44;
    for(const e of [...world.nodes.filter(n=>!n.ready),...world.buildings,...world.drops,...world.enemies,...magicVisuals(world).map(entry=>entry.entity)]){
      if(this.view&&!canInspect(this.view, e.x, e.z, viewer, RULES.reach))continue;
      const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}
    }
    return best;
  }
  ellipse(x,z,r,color,fill=true){const c=this.ctx,p=this.screenPoint(x,z);c.beginPath();c.ellipse(p.x,p.y,r*this.scale,r*this.scale*.72,0,0,Math.PI*2);if(fill){c.fillStyle=color;c.fill();}else{c.strokeStyle=color;c.lineWidth=1.5;c.stroke();}}
  float(text,x,z,color='#f8dfb3'){if(!text)return;const el=document.createElement('div');el.className='world-label';el.textContent=text;el.style.color=color;document.getElementById('world-labels').append(el);this.floaters.push({el,x,z,life:0});}
  reveal(x,z){if(!this.view)return 1;return labelOpacity(brightnessAt(this.view.sources, x, z, this.view.darkness, this.view.lighting), this.view.darkness, this.view.lighting);}
  glow(x,z,r,opacity){const c=this.ctx,p=this.screenPoint(x,z),feather=this.view?.lighting.ambientFraction||1.2;c.save();c.translate(p.x,p.y);c.scale(1,.72);const radius=r*feather*this.scale;const g=c.createRadialGradient(0,0,radius*0.55,0,0,radius);g.addColorStop(0,`rgba(250,190,113,${opacity})`);g.addColorStop(.55,`rgba(250,190,113,${opacity*.35})`);g.addColorStop(1,'rgba(250,190,113,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();c.restore();}
  drawSprite(key,e,kind,world,frame,p){
    const c=this.ctx,def=this.theme.sprites[key]||this.theme.sprites.ember,img=this.images.get(key)||this.images.get('ember'),ground=this.screenPoint(e.x,e.z,0),s=this.screenPoint(e.x,e.z,e.lift||0);
    const special=magicClipName(e, kind),moving=special?special==='walk':e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=special||(e.down||e.ghost?'down':kind==='enemy'?(e.windup>0?'attack':'walk'):e.action||'idle'),clip=def.clips[clipName]||def.clips.walk||def.clips.attack||def.clips.idle;
    const cols=def.columns||1,rows=def.rows||1,frameIndex=key==='gravecraft-skeleton'?skeletonFrame(e,this.magicFrame.lead,def):Number.isInteger(e.frame)?e.frame%Math.max(1,cols*rows):clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length],sw=img.naturalWidth/cols,sh=img.naturalHeight/rows;
    let w=(kind==='drop'?.85:def.size[0])*this.scale,h=(kind==='drop'?1.28:def.size[1])*this.scale;if(kind==='drop'&&e.flightT){const shrink=1-e.flightT*0.35;w*=shrink;h*=shrink;}if(e.down||e.ghost){w*=.8;h*=.65;}if(kind==='enemy'&&e.elite){w*=1.3;h*=1.3;}if(e.pose){w*=e.pose.scale;h*=e.pose.scale;}if(key==='gravecraft-skeleton')h*=Math.min(1,((e.age||0)+this.magicFrame.lead)/.24);
    const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob*this.scale:kind==='enemy'&&key==='wraith'?(Math.sin(this.clock*3)*.1+.2)*this.scale:0;
    const emissive=(kind==='building'&&STRUCTURES[key]?.light&&(key==='lantern'||e.fuel>0))||(kind==='player'&&equippedLanternLit(e));
    let display=kind==='preview'?Math.max(0.72, entityBrightness(frame, e.x, e.z)):entityBrightness(frame, e.x, e.z, {local:kind==='player'&&e.id===p.id, emissive});
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel<=0)display*=0.45;
    if(kind==='held')display=display*.75+.25;
    const fade=labelOpacity(display, frame.darkness, frame.lighting);
    c.save();c.globalAlpha=e.ghost?.4:key==='gravecraft-skeleton'?Math.min(1,Math.max(0,(24-(e.age||0)-this.magicFrame.lead)/.4)):kind==='node'&&e.type==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
    if(kind!=='held'){c.fillStyle='#211b2b30';c.beginPath();c.ellipse(ground.x,ground.y,w*.26,w*.10,0,0,Math.PI*2);c.fill();}
    c.translate(s.x,s.y-bob);
    if(e.pose){c.rotate(-e.pose.rotation);c.scale(e.pose.side,1);}
    else{
      if((kind==='player'&&e.dx<-.1)||(kind==='magic'&&e.facing===-1))c.scale(-1,1);
      let tilt=Number.isFinite(e.aim)?-e.aim:moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;
      if(!Number.isFinite(e.aim)&&['attack','gather'].includes(e.action)&&e.actionUntil>world.time)tilt=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);
      c.rotate(-tilt);
    }
    if(kind==='building'&&key==='gate'&&e.open)w*=.35;
    if(kind!=='preview')c.filter=`brightness(${Math.min(1, Math.max(0, display))})`;
    c.drawImage(img,(frameIndex%cols)*sw,Math.floor(frameIndex/cols)*sh,sw,sh,-w*def.anchor[0],-h*(1-def.anchor[1]),w,h);c.filter='none';c.restore();
    if((kind==='enemy'||kind==='building')&&e.hp<e.maxHp&&fade>0.04){const y=s.y-h*(key==='hearth'?.62:kind==='enemy'?key==='crawler'?.38:.82:.37);c.save();c.globalAlpha=fade;c.fillStyle='#2a2533';c.fillRect(s.x-21,y,42,4);c.fillStyle=kind==='enemy'?'#df9383':'#d2c395';c.fillRect(s.x-20,y+1,40*Math.max(0,e.hp/e.maxHp),2);c.restore();}
    if(kind==='player'&&e.id!==p.id&&fade>0.05){c.save();c.globalAlpha=fade;c.font='10px Arial';c.textAlign='center';c.fillStyle='#f4e4c8';c.fillText(e.name,s.x,s.y-h-4);c.restore();}
    if(kind==='player'&&!e.down&&!e.ghost){
      const pose=heldWeaponPose(e,this.magicFrame.time,this.theme);
      if(pose&&this.images.has(pose.key))this.drawSprite(pose.key,{id:e.id,x:e.x+pose.x,z:e.z+pose.z,lift:pose.y,pose},'held',world,frame,p);
    }
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel>0){for(let i=0;i<5;i++){const t=(this.clock*.45+i*.23)%1;c.globalAlpha=(1-t)*.55;c.fillStyle='#ffce85';c.beginPath();c.arc(s.x+Math.sin(i*3+this.clock)*10,s.y-h*.4-t*35,1.5,0,Math.PI*2);c.fill();}c.globalAlpha=1;}
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;this.magicFrame=this.magicClock.sample(world,this.clock);this.localId=localId;if(this.seed!==world.seed){this.seed=world.seed;this.lastEvent=0;this.magicActors.clear();}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};this.focus.x+=((demo?0:p.x)-this.focus.x)*Math.min(1,dt*6);this.focus.z+=((demo?-1:p.z)-this.focus.z)*Math.min(1,dt*6);
    const frame=frameLighting(world, this.theme);this.view=frame;
    const c=this.ctx;c.clearRect(0,0,this.width,this.height);c.fillStyle=shadeHex(this.theme.palette.background, 1-frame.darkness*0.72, frame.darkness, frame.lighting);c.fillRect(0,0,this.width,this.height);
    const halfX=this.width/this.scale/2+3,halfZ=this.height/(this.scale*.72)/2+6;
    const paintTile=(x,z,size,detail)=>{
      const cx=x+size/2,cz=z+size/2;
      const path=Math.abs(cx+Math.sin(cz*.16)*3)<1.8||Math.abs(cz-Math.sin(cx*.17)*4)<1.6;
      const display=brightnessAt(frame.sources, cx, cz, frame.darkness, frame.lighting);
      c.fillStyle=shadeHex(this.theme.palette[path?'path':biome(x,z)], display, frame.darkness, frame.lighting);
      const a=this.screenPoint(x,z),b=this.screenPoint(x+size,z+size);c.fillRect(a.x-.5,a.y-.5,b.x-a.x+1,b.y-a.y+1);
      if(!detail)return;
      const hash=Math.abs(Math.sin(x*13.7+z*4.3+world.seed)*43758)%1;
      c.fillStyle=`rgba(35,31,42,${hash*.07*display})`;c.fillRect(a.x,a.y,b.x-a.x+1,b.y-a.y+1);
      if(display>0.2){for(let i=0;i<2;i++){const s=this.screenPoint(x+hash*1.9,z+(hash+i*.5)%1*size);c.strokeStyle=hash>.5?`rgba(182,153,108,${display*.4})`:`rgba(53,78,72,${display*.4})`;c.lineWidth=1;c.beginPath();c.moveTo(s.x-2,s.y+1);c.lineTo(s.x,s.y-2);c.lineTo(s.x+3,s.y);c.stroke();}}
    };
    for(let z=Math.max(-RULES.radius-6,Math.floor((this.focus.z-halfZ)/2)*2);z<Math.min(RULES.radius+6,this.focus.z+halfZ);z+=2)for(let x=Math.max(-RULES.radius-6,Math.floor((this.focus.x-halfX)/2)*2);x<Math.min(RULES.radius+6,this.focus.x+halfX);x+=2)paintTile(x,z,2,true);
    if(frame.darkness>0.05){
      for(const source of frame.sources){
        const reach=source.radius*frame.lighting.ambientFraction+0.75;
        const x0=Math.max(-RULES.radius-6,Math.floor((source.x-reach)*2)/2),x1=Math.min(RULES.radius+6,source.x+reach);
        const z0=Math.max(-RULES.radius-6,Math.floor((source.z-reach)*2)/2),z1=Math.min(RULES.radius+6,source.z+reach);
        for(let z=z0;z<z1;z+=0.5)for(let x=x0;x<x1;x+=0.5){
          if(Math.hypot(x+0.25-source.x,z+0.25-source.z)>reach)continue;
          paintTile(x,z,0.5,false);
        }
      }
    }
    for(const b of world.buildings)if(STRUCTURES[b.type].light&&(b.type==='lantern'||b.fuel>0))this.glow(b.x,b.z,STRUCTURES[b.type].light+(b.type==='hearth'?(b.level-1)*1.5:0),.08+frame.darkness*.1);
    for(const source of frame.sources)if(source.kind==='player')this.glow(source.x,source.z,source.radius,.06+frame.darkness*.08);
    if(target&&!placement){const fade=this.reveal(target.x, target.z);if(fade>0.05){c.save();c.globalAlpha=fade;c.setLineDash([5,4]);c.lineDashOffset=-this.clock*6;this.ellipse(target.x,target.z,1,'#edc48c',false);c.setLineDash([]);c.restore();}}
    if(p.goal){const fade=Math.max(this.reveal(p.goal.x, p.goal.z), distance(p, p.goal)<8?.28:0);if(fade>0.04){c.save();c.globalAlpha=fade;this.ellipse(p.goal.x,p.goal.z,.2,'#eadaba',false);c.restore();}}
    for(const e of world.enemies)if(e.windup>0){const radius=e.type==='king'?4:1.9;if(!warningVisible(frame, e.tx, e.tz, radius, p))continue;const alpha=frame.darkness>0.5?.16:.28;this.ellipse(e.tx,e.tz,radius,`rgba(240,118,100,${alpha+Math.sin(this.clock*12)*.04})`);this.ellipse(e.tx,e.tz,radius,`rgba(241,149,123,${frame.darkness>0.5?.45:.8})`,false);}
    const entities=[...world.nodes.filter(n=>!n.ready).map(e=>({e,key:spriteVariant(this.theme,e.type,e),kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:itemSpriteKey(e.stack?.itemId),kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...(world.projectiles||[]).map(e=>({e:{...e,lift:.9},key:e.kind==='arrow'?'arrow':'mbolt',kind:'projectile'})),...magicVisuals(world).filter(entry=>!usesMagicEffects(entry.entity)).map(entry=>({e:entry.entity,key:entry.key,kind:'magic'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'}))];
    const drawn=entities.map(entry=>{
      if(entry.key==='gravecraft-skeleton'){
        const last=this.magicActors.get(entry.e.id)||{x:entry.e.x,z:entry.e.z};
        const t=Math.min(1,dt*13);last.x+=(entry.e.x-last.x)*t;last.z+=(entry.e.z-last.z)*t;
        this.magicActors.set(entry.e.id,last);return {...entry,e:{...entry.e,x:last.x,z:last.z}};
      }
      if(entry.kind!=='drop')return entry;
      const present=this.dropMotion.sample(entry.e,world,this.clock,dt);
      return {...entry, e:{...entry.e, x:present.x, z:present.z, lift:present.y, flightT:present.t||0}, depth:present.z};
    });
    drawn.sort((a,b)=>(a.depth??a.e.z)-(b.depth??b.e.z));for(const {e,key,kind}of drawn){if(kind==='drop'&&!this.theme.sprites[key])continue;if(Math.abs(e.x-this.focus.x)<halfX+4&&Math.abs(e.z-this.focus.z)<halfZ+4)this.drawSprite(key,e,kind,world,frame,p);}
    this.dropMotion.retain(new Set(world.drops.map(drop=>drop.id)));
    const summonIds=new Set((world.magicSummons||[]).map(e=>e.id));for(const id of this.magicActors.keys())if(!summonIds.has(id))this.magicActors.delete(id);
    if(placement){c.save();c.globalAlpha=.7;this.drawSprite(placement.key,{x:placement.x,z:placement.z},'preview',world,frame,p);c.restore();this.ellipse(placement.x,placement.z,.9,placement.valid?'#bbdca5':'#d67d79',false);}
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2){if(['loot','damage','heal','build','craft'].includes(ev.type))this.float(ev.text,ev.x,ev.z,ev.type==='damage'?'#f5c2a9':ev.type==='heal'?'#b9e2ba':'#fbe1ad');if(ev.type==='rare')this.float(`✦ ${ev.text}`,ev.x,ev.z,RARITY_COLORS[rarityOf(ev.itemId)]);if(ev.type==='levelup')this.float(`LEVEL UP · ${ev.text}`,ev.x,ev.z,'#f2c14e');if(ev.type==='discover')this.float(ev.text,ev.x,ev.z,'#d4fff5');if(!ev.magicPack&&['hit','kill','hurt','impact','bolt','nova','burst'].includes(ev.type))this.effects.push({...ev,life:0});}this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;const fade=this.reveal(e.x, e.z);c.save();c.globalAlpha=fade;this.ellipse(e.x,e.z,e.radius?.3+Math.min(1,e.life*3)*e.radius:.2+e.life*(e.type==='impact'?8:3),e.type==='burst'?`rgba(127,214,196,${Math.max(0,1-e.life*2)})`:`rgba(246,194,131,${Math.max(0,1-e.life*2)})`,false);c.restore();return e.life<.5;});
    drawMagicCanvas(c,buildMagicEffects(world,this.magicFrame,this.theme),(x,z,y)=>this.screenPoint(x,z,y));
    this.floaters=this.floaters.filter(f=>{f.life+=dt;const s=this.screenPoint(f.x,f.z,1+f.life*.7);f.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;f.el.style.opacity=String(Math.min(1,(1.8-f.life)*2)*this.reveal(f.x, f.z));if(f.life>1.8){f.el.remove();return false;}return true;});
  }
}
