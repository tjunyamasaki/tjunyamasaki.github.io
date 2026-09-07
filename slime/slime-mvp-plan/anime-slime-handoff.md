# Anime slime — agent handoff

## Scope and source of truth

Continue from the original anime slime below. The user explicitly chose this exact model: preserve its silhouette, face, materials, outlines, highlights, and motion rather than approximating or regenerating it.

This handoff contains only that slime's complete source, its idle/walking animation, camera controls, lighting, and neutral presentation floor. The source was extracted directly from the first slime showcase, retaining the anime appearance only.

## Running and integrating

The code below is an HTML fragment with its own module script. Place it inside a normal HTML document with UTF-8 and viewport metadata, or an equivalent preview surface. It imports Three.js 0.180.0 from jsDelivr, so it requires internet access unless the dependency is bundled locally. No API key, generated image, external model file, build step, or private workspace file is needed.

For standalone presentation, the host utility classes (`btn`, `viz-controls`, `form-label`, etc.) can be given ordinary CSS. They affect the controls, not the slime. Preserve the scene's existing colors, exposure, lights, and camera when comparing appearances.

## Asset and animation details

- The body is the exact `CatmullRomCurve3` profile and `LatheGeometry` below: 64 profile subdivisions and 80 radial segments. Do not substitute a sphere, hemisphere, ellipsoid, or independently recreated silhouette.
- `actor` groups the body, back-face outline, eyes, cheeks, mouth, and painted highlight decals. `turn` supplies the small presentation movement.
- Anime material: `MeshToonMaterial`, mint `0x8fe6c9`, three-step gradient, emissive `0x285e4e` at 0.08. The outline is `0x33655b`.
- Facial decals follow the actual body surface; they are deformed together with it. No skeleton, sprite sheet, image texture, or AI-generated animation is involved.
- `deform()` controls breathing, squash/stretch, lean, and ripples. `samplePose()` defines the 1.25-second walking cycle. `animate()` blends idle and walking, updates faces/blinks, and renders.
- Idle includes subtle breathing, sway, and blinking. Walking includes anticipation, compression, extension, a short hop, landing, and settling. The small side-to-side travel is showcase motion, not game navigation.
- A canvas-generated contact shadow and neutral ground plane are presentation aids. Controls provide idle/walking, pause/resume, orbit, and zoom; reduced-motion preference starts the demo paused.
- This is showcase code, not an optimized crowd renderer. Vertex updates and normal recomputation happen on the CPU. Preserve the approved appearance when optimizing or extracting a reusable component.

## Complete anime-only source

