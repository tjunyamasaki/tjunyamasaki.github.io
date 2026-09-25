import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {NODES,STRUCTURES,RULES,phaseAt} from './content.mjs?v=harvest-10';
import {random,biome,distance,createDropMotion} from './engine.mjs?v=harvest-10';
import {equippedLanternLit,itemSpriteKey} from './inventory.mjs?v=harvest-10';
export async function loadTheme(url=new URL('../themes/harvest/theme.json',import.meta.url)){
  const response=await fetch(url);if(!response.ok)throw new Error('The harvest art could not be loaded. Please reload.');
  const theme=await response.json();theme.url=url;for(const def of Object.values(theme.sprites))def.src=new URL(def.src,url).href;
  for(const[k,v]of Object.entries(theme.audio))theme.audio[k]=new URL(v,url).href;return theme;
}
export class Renderer {
  constructor(canvas,theme){
    this.canvas=canvas;this.theme=theme;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(theme.palette.background);
    this.scene.fog=new THREE.FogExp2(theme.palette.background,.009);this.camera=new THREE.OrthographicCamera(-15,15,15,-15,.1,180);
    this.gl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.gl.setPixelRatio(Math.min(devicePixelRatio,1.6));this.gl.outputColorSpace=THREE.SRGBColorSpace;
    this.objects=new Map();this.textures=new Map();this.materials=new Map();this.effects=[];this.floaters=[];this.focus=new THREE.Vector3();this.zoom=1;this.lastEvent=0;this.seed=null;this.clock=0;this.dropMotion=createDropMotion();
    this.ray=new THREE.Raycaster();this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.v=new THREE.Vector3();
    this.shadowGeo=new THREE.CircleGeometry(1,16);this.shadowMat=new THREE.MeshBasicMaterial({color:0x241e2c,transparent:true,opacity:.19,depthWrite:false});
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,217,149,.5)');g.addColorStop(.5,'rgba(239,176,100,.22)');g.addColorStop(1,'rgba(240,163,93,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);this.glowMap=new THREE.CanvasTexture(c);
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.85,1,40),new THREE.MeshBasicMaterial({color:theme.palette.accent,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.scene.add(this.marker);
    this.ghost=null;this.pathMarker=new THREE.Mesh(new THREE.RingGeometry(.16,.22,20),new THREE.MeshBasicMaterial({color:0xeadaba,transparent:true,opacity:.7,side:THREE.DoubleSide}));this.pathMarker.rotation.x=-Math.PI/2;this.pathMarker.visible=false;this.scene.add(this.pathMarker);
    this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize);this.resize();
  }
  async preload(){const loader=new THREE.TextureLoader();await Promise.all(Object.entries(this.theme.sprites).map(async([key,def])=>{const map=await loader.loadAsync(def.src);map.colorSpace=THREE.SRGBColorSpace;map.minFilter=THREE.LinearFilter;map.magFilter=THREE.LinearFilter;this.textures.set(key,map);}));}
  resize(){const w=innerWidth,h=innerHeight;this.gl.setSize(w,h,false);const aspect=w/h,half=aspect<.85?12:13;this.camera.left=-half*aspect/this.zoom;this.camera.right=half*aspect/this.zoom;this.camera.top=half/this.zoom;this.camera.bottom=-half/this.zoom;this.camera.updateProjectionMatrix();}
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
    for(let z=-44;z<44;z+=tile)for(let x=-44;x<44;x+=tile){
      const b=biome(x,z);col.set(this.theme.palette[b]);const path=Math.abs(x+Math.sin(z*.16)*3)<1.8||Math.abs(z-Math.sin(x*.17)*4)<1.6;
      if(path)col.lerp(new THREE.Color(this.theme.palette.path),.6);col.multiplyScalar(.92+rng()*.15);
      for(const [a,b]of [[x,z],[x,z+tile],[x+tile,z],[x+tile,z],[x,z+tile],[x+tile,z+tile]]){positions.push(a,-.04,b);colors.push(col.r,col.g,col.b);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.ground=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true}));this.scene.add(this.ground);
    const pos=[],cols=[];for(let i=0;i<1700;i++){const x=(rng()-.5)*84,z=(rng()-.5)*84,s=.05+rng()*.2;col.set(rng()<.5?'#bc9767':'#4b5350');for(const[a,b]of [[x,z],[x+s,z+s],[x-s,z+s*.6]]){pos.push(a,.001,b);cols.push(col.r,col.g,col.b);}}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));this.scatter=new THREE.Mesh(sg,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));this.scene.add(this.scatter);
    this.seed=seed;
  }
  glow(o,radius){if(!o.glow){o.glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.glowMap,transparent:true,depthWrite:false,opacity:.8}));o.glow.rotation.x=-Math.PI/2;this.scene.add(o.glow);}o.glow.scale.setScalar(radius*2);o.glow.position.set(o.x,.03,o.z);o.glow.visible=o.sprite.visible;}
  screenPoint(x,z,y=0){const v=new THREE.Vector3(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight};}
  worldPoint(x,y){this.ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),this.camera);const p=new THREE.Vector3();return this.ray.ray.intersectPlane(this.groundPlane,p)?{x:p.x,z:p.z}:null;}
  pick(x,y,world){let best=null,dist=44;for(const e of [...world.nodes.filter(n=>!n.ready),...world.buildings,...world.drops,...world.enemies]){const s=this.screenPoint(e.x,e.z,.6),d=Math.hypot(x-s.x,y-s.y);if(d<dist){best=e;dist=d;}}return best;}
  float(text,x,z,color='#f8dfb3'){if(!text)return;const el=document.createElement('div');el.className='world-label';el.textContent=text;el.style.color=color;document.getElementById('world-labels').append(el);this.floaters.push({el,x,z,life:0});}
  effect(event){
    if(event.type==='hit')for(const o of this.objects.values())if(Math.hypot(o.x-event.x,o.z-event.z)<.2)o.hitUntil=this.clock+.22;
    if(['loot','damage','heal','build','craft'].includes(event.type))this.float(event.text,event.x,event.z,event.type==='damage'?'#f5c2a9':event.type==='heal'?'#b9e2ba':'#fbe1ad');
    if(['hit','kill','hurt','build','craft','impact','bolt'].includes(event.type)){
      const mat=new THREE.MeshBasicMaterial({color:event.type==='hurt'?0xd97773:event.type==='bolt'?0xa7e5d8:0xf4c486,transparent:true,depthWrite:false});const mesh=new THREE.Mesh(new THREE.RingGeometry(.06,.2,10),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,.1,event.z);this.scene.add(mesh);this.effects.push({mesh,life:0,type:event.type});
    }
  }
  render(world,localId,dt,{target=null,placement=null,demo=false}={}){
    this.clock+=dt;if(this.seed!==world.seed){this.terrain(world.seed);for(const o of [...this.objects.values()])this.remove(o);this.lastEvent=0;this.ghost=null;}
    const p=world.player(localId)||world.players[0]||{x:0,z:2};const fx=demo?0:p.x,fz=demo?-1:p.z;
    this.focus.x+=(fx-this.focus.x)*Math.min(1,dt*6);this.focus.z+=(fz-this.focus.z)*Math.min(1,dt*6);this.camera.position.set(this.focus.x,28,this.focus.z+27);this.camera.lookAt(this.focus.x,0,this.focus.z);this.camera.updateMatrixWorld();
    const t=world.time%RULES.cycle,night=t>=180?Math.min(1,(t-180)/7):t>150?(t-150)/30*.7:0;
    const groundColor=new THREE.Color('#ffffff').lerp(new THREE.Color('#555775'),night*.73);this.ground.material.color.copy(groundColor);this.scatter.material.color.copy(groundColor);
    const bg=new THREE.Color(this.theme.palette.background).lerp(new THREE.Color('#191b2b'),night);this.scene.background.copy(bg);this.scene.fog.color.copy(bg);
    const alive=new Set();const entities=[...world.nodes.filter(n=>!n.ready).map(e=>({e,key:e.type,kind:'node'})),...world.buildings.map(e=>({e,key:e.type,kind:'building'})),...world.drops.map(e=>({e,key:itemSpriteKey(e.stack?.itemId),kind:'drop'})),...world.enemies.map(e=>({e,key:e.type,kind:'enemy'})),...world.players.filter(e=>e.online).map(e=>({e,key:e.character,kind:'player'}))];
    entities.sort((a,b)=>Number(a.kind==='drop')-Number(b.kind==='drop'));
    for(const {e,key,kind}of entities){
      if(kind==='drop'&&!this.theme.sprites[key])continue;
      const id=kind+e.id;alive.add(id);let o=this.objects.get(id);if(!o||o.key!==key){if(o)this.remove(o);o=this.sprite(key,id);}const visible=Math.abs(e.x-this.focus.x)<25&&Math.abs(e.z-this.focus.z)<29;o.sprite.visible=o.shadow.visible=visible;if(o.glow)o.glow.visible=visible;if(o.danger)o.danger.visible=visible&&e.windup>0;if(o.health){o.health.back.visible=o.health.fill.visible=visible&&e.hp<e.maxHp;}if(!visible)continue;
      const present=kind==='drop'?this.dropMotion.sample(e,world,this.clock,dt,id=>{const body=this.objects.get('player'+id);return body?.initialized?{x:body.x,z:body.z}:null;}):null;
      const tx=present?present.x:e.x, tz=present?present.z:e.z;
      const smooth=['player','enemy'].includes(kind)&&!demo?Math.min(1,dt*(e.id===localId?22:13)):1;
      if(!o.initialized){o.x=tx;o.z=tz;o.initialized=true;}else{o.x+=(tx-o.x)*smooth;o.z+=(tz-o.z)*smooth;}
      const moving=e.action==='walk'||kind==='enemy',motion=this.theme.motion,clipName=e.down||e.ghost?'down':kind==='enemy'?(e.windup>0?'attack':'walk'):e.action||'idle',clip=o.def.clips[clipName]||o.def.clips.idle;
      const frame=clip.frames[Math.floor(this.clock*(clip.fps||1))%clip.frames.length],cols=o.def.columns||1,rows=o.def.rows||1;
      o.sprite.material.map.offset.set((frame%cols)/cols,1-1/rows-Math.floor(frame/cols)/rows);
      const bob=moving?Math.abs(Math.sin(this.clock*10+e.x))*motion.walkBob:kind==='enemy'&&key==='wraith'?.2+Math.sin(this.clock*3)*.1:0;
      let sx=o.def.size[0],sy=o.def.size[1];if(kind==='drop'){sx=.85;sy=1.28;if(present?.t){sx*=1-present.t*0.35;sy*=1-present.t*0.35;}}
      if(e.down||e.ghost){sx*=.8;sy*=.65;}
      if(o.hitUntil>this.clock){const squash=Math.sin((o.hitUntil-this.clock)*14)*(motion.hitSquash||0);sx*=1+squash;sy*=1-squash;}
      o.sprite.scale.set(kind==='player'&&e.dx<-.1?-sx:sx,sy,1);o.sprite.position.set(o.x,bob+(present?.y||0),o.z);o.shadow.position.set(o.x,.018,o.z);o.sprite.material.rotation=moving?Math.sin(this.clock*10)*motion.walkTilt:Math.sin(this.clock*1.8+e.x)*motion.idleSway;
      if(['attack','gather'].includes(e.action)&&e.actionUntil>world.time)o.sprite.material.rotation=motion.attackTilt*Math.sin((e.actionUntil-world.time)*12);
      o.sprite.material.color.set('#ffffff');if(night){o.sprite.material.color.lerp(new THREE.Color('#737b9f'),night*.7);if(world.lit(e))o.sprite.material.color.lerp(new THREE.Color('#fff0c8'),.6);}
      o.sprite.material.opacity=e.ghost?.4:key==='tree'&&e.z>p.z&&distance(e,p)<4?.38:1;
      if(kind==='building'&&STRUCTURES[key].light){const lit=key==='lantern'||e.fuel>0;this.glow(o,STRUCTURES[key].light+(key==='hearth'?(e.level-1)*1.5:0));o.glow.visible=lit;o.glow.material.opacity=(.3+night*.7)*(1+Math.sin(this.clock*9)*.05);if(!lit)o.sprite.material.color.multiplyScalar(.45);}
      if(kind==='player'){if(equippedLanternLit(e)){this.glow(o,4);o.glow.material.opacity=.6;}else if(o.glow)o.glow.visible=false;}
      if(kind==='building'&&key==='gate'&&e.open)o.sprite.scale.x*=.35;
      if(kind==='building'&&key==='farm'&&e.growth>=100)o.sprite.material.color.set('#efd394');
      if((kind==='enemy'||kind==='building')&&e.hp<e.maxHp){if(!o.health){const back=new THREE.Sprite(new THREE.SpriteMaterial({color:0x302834,depthWrite:false})),fill=new THREE.Sprite(new THREE.SpriteMaterial({color:kind==='enemy'?0xdf9383:0xd2c395,depthWrite:false}));fill.center.set(0,.5);this.scene.add(back,fill);o.health={back,fill};}const y=(kind==='enemy'?key==='king'?5.4:key==='brute'?3.3:key==='wraith'?2.2:1.3:key==='hearth'?3.6:1.8);o.health.back.position.set(o.x,y,o.z);o.health.fill.position.set(o.x-.65,y,o.z+.025);o.health.back.scale.set(1.4,.1,1);o.health.fill.scale.set(1.3*Math.max(0,e.hp/e.maxHp),.055,1);o.health.back.visible=o.health.fill.visible=true;}
      if(kind==='enemy'&&e.windup>0){if(!o.danger){o.danger=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),new THREE.MeshBasicMaterial({color:0xf5947b,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));o.danger.rotation.x=-Math.PI/2;this.scene.add(o.danger);}o.danger.visible=true;o.danger.position.set(e.tx,.08,e.tz);o.danger.scale.setScalar(key==='king'?4:1.9);o.danger.material.opacity=.4+Math.sin(this.clock*14)*.25;}
    }
    for(const o of this.objects.values())if(!alive.has(o.id)&&o!==this.ghost)this.remove(o);
    this.dropMotion.retain(new Set(world.drops.map(drop=>drop.id)));
    this.marker.visible=!!target&&!placement;if(target){this.marker.position.set(target.x,.04,target.z);this.marker.rotation.z=this.clock*.3;}
    this.pathMarker.visible=!!p.goal;if(p.goal)this.pathMarker.position.set(p.goal.x,.03,p.goal.z);
    if(placement){if(!this.ghost||this.ghost.key!==placement.key){if(this.ghost)this.remove(this.ghost);this.ghost=this.sprite(placement.key,'preview');}this.ghost.sprite.position.set(placement.x,0,placement.z);this.ghost.sprite.material.color.set(placement.valid?'#c8e5a6':'#dd7471');this.ghost.sprite.material.opacity=.65;this.ghost.shadow.visible=false;this.ghost.sprite.visible=true;}else if(this.ghost){this.remove(this.ghost);this.ghost=null;}
    // A preview is transient; keep it outside the persistent entity cleanup above.
    for(const ev of world.events)if(ev.id>this.lastEvent){if(!demo&&world.time-ev.at<2)this.effect(ev);this.lastEvent=ev.id;}
    this.effects=this.effects.filter(e=>{e.life+=dt;e.mesh.scale.setScalar(1+e.life*(e.type==='impact'?12:4));e.mesh.material.opacity=Math.max(0,1-e.life*2);if(e.life>.5){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();return false;}return true;});
    this.floaters=this.floaters.filter(f=>{f.life+=dt;const s=this.screenPoint(f.x,f.z,1+f.life*.7);f.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;f.el.style.opacity=String(Math.min(1,(1.8-f.life)*2));if(f.life>1.8){f.el.remove();return false;}return true;});
    this.gl.render(this.scene,this.camera);
  }
}
