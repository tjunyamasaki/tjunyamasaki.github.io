import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {STRUCTURES, RULES} from './content.mjs?v=harvest-16';
import {random, biome, distance, createDropMotion} from './engine.mjs?v=harvest-16';
import {equippedLanternLit, itemSpriteKey, spriteVariant} from './inventory.mjs?v=harvest-16';
import {magicClipName, magicVisuals} from './magic/registry.mjs?v=harvest-16';
import {ALLIES} from './progression.mjs?v=harvest-16';
const PROJECTILE_KEYS={arrow:'arrow',bolt:'mbolt',wisp:'wisp',seed:'pumpseed'};
import {MagicClock, heldWeaponPose, skeletonFrame} from './magic/art.mjs?v=harvest-16';
import {buildMagicEffects, usesMagicEffects} from './magic/effects.mjs?v=harvest-16';
import {MagicMesh} from './magic/effects-three.mjs?v=harvest-16';
import {orthographicHalf, viewSize, watchViewport} from './camera.mjs?v=harvest-16';
import {RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-16';
import {
  LIGHT_FIELD_ORIGIN, LIGHT_FIELD_SIZE, LIGHT_FIELD_SPAN, brightnessAt, canInspect, entityBrightness,
  frameLighting, labelOpacity, linearFromDisplay, spriteTint, warningVisible, writeLightField,
} from './lighting.mjs?v=harvest-16';
import {loadImage, loadJson, preloadThemeAssets} from './assets.mjs?v=harvest-16';
export async function loadTheme(url=new URL('../themes/harvest/theme.json',import.meta.url)){
  const theme=await loadJson(url);theme.url=url;for(const def of Object.values(theme.sprites)){def.src=new URL(def.src,url).href;if(def.icon)def.icon=new URL(def.icon,url).href;}
  for(const[k,v]of Object.entries(theme.audio))theme.audio[k]=new URL(v,url).href;return theme;
}
export class Renderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(theme.palette.background);this.magicClock=new MagicClock();this.magicMesh=new MagicMesh(this.scene);
    this.scene.fog=new THREE.FogExp2(theme.palette.background,.009);this.camera=new THREE.OrthographicCamera(-15,15,15,-15,.1,180);
    this.gl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.gl.setPixelRatio(Math.min(devicePixelRatio,1.6));this.gl.outputColorSpace=THREE.SRGBColorSpace;
    this.objects=new Map();this.textures=new Map();this.materials=new Map();this.effects=[];this.floaters=[];this.focus=new THREE.Vector3();this.zoom=1;this.lastEvent=0;this.seed=null;this.clock=0;this.dropMotion=createDropMotion();
    this.ray=new THREE.Raycaster();this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.v=new THREE.Vector3();this.view=null;this.localId=null;
    this.shadowGeo=new THREE.CircleGeometry(1,16);this.shadowMat=new THREE.MeshBasicMaterial({color:0x241e2c,transparent:true,opacity:.19,depthWrite:false});
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,217,149,.5)');g.addColorStop(.5,'rgba(239,176,100,.22)');g.addColorStop(1,'rgba(240,163,93,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);this.glowMap=new THREE.CanvasTexture(c);
    this.lightCanvas=document.createElement('canvas');this.lightCanvas.width=this.lightCanvas.height=LIGHT_FIELD_SIZE;this.lightCtx=this.lightCanvas.getContext('2d',{willReadFrequently:true});
    this.lightImage=this.lightCtx.createImageData(LIGHT_FIELD_SIZE,LIGHT_FIELD_SIZE);
    this.lightTexture=new THREE.CanvasTexture(this.lightCanvas);this.lightTexture.colorSpace=THREE.NoColorSpace;this.lightTexture.flipY=true;this.lightTexture.generateMipmaps=false;this.lightTexture.minFilter=THREE.LinearFilter;this.lightTexture.magFilter=THREE.LinearFilter;this.lightTexture.wrapS=this.lightTexture.wrapT=THREE.ClampToEdgeWrapping;
    this.lightUniforms={
      uNightLight:{value:this.lightTexture},
      uNightCover:{value:0},
      uNightAmbient:{value:0.03},
      uNightLit:{value:0.92},
      uNightOrigin:{value:new THREE.Vector2(LIGHT_FIELD_ORIGIN,LIGHT_FIELD_ORIGIN)},
      uNightSpan:{value:LIGHT_FIELD_SPAN},
    };
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.85,1,40),new THREE.MeshBasicMaterial({color:theme.palette.accent,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.scene.add(this.marker);
    this.ghost=null;this.pathMarker=new THREE.Mesh(new THREE.RingGeometry(.16,.22,20),new THREE.MeshBasicMaterial({color:0xeadaba,transparent:true,opacity:.7,side:THREE.DoubleSide}));this.pathMarker.rotation.x=-Math.PI/2;this.pathMarker.visible=false;this.scene.add(this.pathMarker);
    this.viewWidth=1;this.viewHeight=1;this.onResize=()=>this.resize();watchViewport(this.onResize);this.resize();
  }
  bindNight(material){
    const uniforms=this.lightUniforms;
    material.onBeforeCompile=shader=>{
      shader.uniforms.uNightLight=uniforms.uNightLight;shader.uniforms.uNightCover=uniforms.uNightCover;shader.uniforms.uNightAmbient=uniforms.uNightAmbient;shader.uniforms.uNightLit=uniforms.uNightLit;shader.uniforms.uNightOrigin=uniforms.uNightOrigin;shader.uniforms.uNightSpan=uniforms.uNightSpan;
      shader.vertexShader='varying vec3 vNightWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvNightWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vNightWorld;\nuniform sampler2D uNightLight;\nuniform float uNightCover;\nuniform float uNightAmbient;\nuniform float uNightLit;\nuniform vec2 uNightOrigin;\nuniform float uNightSpan;').replace('#include <color_fragment>','#include <color_fragment>\n{vec2 luv=(vNightWorld.xz-uNightOrigin)/uNightSpan;float lamp=texture2D(uNightLight,clamp(luv,0.0,1.0)).r;float nightB=mix(uNightAmbient,uNightLit,lamp);diffuseColor.rgb*=mix(vec3(1.0),vec3(nightB),uNightCover);}');
    };
    material.customProgramCacheKey=()=>'hollowstead-night-field';
  }
  paintField(frame){
    this.lightUniforms.uNightCover.value=frame.darkness;
    this.lightUniforms.uNightAmbient.value=linearFromDisplay(frame.lighting.ambientNight);
    this.lightUniforms.uNightLit.value=linearFromDisplay(frame.lighting.litBrightness);
    // The field follows the camera so lamps light the ground anywhere on the larger map.
    const origin={x:Math.round(this.focus.x)-LIGHT_FIELD_SPAN/2,z:Math.round(this.focus.z)-LIGHT_FIELD_SPAN/2};this.lightUniforms.uNightOrigin.value.set(origin.x,origin.z);
    if(frame.darkness>0.001)writeLightField(this.lightImage.data, LIGHT_FIELD_SIZE, origin, LIGHT_FIELD_SPAN, frame.sources, frame.lighting);
    else this.lightImage.data.fill(0);
    this.lightCtx.putImageData(this.lightImage,0,0);this.lightTexture.needsUpdate=true;
  }
  shadeSprite(material, display, lamp, darkness, lighting){
    const tint=spriteTint(lamp, darkness, lighting);
    const channel=byte=>linearFromDisplay(Math.min(1, Math.max(0, display*(byte/255))));
    material.color.setRGB(channel(tint.r), channel(tint.g), channel(tint.b));
  }
  async preload(){await preloadThemeAssets(this.theme);await Promise.all(Object.entries(this.theme.sprites).map(async([key,def])=>{const map=new THREE.Texture(await loadImage(def.src));map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;map.minFilter=THREE.LinearFilter;map.magFilter=THREE.LinearFilter;this.textures.set(key,map);}));}
  resize(){const size=viewSize(this.canvas);const w=size.width,h=size.height;this.viewWidth=w;this.viewHeight=h;this.gl.setSize(w,h,false);const aspect=w/Math.max(1,h),half=orthographicHalf(w,h);this.camera.left=-half*aspect/this.zoom;this.camera.right=half*aspect/this.zoom;this.camera.top=half/this.zoom;this.camera.bottom=-half/this.zoom;this.camera.updateProjectionMatrix();}
  setZoom(value){this.zoom=Math.max(.65,Math.min(1.6,value));this.resize();}
  sprite(key,id){
    const def=this.theme.sprites[key]||this.theme.sprites.ember;const texture=(this.textures.get(key)||this.textures.get('ember')).clone();texture.needsUpdate=true;
    texture.repeat.set(1/(def.columns||1),1/(def.rows||1));
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.04,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.center.set(...(def.anchor||[.5,0]));sprite.scale.set(...def.size,1);
    this.scene.add(sprite);const shadow=new THREE.Mesh(this.shadowGeo,this.shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;shadow.scale.setScalar(def.size[0]*.26);this.scene.add(shadow);
    const o={id,key,sprite,shadow,def,x:0,z:0,initialized:false};this.objects.set(id,o);return o;
  }
  remove(o){this.scene.remove(o.sprite,o.shadow);o.sprite.material.map.dispose();o.sprite.material.dispose();if(o.glow){this.scene.remove(o.glow);o.glow.geometry.dispose();o.glow.material.dispose();}if(o.danger){this.scene.remove(o.danger);o.danger.geometry.dispose();o.danger.material.dispose();}if(o.health){this.scene.remove(o.health.back,o.health.fill);o.health.back.material.dispose();o.health.fill.material.dispose();}this.objects.delete(o.id);}
  terrain(seed){
    if(this.ground){this.scene.remove(this.ground);this.ground.geometry.dispose();this.ground.material.dispose();}
    if(this.scatter){this.scene.remove(this.scatter);this.scatter.geometry.dispose();this.scatter.material.dispose();}
    const rng=random(seed),positions=[],colors=[];const col=new THREE.Color();const tile=2;
    const edge=RULES.radius+8;
    for(let z=-edge;z<edge;z+=tile)for(let x=-edge;x<edge;x+=tile){
      const b=biome(x,z);col.set(this.theme.palette[b]);const path=Math.abs(x+Math.sin(z*.16)*3)<1.8||Math.abs(z-Math.sin(x*.17)*4)<1.6;
      if(path)col.lerp(new THREE.Color(this.theme.palette.path),.6);col.multiplyScalar(.92+rng()*.15);
      for(const [a,b]of [[x,z],[x,z+tile],[x+tile,z],[x+tile,z],[x,z+tile],[x+tile,z+tile]]){positions.push(a,-.04,b);colors.push(col.r,col.g,col.b);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.ground=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true}));this.bindNight(this.ground.material);this.scene.add(this.ground);
    const pos=[],cols=[];for(let i=0;i<8000;i++){const x=(rng()-.5)*2*edge,z=(rng()-.5)*2*edge,s=.05+rng()*.2;col.set(rng()<.5?'#bc9767':'#4b5350');for(const[a,b]of [[x,z],[x+s,z+s],[x-s,z+s*.6]]){pos.push(a,.001,b);cols.push(col.r,col.g,col.b);}}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));this.scatter=new THREE.Mesh(sg,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));this.bindNight(this.scatter.material);this.scene.add(this.scatter);
    this.seed=seed;
  }
  glow(o,radius){if(!o.glow){o.glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.glowMap,transparent:true,depthWrite:false,opacity:.8}));o.glow.rotation.x=-Math.PI/2;this.scene.add(o.glow);}const feather=this.view?.lighting.ambientFraction||1.2;o.glow.scale.setScalar(radius*feather*2);o.glow.position.set(o.x,.03,o.z);o.glow.visible=o.sprite.visible;}
  screenPoint(x,z,y=0){const v=new THREE.Vector3(x,y,z).project(this.camera);const w=this.viewWidth||innerWidth,h=this.viewHeight||innerHeight;return {x:(v.x*.5+.5)*w,y:(-.5*v.y+.5)*h};}
  worldPoint(x,y){const w=this.viewWidth||innerWidth,h=this.viewHeight||innerHeight;this.ray.setFromCamera(new THREE.Vector2(x/w*2-1,1-y/h*2),this.camera);const p=new THREE.Vector3();return this.ray.ray.intersectPlane(this.groundPlane,p)?{x:p.x,z:p.z}:null;}
  pick(x,y,world){
    const viewer=this.localId&&world.player?world.player(this.localId):null;
    let best=null,dist=44;
    for(const e of [...world.nodes.filter(n=>!n.ready),...world.buildings,...world.drops,...world.enemies,...magicVisuals(world).map(entry=>entry.entity)]){
      if(this.view&&!canInspect(this.view, e.x, e.z, viewer, RULES.reach))continue;
      const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}
    }
    return best;
  }
  float(text,x,z,color='#f8dfb3'){if(!text)return;const el=document.createElement('div');el.className='world-label';el.textContent=text;el.style.color=color;document.getElementById('world-labels').append(el);this.floaters.push({el,x,z,life:0});}
  effect(event){
    if(event.type==='hit')for(const o of this.objects.values())if(Math.hypot(o.x-event.x,o.z-event.z)<.2)o.hitUntil=this.clock+.22;
    if(['loot','damage','heal','build','craft'].includes(event.type))this.float(event.text,event.x,event.z,event.type==='damage'?'#f5c2a9':event.type==='heal'?'#b9e2ba':'#fbe1ad');
    if(event.type==='rare')this.float(`✦ ${event.text}`,event.x,event.z,RARITY_COLORS[rarityOf(event.itemId)]);
    if(event.type==='levelup')this.float(`LEVEL UP · ${event.text}`,event.x,event.z,'#f2c14e');
    if(event.type==='discover')this.float(event.text,event.x,event.z,'#d4fff5');
    if(event.type==='freeze')this.float(event.text,event.x,event.z,'#d6f1ff');
    if(['chain','lash'].includes(event.type)){const pts=event.type==='chain'?(event.points||[]).map(([x,z])=>new THREE.Vector3(x,.9,z)):[new THREE.Vector3(event.x,.9,event.z),new THREE.Vector3(event.x+(event.dx||0)*(event.range||4),.9,event.z+(event.dz||0)*(event.range||4))];if(pts.length>1){const bent=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];for(let k=0;k<6;k++){const t=k/6;bent.push(new THREE.Vector3(a.x+(b.x-a.x)*t+(k?(Math.random()-.5)*.35:0),.9+(k?(Math.random()-.5)*.3:0),a.z+(b.z-a.z)*t+(k?(Math.random()-.5)*.35:0)));}}bent.push(pts[pts.length-1]);const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(bent),new THREE.LineBasicMaterial({color:event.type==='chain'?0xbfe8ff:0xc49bff,transparent:true,depthWrite:false}));this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,fixed:true});}}
    if(['starfall','mark','frost','freeze','summon','poof','rend'].includes(event.type)){const color={starfall:0xf2c14e,mark:0xf2c14e,frost:0xbfe8ff,freeze:0xe2f6ff,summon:0x9fd8a8,poof:0x9fd8a8,rend:0xd0504a}[event.type];const mat=new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,radius:event.radius||({freeze:.9,summon:1.1,poof:.8,rend:1}[event.type]||1)});}
    if(['nova','burst'].includes(event.type)){const mat=new THREE.MeshBasicMaterial({color:event.type==='nova'?0xf4a64a:0x7fd6c4,transparent:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,radius:event.radius||2});}
    if(!event.magicPack&&['hit','kill','hurt','build','craft','impact','bolt'].includes(event.type)){
      const mat=new THREE.MeshBasicMaterial({color:event.type==='hurt'?0xd97773:event.type==='bolt'?0xa7e5d8:0xf4c486,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(new THREE.RingGeometry(.06,.2,10),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z});
    }
  }
  reveal(x,z){if(!this.view)return 1;return labelOpacity(brightnessAt(this.view.sources, x, z, this.view.darkness, this.view.lighting), this.view.darkness, this.view.lighting);}
  syncHeldWeapon(player, body){
    const pose=!player.down&&!player.ghost?heldWeaponPose(player,this.magicFrame.time,this.theme):null,id='held'+player.id;
    if(!pose||!this.theme.sprites[pose.key]){const old=this.objects.get(id);if(old)this.remove(old);return null;}
    let o=this.objects.get(id);if(!o||o.key!==pose.key){if(o)this.remove(o);o=this.sprite(pose.key,id);}
    o.x=body.x+pose.x;o.z=body.z+pose.z;o.initialized=true;
    o.sprite.position.set(o.x,pose.y,o.z);o.sprite.scale.set(pose.side*o.def.size[0]*pose.scale,o.def.size[1]*pose.scale,1);
    o.sprite.visible=body.sprite.visible;o.shadow.visible=false;o.sprite.material.opacity=body.sprite.material.opacity;
    o.sprite.material.rotation=pose.rotation;o.sprite.renderOrder=2;
    o.sprite.material.color.copy(body.sprite.material.color).lerp(new THREE.Color('#ffffff'),.25);
    return id;
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;this.magicFrame=this.magicClock.sample(world,this.clock);this.localId=localId;if(this.seed!==world.seed){this.terrain(world.seed);for(const o of [...this.objects.values()])this.remove(o);this.lastEvent=0;this.ghost=null;}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};const fx=demo?0:p.x,fz=demo?-1:p.z;
    this.focus.x+=(fx-this.focus.x)*Math.min(1,dt*6);this.focus.z+=(fz-this.focus.z)*Math.min(1,dt*6);this.camera.position.set(this.focus.x,28,this.focus.z+27);this.camera.lookAt(this.focus.x,0,this.focus.z);this.camera.updateMatrixWorld();
    const frame=frameLighting(world, this.theme);this.view=frame;this.paintField(frame);
    const bg=new THREE.Color(this.theme.palette.background).lerp(new THREE.Color(frame.lighting.nightTint), frame.darkness);this.scene.background.copy(bg);this.scene.fog.color.copy(bg);
    const alive=new Set();const entities=[...world.nodes.filter(n=>!n.ready).map(e=>({e,key:spriteVariant(this.theme,e.type,e),kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:itemSpriteKey(e.stack?.itemId),kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...(world.projectiles||[]).map(e=>({e,key:PROJECTILE_KEYS[e.kind]||'mbolt',kind:'projectile'})),...(world.allies||[]).map(e=>({e,key:e.type,kind:'ally'})),...(world.zones||[]).map(e=>({e,key:e.kind==='star'?'star':'frostcloud',kind:'zone'})),...magicVisuals(world).filter(entry=>!usesMagicEffects(entry.entity)).map(entry=>({e:entry.entity,key:entry.key,kind:'magic'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'}))];
    entities.sort((a,b)=>Number(a.kind==='drop')-Number(b.kind==='drop'));
    for(const {e,key,kind}of entities){
      if(kind==='drop'&&!this.theme.sprites[key])continue;
      const id=kind+e.id;alive.add(id);let o=this.objects.get(id);const visible=Math.abs(e.x-this.focus.x)<25&&Math.abs(e.z-this.focus.z)<29;if(!visible&&!o){alive.delete(id);continue;}if(!o||o.key!==key){if(o)this.remove(o);o=this.sprite(key,id);}o.sprite.visible=o.shadow.visible=visible;if(o.glow)o.glow.visible=visible;if(o.danger)o.danger.visible=false;if(o.health){o.health.back.visible=o.health.fill.visible=false;}if(!visible)continue;
      const present=kind==='drop'?this.dropMotion.sample(e,world,this.clock,dt,id=>{const body=this.objects.get('player'+id);return body?.initialized?{x:body.x,z:body.z}:null;}):null;
      const tx=present?present.x:e.x, tz=present?present.z:e.z;
      const smooth=['player','enemy','magic','ally'].includes(kind)&&!demo?Math.min(1,dt*(e.id===localId?22:13)):1;
      if(!o.initialized){o.x=tx;o.z=tz;o.initialized=true;}else{o.x+=(tx-o.x)*smooth;o.z+=(tz-o.z)*smooth;}
      const special=kind==='ally'?(e.anim||'idle'):magicClipName(e, kind),moving=special?special==='walk':e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=special||(e.down||e.ghost?'down':kind==='enemy'?(e.windup>0?'attack':'walk'):e.action||'idle'),clip=o.def.clips[clipName]||o.def.clips.walk||o.def.clips.attack||o.def.clips.idle;
      const cols=o.def.columns||1,rows=o.def.rows||1,frameIndex=key==='gravecraft-skeleton'?skeletonFrame(e,this.magicFrame.lead,o.def):Number.isInteger(e.frame)?e.frame%Math.max(1,cols*rows):clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length];
      o.sprite.material.map.offset.set((frameIndex%cols)/cols,1-1/rows-Math.floor(frameIndex/cols)/rows);
      const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob:kind==='enemy'&&key==='wraith'?.2+Math.sin(this.clock*3)*.1:0;
      let sx=o.def.size[0],sy=o.def.size[1];if(kind==='drop'){sx=.85;sy=1.28;if(present?.t){sx*=1-present.t*0.35;sy*=1-present.t*0.35;}}
      if(e.down||e.ghost){sx*=.8;sy*=.65;}
      if(kind==='enemy'&&e.elite){sx*=1.3;sy*=1.3;}
      if(key==='gravecraft-skeleton')sy*=Math.min(1,((e.age||0)+this.magicFrame.lead)/.24);
      if(o.hitUntil>this.clock){const squash=Math.sin((o.hitUntil-this.clock)*14)*(motion.hitSquash||0);sx*=1+squash;sy*=1-squash;}
      const flip=(kind==='player'&&e.dx<-.1)||((kind==='magic'||kind==='ally')&&e.facing===-1);
      o.sprite.scale.set(flip?-sx:sx,sy,1);o.sprite.position.set(o.x,bob+(present?.y||0)+(kind==='projectile'?.9:0),o.z);if(kind==='projectile')o.shadow.visible=false;o.shadow.position.set(o.x,.018,o.z);
      if(kind==='zone'){o.shadow.visible=false;if(e.kind==='star'){const fall=Math.max(0,1-e.age/e.delay);o.sprite.position.y=.4+fall*9;o.sprite.position.x=o.x+fall*3;}else{const life=Math.min(1,e.age*3)*Math.min(1,(e.life-e.age)*2);o.sprite.scale.set(sx*e.radius/1.3,sy*e.radius/1.3,1);o.sprite.position.y=-.2;o.sprite.material.opacity=.8*life;}}
      if(kind==='ally'&&ALLIES[key]?.fly){o.sprite.position.y=.9+Math.sin(this.clock*6+e.x)*.15;}
      if(kind==='projectile')o.sprite.material.rotation=-(e.aim||0);
      else if(Number.isFinite(e.aim))o.sprite.material.rotation=e.aim;
      else{o.sprite.material.rotation=moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;if(['attack','gather'].includes(e.action)&&e.actionUntil>world.time)o.sprite.material.rotation=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);}
      const emissive=(kind==='building'&&STRUCTURES[key]?.light&&(key==='lantern'||e.fuel>0))||(kind==='player'&&equippedLanternLit(e));
      let display=entityBrightness(frame, o.x, o.z, {local:kind==='player'&&e.id===localId, emissive});
      if(kind==='building'&&STRUCTURES[key]?.light&&key!=='lantern'&&!(e.fuel>0))display*=0.45;
      const lamp=brightnessAt(frame.sources, o.x, o.z, 1, frame.lighting);
      const lampStrength=lamp>frame.lighting.ambientNight?Math.min(1,(lamp-frame.lighting.ambientNight)/Math.max(0.01, frame.lighting.litBrightness-frame.lighting.ambientNight)):0;
      this.shadeSprite(o.sprite.material, display, lampStrength, frame.darkness, frame.lighting);
      if(kind==='enemy'&&e.stunned>0)o.sprite.material.color.lerp(new THREE.Color('#bfe8ff'), .65);
      if(kind==='building'&&key==='farm'&&e.growth>=100&&display>0.55)o.sprite.material.color.lerp(new THREE.Color('#efd394'), .45);
      if(kind!=='zone')o.sprite.material.opacity=e.ghost?.4:kind==='ally'?Math.min(1,e.spawn*4,(e.life-e.age)*2):key==='gravecraft-skeleton'?Math.min(1,Math.max(0,(24-(e.age||0)-this.magicFrame.lead)/.4)):kind==='node'&&e.type==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
      const fade=labelOpacity(display, frame.darkness, frame.lighting);
      if(kind==='building'&&STRUCTURES[key].light){const lit=key==='lantern'||e.fuel>0;this.glow(o,STRUCTURES[key].light+(key==='hearth'?(e.level-1)*1.5:0));o.glow.visible=lit&&visible;o.glow.material.opacity=lit?(.12+frame.darkness*.16)*(1+Math.sin(this.clock*9)*.05):0;}
      if(kind==='player'){const pool=frame.sources.find(source=>source.kind==='player'&&source.id===e.id);if(pool){this.glow(o,pool.radius);o.glow.material.opacity=.1+frame.darkness*.12;}else if(o.glow)o.glow.visible=false;const held=this.syncHeldWeapon(e,o,world);if(held)alive.add(held);}
      if(kind==='building'&&key==='gate'&&e.open)o.sprite.scale.x*=.35;
      if((kind==='enemy'||kind==='building'||(kind==='ally'&&key!=='crow'))&&e.hp<e.maxHp&&fade>0.04){if(!o.health){const back=new THREE.Sprite(new THREE.SpriteMaterial({color:0x302834,transparent:true,depthWrite:false})),fill=new THREE.Sprite(new THREE.SpriteMaterial({color:kind==='enemy'?0xdf9383:kind==='ally'?0x9fd8a8:0xd2c395,transparent:true,depthWrite:false}));fill.center.set(0,.5);this.scene.add(back,fill);o.health={back,fill};}const y=kind==='ally'?({wight:4.3,jack:2.4}[key]||1.6):(kind==='enemy'?({king:5.4,brute:3.3,wraith:2.2,golem:3.4,bonewalker:2.4,bogling:1.6}[key]||1.3)*(e.elite?1.3:1):key==='hearth'?3.6:1.8);o.health.back.position.set(o.x,y,o.z);o.health.fill.position.set(o.x-.65,y,o.z+.025);o.health.back.scale.set(1.4,.1,1);o.health.fill.scale.set(1.3*Math.max(0,e.hp/e.maxHp),.055,1);o.health.back.material.opacity=o.health.fill.material.opacity=fade;o.health.back.visible=o.health.fill.visible=true;}
      if(kind==='enemy'&&e.windup>0){const radius=key==='king'?4:1.9;if(warningVisible(frame, e.tx, e.tz, radius, p)){if(!o.danger){o.danger=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),new THREE.MeshBasicMaterial({color:0xf5947b,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));o.danger.rotation.x=-Math.PI/2;this.scene.add(o.danger);}o.danger.visible=true;o.danger.position.set(e.tx,.08,e.tz);o.danger.scale.setScalar(radius);o.danger.material.opacity=(frame.darkness>0.5?.34:.55)+Math.sin(this.clock*14)*.12;}}
    }
    for(const o of this.objects.values())if(!alive.has(o.id)&&o!==this.ghost)this.remove(o);
    this.dropMotion.retain(new Set(world.drops.map(drop=>drop.id)));
    const markerFade=target?this.reveal(target.x, target.z):0;
    this.marker.visible=!!target&&!placement&&markerFade>0.05;if(target){this.marker.position.set(target.x,.04,target.z);this.marker.rotation.z=this.clock*.3;this.marker.material.opacity=.8*markerFade;}
    const goalFade=p.goal?Math.max(this.reveal(p.goal.x, p.goal.z), distance(p, p.goal)<8?.28:0):0;
    this.pathMarker.visible=!!p.goal&&goalFade>0.04;if(p.goal){this.pathMarker.position.set(p.goal.x,.03,p.goal.z);this.pathMarker.material.opacity=.7*goalFade;}
    if(placement){if(!this.ghost||this.ghost.key!==placement.key){if(this.ghost)this.remove(this.ghost);this.ghost=this.sprite(placement.key,'preview');}this.ghost.sprite.position.set(placement.x,0,placement.z);this.ghost.sprite.material.color.set(placement.valid?'#c8e5a6':'#dd7471');this.ghost.sprite.material.opacity=.7;this.ghost.shadow.visible=false;this.ghost.sprite.visible=true;}else if(this.ghost){this.remove(this.ghost);this.ghost=null;}
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2)this.effect(ev);this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;const fade=this.reveal(e.x, e.z);if(!e.fixed)e.mesh.scale.setScalar(e.radius?.3+Math.min(1,e.life*3)*e.radius:1+e.life*(e.type==='impact'?12:4));e.mesh.material.opacity=Math.max(0,1-e.life*2)*fade;if(e.life>.5){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();return false;}return true;});
    this.floaters=this.floaters.filter(f=>{f.life+=dt;const s=this.screenPoint(f.x,f.z,1+f.life*.7);f.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;f.el.style.opacity=String(Math.min(1,(1.8-f.life)*2)*this.reveal(f.x, f.z));if(f.life>1.8){f.el.remove();return false;}return true;});
    this.magicMesh.update(buildMagicEffects(world,this.magicFrame,this.theme));
    this.gl.render(this.scene,this.camera);
  }
}
