import * as T from './vendor/three.module.min.js';
import { LEVEL, ALTAR } from './state.mjs';
import { MOONLIT, EMBER, paletteColor } from './palettes.mjs';
import { clampZoom } from './gestures.mjs';

const TAU = Math.PI * 2;
function random(seed = 27) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

export function createWorld(canvas) {
  let C = MOONLIT;
  const rand = random();
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(C.night);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(C.night, 0.009);
  const camera = new T.OrthographicCamera(-18, 18, 12, -12, 0.1, 160);
  camera.position.set(0, 21, 27);
  camera.lookAt(0, -0.6, 0);
  const hemi = new T.HemisphereLight(0xb0d9e6, 0x17202b, 2.2);
  scene.add(hemi);
  const moonlight = new T.DirectionalLight(0x9bc9db, 3.1);
  moonlight.position.set(-10, 19, 5); moonlight.castShadow = true;
  Object.assign(moonlight.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.5, far: 60 });
  moonlight.shadow.mapSize.set(1024, 1024); moonlight.shadow.normalBias = 0.04;
  scene.add(moonlight);
  const rim = new T.DirectionalLight(0x79bdb0, 1.5); rim.position.set(7, 4, -9); scene.add(rim);
  const materials = new Map();
  const mat = (color, emissive = 0, intensity = 0) => {
    const key = `${color}/${emissive}/${intensity}`;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, emissive, emissiveIntensity: intensity }));
    return materials.get(key);
  };
  const geometries = {
    stone: new T.IcosahedronGeometry(1, 0),
    crystal: new T.OctahedronGeometry(1, 0),
    cone: new T.ConeGeometry(1, 1, 5),
    cylinder: new T.CylinderGeometry(1, 1, 1, 7),
    cube: new T.BoxGeometry(1, 1, 1),
    ring: new T.RingGeometry(0.9, 1, 48),
  };
  function mesh(geometry, material, parent, x, y, z, sx = 1, sy = sx, sz = sx) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const terrain = new T.Group(); scene.add(terrain);
  // Each triangle is independent, so its color and normal read as a carved facet.
  const positions = [], colors = [];
  function face(a, b, c, color) {
    positions.push(...a, ...b, ...c);
    const shade = new T.Color(color); colors.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
  }
  const count = 26, rings = [];
  for (let layer = 0; layer < 4; layer++) {
    const ring = [];
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU;
      const radius = layer === 0 ? 4.7 : layer === 1 ? 9.8 + rand() * 0.65 : layer === 2 ? 8.5 + rand() * 1.2 : 2.8 + rand() * 2.2;
      const y = layer <= 1 ? -0.03 : layer === 2 ? -1.7 - rand() * 0.8 : -5.8 - rand() * 1.7;
      ring.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    }
    rings.push(ring);
  }
  const tops = [0x30565b, 0x345b60, 0x294e54, 0x3a6063, 0x31585b];
  const sides = [0x1b2c3c, 0x263e4c, 0x304655, 0x203342, 0x38505b];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    face([0, -0.03, 0], rings[0][j], rings[0][i], tops[i % tops.length]);
    for (let r = 0; r < 3; r++) {
      const palette = r === 0 ? tops : sides;
      face(rings[r][i], rings[r][j], rings[r + 1][i], palette[Math.floor(rand() * palette.length)]);
      face(rings[r][j], rings[r + 1][j], rings[r + 1][i], palette[Math.floor(rand() * palette.length)]);
    }
    face(rings[3][i], rings[3][j], [0, -8, 0], sides[i % sides.length]);
  }
  const landGeo = new T.BufferGeometry();
  landGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  landGeo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); landGeo.computeVertexNormals();
  const land = new T.Mesh(landGeo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: T.DoubleSide }));
  land.receiveShadow = true; terrain.add(land);

  // Broken stepping stones invite wandering without turning the garden into a maze.
  const pathMat = mat(0x627774);
  for (const shrine of LEVEL.shrines) {
    const start = { x: 0, z: 3.4 };
    for (let i = 0; i < 11; i++) {
      const t = i / 11, x = start.x + (shrine.x - start.x) * t, z = start.z + (shrine.z - start.z) * t;
      if (LEVEL.shrines.some(s => Math.hypot(x - s.x, z - s.z) < 1)) continue;
      const stone = mesh(geometries.cylinder, pathMat, terrain, x + (rand() - .5) * .35, .015, z + (rand() - .5) * .2, .25 + rand() * .12, .035, .22 + rand() * .13);
      stone.rotation.y = rand() * TAU; stone.castShadow = false;
    }
  }
  const trees = [];
  function tree(x, z, scale) {
    const group = new T.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); terrain.add(group);
    mesh(geometries.cylinder, mat(0x42494b), group, 0, .5, 0, .12, 1, .12);
    for (let j = 0; j < 3; j++) {
      const leaves = mesh(geometries.cone, mat([0x204742, 0x2d6053, 0x437c67][j]), group, 0, 1.1 + j * .56, 0, 1.02 - j * .23, 1.5 - j * .15, 1.02 - j * .23);
      leaves.rotation.y = j * .6;
    }
    trees.push(group);
  }
  [[-7.8,-4.7,1.2],[-8.1,-1.8,.9],[-8,1.2,.75],[-5.7,-6.8,1.15],[-3.8,-7.6,.8],[3.2,-7.8,1.25],[5.7,-6.8,1.05],[7.8,-4.4,1.2],[8.4,-.6,.8],[-6.9,5.8,.7],[7.2,5.6,.75]].forEach(p => tree(...p));

  // Low perimeter flora never blocks the player or hides an objective.
  for (let i = 0; i < 75; i++) {
    const a = rand() * TAU, radius = 7.3 + rand() * 2.1;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    if (LEVEL.lights.some(([lx,lz]) => Math.hypot(lx-x,lz-z) < .9)) continue;
    if (i % 3 === 0) {
      const rock = mesh(geometries.stone, mat(i % 2 ? 0x486368 : 0x52696b), terrain, x, .1, z, .17 + rand() * .33, .2 + rand() * .3, .25 + rand() * .2);
      rock.rotation.set(rand(), rand(), rand());
    } else {
      for (let j = 0; j < 3; j++) {
        const leaf = mesh(geometries.cone, mat(0x548474), terrain, x + j * .08, .16, z, .05, .35 + rand() * .18, .055);
        leaf.rotation.z = (rand() - .5) * .9;
      }
    }
  }

  const texCanvas = document.createElement('canvas'); texCanvas.width = texCanvas.height = 64;
  const context = texCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffff'); gradient.addColorStop(.13, '#ffffffe0'); gradient.addColorStop(.4, '#ffffff38'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  const glowTexture = new T.CanvasTexture(texCanvas);
  function glow(parent, color, size, x = 0, y = 0, z = 0, opacity = .7) {
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
    sprite.position.set(x,y,z); sprite.scale.setScalar(size); parent.add(sprite); return sprite;
  }
  function ring(parent, color, radius, y, opacity = .5) {
    const r = new T.Mesh(geometries.ring, new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.y = y; r.scale.setScalar(radius); parent.add(r); return r;
  }
  const shrineViews = [...LEVEL.shrines, ALTAR].map((s, index) => {
    const group = new T.Group(); group.position.set(s.x,0,s.z); terrain.add(group);
    mesh(geometries.cylinder, mat(0x536a6b), group, 0,.14,0,.9,.27,.9);
    mesh(geometries.cylinder, mat(0x2a424c), group, 0,.32,0,.63,.16,.63);
    const crystalMat = new T.MeshStandardMaterial({ color: 0x75b4aa, emissive: C.teal, emissiveIntensity: .25, roughness: .35, metalness: .1, flatShading: true });
    const crystal = mesh(geometries.crystal, crystalMat, group, 0,1.14,0,.32,.77,.32);
    crystal.rotation.z = .15; crystal.rotation.y = index;
    const halo = glow(group, C.teal, 2.6, 0,1,0,.28);
    const circle = ring(group, C.teal, 1.2, .035, .45);
    const light = new T.PointLight(C.gold,0,6,2); light.position.set(0,1.5,0); group.add(light);
    const beam = new T.Mesh(new T.CylinderGeometry(.12,.48,9,12,1,true), new T.MeshBasicMaterial({ color: C.gold, transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
    beam.position.y = 5; group.add(beam);
    const flowers = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, radius = 1.5 + rand() * .45;
      const flower = mesh(geometries.crystal, mat(0xf2bd8d, C.gold,.35), group, Math.cos(a)*radius,.1,Math.sin(a)*radius,.075,.16,.075);
      flowers.push(flower);
    }
    return {id:s.id,group,crystal,halo,circle,light,beam,flowers, awakened:0};
  });

  // The silent gate becomes the final beacon.
  const beacon = new T.Group(); beacon.position.set(0,0,-7.7); terrain.add(beacon);
  mesh(geometries.cylinder,mat(0x526769),beacon,0,.18,0,1.2,.36,1);
  for (const side of [-1,1]) {
    const pillar = mesh(geometries.cube,mat(0x71837c),beacon,side*.7,1.55,0,.38,2.9,.43); pillar.rotation.z = -side*.09;
    mesh(geometries.crystal,mat(0x9ea38a),beacon,side*.59,3.18,0,.29,.42,.29);
  }
  mesh(geometries.cube,mat(0x879384),beacon,0,2.7,0,1.65,.33,.52);
  const beaconCore = mesh(geometries.crystal,mat(0xffd69d,C.gold,1.7),beacon,0,1.75,0,.21,.45,.21);
  const beaconHalo = glow(beacon,C.gold,4,0,1.8,0,.12);
  const endRing = ring(terrain,C.gold,1,.12,0);

  const keeper = new T.Group(); terrain.add(keeper);
  const body = new T.Group(); keeper.add(body);
  mesh(new T.ConeGeometry(.3,.72,7),mat(0xca987b),body,0,.54,0);
  mesh(geometries.stone,mat(0xe9bd92),body,0,.99,.015,.23,.25,.21);
  mesh(geometries.stone,mat(0x283b44),body,0,.99,.155,.16,.17,.095);
  const hood = mesh(geometries.cone,mat(0xdba486),body,0,1.16,-.06,.26,.29,.25); hood.rotation.x = -.23;
  const feet = [-1,1].map(side => mesh(geometries.cube,mat(0x293740),keeper,side*.12,.1,0,.13,.18,.22));
  const arm = mesh(geometries.cube,mat(0xdca480),body,.29,.65,.11,.13,.4,.13); arm.rotation.z = -.7;
  const lantern = new T.Group(); lantern.position.set(.46,.57,.18); body.add(lantern);
  mesh(geometries.cylinder,mat(0x715849),lantern,0,-.16,0,.14,.055,.14);
  mesh(geometries.cylinder,mat(0x715849),lantern,0,.16,0,.14,.055,.14);
  mesh(geometries.cube,mat(0xffdf9c,C.gold,2.5),lantern,0,0,0,.15,.26,.15);
  glow(lantern,C.gold,1.9,0,0,0,.65);
  const lamp = new T.PointLight(C.gold,6,5,2); lantern.add(lamp);
  const keeperRing = ring(keeper,C.gold,.42,.012,.16);

  const lightViews = LEVEL.lights.map(([x,z],i) => {
    const group = new T.Group(); group.position.set(x,.65,z); terrain.add(group);
    const core = mesh(geometries.crystal,mat(0xffe6ad,C.gold,2.5),group,0,0,0,.065,.095,.065);
    core.castShadow = false;
    glow(group,C.gold,1.15,0,0,0,.9);
    for (const side of [-1,1]) {
      const wing = mesh(geometries.crystal,mat(0xa9e2ca,C.teal,.65),group,side*.09,0,0,.085,.016,.04);
      wing.castShadow = false;
    }
    const ground = ring(terrain,C.gold,.2,.012,.25); ground.position.x=x; ground.position.z=z;
    return {group, ground, phase:i*1.9};
  });

  const starPositions = [], starColors = [];
  for (let i=0;i<450;i++) {
    const x=(rand()-.5)*110,y=rand()*52-10,z=-18-rand()*45;
    starPositions.push(x,y,z); const color=new T.Color(i%4 ? 0x9dbcc9 : C.gold);
    starColors.push(color.r,color.g,color.b);
  }
  const starsGeo=new T.BufferGeometry(); starsGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3)); starsGeo.setAttribute('color',new T.Float32BufferAttribute(starColors,3));
  const stars=new T.Points(starsGeo,new T.PointsMaterial({size:.095,vertexColors:true,transparent:true,opacity:.7,depthWrite:false})); scene.add(stars);
  const moon=mesh(new T.SphereGeometry(1.65,16,12),new T.MeshBasicMaterial({color:0xb9cec3}),scene,-16,12,-26);
  moon.castShadow=false; glow(scene,0x95b6b4,12,-16,12,-26,.2);
  const satellites=[];
  for(let i=0;i<16;i++) {
    const a=rand()*TAU, radius=12+rand()*9;
    const object=mesh(geometries.stone,mat(0x203a48),scene,Math.cos(a)*radius,-3-rand()*8,Math.sin(a)*radius, .3+rand()*.8,.5+rand(),.4+rand()*.6);
    object.rotation.set(rand()*3,rand()*3,rand()*3); satellites.push({object,y:object.position.y});
  }
  const motes=[];
  for(let i=0;i<30;i++) {
    const a=rand()*TAU,r=rand()*9;
    const object=glow(terrain,i%3 ? C.teal:C.gold,.12+rand()*.13,Math.cos(a)*r,.3+rand()*2,Math.sin(a)*r,.5);
    motes.push({object,x:object.position.x,y:object.position.y,z:object.position.z,phase:rand()*TAU});
  }
  const skyLanterns=[];
  for(let i=0;i<32;i++) {
    const group=new T.Group(); const a=rand()*TAU,r=3+rand()*9;
    group.position.set(Math.cos(a)*r,-5,Math.sin(a)*r);scene.add(group);
    mesh(geometries.cylinder,mat(0xf8c08c,C.gold,.8),group,0,0,0,.13,.29,.13);
    glow(group,C.gold,1.35,0,0,0,.65); group.visible=false;
    skyLanterns.push({group,x:group.position.x,z:group.position.z,delay:i*.31,speed:.7+rand()*.4});
  }
  const bursts = [];
  for(let i=0;i<45;i++) {
    const object=glow(scene,C.gold,.22,0,-20,0,.7);object.visible=false;
    bursts.push({object,life:0,vx:0,vy:0,vz:0});
  }
  let burstIndex=0;
  const targetMarker=ring(terrain,C.gold,.35,.025,0);
  const raycaster=new T.Raycaster(), plane=new T.Plane(new T.Vector3(0,1,0),0), hit=new T.Vector3();
  let completedTime=null, zoom=1;
  const cameraFocus=new T.Vector3();
  const originalMaterials=new Map(), originalLights=[];
  scene.traverse(object=>{
    if(object.material){
      for(const m of (Array.isArray(object.material)?object.material:[object.material])){
        if(!originalMaterials.has(m))originalMaterials.set(m,{color:m.color?.getHex(),emissive:m.emissive?.getHex()});
      }
    }
    if(object.isLight)originalLights.push({object,color:object.color.getHex(),ground:object.groundColor?.getHex(),intensity:object.intensity});
  });
  const originalVertices=[landGeo,starsGeo].map(geometry=>({geometry,colors:Array.from(geometry.attributes.color.array)}));
  function setPalette(name){
    C=name==='ember'?EMBER:MOONLIT;
    renderer.setClearColor(C.night);scene.fog.color.set(C.night);
    for(const [material,original] of originalMaterials){
      if(original.color!==undefined)material.color.setHex(paletteColor(original.color,name));
      if(original.emissive!==undefined)material.emissive.setHex(paletteColor(original.emissive,name));
    }
    for(const {object,color,ground,intensity} of originalLights){
      object.color.setHex(paletteColor(color,name));
      if(ground!==undefined)object.groundColor.setHex(paletteColor(ground,name));
      object.intensity=intensity*(name==='ember' && object.isDirectionalLight ? .75 : 1);
    }
    for(const {geometry,colors:original} of originalVertices){
      const attribute=geometry.attributes.color,color=new T.Color();
      for(let i=0;i<original.length;i+=3){
        color.setRGB(original[i],original[i+1],original[i+2]);
        color.setHex(paletteColor(color.getHex(),name));attribute.setXYZ(i/3,color.r,color.g,color.b);
      }
      attribute.needsUpdate=true;
    }
  }
  function setZoom(value){zoom=clampZoom(value);camera.zoom=zoom;camera.updateProjectionMatrix();return zoom;}
  function resize() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    const aspect=w/h, half=Math.max(11.8,11.7/aspect);
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
    camera.updateProjectionMatrix();
  }
  resize();
  function groundPoint(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),camera);
    if(!raycaster.ray.intersectPlane(plane,hit)) return null;
    if(Math.hypot(hit.x,hit.z)>10.5) return null;
    return {x:hit.x,z:hit.z};
  }
  function burst(x,z,amount=12) {
    for(let i=0;i<amount;i++) {
      const p=bursts[burstIndex++%bursts.length],a=rand()*TAU;
      p.life=1;p.object.visible=true;p.object.position.set(x,.8,z);
      p.vx=Math.cos(a)*(1+rand());p.vz=Math.sin(a)*(1+rand());p.vy=1+rand()*2;
    }
  }
  function update(state,time,dt,reduced,target) {
    const animationTime=reduced ? 0:time;
    // At close range the camera follows the keeper, so every edge stays reachable.
    const follow=Math.min(1,(zoom-1)*.9);
    const desiredFocus=new T.Vector3(state.player.x*follow,0,state.player.z*follow);
    cameraFocus.lerp(desiredFocus,reduced?1:1-Math.exp(-Math.max(dt,.016)*7));
    camera.position.set(cameraFocus.x,21,27+cameraFocus.z);
    camera.lookAt(cameraFocus.x,-.6,cameraFocus.z);camera.updateMatrixWorld();
    keeper.position.set(state.player.x,0,state.player.z);
    const angleDelta=Math.atan2(Math.sin(state.player.facing-keeper.rotation.y),Math.cos(state.player.facing-keeper.rotation.y));
    keeper.rotation.y+=angleDelta*Math.min(1,dt*14);
    body.position.y=state.player.moving && !reduced ? Math.sin(time*16)*.035:0;
    feet.forEach((foot,i)=>{foot.position.z=state.player.moving && !reduced ? Math.sin(time*16+i*Math.PI)*.105:0;});
    lantern.rotation.z=Math.sin(animationTime*3)*.08;
    keeperRing.material.opacity=.15+Math.sin(animationTime*2)*.035;
    const carried=state.lights.filter(l=>l.status==='following');
    state.lights.forEach((light,i)=>{
      const view=lightViews[i]; view.group.visible=light.status!=='delivered'; view.ground.visible=light.status==='wild';
      if(light.status==='wild') view.group.position.set(light.x+Math.sin(animationTime*.7+view.phase)*.12,.7+Math.sin(animationTime*2+view.phase)*.16,light.z+Math.cos(animationTime*.8+view.phase)*.12);
      else if(light.status==='following') {
        const a=animationTime*1.1+carried.indexOf(light)*TAU/3;
        const desired=new T.Vector3(state.player.x+Math.cos(a)*.72,1.1+Math.sin(animationTime*2+i)*.13,state.player.z+Math.sin(a)*.72);
        view.group.position.lerp(desired,1-Math.exp(-dt*7));
      }
      view.group.rotation.y=animationTime+i;
    });
    shrineViews.forEach((v,i)=>{
      const s=state.shrines.find(s=>s.id===v.id);v.group.visible=!!s;if(!s)return;
      const warmth=state.mode==='endless'?Math.min(.85,state.offerings*.12):Number(s.lit);
      v.awakened+=(warmth-v.awakened)*Math.min(1,dt*2);
      const energy=Math.max(s.charge*.8,v.awakened);
      v.crystal.position.y=1.12+Math.sin(animationTime*1.4+i)*.085;
      v.crystal.rotation.y=animationTime*.35+i;
      v.crystal.material.color.set(s.lit?C.gold:C.sleeping);
      v.crystal.material.emissive.set(s.lit?C.gold:C.teal);v.crystal.material.emissiveIntensity=.3+energy*1.7;
      v.halo.material.color.set(s.lit?C.gold:C.teal);v.halo.material.opacity=.25+energy*.55;
      v.circle.material.color.set(s.lit?C.gold:C.teal);v.circle.material.opacity=.25+energy*.5;
      v.circle.rotation.z=animationTime*.05;
      v.light.intensity=v.awakened*9;v.beam.material.opacity=v.awakened*.055;
      v.flowers.forEach((f,j)=>{f.scale.y=.015+v.awakened*(.17+Math.sin(j)*.045);f.position.y=.07+v.awakened*.08;});
    });
    trees.forEach((tree,i)=>{tree.rotation.z=Math.sin(animationTime*.6+i)*.007;});
    satellites.forEach((s,i)=>{s.object.position.y=s.y+Math.sin(animationTime*.35+i)*.15;});
    motes.forEach(p=>{p.object.position.set(p.x+Math.sin(animationTime*.3+p.phase)*.4,p.y+Math.sin(animationTime*.7+p.phase)*.3,p.z);});
    stars.material.opacity=.6+Math.sin(animationTime*.3)*.1;
    beaconCore.rotation.y=animationTime*.3;
    beaconHalo.material.opacity=.12+(state.mode==='endless'?Math.min(3,state.offerings):state.lit)*.13;
    if(state.phase==='complete' && completedTime===null) completedTime=time;
    const finale=completedTime===null ? -1:time-completedTime;
    skyLanterns.forEach((p,i)=>{
      const endless=state.mode==='endless'&&state.lastOfferingAt!==null;
      const age=endless?state.elapsed-state.lastOfferingAt-i*.3:finale-p.delay;
      p.group.visible=age>0&&(!endless||(i<3&&age<22));
      if(age>0) {
        const height=reduced ? 3+p.delay:((age*p.speed)%24);
        p.group.position.set(p.x+Math.sin(animationTime*.25+p.delay)*.6,height+.5,p.z);
      }
    });
    if(finale>=0 && finale<7 && !reduced) {endRing.material.opacity=(1-finale/7)*.45;endRing.scale.setScalar(.5+finale*3);} else endRing.material.opacity=0;
    for(const p of bursts) {
      if(p.life<=0)continue;p.life-=dt;p.object.visible=p.life>0 && !reduced;
      p.object.position.x+=p.vx*dt;p.object.position.z+=p.vz*dt;p.object.position.y+=p.vy*dt;p.vy-=dt*2;
      p.object.material.opacity=Math.max(0,p.life)*.8;
    }
    targetMarker.material.opacity=target?.active ? .6:0;
    if(target){targetMarker.position.x=target.x;targetMarker.position.z=target.z;targetMarker.scale.setScalar(.3+Math.sin(animationTime*4)*.035);}
    renderer.render(scene,camera);
  }
  function reset() {
    cameraFocus.set(0,0,0);
    completedTime=null;shrineViews.forEach(s=>{s.awakened=0;});
    bursts.forEach(p=>{p.life=0;p.object.visible=false;});
    lightViews.forEach((v,i)=>v.group.position.set(...[LEVEL.lights[i][0],.7,LEVEL.lights[i][1]]));
  }
  return {update,resize,groundPoint,burst,reset,setZoom,setPalette};
}
