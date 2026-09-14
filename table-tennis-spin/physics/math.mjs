// All vectors are world-space [X, Y, Z]. SI units throughout.
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const mul = (a,s) => a.map(v=>v*s);
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const unit = a => mul(a,1/(length(a)||1));
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
export const limit = (a,max) => mul(a,Math.min(1,max/(length(a)||1)));
export const rpm = w => length(w)*60/(2*Math.PI);
export function qmul(a,b) {
  const [x,y,z,w]=a,[X,Y,Z,W]=b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
export function rotate(q,w,dt,readable=false) {
  const speed=length(w);
  if(speed<1e-9) return q.slice();
  // Display orientation is deliberately slowed; the physics always uses real omega.
  const angle=(readable ? 8*Math.tanh(speed/150) : speed)*dt;
  const s=Math.sin(angle/2)/speed;
  return unit(qmul([w[0]*s,w[1]*s,w[2]*s,Math.cos(angle/2)],q));
}
export function qmix(a,b,t) {
  const end=dot(a,b)<0?mul(b,-1):b;
  return unit(mix(a,end,t));
}
