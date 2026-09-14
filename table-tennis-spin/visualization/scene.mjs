import * as T from '../../hushlight/vendor/three.module.min.js';
import {C} from '../physics/engine.mjs';
import {length,clamp,add,mul} from '../physics/math.mjs';

const COLORS={spin:0xe9ff70,x:0xff9a76,y:0x7de3ff,z:0xc6a0ff,velocity:0x70dce7,racket:0xbba0ff,friction:0xff9774,b:0xd69bff};
const v=a=>new T.Vector3(...a);
const Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1);
export function createScene(canvas,callbacks={}) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new T.Scene(),lensScene=new T.Scene();
  scene.fog=new T.FogExp2(0x091316,.095);
  const camera=new T.PerspectiveCamera(38,1,.01,80);
  const lensCamera=new T.PerspectiveCamera(36,1,.01,20);
  const lights=s=>{
    s.add(new T.HemisphereLight(0xd4f5ef,0x19232b,2.6));
    const key=new T.DirectionalLight(0xffeed5,3.1);key.position.set(-3,7,4);s.add(key);
    const rim=new T.DirectionalLight(0x7dd6dc,2.2);rim.position.set(4,3,-6);s.add(rim);
  };lights(scene);lights(lensScene);
  const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.75,...extra});
  const basic=(color,opacity=1)=>new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1});
  const arena=new T.Group();scene.add(arena);
  function box(parent,size,position,mat) {
    const o=new T.Mesh(new T.BoxGeometry(...size),mat);o.position.set(...position);parent.add(o);return o;
  }
  const top=material(0x143a3d,{roughness:.52,metalness:.16});
  box(arena,[1.525,.065,2.74],[0,.7275,0],top);
  box(arena,[1.54,.026,2.75],[0,.685,0],material(0x101d23,{metalness:.65}));
  const marking=basic(0xd2e6de,.86),glow=basic(0x8cddd0,.65);
  for(const x of [-.752,.752])box(arena,[.012,.003,2.715],[x,.762,0],marking);
  for(const z of [-1.357,1.357])box(arena,[1.5,.003,.012],[0,.762,z],marking);
  box(arena,[.003,.003,2.72],[0,.762,0],marking);
  for(const x of [-.769,.769])box(arena,[.005,.006,2.72],[x,.711,0],glow);
  for(const x of [-.59,.59])for(const z of [-.95,.95]){
    box(arena,[.043,.67,.043],[x,.34,z],material(0x283b41,{metalness:.6}));
    box(arena,[.14,.022,.13],[x,.012,z],material(0x16262d));
  }
  box(arena,[1.2,.035,.04],[0,.25,-.95],material(0x304349));
  box(arena,[1.2,.035,.04],[0,.25,.95],material(0x304349));
  // Net grid is a single draw call.
  const net=[];
  for(let x=-.82;x<=.82;x+=.027)net.push(x,.762,0,x,.913,0);
  for(let y=.775;y<=.913;y+=.027)net.push(-.82,y,0,.82,y,0);
  const netGeo=new T.BufferGeometry();netGeo.setAttribute('position',new T.Float32BufferAttribute(net,3));
  arena.add(new T.LineSegments(netGeo,new T.LineBasicMaterial({color:0xb7d4d3,transparent:true,opacity:.32})));
  box(arena,[1.68,.012,.007],[0,.918,0],marking);
  for(const x of [-.825,.825])box(arena,[.018,.23,.022],[x,.805,0],material(0x647c7c));
  const floor=new T.Mesh(new T.CircleGeometry(9,64),material(0x0b1b20,{roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.012;arena.add(floor);
  const grid=new T.GridHelper(14,28,0x284344,0x172a2e);grid.position.y=-.007;arena.add(grid);
  function textSprite(text,color='#aac3c0',size=.12) {
    const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');
    ctx.font='500 45px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,256,48);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    const o=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false}));o.scale.set(size*5.33,size,1);return o;
  }
  const near=textSprite('YOU / +Z','#769b99',.075);near.position.set(0,.025,-1.62);arena.add(near);
  const far=textSprite('SPIN LAB','#456f70',.12);far.position.set(0,.025,1.82);arena.add(far);
  // The same texture is shared by every ball. Asymmetry makes orientation legible.
  const textureCanvas=document.createElement('canvas');textureCanvas.width=1024;textureCanvas.height=512;
  const ctx=textureCanvas.getContext('2d');
  ctx.fillStyle='#f3f0df';ctx.fillRect(0,0,1024,512);
  ctx.fillStyle='#ff8652';ctx.fillRect(0,0,512,512);
  ctx.strokeStyle='rgba(28,53,54,.22)';ctx.lineWidth=2;
  for(let x=0;x<1024;x+=128){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
  for(let y=64;y<512;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y);ctx.stroke();}
  ctx.fillStyle='#14272d';ctx.fillRect(0,238,1024,36);
  ctx.fillStyle='#efff81';ctx.fillRect(0,252,1024,7);
  ctx.fillStyle='#14272d';ctx.beginPath();ctx.arc(744,159,33,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f8f3df';ctx.beginPath();ctx.arc(244,350,25,0,Math.PI*2);ctx.fill();
  ctx.font='bold 24px system-ui';ctx.textAlign='center';ctx.fillStyle='#14272d';ctx.fillText('SPIN / LAB',730,355);
  const texture=new T.CanvasTexture(textureCanvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const sphereGeo=new T.SphereGeometry(1,48,32);
  const ballMat=material(0xffffff,{map:texture,roughness:.46,metalness:.02});
  const ghostMat=material(0xd4b2ff,{map:texture,transparent:true,opacity:.48,depthWrite:false});
  function arrow(color) {
    const a=new T.ArrowHelper(Y,new T.Vector3(),1,color,.16,.075);
    a.line.material.transparent=true;a.line.material.opacity=.95;
    a.cone.material.transparent=true;a.cone.material.opacity=.95;
    a.line.material.depthTest=false;a.cone.material.depthTest=false;a.line.material.depthWrite=false;a.cone.material.depthWrite=false;a.line.renderOrder=5;a.cone.renderOrder=5;
    return a;
  }
  function setArrow(a,value,origin=[0,0,0],scale=1,max=Infinity) {
    const mag=length(value);a.visible=mag>1e-6;
    if(!a.visible)return;
    a.position.set(...origin);a.setDirection(v(value).normalize());
    const len=Math.min(max,mag*scale);
    a.setLength(len,Math.min(len*.3,.14),Math.min(len*.13,.065));
  }
  function makeBall(parent,ghost=false) {
    const root=new T.Group(),body=new T.Mesh(sphereGeo,ghost?ghostMat:ballMat);root.add(body);parent.add(root);
    const axis=arrow(ghost?COLORS.b:COLORS.spin);root.add(axis);
    const rear=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(0,-1,0)]),new T.LineBasicMaterial({color:COLORS.spin,transparent:true,opacity:.28}));root.add(rear);
    const components=['x','y','z'].map(k=>{const a=arrow(COLORS[k]);root.add(a);return a;});
    const ring=new T.Group();root.add(ring);
    const points=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;points.push(new T.Vector3(Math.cos(a)*1.38,0,-Math.sin(a)*1.38));}
    const circle=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:ghost?COLORS.b:COLORS.spin,transparent:true,opacity:.4}));ring.add(circle);
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,cone=new T.Mesh(new T.ConeGeometry(.065,.2,10),basic(ghost?COLORS.b:COLORS.spin));
      cone.position.set(Math.cos(a)*1.38,0,-Math.sin(a)*1.38);
      cone.quaternion.setFromUnitVectors(Y,new T.Vector3(-Math.sin(a),0,-Math.cos(a)));
      ring.add(cone);
    }
    const label=textSprite('ω','#e9ff70',.23);root.add(label);
    const surfaceGhosts=[];
    for(let i=0;i<2;i++){
      const g=new T.Mesh(sphereGeo,new T.MeshBasicMaterial({map:texture,transparent:true,opacity:.08/(i+1),depthWrite:false,wireframe:true}));
      g.scale.setScalar(1.015+i*.015);root.add(g);surfaceGhosts.push(g);
    }
    const contactDot=new T.Mesh(new T.SphereGeometry(.07,12,8),basic(COLORS.friction));root.add(contactDot);contactDot.visible=false;
    return {root,body,axis,rear,components,ring,label,surfaceGhosts,contactDot};
  }
  const primary=makeBall(scene),secondary=makeBall(scene,true),lens=makeBall(lensScene);
  lens.root.position.set(0,0,0);lens.root.scale.setScalar(.38);
  const spinBackdrop=new T.Group();scene.add(spinBackdrop);
  for(let i=0;i<3;i++){
    const ring=new T.Mesh(new T.RingGeometry(.73+i*.23,.733+i*.23,96),basic(0x365652,.23-i*.05));
    ring.rotation.x=-Math.PI/2;ring.position.y=.58;spinBackdrop.add(ring);
  }
  const axes=new T.AxesHelper(.55);axes.position.set(-.9,.82,-.9);arena.add(axes);
  function racket(parent,tint=0x784899) {
    const root=new T.Group();parent.add(root);
    const wood=material(0xd2ab75,{roughness:.75}),rubber=material(tint,{roughness:.96});
    const blade=new T.Mesh(new T.CylinderGeometry(.079,.079,.009,40),wood);blade.rotation.x=Math.PI/2;blade.scale.z=1.08;root.add(blade);
    for(const sign of [-1,1]){
      const face=new T.Mesh(new T.CircleGeometry(.078,40),sign>0?rubber:material(0x29272c));
      face.position.z=sign*.0055;face.scale.y=1.08;if(sign<0)face.rotation.y=Math.PI;root.add(face);
    }
    box(root,[.026,.105,.021],[0,-.116,0],wood);
    box(root,[.019,.078,.023],[0,-.131,0],material(0x382e40));
    return root;
  }
  const paddle=racket(scene),paddleB=racket(scene,0x454b82);
  const strokeArrow=arrow(COLORS.racket);scene.add(strokeArrow);
  const linearArrow=arrow(COLORS.velocity);scene.add(linearArrow);
  const forceArrow=arrow(COLORS.friction);scene.add(forceArrow);
  const impactRing=new T.Mesh(new T.RingGeometry(.8,1,48),basic(0xe9ff95,.7));scene.add(impactRing);impactRing.visible=false;
  const shadow=new T.Mesh(new T.CircleGeometry(.07,32),basic(0x000b0e,.35));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const paths=new T.Group();scene.add(paths);
  let timelines=[],pathLines=[],ghostLine=null,markers=[],mode='return',view='arena',width=1,height=1,lastState=null;
  let theta=-.58,phi=1.07,distance=4.8,targetTheta=theta,targetPhi=phi,targetDistance=distance;
  const focus=new T.Vector3(0,.8,0),desiredFocus=focus.clone();
  const raycaster=new T.Raycaster();
  const pointers=new Map();
  let drag=null,pinchDistance=0;
  function clearPaths(){
    paths.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
    paths.clear();pathLines=[];markers=[];ghostLine=null;
  }
  function path(t,color,dashed=false) {
    const points=t.states.map(s=>v(s.p));
    const geometry=new T.BufferGeometry().setFromPoints(points);
    const mat=dashed?new T.LineDashedMaterial({color,dashSize:.04,gapSize:.035,transparent:true,opacity:.35}):
      new T.LineBasicMaterial({color,transparent:true,opacity:.85});
    const line=new T.Line(geometry,mat);if(dashed)line.computeLineDistances();paths.add(line);
    return line;
  }
  function setTimelines(next,ghost){
    clearPaths();timelines=next;
    next.forEach((t,i)=>{
      const faint=path(t,i?COLORS.b:COLORS.velocity,true);faint.material.opacity=i?.19:.13;
      pathLines.push(path(t,i?COLORS.b:COLORS.velocity));
      if(t.impact){
        const hit=t.impact,center=add(hit.before.p,mul(hit.normal,-(C.radius+.006)));
        const trace={states:[-.12,0,.12].map(dt=>({p:add(center,mul(hit.velocity,dt))}))};
        const line=path(trace,COLORS.racket,true);line.material.opacity=.35;
      }
      t.events.filter(e=>e.kind==='bounce'||e.kind==='racket').slice(0,4).forEach(e=>{
        const mark=new T.Mesh(new T.RingGeometry(.047,.052,36),basic(i?COLORS.b:COLORS.spin,.45));
        mark.position.set(...e.p);if(e.kind==='bounce'){mark.rotation.x=-Math.PI/2;mark.position.y=C.tableHeight+.004;}else mark.quaternion.copy(camera.quaternion);
        paths.add(mark);markers.push({mark,event:e});
      });
    });
    if(ghost)ghostLine=path(ghost,0xd0dbd8,true);
  }
  function setMode(next) {
    mode=next;arena.visible=next!=='spin';paths.visible=next!=='spin';spinBackdrop.visible=next==='spin';
    view=next==='spin'?'ball':'arena';setView(view,true);
  }
  function setView(next,reset=false){
    view=next;
    const close=next==='ball'||next==='contact';
    if(next==='top'){targetTheta=0;targetPhi=.045;targetDistance=4.8;}
    else if(next==='side'){targetTheta=-Math.PI/2;targetPhi=1.4;targetDistance=4.9;}
    else if(next==='player'){targetTheta=Math.PI;targetPhi=1.17;targetDistance=3.9;}
    else if(close){targetTheta=-.5;targetPhi=1.13;targetDistance=mode==='spin'?2.55:next==='contact'?.4:.65;}
    else {targetTheta=-.58;targetPhi=1.07;targetDistance=4.8;}
    if(reset&&mode==='spin')desiredFocus.set(0,1.13,0);
  }
  function resize(){
    width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);resize();
  function paintBall(o,s,radius,opts) {
    o.root.visible=true;o.root.position.set(...s.p);o.root.scale.setScalar(radius);
    o.body.quaternion.fromArray(opts.readable?s.displayQ:s.q);
    const speed=length(s.w),u=speed?v(s.w).normalize():Y.clone();
    const axisLength=2.8*Math.tanh(speed/350);
    setArrow(o.axis,s.w,[0,0,0],axisLength/(speed||1));
    o.axis.visible=opts.axis&&speed>.001;
    o.rear.visible=o.axis.visible;o.rear.quaternion.setFromUnitVectors(Y,u);o.rear.scale.setScalar(axisLength*.75);
    o.label.visible=o.axis.visible;o.label.position.copy(u).multiplyScalar(axisLength+.2);
    o.ring.visible=opts.ring&&speed>.001;o.ring.quaternion.setFromUnitVectors(Y,u);
    // Components use one common linear scale and share an origin.
    o.components.forEach((a,i)=>{const w=[0,0,0];w[i]=s.w[i];setArrow(a,w,[0,0,0],axisLength/(speed||1));a.visible=opts.components&&Math.abs(w[i])>.01;});
    o.surfaceGhosts.forEach((g,i)=>{g.visible=opts.ghosts;g.quaternion.copy(o.body.quaternion);
      if(speed)g.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(u,-.18*(i+1)));});
    o.contactDot.visible=false;
  }
  function positionRacket(object,timeline,time) {
    if(!timeline?.impact){object.visible=false;return;}
    object.visible=true;
    const hit=timeline.impact,dt=clamp(time-timeline.impactTime,-.12,.12);
    const center=add(hit.before.p,mul(hit.normal,-(C.radius+.006)));
    object.position.set(...add(center,mul(hit.velocity,dt)));
    object.quaternion.setFromUnitVectors(Z,v(hit.normal));
  }
  let slowFrames=0,frames=0;
  function update(states,time,dt,opts) {
    lastState=states[0];
    const spin=mode==='spin',close=view==='ball'||view==='contact';
    const s=states[0],radius=spin?.33:close?.025:.036;
    paintBall(primary,s,radius,opts);
    if(states[1])paintBall(secondary,states[1],radius,{...opts,components:false});
    else secondary.root.visible=false;
    paintBall(lens,{...s,p:[0,0,0]},.34,{...opts,components:false,ghosts:false});
    if(spin)desiredFocus.set(0,1.13,0);
    else if(view==='contact'&&timelines[0]?.impact)desiredFocus.set(...timelines[0].impact.before.p);
    else if(view==='ball')desiredFocus.set(...s.p);
    else desiredFocus.set(0,mode==='serve'?1.0:.76,0);
    const factor=opts.reduced?1:1-Math.exp(-dt*7);
    focus.lerp(desiredFocus,factor);theta+=(targetTheta-theta)*factor;phi+=(targetPhi-phi)*factor;distance+=(targetDistance-distance)*factor;
    const portrait=close?1:Math.max(1,1/camera.aspect*.73);
    camera.position.set(focus.x+distance*portrait*Math.sin(phi)*Math.sin(theta),
      focus.y+distance*portrait*Math.cos(phi),focus.z+distance*portrait*Math.sin(phi)*Math.cos(theta));
    camera.lookAt(focus);camera.updateMatrixWorld();
    const hit=timelines[0]?.impact;
    const atImpact=hit&&Math.abs(time-timelines[0].impactTime)<.14;
    positionRacket(paddle,timelines[0],time);positionRacket(paddleB,timelines[1],time);
    paddle.visible=paddle.visible&&!spin;paddleB.visible=paddleB.visible&&!spin;
    setArrow(linearArrow,s.v,s.p,.08,.58);linearArrow.visible=opts.vectors&&!spin&&length(s.v)>.01;
    if(hit&&!spin){
      const origin=add(hit.before.p,mul(hit.normal,-.028));
      setArrow(strokeArrow,hit.velocity,origin,.08,.65);strokeArrow.visible=opts.vectors;
      setArrow(forceArrow,hit.tangentImpulse,origin,160,.45);forceArrow.visible=opts.vectors&&atImpact&&length(hit.tangentImpulse)>.00001;
      if(view==='contact'){primary.contactDot.visible=true;primary.contactDot.position.copy(v(hit.normal).multiplyScalar(-1.025));}
    }else {strokeArrow.visible=false;forceArrow.visible=false;}
    shadow.visible=!spin&&s.p[1]>.76&&Math.abs(s.p[0])<.8&&Math.abs(s.p[2])<1.4;
    shadow.position.set(s.p[0],.765,s.p[2]);shadow.material.opacity=.4/(1+Math.abs(s.p[1]-.78)*4);
    const event=timelines[0]?.events.filter(e=>e.contact&&time>=e.t&&time-e.t<.17).at(-1);
    impactRing.visible=!!event&&!opts.reduced;
    if(event){
      const age=(time-event.t)/.17;impactRing.position.set(...event.p);
      impactRing.quaternion.copy(camera.quaternion);impactRing.scale.setScalar(.04+age*.2);impactRing.material.opacity=(1-age)*.65;
    }
    pathLines.forEach((line,i)=>{
      const a=timelines[i].states;
      let count=0;while(count<a.length&&a[count].t<=time)count++;
      line.geometry.setDrawRange(0,Math.max(2,count));line.visible=opts.trails;
    });
    paths.visible=!spin&&opts.trails;
    if(ghostLine)ghostLine.visible=opts.baseline;
    axes.visible=opts.components;
    renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);renderer.setClearColor(0x081316,0);renderer.clear();renderer.render(scene,camera);
    if(!spin&&!close&&opts.lens){
      const size=Math.min(width*.34,146),x=width-size-8,y=height-size-8;
      renderer.setScissorTest(true);renderer.setScissor(x,y,size,size);renderer.setViewport(x,y,size,size);
      renderer.clearDepth();
      lensCamera.position.copy(camera.position).sub(focus).normalize().multiplyScalar(2.2);
      lensCamera.lookAt(0,0,0);renderer.render(lensScene,lensCamera);renderer.setScissorTest(false);
    }
    if(++frames<180&&dt>.027)slowFrames++;
    if(frames===180&&slowFrames>60)renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  }
  function point(e){
    const rect=canvas.getBoundingClientRect();
    return new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){drag=null;const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);return;}
    raycaster.setFromCamera(point(e),camera);
    const touched=mode==='spin'&&raycaster.intersectObject(primary.body).length>0;
    const stroke=['return','serve'].includes(mode)&&paddle.visible&&raycaster.intersectObject(paddle,true).length>0;
    drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),ball:touched,stroke};
    canvas.style.cursor=touched?'grabbing':'move';
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinchDistance)targetDistance=clamp(targetDistance*pinchDistance/d,.22,12);
      pinchDistance=d;return;
    }
    if(!drag)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.ball){
      const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      const up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
      const impulse=up.multiplyScalar(dx*2).add(right.multiplyScalar(dy*2));
      callbacks.onSpin?.(impulse.toArray());
    }else if(drag.stroke){
      const dxAll=e.clientX-drag.startX,dyAll=e.clientY-drag.startY;
      const direction=new T.Vector3(dxAll,-dyAll,0).applyQuaternion(camera.quaternion);
      const setup=timelines[0].racket;
      const along=direction.dot(v(setup.side)),up=direction.dot(v(setup.up));
      callbacks.onStroke?.((Math.atan2(up,along)*180/Math.PI+360)%360,clamp(Math.hypot(dxAll,dyAll)/12,.2,14));
    }else{
      targetTheta-=dx*.008;targetPhi=clamp(targetPhi-dy*.006,.04,Math.PI*.88);
    }
    drag.x=e.clientX;drag.y=e.clientY;
  });
  const end=e=>{
    const wasStroke=drag?.stroke;pointers.delete(e.pointerId);pinchDistance=0;drag=null;canvas.style.cursor='grab';
    if(wasStroke)callbacks.onStrokeEnd?.();
  };
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('wheel',e=>{e.preventDefault();targetDistance=clamp(targetDistance*Math.exp(e.deltaY*.001),.22,12);},{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='+'||e.key==='='){targetDistance=clamp(targetDistance*.85,.22,12);e.preventDefault();}
    if(e.key==='-'){targetDistance=clamp(targetDistance*1.18,.22,12);e.preventDefault();}
    if(e.key==='ArrowLeft'){targetTheta-=.15;e.preventDefault();}
    if(e.key==='ArrowRight'){targetTheta+=.15;e.preventDefault();}
    if(e.key==='ArrowUp'){targetPhi=clamp(targetPhi-.12,.04,2.76);e.preventDefault();}
    if(e.key==='ArrowDown'){targetPhi=clamp(targetPhi+.12,.04,2.76);e.preventDefault();}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();callbacks.onContextLost?.();});
  return {setTimelines,setMode,setView,update,resize,renderer,
    zoom:amount=>{targetDistance=clamp(targetDistance*amount,.22,12);},
    project:p=>{const a=v(p).project(camera);return {x:(a.x+1)*width/2,y:(1-a.y)*height/2};}};
}
