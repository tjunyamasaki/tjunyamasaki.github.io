import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {STRUCTURES, RULES} from './content.mjs?v=harvest-18';
import {random, biome, distance, createDropMotion} from './engine.mjs?v=harvest-18';
import {equippedLanternLit, itemSpriteKey, spriteVariant} from './inventory.mjs?v=harvest-18';
import {magicClipName, magicVisuals} from './magic/registry.mjs?v=harvest-18';
import {ALLIES, DASH} from './progression.mjs?v=harvest-18';
import {hostileShots, telegraphOf} from './mobs.mjs?v=harvest-18';
import {nightGlow} from './regions.mjs?v=harvest-18';
import {glowStrength} from './lighting.mjs?v=harvest-18';
import {SceneryLayer} from './scenery.mjs?v=harvest-18';
import {groundColors, walkableAt} from './worldgen.mjs?v=harvest-18';
import {nodeAwake} from './content.mjs?v=harvest-18';
import {RopeLayer} from './cart-rope.mjs?v=harvest-18';
/** Standing stones or lamps ringing the Heartfire plaza (presentation only). */
export function plazaProps(world,theme){const hearth=world.buildings.find(b=>b.type==='hearth');if(!hearth||!theme.sprites['plaza-prop'])return [];return [0,1,2,3,4,5].map(i=>{const a=i*Math.PI/3;return {e:{id:'plaza'+i,x:hearth.x+Math.cos(a)*4.7,z:hearth.z+Math.sin(a)*4.7*.92},key:'plaza-prop',kind:'prop'};});}
/** Runestones ringing the battle arena's wall (presentation only; nothing collides with them). */
export function arenaProps(world,theme){if(!world?.arena||!theme.sprites['plaza-prop'])return [];const R=world.radius-.35,n=22;return [...Array(n)].map((_,i)=>{const a=i/n*Math.PI*2;return {e:{id:'arena-stone'+i,x:Math.cos(a)*R,z:Math.sin(a)*R},key:'plaza-prop',kind:'prop'};});}
/** Arena floor colour at x,z: flagstone bands and spokes inside the wall, dark beyond it. */
export function arenaTile(x,z,R){
  const r=Math.hypot(x,z);
  if(r>R-.4)return '#211d29';
  if(r>R-1.5)return '#5d4f55';
  const a=Math.atan2(z,x),spoke=r>5.2&&Math.abs(Math.sin(a*4))<.07;
  if(spoke)return '#7a6d70';
  return Math.floor(r/3.2)%2?'#6b6270':'#615968';
}
const PROJECTILE_KEYS={arrow:'arrow',bolt:'mbolt',wisp:'wisp',seed:'pumpseed'};
import {MagicClock, heldWeaponPose, skeletonFrame} from './magic/art.mjs?v=harvest-18';
import {buildMagicEffects, usesMagicEffects} from './magic/effects.mjs?v=harvest-18';
import {MagicMesh} from './magic/effects-three.mjs?v=harvest-18';
import {WeaponFx} from './fx/index.mjs?v=harvest-18';
import {orthographicHalf, viewSize, watchViewport} from './camera.mjs?v=harvest-18';
import {RARITY_COLORS, rarityOf} from './progression.mjs?v=harvest-18';
import {
  LIGHT_FIELD_ORIGIN, LIGHT_FIELD_SIZE, LIGHT_FIELD_SPAN, brightnessAt, canInspect, entityBrightness,
  frameLighting, labelOpacity, linearFromDisplay, spriteTint, warningVisible, writeLightField,
} from './lighting.mjs?v=harvest-18';
import {loadImage, loadJson, preloadThemeAssets} from './assets.mjs?v=harvest-18';
/** Art that ships in more than one version (wanderer look, Heartfire). ?look=mask&hearth=b in the URL,
 * or a saved pick, chooses; otherwise the theme default. Sprites are swapped by file suffix. */
export function themeChoice(theme, name){
  const choice=theme.choices?.[name];if(!choice)return null;
  let picked=null;
  try{picked=new URLSearchParams(globalThis.location?.search||'').get(name)||globalThis.localStorage?.getItem(`hollowstead.${name}`);}catch{}
  return choice.options[picked]?picked:choice.default;
}
export function applyThemeChoices(theme){
  for(const [name,choice] of Object.entries(theme.choices||{})){
    const option=choice.options[themeChoice(theme,name)]||{};
    for(const key of choice.keys){const def=theme.sprites[key];if(!def)continue;if(option.srcs?.[key])def.src=option.srcs[key];else if(option.suffix)def.src=def.src.replace(/\.svg(\?|$)/,`${option.suffix}.svg$1`);if(option.size)def.size=option.size;}
  }
  return theme;
}
export async function loadTheme(url=new URL('../themes/harvest/theme.json',import.meta.url)){
  const theme=await loadJson(url);theme.url=url;applyThemeChoices(theme);for(const def of Object.values(theme.sprites)){def.src=new URL(def.src,url).href;if(def.icon)def.icon=new URL(def.icon,url).href;}
  for(const[k,v]of Object.entries(theme.audio))theme.audio[k]=new URL(v,url).href;return theme;
}
/** Swarm fights spray numbers; old labels give way so the DOM stays light on phones. */
const MAX_FLOATERS=36;
/** Floater colours for 'strike' events: clean harvest strikes (rhythm.mjs) and trinket moments (trinkets.mjs). */
export const STRIKE_COLORS=Object.freeze({clean:'#ffe6a3',perfect:'#f2c14e',find:'#9fcaff',ward:'#efe6d2',fang:'#b9e2ba',thorn:'#f5c2a9'});
/**
 * Ground telegraphs and hostile shots. Pooled meshes on shared unit geometries: a swarm winding up
 * and a sky full of orbs must not allocate textures every frame.
 */
