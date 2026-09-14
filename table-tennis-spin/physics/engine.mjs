import {add,sub,mul,dot,cross,length,unit,clamp,rotate} from './math.mjs';

// Right handed frame: +X right, +Y up, +Z from server toward far end.
// Topspin for flight toward +Z is +omegaX; sidespin is omegaY.
// Clockwise sidespin is defined viewed from ABOVE (+Y looking down).
// A thin hollow shell: I = 2/3 m R^2. The visible ball may be enlarged.
export const C = Object.freeze({
  radius:.02, mass:.0027, inertia:2/3*.0027*.02**2, gravity:9.81,
  tableHeight:.76, tableWidth:1.525, tableLength:2.74, netHeight:.1525,
  dt:1/120, airDensity:1.225, dragCoefficient:.47,
  magnus:.00065, spinDecay:.025, tableRestitution:.88, tableFriction:.22,
  racketRestitution:.78, racketFriction:.85,
});
export function ball(p,v,w=[0,0,0]) {
  return {p:p.slice(),v:v.slice(),w:w.slice(),q:[0,0,0,1],displayQ:[0,0,0,1],t:0};
}
export function copy(s) {
  return {p:s.p.slice(),v:s.v.slice(),w:s.w.slice(),q:s.q.slice(),displayQ:s.displayQ.slice(),t:s.t};
}
export function flight(s,dt=C.dt,magnus=true) {
  const speed=length(s.v);
  const drag=.5*C.airDensity*C.dragCoefficient*Math.PI*C.radius**2/C.mass;
  const lift=magnus?mul(cross(s.w,s.v),C.magnus):[0,0,0];
  const a=add([0,-C.gravity,0],add(mul(s.v,-drag*speed),lift));
  const old=s.v;
  s.v=add(s.v,mul(a,dt)); s.p=add(s.p,mul(add(old,s.v),dt/2));
  s.q=rotate(s.q,s.w,dt); s.displayQ=rotate(s.displayQ,s.w,dt,true);
  s.w=mul(s.w,Math.exp(-C.spinDecay*dt)); s.t+=dt;
  return s;
}
// Infinite-mass moving plane, normal points from the surface INTO the ball.
// Contact normal and radius stay antiparallel: an ideal sphere's normal
// impulse passes through its center. Moving the contact rotates that plane.
// Coulomb friction is bounded by mu*Jn AND the impulse required to stop slip.
export function contact(s,{normal=[0,1,0],velocity=[0,0,0],restitution=.88,friction=.22,grip=1}={}) {
  const n=unit(normal), r=mul(n,-C.radius), before=copy(s);
  const rotational=cross(s.w,r),surface=add(s.v,rotational);
  const relative=sub(velocity,surface),closing=dot(relative,n);
  const tangent=sub(relative,mul(n,closing));
  let normalImpulse=[0,0,0],tangentImpulse=[0,0,0];
  if(closing>0) {
    normalImpulse=mul(n,C.mass*(1+restitution)*closing);
    const inverseEffectiveMass=1/C.mass+C.radius**2/C.inertia;
    const needed=length(tangent)/inverseEffectiveMass;
    const amount=Math.min(needed*clamp(grip,0,1),friction*length(normalImpulse));
    tangentImpulse=mul(unit(tangent),amount);
    const impulse=add(normalImpulse,tangentImpulse);
    s.v=add(s.v,mul(impulse,1/C.mass));
    s.w=add(s.w,mul(cross(r,tangentImpulse),1/C.inertia));
  }
  return {before,after:copy(s),normal:n,r,velocity:velocity.slice(),rotational,surface,
    relative,tangent,normalImpulse,tangentImpulse,impulse:add(normalImpulse,tangentImpulse),
    deltaW:sub(s.w,before.w),closing};
}
export function bounce(s) {
  s.p[1]=C.tableHeight+C.radius;
  return contact(s,{normal:[0,1,0],restitution:C.tableRestitution,friction:C.tableFriction});
}
export function onTable(p) {
  return Math.abs(p[0])<=C.tableWidth/2 && Math.abs(p[2])<=C.tableLength/2;
}
export function racketSetup(config) {
  const pitch=config.angle*Math.PI/180;
  const yaw=clamp(config.contactX*.65,-Math.PI/2+.02,Math.PI/2-.02);
  // Contact Y and face pitch jointly orient the tangent plane, so the
  // chosen contact patch and displayed racket are geometrically consistent.
  const tilt=clamp(pitch+config.contactY*.65,-Math.PI/2+.02,Math.PI/2-.02);
  const normal=unit([Math.sin(yaw)*Math.cos(tilt),Math.sin(tilt),Math.cos(yaw)*Math.cos(tilt)]);
  const side=unit(cross([0,1,0],normal)),up=unit(cross(normal,side));
  const a=config.direction*Math.PI/180;
  const brush=add(mul(side,Math.cos(a)),mul(up,Math.sin(a)));
  // The speed control is the magnitude, independent of the brush/normal mix.
  const velocity=config.velocityOverride?.slice()||mul(unit(add(mul(normal,1-.83*config.brush),mul(brush,config.brush))),config.speed);
  return {normal,velocity,side,up,restitution:C.racketRestitution,friction:C.racketFriction,
    grip:.25+.75*config.brush};
}

// Contact-pad coordinates are a projection from the racket side:
// +x is screen-right (world -X on the ball), +y is world-up.
// Use the ACTUAL plane normal, including face pitch, for both directions.
export function contactPatch(config) {
  const {normal}=racketSetup(config);
  return [normal[0],-normal[1]];
}
export function setContactPatch(config,x,y) {
  // Stay on the visible hemisphere; avoid the singular silhouette at z=0.
  const scale=Math.min(1,.98/(Math.hypot(x,y)||1));
  x*=scale;y*=scale;
  const nz=Math.sqrt(Math.max(0,1-x*x-y*y));
  const yaw=Math.atan2(x,nz),tilt=Math.asin(-y);
  config.contactX=yaw/.65;
  config.contactY=(tilt-config.angle*Math.PI/180)/.65;
  return config;
}