```html
<div id="slime-motion-demo">
  <div class="slime-stage" role="img" aria-label="A round mint slime in 3D, with idle and walking animations. Drag to rotate the camera and scroll to zoom."></div>
  <div class="viz-controls" style="margin-top:12px">
    <button type="button" class="btn" data-motion="idle" aria-pressed="true">Idle</button>
    <button type="button" class="btn" data-motion="walk" aria-pressed="false">Walking</button>
    <button type="button" class="btn" data-pause aria-pressed="false">Pause</button>
    <span class="text-small">Drag to rotate · Scroll to zoom</span>
  </div>
  <div data-error role="alert" hidden></div>
</div>
<style>
 #slime-motion-demo .slime-stage{width:100%;height:510px;background:#eaf0d6;touch-action:none;overflow:hidden;border-radius:12px;cursor:grab;}
 #slime-motion-demo .slime-stage:active{cursor:grabbing;}
 #slime-motion-demo canvas{display:block;width:100%;height:100%;}
 @media(max-width:500px){#slime-motion-demo .slime-stage{height:410px;}}
</style>
<script type="module">
const root=document.getElementById('slime-motion-demo');
try{
 const T=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
 const stage=root.querySelector('.slime-stage');
 const renderer=new T.WebGLRenderer({antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 stage.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.05,60);
 scene.background=new T.Color(0xeaf0d6);scene.fog=new T.Fog(0xeaf0d6,12,30);
 const hemi=new T.HemisphereLight(0xf3ffff,0x719c78,2.4);scene.add(hemi);
 const sun=new T.DirectionalLight(0xfff1ca,3.1);sun.position.set(-3,6,4);sun.castShadow=true;
 sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});sun.shadow.normalBias=.025;scene.add(sun);
 const rim=new T.DirectionalLight(0xbffff2,1.3);rim.position.set(3,3,-4);scene.add(rim);
 const ramp=new T.DataTexture(new Uint8Array([80,80,80,255,170,170,170,255,255,255,255,255]),3,1,T.RGBAFormat);ramp.minFilter=ramp.magFilter=T.NearestFilter;ramp.needsUpdate=true;
 const animeMat=new T.MeshToonMaterial({color:0x8fe6c9,gradientMap:ramp,emissive:0x285e4e,emissiveIntensity:.08});
 const outlineMat=new T.MeshBasicMaterial({color:0x33655b,side:T.BackSide});
 const floorMat=new T.MeshStandardMaterial({color:0xe2eacc,roughness:1});
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const turn=new T.Group();scene.add(turn);
 const actor=new T.Group();turn.add(actor);
 // A low, rounded bell profile with a broad resting footprint.
 const profile=new T.CatmullRomCurve3([
  new T.Vector3(0,.022,0),new T.Vector3(.55,.026,0),new T.Vector3(.82,.055,0),new T.Vector3(.96,.16,0),
  new T.Vector3(.99,.31,0),new T.Vector3(.935,.56,0),new T.Vector3(.82,.82,0),new T.Vector3(.61,1.08,0),
  new T.Vector3(.31,1.27,0),new T.Vector3(0,1.34,0)
 ]);
 const profilePoints=profile.getPoints(64).map(p=>new T.Vector2(Math.max(0,p.x),p.y));
 const geometry=new T.LatheGeometry(profilePoints,80);
 const base=new Float32Array(geometry.attributes.position.array);
 const body=new T.Mesh(geometry,animeMat);body.castShadow=true;body.receiveShadow=true;actor.add(body);
 const outline=new T.Mesh(geometry,outlineMat);outline.scale.set(1.012,1.008,1.012);actor.add(outline);
 function radius(y){let best=profilePoints[0].x;for(let i=1;i<profilePoints.length;i++){const a=profilePoints[i-1],b=profilePoints[i];if(y>=a.y&&y<=b.y){return T.MathUtils.lerp(a.x,b.x,(y-a.y)/Math.max(.00001,b.y-a.y));}best=b.x;}return best;}
 // Facial markings follow the exact body surface and deformation.
 const faceParts=[];
 function decal(cx,cy,rx,ry,color,depth=.01){
  const positions=[],idx=[];const segments=48;
  for(let i=0;i<=segments+1;i++){const a=(i-1)/segments*Math.PI*2;const x=i===0?cx:cx+Math.cos(a)*rx,y=i===0?cy:cy+Math.sin(a)*ry;const r=radius(y);positions.push(x,y,Math.sqrt(Math.max(0,r*r-x*x))+depth);}
  for(let i=1;i<=segments;i++)idx.push(0,i,i+1);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new T.Mesh(g,new T.MeshBasicMaterial({color,side:T.DoubleSide}));actor.add(m);faceParts.push({m,base:new Float32Array(positions),cy,eye:false});return faceParts[faceParts.length-1];
 }
 for(const s of [-1,1]){
  const eye=decal(s*.265,.655,.065,.115,0x244e48,.014);eye.eye=true;
  const glint=decal(s*.265-.017,.695,.018,.027,0xf4fff5,.022);glint.eye=true;glint.cy=.655;
  decal(s*.47,.475,.095,.035,0xefadac,.014);
 }
 const mouthPoints=[];
 for(let i=0;i<=20;i++){const x=(i/20-.5)*.15,y=.468-.035*Math.sin(i/20*Math.PI);mouthPoints.push(new T.Vector3(x,y,Math.sqrt(radius(y)**2-x*x)+.018));}
 const mouthGeometry=new T.TubeGeometry(new T.CatmullRomCurve3(mouthPoints),24,.009,6,false);
 const mouth=new T.Mesh(mouthGeometry,new T.MeshBasicMaterial({color:0x2f6156}));actor.add(mouth);faceParts.push({m:mouth,base:new Float32Array(mouthGeometry.attributes.position.array),eye:false});
 decal(-.32,1.025,.07,.12,0xecfff6,.015);decal(-.45,.91,.031,.05,0xe6fff4,.015);
 // Subtle contact shadow helps make squashes and short lifts readable.
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
 const ctx=shadowCanvas.getContext('2d'),fade=ctx.createRadialGradient(64,64,5,64,64,64);fade.addColorStop(0,'rgba(31,68,50,0.30)');fade.addColorStop(.55,'rgba(31,68,50,0.13)');fade.addColorStop(1,'rgba(31,68,50,0)');ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
 const shadow=new T.Mesh(new T.PlaneGeometry(2.8,2.6),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.006;turn.add(shadow);
 let mode='idle',paused=matchMedia('(prefers-reduced-motion: reduce)').matches,t=0,walkBlend=0,previous=performance.now();
 let yaw=.23,pitch=.31,distance=5.8,desiredDistance=5.8,dragging=false,px=0,py=0;
 const pause=root.querySelector('[data-pause]');function syncPause(){pause.textContent=paused?'Resume':'Pause';pause.setAttribute('aria-pressed',String(paused));}syncPause();
 root.querySelectorAll('[data-motion]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.motion;root.querySelectorAll('[data-motion]').forEach(a=>a.setAttribute('aria-pressed',String(a===b)));}));
 pause.addEventListener('click',()=>{paused=!paused;syncPause();});
 stage.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;stage.setPointerCapture(e.pointerId);});
 stage.addEventListener('pointermove',e=>{if(!dragging)return;yaw-=(e.clientX-px)*.008;pitch=T.MathUtils.clamp(pitch+(e.clientY-py)*.006,.06,1.35);px=e.clientX;py=e.clientY;});
 stage.addEventListener('pointerup',()=>dragging=false);stage.addEventListener('pointercancel',()=>dragging=false);
 stage.addEventListener('wheel',e=>{e.preventDefault();desiredDistance=T.MathUtils.clamp(desiredDistance*Math.exp(e.deltaY*.001),3,10);},{passive:false});
 const observer=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(stage);
 const out=new T.Vector3();
 let sx=1,sy=1,sz=1,lean=0,wobble=0,lift=0;
 function deform(x,y,z){const h=y/1.34;const a=Math.atan2(z,x),ripple=wobble*Math.sin(a*3+t*9-h*5)*Math.sin(Math.PI*Math.min(1,h));out.set(x*sx*(1+ripple),y*sy,z*sz*(1+ripple)+lean*h*h);return out;}
 function samplePose(p){
  // Compression, extension, short forward hop, then a damped landing.
  const keys=[[0,.88,0,-.09],[.17,.77,0,-.15],[.29,1.16,.06,.10],[.49,1.06,.21,.16],[.68,.82,0,.13],[.80,1.05,0,-.04],[1,.88,0,-.09]];
  for(let i=1;i<keys.length;i++){if(p<=keys[i][0]){const a=keys[i-1],b=keys[i];let f=(p-a[0])/(b[0]-a[0]);f=f*f*(3-2*f);return [T.MathUtils.lerp(a[1],b[1],f),T.MathUtils.lerp(a[2],b[2],f),T.MathUtils.lerp(a[3],b[3],f)];}}
  return [1,0,0];
 }
 function animate(now){
  if(!root.isConnected){observer.disconnect();renderer.dispose();return;}
  const dt=Math.min(.05,(now-previous)/1000);previous=now;if(!paused){t+=dt;walkBlend=T.MathUtils.damp(walkBlend,mode==='walk'?1:0,5,dt);}
  const phase=(t/1.25)%1,pose=samplePose(phase),breath=1+Math.sin(t*2.1)*.027;
  sy=T.MathUtils.lerp(breath,pose[0],walkBlend);sx=1/Math.sqrt(sy);sz=sx;lift=pose[1]*walkBlend;lean=T.MathUtils.lerp(Math.sin(t*.9)*.018,pose[2],walkBlend);wobble=.007+walkBlend*.018;
  actor.position.y=lift;actor.rotation.z=Math.sin(t*2.1)*.012*(1-walkBlend);
  // Small back-and-forth travel keeps the entire loop in the inspection frame.
  turn.position.x=Math.sin(t*.55)*.62*walkBlend;
  turn.rotation.y=.23+Math.sin(t*.55+1)*.22*walkBlend;
  const attr=geometry.attributes.position;
  for(let i=0;i<base.length;i+=3){deform(base[i],base[i+1],base[i+2]);attr.array[i]=out.x;attr.array[i+1]=out.y;attr.array[i+2]=out.z;}attr.needsUpdate=true;geometry.computeVertexNormals();
  const blinkTime=t%4.9,blink=blinkTime>4.65?Math.max(.065,Math.abs((blinkTime-4.775)/.125)):1;
  faceParts.forEach(part=>{const a=part.m.geometry.attributes.position;for(let i=0;i<part.base.length;i+=3){const x=part.base[i],y=part.eye?part.cy+(part.base[i+1]-part.cy)*blink:part.base[i+1];let z=part.base[i+2];if(part.eye){const oldR=radius(part.base[i+1]),newR=radius(y);z+=Math.sqrt(Math.max(0,newR*newR-x*x))-Math.sqrt(Math.max(0,oldR*oldR-x*x));}deform(x,y,z);a.array[i]=out.x;a.array[i+1]=out.y;a.array[i+2]=out.z;}a.needsUpdate=true;});
  shadow.scale.set(sx*(1+lift*.4),sz*(1+lift*.4),1);shadow.material.opacity=1-lift*1.8;
  distance=T.MathUtils.damp(distance,desiredDistance,7,dt);const fit=Math.max(1,.85/camera.aspect),d=distance*fit;
  camera.position.set(Math.sin(yaw)*Math.cos(pitch)*d,.65+Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(0,.65,0);
  renderer.render(scene,camera);requestAnimationFrame(animate);
 }
 requestAnimationFrame(animate);
}catch(error){const el=root.querySelector('[data-error]');el.hidden=false;el.textContent='The 3D preview could not load. '+error.message;}
</script>
```