class CombatLayer {
  constructor(scene){
    this.scene=scene;this.disc=new THREE.CircleGeometry(1,44);this.ring=new THREE.RingGeometry(.9,1,56);
    this.rect=new THREE.PlaneGeometry(1,1);this.rect.translate(.5,0,0);this.cones=new Map();
    this.meshes=[];this.usedMeshes=0;this.sprites=new Map();this.usedSprites=new Map();
    const glow=(inner,outer)=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,1,32,32,32);r.addColorStop(0,'#ffffff');r.addColorStop(.28,inner);r.addColorStop(.62,outer);r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
    this.textures={orb:glow('#f3c8ff','rgba(176,108,255,.55)'),shard:glow('#dff3ff','rgba(110,184,255,.55)'),spore:glow('#eaffb8','rgba(120,196,76,.6)')};
  }
  cone(arc){let g=this.cones.get(arc);if(!g){const t=arc*Math.PI/180;g=new THREE.CircleGeometry(1,Math.max(8,Math.round(arc/6)),-t/2,t);this.cones.set(arc,g);}return g;}
  /** A rim of constant width (0.14 units) whatever the radius, so small bites read as clearly as big slams. */
  rim(radius,arc=360){const key=`${Math.round(radius*20)}:${arc}`;this.rims||=new Map();let g=this.rims.get(key);if(!g){const r=Math.round(radius*20)/20,t=Math.min(Math.PI*2,arc*Math.PI/180);g=new THREE.RingGeometry(Math.max(0,r-.14),r,Math.max(12,Math.round(48*t/(Math.PI*2))),1,arc>=360?0:-t/2,t);this.rims.set(key,g);}return g;}
  begin(){this.usedMeshes=0;for(const k of this.usedSprites.keys())this.usedSprites.set(k,0);}
  mesh(geometry,color,opacity,additive=false){
    let m=this.meshes[this.usedMeshes];
    if(!m){m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.renderOrder=-1;this.scene.add(m);this.meshes.push(m);}
    this.usedMeshes++;m.geometry=geometry;m.material.color.set(color);m.material.opacity=opacity;m.material.blending=additive?THREE.AdditiveBlending:THREE.NormalBlending;m.visible=true;m.scale.set(1,1,1);m.rotation.set(-Math.PI/2,0,0);return m;
  }
  sprite(kind){
    const list=this.sprites.get(kind)||[];this.sprites.set(kind,list);const used=this.usedSprites.get(kind)||0;
    let sp=list[used];if(!sp){sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.textures[kind]||this.textures.orb,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));sp.renderOrder=3;this.scene.add(sp);list.push(sp);}
    this.usedSprites.set(kind,used+1);sp.visible=true;return sp;
  }
  end(){for(let i=this.usedMeshes;i<this.meshes.length;i++)this.meshes[i].visible=false;for(const [kind,list] of this.sprites){const used=this.usedSprites.get(kind)||0;for(let i=used;i<list.length;i++)list[i].visible=false;}}
  /** One telegraph: faint area, bright edge, and a fill that grows as the blow nears. */
  telegraph(tg,alpha,clock){
    const hot=tg.heavy?0xd8341f:0xf0583c,edge=tg.heavy?0xff6a48:0xff9a7e,pulse=.8+Math.sin(clock*18)*.2*tg.fill;
    const y=.055;
    if(tg.shape==='circle'||tg.shape==='ring'){
      const base=this.mesh(this.disc,hot,.2*alpha);base.position.set(tg.x,y,tg.z);base.scale.setScalar(tg.radius);
      const fill=this.mesh(this.disc,hot,.42*alpha);fill.position.set(tg.x,y+.002,tg.z);fill.scale.setScalar(Math.max(.02,tg.radius*tg.fill));
      const rim=this.mesh(this.rim(tg.radius),edge,.95*alpha*pulse);rim.position.set(tg.x,y+.004,tg.z);
    }else if(tg.shape==='cone'){
      const g=this.cone(tg.arc);
      const base=this.mesh(g,hot,.2*alpha);base.position.set(tg.x,y,tg.z);base.rotation.z=-tg.angle;base.scale.setScalar(tg.radius);
      const fill=this.mesh(g,hot,.44*alpha*pulse);fill.position.set(tg.x,y+.002,tg.z);fill.rotation.z=-tg.angle;fill.scale.setScalar(Math.max(.02,tg.radius*tg.fill));
      const rim=this.mesh(this.rim(tg.radius,tg.arc),edge,.95*alpha*pulse);rim.position.set(tg.x,y+.004,tg.z);rim.rotation.z=-tg.angle;
    }else{
      const base=this.mesh(this.rect,hot,.2*alpha);base.position.set(tg.x,y,tg.z);base.rotation.z=-tg.angle;base.scale.set(tg.length,tg.width,1);
      const fill=this.mesh(this.rect,hot,.46*alpha*pulse);fill.position.set(tg.x,y+.002,tg.z);fill.rotation.z=-tg.angle;fill.scale.set(Math.max(.02,tg.length*tg.fill),tg.width*.92,1);
    }
  }
}
export class Renderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(theme.palette.background);this.magicClock=new MagicClock();this.magicMesh=new MagicMesh(this.scene);this.glowMesh=new MagicMesh(this.scene,{additive:true,order:5,capacity:65536});this.groundFxMesh=new MagicMesh(this.scene,{order:-.6,capacity:32768});this.groundGlowMesh=new MagicMesh(this.scene,{additive:true,order:-.5,capacity:49152});this.weaponFx=new WeaponFx();this.flashLevel=-1;this.combat=new CombatLayer(this.scene);this.afterimages=[];this.scenery=new SceneryLayer(this);
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
      uNightAmbient:{value:0.20},
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
  remove(o){this.scene.remove(o.sprite,o.shadow);o.sprite.material.map.dispose();o.sprite.material.dispose();if(o.glow){this.scene.remove(o.glow);o.glow.geometry.dispose();o.glow.material.dispose();}if(o.eyes){this.scene.remove(o.eyes);o.eyes.material.map.dispose();o.eyes.material.dispose();}if(o.danger){this.scene.remove(o.danger);o.danger.geometry.dispose();o.danger.material.dispose();}if(o.health){this.scene.remove(o.health.back,o.health.fill);o.health.back.material.dispose();o.health.fill.material.dispose();}this.objects.delete(o.id);}
  terrain(seed,world=null){
    if(this.ground){this.scene.remove(this.ground);this.ground.geometry.dispose();this.ground.material.map?.dispose();this.ground.material.dispose();}
    if(this.scatter){this.scene.remove(this.scatter);this.scatter.geometry.dispose();this.scatter.material.dispose();}
    if(this.arenaWall){this.scene.remove(this.arenaWall);this.arenaWall.geometry.dispose();this.arenaWall.material.dispose();this.arenaWall=null;}
    const arena=!!world?.arena,R=world?.radius||RULES.radius;
    const rng=random(seed),positions=[],colors=[];const col=new THREE.Color();const tile=arena?1:2;
    const edge=arena?R+12:RULES.radius+8;
    if(arena)for(let z=-edge;z<edge;z+=tile)for(let x=-edge;x<edge;x+=tile){
      if(arena){col.set(arenaTile(x+tile/2,z+tile/2,R));col.multiplyScalar(.97+rng()*.05);}
      else{const b=biome(x,z);col.set(this.theme.palette[b]);const path=Math.abs(x+Math.sin(z*.16)*3)<1.8||Math.abs(z-Math.sin(x*.17)*4)<1.6;
      if(path)col.lerp(new THREE.Color(this.theme.palette.path),.6);col.multiplyScalar(.92+rng()*.15);}
      for(const [a,b]of [[x,z],[x,z+tile],[x+tile,z],[x+tile,z],[x,z+tile],[x+tile,z+tile]]){positions.push(a,-.04,b);colors.push(col.r,col.g,col.b);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    if(arena)this.ground=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true}));
    else{
      // The hollow's ground (worldgen.groundColors): one texel per unit, filtered, on a single quad that runs on into the void.
      const g=groundColors(seed,this.theme.palette),n=g.size,E=g.extent,data=new Uint8Array(n*n*4);for(let q=0;q<n*n;q++){data[q*4]=g.rgb[q*3];data[q*4+1]=g.rgb[q*3+1];data[q*4+2]=g.rgb[q*3+2];data[q*4+3]=255;}
      const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;
      const F=E+160,uv=v=>(v+E)/(2*E),quad=[[-F,-F],[-F,F],[F,-F],[F,-F],[-F,F],[F,F]];geo.setAttribute('position',new THREE.Float32BufferAttribute(quad.flatMap(([x,z])=>[x,-.04,z]),3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(quad.flatMap(([x,z])=>[uv(x),uv(z)]),2));geo.deleteAttribute('color');
      this.ground=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map}));
    }
    this.bindNight(this.ground.material);this.scene.add(this.ground);
    if(arena){
      // The wall: a glowing ring at the edge of the walkable disc.
      this.arenaWall=new THREE.Mesh(new THREE.RingGeometry(R-1.12,R-.88,128),new THREE.MeshBasicMaterial({color:0xe0776b,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
      this.arenaWall.rotation.x=-Math.PI/2;this.arenaWall.position.y=.02;this.scene.add(this.arenaWall);
    }
    const pos=[],cols=[];for(let i=0;i<(arena?1400:8000);i++){const x=(rng()-.5)*2*edge,z=(rng()-.5)*2*edge,s=.05+rng()*.2;if(arena?Math.hypot(x,z)>R-1.5:!walkableAt(seed,x,z))continue;col.set(rng()<.5?'#bc9767':'#4b5350');for(const[a,b]of [[x,z],[x+s,z+s],[x-s,z+s*.6]]){pos.push(a,.001,b);cols.push(col.r,col.g,col.b);}}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));this.scatter=new THREE.Mesh(sg,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));this.bindNight(this.scatter.material);this.scene.add(this.scatter);
    this.scenery.build(seed, world);
    this.seed=seed;
  }
  glow(o,radius){if(!o.glow){o.glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.glowMap,transparent:true,depthWrite:false,opacity:.8}));o.glow.rotation.x=-Math.PI/2;this.scene.add(o.glow);}const feather=this.view?.lighting.ambientFraction||1.2;o.glow.scale.setScalar(radius*feather*2);o.glow.position.set(o.x,.03,o.z);o.glow.visible=o.sprite.visible;}
  screenPoint(x,z,y=0){const v=new THREE.Vector3(x,y,z).project(this.camera);const w=this.viewWidth||innerWidth,h=this.viewHeight||innerHeight;return {x:(v.x*.5+.5)*w,y:(-.5*v.y+.5)*h};}
  worldPoint(x,y){const w=this.viewWidth||innerWidth,h=this.viewHeight||innerHeight;this.ray.setFromCamera(new THREE.Vector2(x/w*2-1,1-y/h*2),this.camera);const p=new THREE.Vector3();return this.ray.ray.intersectPlane(this.groundPlane,p)?{x:p.x,z:p.z}:null;}
  pick(x,y,world){
    const viewer=this.localId&&world.player?world.player(this.localId):null;
    let best=null,dist=44;
    for(const e of [...world.nodes.filter(n=>!n.ready&&nodeAwake(n,world.time)),...world.buildings,...world.drops,...world.enemies,...magicVisuals(world).map(entry=>entry.entity)]){
      if(this.view&&!canInspect(this.view, e.x, e.z, viewer, RULES.reach))continue;
      const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}
    }
    return best;
  }
  float(text,x,z,color='#f8dfb3',opts={}){if(!text)return;const el=document.createElement('div');el.className=opts.className||'world-label';el.textContent=text;el.style.color=color;document.getElementById('world-labels').append(el);this.floaters.push({el,x,z,life:0,alwaysVisible:!!opts.alwaysVisible});while(this.floaters.length>MAX_FLOATERS){const old=this.floaters.shift();old.el.remove();}}
  effect(event,world=null){
    this.weaponFx.event(event,this.clock,world);
    if(event.type==='hit')for(const o of this.objects.values())if(Math.hypot(o.x-event.x,o.z-event.z)<.2)o.hitUntil=this.clock+.22;
    if(['loot','damage','heal','build','craft'].includes(event.type))this.float(event.text,event.x,event.z,event.type==='damage'?'#f5c2a9':event.type==='heal'?'#b9e2ba':'#fbe1ad');
    if(event.type==='hurt')this.float(event.text,event.x,event.z,'#e53935',{className:'world-label player-hurt',alwaysVisible:true});
    if(event.type==='rare')this.float(`✦ ${event.text}`,event.x,event.z,RARITY_COLORS[rarityOf(event.itemId)]);
    if(event.type==='levelup')this.float(`LEVEL UP · ${event.text}`,event.x,event.z,'#f2c14e');
    if(event.type==='discover')this.float(event.text,event.x,event.z,'#d4fff5');
    if(event.type==='freeze')this.float(event.text,event.x,event.z,'#d6f1ff');
    if(event.type==='rankup')this.float(`✦ ${event.text}`,event.x,event.z,'#f2c14e',{alwaysVisible:true});
    if(event.type==='swap')this.float(event.text,event.x,event.z,'#f0dfbd',{className:'world-label swap-label',alwaysVisible:event.player===this.localId});
    if(event.type==='dodge')this.float(event.text,event.x,event.z,'#bfe8ff',{className:'world-label dodge-label',alwaysVisible:event.player===this.localId});
    if(event.type==='strike')this.float(event.text,event.x,event.z,STRIKE_COLORS[event.kind]||STRIKE_COLORS.clean,{className:`world-label strike-label strike-${event.kind||'clean'}`,alwaysVisible:event.player===this.localId}); // rhythm.mjs / trinkets.mjs
    if(event.type==='dash'){const body=this.objects.get('player'+event.player);if(body){for(let i=0;i<4;i++){const ghost=new THREE.Sprite(body.sprite.material.clone());ghost.center.copy(body.sprite.center);ghost.scale.copy(body.sprite.scale);const t=i/4;ghost.position.set(event.x+(event.dx||0)*DASH.distance*t,body.sprite.position.y,event.z+(event.dz||0)*DASH.distance*t);ghost.material.color.set('#9fd0ff');ghost.material.opacity=0;ghost.renderOrder=1;this.scene.add(ghost);this.afterimages.push({sprite:ghost,life:-t*DASH.time});}}}
    if(event.type==='quake'||event.type==='splat'){const mat=new THREE.MeshBasicMaterial({color:event.type==='quake'?0xff8a5c:0x9fdc6a,transparent:true,depthWrite:false,side:THREE.DoubleSide});const arc=Math.min(Math.PI*2,(event.arc||360)*Math.PI/180);const geo=arc<Math.PI*1.99?new THREE.RingGeometry(.72,1,36,1,-(event.angle||0)-arc/2,arc):new THREE.RingGeometry(.8,1,48);const mesh=new THREE.Mesh(geo,mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,radius:event.radius||1.5});}
    if(['slash','cleave'].includes(event.type)){const arc=Math.min(Math.PI*1.9,(event.arc||120)*Math.PI/180),range=event.range||2.5,phi=Math.atan2(event.dz||0,event.dx||1);const geo=new THREE.RingGeometry(range*.5,range*.98,28,1,-phi-arc/2,arc);geo.setDrawRange(0,0);const mat=new THREE.MeshBasicMaterial({color:event.type==='cleave'?0xffe0b0:0xfff4e2,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.5,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,fixed:true,sweep:28});}
    if(['chain','lash'].includes(event.type)){const pts=event.type==='chain'?(event.points||[]).map(([x,z])=>new THREE.Vector3(x,.9,z)):[new THREE.Vector3(event.x,.9,event.z),new THREE.Vector3(event.x+(event.dx||0)*(event.range||4),.9,event.z+(event.dz||0)*(event.range||4))];if(pts.length>1){const bent=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];for(let k=0;k<6;k++){const t=k/6;bent.push(new THREE.Vector3(a.x+(b.x-a.x)*t+(k?(Math.random()-.5)*.35:0),.9+(k?(Math.random()-.5)*.3:0),a.z+(b.z-a.z)*t+(k?(Math.random()-.5)*.35:0)));}}bent.push(pts[pts.length-1]);const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(bent),new THREE.LineBasicMaterial({color:event.type==='chain'?0xbfe8ff:0xc49bff,transparent:true,depthWrite:false}));this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,fixed:true});}}
    if(['frost','freeze','summon','poof','rend','portal'].includes(event.type)){const color={starfall:0xf2c14e,mark:0xf2c14e,frost:0xbfe8ff,freeze:0xe2f6ff,summon:0x9fd8a8,poof:0x9fd8a8,rend:0xd0504a,portal:0xb784ff}[event.type];const mat=new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,radius:event.radius||({freeze:.9,summon:1.1,poof:.8,rend:1}[event.type]||1)});}
    if(['nova','burst'].includes(event.type)){const mat=new THREE.MeshBasicMaterial({color:event.type==='nova'?0xf4a64a:0x7fd6c4,transparent:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z,radius:event.radius||2});}
    if(!event.magicPack&&['hit','kill','hurt','build','craft','impact','bolt'].includes(event.type)){
      const mat=new THREE.MeshBasicMaterial({color:event.type==='hurt'?0xd97773:event.type==='bolt'?0xa7e5d8:0xf4c486,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(new THREE.RingGeometry(.06,.2,10),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type,x:event.x,z:event.z});
    }
  }
  paintPlaza(world,frame){
    const hearth=world.buildings.find(b=>b.type==='hearth')||(world.arena?{x:0,z:0,level:1}:null);
    if(!hearth||!this.textures.has('plaza')){if(this.plaza){this.plaza.base.visible=false;if(this.plaza.glow)this.plaza.glow.visible=false;}return;}
    if(!this.plaza){const size=this.theme.sprites.plaza.size[0];const mk=(key,add)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({map:this.textures.get(key),transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));m.rotation.x=-Math.PI/2;m.renderOrder=add?-1:-2;this.scene.add(m);return m;};this.plaza={base:mk('plaza'),glow:this.textures.has('plaza-glow')?mk('plaza-glow',true):null};}
    const {base,glow}=this.plaza;base.visible=true;base.position.set(hearth.x,.012,hearth.z);base.material.color.setScalar(Math.min(1,entityBrightness(frame,hearth.x,hearth.z,{emissive:true})));
    if(glow){glow.visible=true;glow.position.set(hearth.x,.015,hearth.z);glow.material.opacity=(.12+.5*frame.darkness)*(.75+.25*Math.sin(this.clock*1.6));}
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
    // A weapon mid-skill (skills.mjs) burns brighter than the wielder.
    o.sprite.material.color.copy(body.sprite.material.color).lerp(new THREE.Color('#ffffff'),pose.skilling?.7:.25);
    return id;
  }
  /** A brief full-screen wash on the biggest weapon moments (src/fx). A DOM layer, so both renderers share it. */
  paintFlash(weapon){
    const level=weapon?Math.round(weapon.flash*100)/100:0;
    if(level===this.flashLevel)return;this.flashLevel=level;
    const el=document.getElementById('fx-flash');if(!el)return;
    el.style.opacity=String(level);if(level>0)el.style.setProperty('--flash',weapon.flashColor||'#fff3cf');
  }
  /** Hostile orbs, shards and lobbed spores. Extrapolated between 20 Hz ticks so bullets glide. */
  paintShots(world,dt){
    const seen=new Set();this.shotState||=new Map();
    for(const s of hostileShots(world)){
      if(Math.abs(s.x-this.focus.x)>27||Math.abs(s.z-this.focus.z)>31)continue;
      if(s.kind==='spore'){
        this.combat.telegraph({shape:'circle',x:s.x,z:s.z,radius:s.radius,fill:s.fill,heavy:false},.9,this.clock);
        const t=s.fill,bx=s.sx+(s.x-s.sx)*t,bz=s.sz+(s.z-s.sz)*t,by=.5+Math.sin(Math.PI*t)*3.2;
        const blob=this.combat.sprite('spore');blob.position.set(bx,by,bz);blob.scale.set(1.2,1.2,1);blob.material.opacity=.95;continue;
      }
      seen.add(s.id);let st=this.shotState.get(s.id);
      if(!st||st.x!==s.x||st.z!==s.z){st={x:s.x,z:s.z,since:0};this.shotState.set(s.id,st);}else st.since+=dt;
      const lead=Math.min(st.since,.07),x=s.x+(s.vx||0)*lead,z=s.z+(s.vz||0)*lead;
      const glow=this.combat.sprite(s.kind==='shard'?'shard':'orb'),r=s.radius*3.1;glow.position.set(x,.5,z);glow.scale.set(r,r,1);glow.material.opacity=1;
      const shade=this.combat.mesh(this.combat.disc,0x1a1224,.3);shade.position.set(x,.03,z);shade.scale.setScalar(s.radius*.95);
    }
    for(const id of this.shotState.keys())if(!seen.has(id))this.shotState.delete(id);
  }
  paintAfterimages(dt){
    // Each ghost appears as the dash passes its spot, then fades: a streak that trails the wanderer.
    this.afterimages=this.afterimages.filter(a=>{a.life+=dt;a.sprite.material.opacity=a.life<0?0:Math.max(0,.55*(1-a.life/.3));if(a.life>.3){this.scene.remove(a.sprite);a.sprite.material.dispose();return false;}return true;});
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;this.magicFrame=this.magicClock.sample(world,this.clock);this.localId=localId;const terrainKey=`${world.seed}:${world.arena?'arena':'world'}`;if(this.terrainKey!==terrainKey){this.terrainKey=terrainKey;this.terrain(world.seed,world);this.weaponFx.reset();for(const o of [...this.objects.values()])this.remove(o);this.lastEvent=0;this.ghost=null;}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};const fx=demo?0:p.x,fz=demo?-1:p.z;
    this.focus.x+=(fx-this.focus.x)*Math.min(1,dt*6);this.focus.z+=(fz-this.focus.z)*Math.min(1,dt*6);
    // Weapon effects first: their camera kick and their light on the night ground belong to this frame.
    const weapon=demo?null:this.weaponFx.build(world,this.magicFrame,this.clock,dt,this.focus);
    const kick=weapon?.shake>0?weapon.shake*.32:0,kx=kick?(Math.sin(this.clock*71)+Math.sin(this.clock*43))*kick*.5:0,kz=kick?(Math.sin(this.clock*59+1)+Math.sin(this.clock*31))*kick*.5:0;
    this.camera.position.set(this.focus.x+kx,28,this.focus.z+27+kz);this.camera.lookAt(this.focus.x+kx,0,this.focus.z+kz);this.camera.updateMatrixWorld();
    const frame=frameLighting(world, this.theme, world.player(localId)||null);if(weapon?.lights.length)frame.sources.push(...weapon.lights);this.view=frame;this.paintField(frame);this.paintFlash(weapon);
    const bg=new THREE.Color(this.theme.palette.background).lerp(new THREE.Color(frame.lighting.nightTint), frame.darkness);this.scene.background.copy(bg);this.scene.fog.color.copy(bg);
    this.paintPlaza(world,frame);this.scenery.update(world,frame,dt,this.focus);this.combat.begin();
    const alive=new Set();const entities=[...world.nodes.filter(n=>!n.ready&&nodeAwake(n,world.time)).map(e=>({e,key:spriteVariant(this.theme,e.type,e),kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:itemSpriteKey(e.stack?.itemId),kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...(world.projectiles||[]).map(e=>({e,key:PROJECTILE_KEYS[e.kind]||'mbolt',kind:'projectile'})),...(world.allies||[]).map(e=>({e,key:e.type,kind:'ally'})),...(world.zones||[]).filter(e=>e.kind!=='star').map(e=>({e,key:'frostcloud',kind:'zone'})),...magicVisuals(world).filter(entry=>!usesMagicEffects(entry.entity)).map(entry=>({e:entry.entity,key:entry.key,kind:'magic'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'})),...plazaProps(world,this.theme),...arenaProps(world,this.theme)];
    entities.sort((a,b)=>Number(a.kind==='drop')-Number(b.kind==='drop'));
    for(const {e,key,kind}of entities){
      if(kind==='drop'&&!this.theme.sprites[key])continue;
      const id=kind+e.id;alive.add(id);let o=this.objects.get(id);const visible=Math.abs(e.x-this.focus.x)<25&&Math.abs(e.z-this.focus.z)<29;if(!visible&&!o){alive.delete(id);continue;}if(!o||o.key!==key){if(o)this.remove(o);o=this.sprite(key,id);}o.sprite.visible=o.shadow.visible=visible;if(o.glow)o.glow.visible=visible;if(o.danger)o.danger.visible=false;if(o.eyes)o.eyes.visible=visible;if(o.health){o.health.back.visible=o.health.fill.visible=false;}if(!visible)continue;
      const present=kind==='drop'?this.dropMotion.sample(e,world,this.clock,dt,id=>{const body=this.objects.get('player'+id);return body?.initialized?{x:body.x,z:body.z}:null;}):null;
      const tx=present?present.x:e.x, tz=present?present.z:e.z;
      const smooth=(['player','enemy','magic','ally'].includes(kind)||key==='cart')&&!demo?Math.min(1,dt*(e.id===localId||(key==='cart'&&e.towedBy===localId)?22:13)):1;
      if(!o.initialized){o.x=tx;o.z=tz;o.initialized=true;}else{o.x+=(tx-o.x)*smooth;o.z+=(tz-o.z)*smooth;}
      const special=kind==='ally'?(e.anim||'idle'):magicClipName(e, kind),moving=special?special==='walk':e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=special||(e.down||e.ghost?'down':kind==='enemy'?(e.windup>0||e.act>0?'attack':'walk'):e.action||'idle'),clip=o.def.clips[clipName]||o.def.clips.walk||o.def.clips.attack||o.def.clips.idle;
      const cols=o.def.columns||1,rows=o.def.rows||1,frameIndex=key==='gravecraft-skeleton'?skeletonFrame(e,this.magicFrame.lead,o.def):Number.isInteger(e.frame)?e.frame%Math.max(1,cols*rows):clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length];
      o.sprite.material.map.offset.set((frameIndex%cols)/cols,1-1/rows-Math.floor(frameIndex/cols)/rows);
      // A hand cart shows its handle on the puller's side. Sprites ignore a negative scale, so mirror the sheet cell instead.
      if(key==='cart'){const mirror=e.face===1;o.sprite.material.map.repeat.x=(mirror?-1:1)/cols;if(mirror)o.sprite.material.map.offset.x+=1/cols;}
      const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob:kind==='enemy'&&key==='wraith'?.2+Math.sin(this.clock*3)*.1:0;
      let sx=o.def.size[0],sy=o.def.size[1];if(kind==='drop'){sx=.85;sy=1.28;if(present?.t){sx*=1-present.t*0.35;sy*=1-present.t*0.35;}}
      if(e.down||e.ghost){sx*=.8;sy*=.65;}
      if(kind==='enemy'&&e.elite){sx*=1.3;sy*=1.3;}
      if(key==='gravecraft-skeleton')sy*=Math.min(1,((e.age||0)+this.magicFrame.lead)/.24);
      if(o.hitUntil>this.clock){const squash=Math.sin((o.hitUntil-this.clock)*14)*(motion.hitSquash||0);sx*=1+squash;sy*=1-squash;}
      const flip=(kind==='player'&&e.dx<-.1)||((kind==='magic'||kind==='ally')&&e.facing===-1)||(kind==='enemy'&&e.face===-1);
      o.sprite.scale.set(flip?-sx:sx,sy,1);o.sprite.position.set(o.x,bob+(present?.y||0)+(kind==='projectile'?.9:0),o.z);if(kind==='projectile')o.shadow.visible=false;o.shadow.position.set(o.x,.018,o.z);
      if(kind==='zone'){o.shadow.visible=false;if(e.kind==='star'){const fall=Math.max(0,1-e.age/e.delay);o.sprite.position.y=.4+fall*9;o.sprite.position.x=o.x+fall*3;}else{const life=Math.min(1,e.age*3)*Math.min(1,(e.life-e.age)*2);o.sprite.scale.set(sx*e.radius/1.3,sy*e.radius/1.3,1);o.sprite.position.y=-.2;o.sprite.material.opacity=.8*life;}}
      if(kind==='ally'&&ALLIES[key]?.fly){o.sprite.position.y=.9+Math.sin(this.clock*6+e.x)*.15;}
      if(kind==='projectile')o.sprite.material.rotation=-(e.aim||0);
      else if(Number.isFinite(e.aim))o.sprite.material.rotation=e.aim;
      else{o.sprite.material.rotation=moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;if(['attack','gather'].includes(e.action)&&e.actionUntil>world.time)o.sprite.material.rotation=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);}
      const emissive=(kind==='building'&&STRUCTURES[key]?.light&&(key==='lantern'||e.fuel>0))||(kind==='player'&&equippedLanternLit(e))||(kind==='node'&&!!nightGlow(e));
      let display=entityBrightness(frame, o.x, o.z, {local:kind==='player'&&e.id===localId, emissive});
      if(kind==='building'&&STRUCTURES[key]?.light&&key!=='lantern'&&!(e.fuel>0))display*=0.45;
      const lamp=brightnessAt(frame.sources, o.x, o.z, 1, frame.lighting);
      const lampStrength=lamp>frame.lighting.ambientNight?Math.min(1,(lamp-frame.lighting.ambientNight)/Math.max(0.01, frame.lighting.litBrightness-frame.lighting.ambientNight)):0;
      this.shadeSprite(o.sprite.material, display, lampStrength, frame.darkness, frame.lighting);
      if(kind==='enemy'&&e.stunned>0)o.sprite.material.color.lerp(new THREE.Color('#bfe8ff'), .65);
      if(kind==='enemy'&&this.textures.has('glow-'+key)){if(!o.eyes){const gdef=this.theme.sprites['glow-'+key],tex=this.textures.get('glow-'+key).clone();tex.needsUpdate=true;tex.repeat.set(1/(gdef.columns||1),1/(gdef.rows||1));o.eyes=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));o.eyes.center.copy(o.sprite.center);this.scene.add(o.eyes);}o.eyes.material.map.offset.copy(o.sprite.material.map.offset);o.eyes.scale.copy(o.sprite.scale);o.eyes.position.set(o.sprite.position.x,o.sprite.position.y+.03,o.sprite.position.z+.03);o.eyes.material.rotation=o.sprite.material.rotation;o.eyes.visible=o.sprite.visible;o.eyes.material.opacity=glowStrength(frame.darkness,e,this.clock);}
      if(kind==='building'&&key==='farm'&&e.growth>=100&&display>0.55)o.sprite.material.color.lerp(new THREE.Color('#efd394'), .45);
      if(kind!=='zone')o.sprite.material.opacity=e.ghost?.4:kind==='ally'?Math.min(1,e.spawn*4,(e.life-e.age)*2):key==='gravecraft-skeleton'?Math.min(1,Math.max(0,(24-(e.age||0)-this.magicFrame.lead)/.4)):kind==='node'&&e.type==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
      const fade=labelOpacity(display, frame.darkness, frame.lighting);
      if(kind==='building'&&STRUCTURES[key].light){const lit=key==='lantern'||e.fuel>0;this.glow(o,STRUCTURES[key].light+(key==='hearth'?(e.level-1)*1.5:0));o.glow.visible=lit&&visible;o.glow.material.opacity=lit?(.12+frame.darkness*.16)*(1+Math.sin(this.clock*9)*.05):0;}
      if(kind==='player'){const pool=frame.sources.find(source=>source.kind==='player'&&source.id===e.id);if(pool){this.glow(o,pool.radius);o.glow.material.opacity=.1+frame.darkness*.12;}else if(o.glow)o.glow.visible=false;const held=this.syncHeldWeapon(e,o,world);if(held)alive.add(held);}
      // Night-only finds (regions.mjs) glow in the dark so they can be found from afar.
      if(kind==='node'){const hue=nightGlow(e);if(hue){this.glow(o,1.1);o.glow.material.color.set(hue);o.glow.material.opacity=(.16+.42*frame.darkness)*(.8+.2*Math.sin(this.clock*2.4+e.x));}}
      if(kind==='building'&&key==='gate'&&e.open)o.sprite.scale.x*=.35;
      if((kind==='enemy'||kind==='building'||(kind==='ally'&&key!=='crow'))&&e.hp<e.maxHp&&fade>0.04){if(!o.health){const back=new THREE.Sprite(new THREE.SpriteMaterial({color:0x302834,transparent:true,depthWrite:false})),fill=new THREE.Sprite(new THREE.SpriteMaterial({color:kind==='enemy'?0xdf9383:kind==='ally'?0x9fd8a8:0xd2c395,transparent:true,depthWrite:false}));fill.center.set(0,.5);this.scene.add(back,fill);o.health={back,fill};}const y=kind==='ally'?({wight:4.3,jack:2.4}[key]||1.6):(kind==='enemy'?({king:5.4,brute:3.3,wraith:2.2,golem:3.4,bonewalker:2.4,bogling:1.6}[key]||1.3)*(e.elite?1.3:1):key==='hearth'?3.6:1.8);o.health.back.position.set(o.x,y,o.z);o.health.fill.position.set(o.x-.65,y,o.z+.025);o.health.back.scale.set(1.4,.1,1);o.health.fill.scale.set(1.3*Math.max(0,e.hp/e.maxHp),.055,1);o.health.back.material.opacity=o.health.fill.material.opacity=fade;o.health.back.visible=o.health.fill.visible=true;}
      if(kind==='enemy'){const tg=telegraphOf(e);if(tg){const reach=tg.radius||tg.length||2;if(warningVisible(frame, tg.x, tg.z, reach, p))this.combat.telegraph(tg,frame.darkness>0.5?.75:1,this.clock);
        // The creature itself brightens as its blow comes due.
        o.sprite.material.color.lerp(new THREE.Color(tg.heavy?'#ffb3a0':'#fff1e0'),.15+.35*tg.fill);}}
    }
    (this.ropes||=new RopeLayer(this.scene)).update(world,this.objects,frame,this.theme);
    for(const o of this.objects.values())if(!alive.has(o.id)&&o!==this.ghost)this.remove(o);
    this.paintShots(world,dt);this.combat.end();this.paintAfterimages(dt);
    this.dropMotion.retain(new Set(world.drops.map(drop=>drop.id)));
    const markerFade=target?this.reveal(target.x, target.z):0;
    this.marker.visible=!!target&&!placement&&markerFade>0.05;if(target){this.marker.position.set(target.x,.04,target.z);this.marker.rotation.z=this.clock*.3;this.marker.material.opacity=.8*markerFade;}
    const goalFade=p.goal?Math.max(this.reveal(p.goal.x, p.goal.z), distance(p, p.goal)<8?.28:0):0;
    this.pathMarker.visible=!!p.goal&&goalFade>0.04;if(p.goal){this.pathMarker.position.set(p.goal.x,.03,p.goal.z);this.pathMarker.material.opacity=.7*goalFade;}
    if(placement){if(!this.ghost||this.ghost.key!==placement.key){if(this.ghost)this.remove(this.ghost);this.ghost=this.sprite(placement.key,'preview');}this.ghost.sprite.position.set(placement.x,0,placement.z);this.ghost.sprite.material.color.set(placement.valid?'#c8e5a6':'#dd7471');this.ghost.sprite.material.opacity=.7;this.ghost.shadow.visible=false;this.ghost.sprite.visible=true;}else if(this.ghost){this.remove(this.ghost);this.ghost=null;}
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2)this.effect(ev,world);this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;const fade=this.reveal(e.x, e.z);if(e.sweep)e.mesh.geometry.setDrawRange(0,6*Math.ceil(e.sweep*Math.min(1,e.life/.1)));if(!e.fixed)e.mesh.scale.setScalar(e.radius?.3+Math.min(1,e.life*3)*e.radius:1+e.life*(e.type==='impact'?12:4));e.mesh.material.opacity=Math.max(0,1-e.life*(e.sweep?3.2:2))*fade*(e.sweep?.55:1);if(e.life>.5){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();return false;}return true;});
    this.floaters=this.floaters.filter(f=>{f.life+=dt;const s=this.screenPoint(f.x,f.z,1+f.life*.7);f.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;f.el.style.opacity=String(Math.min(1,(1.8-f.life)*2)*(f.alwaysVisible?1:this.reveal(f.x, f.z)));if(f.life>1.8){f.el.remove();return false;}return true;});
    const magic=buildMagicEffects(world,this.magicFrame,this.theme);if(weapon?.normal.length)magic.push(...weapon.normal);
    this.magicMesh.update(magic);this.glowMesh.update(weapon?.glow||[]);this.groundFxMesh.update(weapon?.groundNormal||[]);this.groundGlowMesh.update(weapon?.groundGlow||[]);
    this.gl.render(this.scene,this.camera);
  }
}
