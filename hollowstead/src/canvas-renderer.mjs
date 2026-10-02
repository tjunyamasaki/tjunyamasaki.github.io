// Compatibility adapter for browsers without WebGL. It projects the same 3D
// coordinates and sprite manifest onto Canvas2D; simulation/networking are shared.
import {damageFloater,spawnFloater,stepFloaters} from './floaters.mjs?v=harvest-18';
import {STRUCTURES, RULES, nodeAwake} from './content.mjs?v=harvest-18';
import {paintScenery} from './scenery.mjs?v=harvest-18';
import {paintRopes} from './cart-rope.mjs?v=harvest-18';
import {groundColors, groundHex} from './worldgen.mjs?v=harvest-18';
import {biome, distance, createDropMotion} from './engine.mjs?v=harvest-18';
import {equippedLanternLit, itemSpriteKey, spriteVariant} from './inventory.mjs?v=harvest-18';
import {magicClipName, magicVisuals} from './magic/registry.mjs?v=harvest-18';
import {MagicClock, heldWeaponPose, skeletonFrame} from './magic/art.mjs?v=harvest-18';
import {buildMagicEffects, drawMagicCanvas, usesMagicEffects} from './magic/effects.mjs?v=harvest-18';
import {WeaponFx, dropBlink} from './fx/index.mjs?v=harvest-18';
import {orthographicHalf, viewSize, watchViewport} from './camera.mjs?v=harvest-18';
import {ALLIES, DASH, RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-18';
import {hostileShots, telegraphOf} from './mobs.mjs?v=harvest-18';
import {nightGlow} from './regions.mjs?v=harvest-18';
import {beaconArt, beaconPhase, beaconStrength, dropSticker, lootBeacon, preloadDropArt} from './drop-art.mjs?v=harvest-18';
import {markerPulse, paintMarker, targetMarker} from './target-marker.mjs?v=harvest-18';
import {arenaProps, arenaTile, plazaProps} from './renderer.mjs?v=harvest-18';
import {STRIKE_COLORS} from './renderer.mjs?v=harvest-18';
import {glowStrength} from './lighting.mjs?v=harvest-18';
import {paintDungeonCanvas} from './dungeon/canvas.mjs?v=harvest-18';
import {dungeonProps} from './dungeon/art.mjs?v=harvest-18';
const PROJECTILE_KEYS={arrow:'arrow',bolt:'mbolt',wisp:'wisp',seed:'pumpseed'};
import {
  brightnessAt, canInspect, entityBrightness, frameLighting, labelOpacity, shadeHex, warningVisible,
} from './lighting.mjs?v=harvest-18';
import {loadImage, preloadThemeAssets} from './assets.mjs?v=harvest-18';
/** Swarm fights spray numbers; old labels give way so the DOM stays light on phones. */
export class CanvasRenderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.magicClock=new MagicClock();this.weaponFx=new WeaponFx();this.flashLevel=-1;this.magicActors=new Map();this.ctx=canvas.getContext('2d');if(!this.ctx)throw new Error('Canvas rendering is unavailable.');
    this.images=new Map();this.zoom=1;this.clock=0;this.lastEvent=0;this.seed=null;this.effects=[];this.floaters=[];this.focus={x:0,z:0,set:(x,y,z)=>{this.focus.x=x;this.focus.z=z;}};this.dropMotion=createDropMotion();this.view=null;this.localId=null;
    this.onResize=()=>this.resize();watchViewport(this.onResize);this.resize();
  }
  async preload(){await preloadThemeAssets(this.theme);preloadDropArt(this.theme);await Promise.all(Object.entries(this.theme.sprites).filter(([,def])=>!def.lazy).map(async([key,def])=>{try{this.images.set(key,await loadImage(def.src));}catch{throw new Error(`Missing sprite: ${key}`);}}));}
  /** A look worn for the first time (lazy sprite): load it once, draw the default until it arrives. */
  ensureImage(key){this.loadingImages??=new Set();const def=this.theme.sprites[key];if(!def||this.images.has(key)||this.loadingImages.has(key))return;this.loadingImages.add(key);loadImage(def.src).then(img=>this.images.set(key,img)).catch(()=>this.loadingImages.delete(key));}
  resize(){const size=viewSize(this.canvas);this.width=size.width;this.height=size.height;const dpr=Math.min(devicePixelRatio||1,1.6);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);const half=orthographicHalf(this.width,this.height);this.scale=this.height/(2*half/this.zoom);}
  setZoom(value){this.zoom=Math.max(.65,Math.min(1.6,value));this.resize();}
  screenPoint(x,z,y=0){return{x:(x-this.focus.x)*this.scale+this.width/2,y:(z-this.focus.z)*this.scale*.72-y*this.scale*.694+this.height/2};}
  worldPoint(x,y){return{x:(x-this.width/2)/this.scale+this.focus.x,z:(y-this.height/2)/(this.scale*.72)+this.focus.z};}
  pick(x,y,world){
    const viewer=this.localId&&world.player?world.player(this.localId):null;
    let best=null,dist=44;
    for(const e of [...world.nodes.filter(n=>!n.ready&&nodeAwake(n,world)),...world.buildings,...world.drops,...world.enemies,...magicVisuals(world).map(entry=>entry.entity)]){
      if(this.view&&!canInspect(this.view, e.x, e.z, viewer, RULES.reach))continue;
      const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}
    }
    return best;
  }
  ellipse(x,z,r,color,fill=true){const c=this.ctx,p=this.screenPoint(x,z);c.beginPath();c.ellipse(p.x,p.y,r*this.scale,r*this.scale*.72,0,0,Math.PI*2);if(fill){c.fillStyle=color;c.fill();}else{c.strokeStyle=color;c.lineWidth=1.5;c.stroke();}}
  float(text,x,z,color='#f8dfb3',opts={}){spawnFloater(this.floaters,text,x,z,color,opts);}
  reveal(x,z){if(!this.view)return 1;return labelOpacity(brightnessAt(this.view.sources, x, z, this.view.darkness, this.view.lighting), this.view.darkness, this.view.lighting);}
  glow(x,z,r,opacity){const c=this.ctx,p=this.screenPoint(x,z),feather=this.view?.lighting.ambientFraction||1.2;c.save();c.translate(p.x,p.y);c.scale(1,.72);const radius=r*feather*this.scale;const g=c.createRadialGradient(0,0,radius*0.55,0,0,radius);g.addColorStop(0,`rgba(250,190,113,${opacity})`);g.addColorStop(.55,`rgba(250,190,113,${opacity*.35})`);g.addColorStop(1,'rgba(250,190,113,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();c.restore();}
  /** A dropped item: its icon as a rimmed sticker (drop-art.mjs); valuable loot also gets a beacon. */
  drawDrop(key,e,world,frame){
    const st=dropSticker(this.theme,key,e.stack?.itemId);if(!st)return;
    const c=this.ctx,S=this.scale,ground=this.screenPoint(e.x,e.z,0),s=this.screenPoint(e.x,e.z,e.lift||0);
    const shrink=e.flightT?1-e.flightT*0.35:1,w=st.width*S*shrink,h=st.height*S*shrink;
    const blink=dropBlink(e,world.time,this.clock),beacon=e.flightT?null:lootBeacon(e.stack?.itemId);
    const display=entityBrightness(frame,e.x,e.z,{emissive:!!beacon});
    if(beacon)this.drawBeacon(beacon,ground,e,frame,blink,'back');
    c.save();c.globalAlpha=blink;
    c.fillStyle='#211b2b44';c.beginPath();c.ellipse(ground.x,ground.y,w*.34,w*.11,0,0,Math.PI*2);c.fill();
    c.filter=`brightness(${Math.min(1,Math.max(0,display))})`;
    c.drawImage(st.canvas,s.x-w*st.anchor[0],s.y-h*(1-st.anchor[1]),w,h);c.filter='none';c.restore();
    if(beacon)this.drawBeacon(beacon,ground,e,frame,blink,'front');
  }
  /** Epic and legendary loot: a pool and ripple on the ground and a column of light (behind), motes (in front). */
  drawBeacon(b,ground,e,frame,blink,layer){
    const art=beaconArt(b.color);if(!art?.beam)return;
    const c=this.ctx,S=this.scale,str=beaconStrength(frame.darkness,this.clock,e.x,blink),{ripple,motes}=beaconPhase(b,this.clock,e.x);
    c.save();c.globalCompositeOperation='lighter';
    if(layer==='back'){
      const pool=b.ring*1.3*S;c.globalAlpha=.8*str;c.drawImage(art.pool,ground.x-pool/2,ground.y-pool*.36,pool,pool*.72);
      const ring=(.5+ripple*(b.ring*2-.5))*S;c.globalAlpha=(1-ripple)*str;c.drawImage(art.ring,ground.x-ring/2,ground.y-ring*.36,ring,ring*.72);
      const H=b.height*S,W=b.width*S;c.globalAlpha=str;c.drawImage(art.beam,ground.x-W/2,ground.y-H,W,H);
    }else{
      for(const m of motes){const r=.3*S,y=ground.y-m.t*b.height*S*.9;c.globalAlpha=m.alpha*str;c.drawImage(art.mote,ground.x+m.x*S-r/2,y-r/2,r,r);}
    }
    c.restore();
  }
  drawSprite(key,e,kind,world,frame,p){
    if(kind==='drop')return this.drawDrop(key,e,world,frame);
    // A weapon's body rig (src/fx WEAPON_FX: the kitsune's tails...). One sorted behind the body is
    // drawn now; one sorted in front of it (origin nearer the camera) after the body.
    let rigAfter=null;
    if(kind==='player'&&this.frameFx&&!e.down){
      const bob=e.action==='walk'?Math.abs(Math.sin(this.clock*10+e.x))*this.theme.motion.walkBob:0;
      const rig=this.weaponFx.rig(world,e,{x:e.x,z:e.z,y:bob},this.clock,this.magicFrame.time);
      if(rig){const list=[...rig.groundGlow,...rig.groundNormal,...rig.normal,...rig.glow];if(rig.origin.z>e.z)rigAfter=list;else drawMagicCanvas(this.ctx,list,(x,z,y)=>this.screenPoint(x,z,y));}
    }
    const c=this.ctx,def=this.theme.sprites[key]||this.theme.sprites.ember,img=this.images.get(key)||(this.ensureImage(key),this.images.get(def.base)||this.images.get('ember')),ground=this.screenPoint(e.x,e.z,0),s=this.screenPoint(e.x,e.z,e.lift||0);
    const special=kind==='ally'?(e.anim||'idle'):magicClipName(e, kind),moving=special?special==='walk':e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=special||(e.down||e.ghost?'down':kind==='enemy'?(e.windup>0||e.act>0?'attack':'walk'):e.action||'idle'),clip=def.clips[clipName]||def.clips.walk||def.clips.attack||def.clips.idle;
    const cols=def.columns||1,rows=def.rows||1,frameIndex=key==='gravecraft-skeleton'?skeletonFrame(e,this.magicFrame.lead,def):Number.isInteger(e.frame)?e.frame%Math.max(1,cols*rows):clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length],sw=img.naturalWidth/cols,sh=img.naturalHeight/rows;
    let w=def.size[0]*this.scale,h=def.size[1]*this.scale;if(e.down||e.ghost){w*=.8;h*=.65;}if(kind==='enemy'&&e.elite){w*=1.3;h*=1.3;}if(kind==='enemy'&&e.warden){w*=1.12;h*=1.12;}if(kind==='prop'&&e.scale){w*=e.scale;h*=e.scale;}if(e.pose){w*=e.pose.scale;h*=e.pose.scale;}if(kind==='zone'&&e.kind==='frost'){w*=e.radius/1.3;h*=e.radius/1.3;}if(key==='gravecraft-skeleton')h*=Math.min(1,((e.age||0)+this.magicFrame.lead)/.24);
    const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob*this.scale:kind==='enemy'&&key==='wraith'?(Math.sin(this.clock*3)*.1+.2)*this.scale:0;
    const emissive=(kind==='prop'&&e.glow)||(kind==='building'&&STRUCTURES[key]?.light&&(key==='lantern'||e.fuel>0))||(kind==='player'&&equippedLanternLit(e))||(kind==='node'&&!!nightGlow(e));
    let display=kind==='preview'?Math.max(0.72, entityBrightness(frame, e.x, e.z)):entityBrightness(frame, e.x, e.z, {local:kind==='player'&&e.id===p.id, emissive});
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel<=0)display*=0.45;
    if(kind==='held')display=display*.75+.25;
    const fade=labelOpacity(display, frame.darkness, frame.lighting);
    c.save();c.globalAlpha=kind==='zone'&&e.kind==='frost'?.8*Math.min(1,e.age*3)*Math.min(1,(e.life-e.age)*2):kind==='ally'?Math.min(1,(e.spawn||1)*4,(e.life-e.age)*2):e.ghost?.4:key==='gravecraft-skeleton'?Math.min(1,Math.max(0,(24-(e.age||0)-this.magicFrame.lead)/.4)):kind==='node'&&e.type==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
    // Night-only resources glow so they can be found in the dark.
    const halo=kind==='node'&&nightGlow(e);if(halo){const r=1.3*this.scale,g=c.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,halo+'aa');g.addColorStop(.5,halo+'40');g.addColorStop(1,halo+'00');c.save();c.translate(ground.x,ground.y);c.scale(1,.72);c.globalCompositeOperation='lighter';c.globalAlpha*=(.3+.55*frame.darkness)*(.8+.2*Math.sin(this.clock*2.4+e.x));c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();}
    if(kind!=='held'&&kind!=='zone'){c.fillStyle='#211b2b30';c.beginPath();c.ellipse(ground.x,ground.y,w*.26,w*.10,0,0,Math.PI*2);c.fill();}
    c.translate(s.x,s.y-bob);
    if(e.pose){c.rotate(-e.pose.rotation);c.scale(e.pose.side,1);}
    else{
      if((kind==='player'&&e.dx<-.1)||((kind==='magic'||kind==='ally')&&e.facing===-1)||(kind==='enemy'&&e.face===-1)||(key==='cart'&&e.face===1))c.scale(-1,1);
      let tilt=Number.isFinite(e.aim)?-e.aim:moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;
      if(!Number.isFinite(e.aim)&&['attack','gather'].includes(e.action)&&e.actionUntil>world.time)tilt=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);
      c.rotate(-tilt);
    }
    if(kind==='building'&&key==='gate'&&e.open)w*=.35;
    if(kind!=='preview')c.filter=`brightness(${Math.min(1, Math.max(0, display))})`+(kind==='enemy'&&e.stunned>0?' saturate(.35) hue-rotate(160deg)':'')+(kind==='enemy'&&e.gilded?' sepia(1) saturate(3) brightness(1.25)':'');
    c.drawImage(img,(frameIndex%cols)*sw,Math.floor(frameIndex/cols)*sh,sw,sh,-w*def.anchor[0],-h*(1-def.anchor[1]),w,h);c.filter='none';
    const glowImg=kind==='enemy'&&this.images.get('glow-'+key);if(glowImg){const gw=glowImg.naturalWidth/cols,gh=glowImg.naturalHeight/rows;c.globalCompositeOperation='lighter';c.globalAlpha=glowStrength(frame.darkness,e,this.clock);c.drawImage(glowImg,(frameIndex%cols)*gw,Math.floor(frameIndex/cols)*gh,gw,gh,-w*def.anchor[0],-h*(1-def.anchor[1]),w,h);c.globalCompositeOperation='source-over';}
    c.restore();
    if(rigAfter)drawMagicCanvas(this.ctx,rigAfter,(x,z,y)=>this.screenPoint(x,z,y));
    if((kind==='enemy'||kind==='building'||(kind==='ally'&&key!=='crow'))&&e.hp<e.maxHp&&fade>0.04){const y=s.y-h*(key==='hearth'?.62:kind==='enemy'||kind==='ally'?key==='crawler'?.38:.82:.37);c.save();c.globalAlpha=fade;c.fillStyle='#2a2533';c.fillRect(s.x-21,y,42,4);c.fillStyle=kind==='enemy'?'#df9383':kind==='ally'?'#9fd8a8':'#d2c395';c.fillRect(s.x-20,y+1,40*Math.max(0,e.hp/e.maxHp),2);c.restore();}
    if(kind==='player'&&e.id!==p.id&&fade>0.05){c.save();c.globalAlpha=fade;c.font='10px Arial';c.textAlign='center';c.fillStyle='#f4e4c8';c.fillText(e.name,s.x,s.y-h-4);c.restore();}
    if(kind==='player'&&!e.down&&!e.ghost){
      const pose=heldWeaponPose(e,this.magicFrame.time,this.theme);
      if(pose&&this.images.has(pose.key))this.drawSprite(pose.key,{id:e.id,x:e.x+pose.x,z:e.z+pose.z,lift:pose.y,pose},'held',world,frame,p);
    }
    if(kind==='building'&&['hearth','fire'].includes(key)&&e.fuel>0){for(let i=0;i<5;i++){const t=(this.clock*.45+i*.23)%1;c.globalAlpha=(1-t)*.55;c.fillStyle='#ffce85';c.beginPath();c.arc(s.x+Math.sin(i*3+this.clock)*10,s.y-h*.4-t*35,1.5,0,Math.PI*2);c.fill();}c.globalAlpha=1;}
  }
  /** Ground warning: faint area, a fill that grows until the blow lands, and a bright edge. */
  drawTelegraph(tg,alpha){
    const c=this.ctx,poly=scale=>{
      const pts=[];
      if(tg.shape==='ring'&&tg.inner>0){const ro=tg.inner+(tg.radius-tg.inner)*scale;for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;pts.push([tg.x+Math.cos(a)*ro,tg.z+Math.sin(a)*ro]);}for(let i=40;i>=0;i--){const a=i/40*Math.PI*2;pts.push([tg.x+Math.cos(a)*tg.inner,tg.z+Math.sin(a)*tg.inner]);}}
      else if(tg.shape==='circle'||tg.shape==='ring'){for(let i=0;i<32;i++){const a=i/32*Math.PI*2;pts.push([tg.x+Math.cos(a)*tg.radius*scale,tg.z+Math.sin(a)*tg.radius*scale]);}}
      else if(tg.shape==='cone'){const arc=tg.arc*Math.PI/180;pts.push([tg.x,tg.z]);for(let i=0;i<=16;i++){const a=tg.angle-arc/2+arc*i/16;pts.push([tg.x+Math.cos(a)*tg.radius*scale,tg.z+Math.sin(a)*tg.radius*scale]);}}
      else{const ca=Math.cos(tg.angle),sa=Math.sin(tg.angle),w=tg.width/2,l=tg.length*scale;pts.push([tg.x-sa*w,tg.z+ca*w],[tg.x+ca*l-sa*w,tg.z+sa*l+ca*w],[tg.x+ca*l+sa*w,tg.z+sa*l-ca*w],[tg.x+sa*w,tg.z-ca*w]);}
      c.beginPath();pts.forEach(([x,z],i)=>{const q=this.screenPoint(x,z);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.closePath();
    };
    const hot=tg.heavy?'216,52,31':'240,88,60';
    c.save();poly(1);c.fillStyle=`rgba(${hot},${.22*alpha})`;c.fill();c.strokeStyle=`rgba(255,${tg.heavy?106:154},${tg.heavy?72:126},${.9*alpha})`;c.lineWidth=Math.max(2,.14*this.scale);c.stroke();
    poly(Math.max(.02,tg.fill));c.fillStyle=`rgba(${hot},${.46*alpha})`;c.fill();c.restore();
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;this.magicFrame=this.magicClock.sample(world,this.clock);this.localId=localId;if(this.seed!==world.seed){this.seed=world.seed;this.lastEvent=0;this.magicActors.clear();this.weaponFx.reset();}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};this.focus.x+=((demo?0:p.x)-this.focus.x)*Math.min(1,dt*6);this.focus.z+=((demo?-1:p.z)-this.focus.z)*Math.min(1,dt*6);
    // Weapon effects (src/fx): built first so their camera kick and night light land this frame.
    const weapon=demo?null:this.weaponFx.build(world,this.magicFrame,this.clock,dt,this.focus);this.frameFx=weapon;
    const kick=weapon?.shake>0?weapon.shake*.32:0,kx=kick?(Math.sin(this.clock*71)+Math.sin(this.clock*43))*kick*.5:0,kz=kick?(Math.sin(this.clock*59+1)+Math.sin(this.clock*31))*kick*.5:0;
    this.focus.x+=kx;this.focus.z+=kz;
    const frame=frameLighting(world, this.theme, world.player(localId)||null);if(weapon?.lights.length)frame.sources.push(...weapon.lights);this.view=frame;
    {const level=weapon?Math.round(weapon.flash*100)/100:0;if(level!==this.flashLevel){this.flashLevel=level;const el=document.getElementById('fx-flash');if(el){el.style.opacity=String(level);if(level>0)el.style.setProperty('--flash',weapon.flashColor||'#fff3cf');}}}
    const c=this.ctx;c.clearRect(0,0,this.width,this.height);c.fillStyle=shadeHex(this.theme.palette.background, 1-frame.darkness*0.72, frame.darkness, frame.lighting);c.fillRect(0,0,this.width,this.height);
    const halfX=this.width/this.scale/2+3,halfZ=this.height/(this.scale*.72)/2+6;
    // The hollow's ground colours (worldgen.groundColors, the same texels the WebGL ground uses); tiles along a shore,
    // thicket or the edge split into unit tiles so the colour follows the walkable shape.
    const tone=world.arena||world.dungeon?null:(this.groundTone?.seed===world.seed&&this.groundTone.palette===this.theme.palette?this.groundTone:(this.groundTone={seed:world.seed,palette:this.theme.palette,colors:groundColors(world.seed,this.theme.palette)})).colors;
    const landAt=(x,z)=>{const i=Math.floor((x+tone.extent)*tone.res),j=Math.floor((z+tone.extent)*tone.res);return i<0||j<0||i>=tone.size||j>=tone.size?4:tone.land[j*tone.size+i];};
    const plain=(x,z,size)=>{for(let a=.25;a<size;a+=.5)for(let b=.25;b<size;b+=.5)if(landAt(x+a,z+b)!==1)return false;return true;};
    const paintTile=(x,z,size,detail)=>{
      if(tone&&size>.5&&!plain(x,z,size)){const h=size/2;paintTile(x,z,h,detail);paintTile(x+h,z,h,detail);paintTile(x,z+h,h,detail);paintTile(x+h,z+h,h,detail);return;}
      const cx=x+size/2,cz=z+size/2;
      const display=brightnessAt(frame.sources, cx, cz, frame.darkness, frame.lighting);
      c.fillStyle=shadeHex(world.arena?arenaTile(cx,cz,world.radius):groundHex(tone,cx,cz)||this.theme.palette.void||this.theme.palette.background, display, frame.darkness, frame.lighting);
      const a=this.screenPoint(x,z),b=this.screenPoint(x+size,z+size);c.fillRect(a.x-.5,a.y-.5,b.x-a.x+1,b.y-a.y+1);
      if(!detail||(tone&&landAt(cx,cz)!==1))return;
      const hash=Math.abs(Math.sin(x*13.7+z*4.3+world.seed)*43758)%1;
      c.fillStyle=`rgba(35,31,42,${hash*.07*display})`;c.fillRect(a.x,a.y,b.x-a.x+1,b.y-a.y+1);
      if(display>0.2){for(let i=0;i<2;i++){const s=this.screenPoint(x+hash*1.9,z+(hash+i*.5)%1*size);c.strokeStyle=hash>.5?`rgba(182,153,108,${display*.4})`:`rgba(53,78,72,${display*.4})`;c.lineWidth=1;c.beginPath();c.moveTo(s.x-2,s.y+1);c.lineTo(s.x,s.y-2);c.lineTo(s.x+3,s.y);c.stroke();}}
    };
    if(world.dungeon)paintDungeonCanvas(this,c,world,frame,this.clock,halfX,halfZ);
    else for(let z=Math.max(-RULES.radius-6,Math.floor((this.focus.z-halfZ)/2)*2);z<Math.min(RULES.radius+6,this.focus.z+halfZ);z+=2)for(let x=Math.max(-RULES.radius-6,Math.floor((this.focus.x-halfX)/2)*2);x<Math.min(RULES.radius+6,this.focus.x+halfX);x+=2)paintTile(x,z,2,true);
    if(frame.darkness>0.05&&!world.dungeon){
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
    if(world.arena){c.save();c.strokeStyle='rgba(224,119,107,.8)';c.lineWidth=Math.max(2,.22*this.scale);const q=this.screenPoint(0,0);c.beginPath();c.ellipse(q.x,q.y,(world.radius-1)*this.scale,(world.radius-1)*this.scale*.72,0,0,Math.PI*2);c.stroke();c.restore();}
    for(const b of world.buildings)if(STRUCTURES[b.type].light&&(b.type==='lantern'||b.fuel>0))this.glow(b.x,b.z,STRUCTURES[b.type].light+(b.type==='hearth'?(b.level-1)*1.5:0),.08+frame.darkness*.1);
    for(const source of frame.sources)if(source.kind==='player')this.glow(source.x,source.z,source.radius,.06+frame.darkness*.08);
    if(target&&!placement){const fade=this.reveal(target.x, target.z),m=targetMarker(this.theme,target);if(fade>0.05&&m){const q=this.screenPoint(target.x,target.z);c.save();c.globalAlpha=fade;c.translate(q.x,q.y);c.scale(1,.72);paintMarker(c,0,0,m.radius*markerPulse(this.clock),this.scale,m.color);c.restore();}}
    if(p.goal){const fade=Math.max(this.reveal(p.goal.x, p.goal.z), distance(p, p.goal)<8?.28:0);if(fade>0.04){c.save();c.globalAlpha=fade;this.ellipse(p.goal.x,p.goal.z,.2,'#eadaba',false);c.restore();}}
    for(const e of world.enemies){const tg=telegraphOf(e);if(!tg||Math.abs(tg.x-this.focus.x)>halfX+6||Math.abs(tg.z-this.focus.z)>halfZ+6)continue;if(!warningVisible(frame, tg.x, tg.z, tg.radius||tg.length||2, p))continue;this.drawTelegraph(tg,frame.darkness>0.5?.75:1);}
    for(const s of hostileShots(world))if(s.kind==='spore'&&Math.abs(s.x-this.focus.x)<halfX+4&&Math.abs(s.z-this.focus.z)<halfZ+4)this.drawTelegraph({shape:'circle',x:s.x,z:s.z,radius:s.radius,fill:s.fill,heavy:false},.9);
    // Blasts (blasts.mjs): vents, falling stars, a boss's roots and gaze. Their look is drawn by src/fx/hollow.mjs.
    for(const s of hostileShots(world))if(s.kind==='blast'&&!s.telegraph.waiting&&Math.abs(s.x-this.focus.x)<halfX+14&&Math.abs(s.z-this.focus.z)<halfZ+14)this.drawTelegraph(s.telegraph,.9);
    const hearthB=world.buildings.find(b=>b.type==='hearth')||(world.arena?{x:0,z:0,level:1}:null),plazaImg=this.images.get('plaza');if(hearthB&&plazaImg){const size=this.theme.sprites.plaza.size[0]*this.scale,q=this.screenPoint(hearthB.x,hearthB.z,0);c.save();c.filter=`brightness(${Math.min(1,entityBrightness(frame,hearthB.x,hearthB.z,{emissive:true}))})`;c.drawImage(plazaImg,q.x-size/2,q.y-size*.36,size,size*.72);c.filter='none';const g=this.images.get('plaza-glow');if(g){c.globalCompositeOperation='lighter';c.globalAlpha=(.12+.5*frame.darkness)*(.75+.25*Math.sin(this.clock*1.6));c.drawImage(g,q.x-size/2,q.y-size*.36,size,size*.72);}c.restore();}
    paintScenery(this,c,world,frame,dt,'ground');
    if(weapon&&(weapon.groundNormal.length||weapon.groundGlow.length))drawMagicCanvas(c,[...weapon.groundNormal,...weapon.groundGlow],(x,z,y)=>this.screenPoint(x,z,y));
    paintRopes(this,c,world,frame,this.theme,true);
    const entities=[...world.nodes.filter(n=>!n.ready&&nodeAwake(n,world)).map(e=>({e,key:spriteVariant(this.theme,e.type,e),kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:itemSpriteKey(e.stack?.itemId),kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...(world.projectiles||[]).map(e=>({e:{...e,lift:.9},key:PROJECTILE_KEYS[e.kind]||'mbolt',kind:'projectile'})),...(world.allies||[]).map(e=>({e:ALLIES[e.type]?.fly?{...e,lift:.9+Math.sin(this.clock*6+e.x)*.15}:e,key:e.type,kind:'ally'})),...(world.zones||[]).filter(z=>z.kind!=='star').map(z=>({e:z,key:'frostcloud',kind:'zone'})),...magicVisuals(world).filter(entry=>!usesMagicEffects(entry.entity)).map(entry=>({e:entry.entity,key:entry.key,kind:'magic'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'})),...plazaProps(world,this.theme),...arenaProps(world,this.theme),...dungeonProps(world,this.theme)];
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
    paintRopes(this,c,world,frame,this.theme);
    paintScenery(this,c,world,frame,dt,'air');
    this.dropMotion.retain(new Set(world.drops.map(drop=>drop.id)));
    const summonIds=new Set((world.magicSummons||[]).map(e=>e.id));for(const id of this.magicActors.keys())if(!summonIds.has(id))this.magicActors.delete(id);
    for(const s of hostileShots(world)){
      if(s.kind==='blast'||Math.abs(s.x-this.focus.x)>halfX+4||Math.abs(s.z-this.focus.z)>halfZ+4)continue;
      const t=s.fill||0,x=s.kind==='spore'?s.sx+(s.x-s.sx)*t:s.x,z=s.kind==='spore'?s.sz+(s.z-s.sz)*t:s.z,y=s.kind==='spore'?.5+Math.sin(Math.PI*t)*3.2:.5;
      const q=this.screenPoint(x,z,y),r=Math.max(3,(s.kind==='spore'?.5:s.radius*1.5)*this.scale),color={orb:'176,108,255',shard:'110,184,255',spore:'120,196,76',thorn:'214,82,60',void:'120,40,200'}[s.kind]||'176,108,255';
      if(s.kind!=='spore')this.ellipse(x,z,s.radius*.95,'rgba(26,18,36,.3)');
      const g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,r);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.35,`rgba(${color},.85)`);g.addColorStop(1,`rgba(${color},0)`);c.fillStyle=g;c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();
    }
    if(placement){c.save();c.globalAlpha=.7;this.drawSprite(placement.key,{x:placement.x,z:placement.z},'preview',world,frame,p);c.restore();this.ellipse(placement.x,placement.z,.9,placement.valid?'#bbdca5':'#d67d79',false);}
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2){this.weaponFx.event(ev,this.clock,world);if(ev.type==='damage')damageFloater(this.floaters,ev,this.localId,'hit');else if(['loot','heal','build','craft'].includes(ev.type))this.float(ev.text,ev.x,ev.z,ev.type==='damage'?'#f5c2a9':ev.type==='heal'?'#b9e2ba':'#fbe1ad');if(ev.type==='refine')this.float(`◆ ${ev.text}`,ev.x,ev.z,RARITY_COLORS[ev.rarity]||'#fbe1ad',{className:'world-label refine-label',alwaysVisible:ev.player===this.localId});if(ev.type==='hurt')damageFloater(this.floaters,ev,this.localId,'hurt');if(ev.type==='salvage')this.float(`◆ ${ev.text}`,ev.x,ev.z,RARITY_COLORS[ev.rarity]||'#fbe1ad',{className:'world-label salvage-label',alwaysVisible:ev.player===this.localId});if(ev.type==='rare')this.float(`✦ ${ev.text}`,ev.x,ev.z,RARITY_COLORS[rarityOf(ev.itemId)]);if(ev.type==='levelup')this.float(`LEVEL UP · ${ev.text}`,ev.x,ev.z,'#f2c14e');if(ev.type==='discover')this.float(ev.text,ev.x,ev.z,'#d4fff5');if(ev.type==='freeze')this.float(ev.text,ev.x,ev.z,'#d6f1ff');if(ev.type==='rankup')this.float(`✦ ${ev.text}`,ev.x,ev.z,'#f2c14e',{alwaysVisible:true});if(ev.type==='swap')this.float(ev.text,ev.x,ev.z,'#f0dfbd',{className:'world-label swap-label',alwaysVisible:ev.player===this.localId});if(ev.type==='dodge')this.float(ev.text,ev.x,ev.z,'#bfe8ff',{className:'world-label dodge-label',alwaysVisible:ev.player===this.localId});if(ev.type==='strike')this.float(ev.text,ev.x,ev.z,STRIKE_COLORS[ev.kind]||STRIKE_COLORS.clean,{className:`world-label strike-label strike-${ev.kind||'clean'}`,alwaysVisible:ev.player===this.localId});if(!ev.magicPack&&['kill','hurt','impact','bolt','nova','burst','chain','lash','frost','freeze','summon','poof','rend','quake','splat','dash','portal'].includes(ev.type))this.effects.push({...ev,life:0,radius:ev.radius||({freeze:.9,summon:1.1,poof:.8,rend:1}[ev.type])});}this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;const fade=this.reveal(e.x, e.z);if(e.type==='dash'){const a=this.screenPoint(e.x,e.z,1),b=this.screenPoint(e.x+(e.dx||0)*DASH.distance,e.z+(e.dz||0)*DASH.distance,1);c.save();c.globalAlpha=Math.max(0,.55-e.life*1.8);c.strokeStyle='#bfe0ff';c.lineCap='round';c.lineWidth=Math.max(4,.7*this.scale);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();return e.life<.3;}if(e.type==='chain'||e.type==='lash'){const pts=e.type==='chain'?e.points||[]:[[e.x,e.z],[e.x+(e.dx||0)*(e.range||4),e.z+(e.dz||0)*(e.range||4)]];c.save();c.globalAlpha=fade*Math.max(0,1-e.life*2);c.strokeStyle=e.type==='chain'?'#bfe8ff':'#c49bff';c.lineWidth=3;c.beginPath();pts.forEach(([x,z],i)=>{const q=this.screenPoint(x,z,.9);if(i)c.lineTo(q.x+(Math.random()-.5)*6,q.y+(Math.random()-.5)*6);else c.moveTo(q.x,q.y);});c.stroke();c.restore();return e.life<.5;}const tint={starfall:'242,193,78',mark:'242,193,78',frost:'191,232,255',freeze:'226,246,255',summon:'159,216,168',poof:'159,216,168',rend:'208,80,74',quake:'255,138,92',splat:'159,220,106',portal:'183,132,255'}[e.type];c.save();c.globalAlpha=fade;if(tint){this.ellipse(e.x,e.z,.3+Math.min(1,e.life*3)*e.radius,`rgba(${tint},${Math.max(0,1-e.life*2)})`,false);c.restore();return e.life<.5;}this.ellipse(e.x,e.z,e.radius?.3+Math.min(1,e.life*3)*e.radius:.2+e.life*(e.type==='impact'?8:3),e.type==='burst'?`rgba(127,214,196,${Math.max(0,1-e.life*2)})`:`rgba(246,194,131,${Math.max(0,1-e.life*2)})`,false);c.restore();return e.life<.5;});
    const magic=buildMagicEffects(world,this.magicFrame,this.theme);if(weapon){magic.push(...weapon.normal,...weapon.glow);}
    drawMagicCanvas(c,magic,(x,z,y)=>this.screenPoint(x,z,y));
    this.floaters=stepFloaters(this.floaters,dt,(x,z,y)=>this.screenPoint(x,z,y),(x,z)=>this.reveal(x,z));
    this.focus.x-=kx;this.focus.z-=kz;
  }
}
