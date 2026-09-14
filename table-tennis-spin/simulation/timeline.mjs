import {C,ball,copy,flight,contact,bounce,onTable,racketSetup} from '../physics/engine.mjs';
import {add,mul,mix,qmix,clamp} from '../physics/math.mjs';
import {spinFor} from './presets.mjs';

export function simulate(config,{noMagnus=false,noSpin=false}={}) {
  const mode=config.mode,serve=mode==='serve',isBounce=mode==='bounce';
  const racket=racketSetup(config),states=[],events=[];
  const releaseHeight=.88,apex=config.contactHeight+config.toss;
  const launchUp=Math.sqrt(2*C.gravity*Math.max(.01,apex-releaseHeight));
  const hitTime=serve?(launchUp+Math.sqrt(2*C.gravity*config.toss))/C.gravity:.42;
  let s=serve?ball([-.1,releaseHeight,-1.15],[0,launchUp,0]):
    isBounce?ball([0,config.launchHeight,-1.25],[0,-.2,config.launchSpeed],noSpin?[0,0,0]:spinFor(config.incoming)):
    ball([0,1.62,.57],[0,.9,-3.8],noSpin?[0,0,0]:spinFor(config.incoming,true));
  let impacted=isBounce,bounces=0,groundTime=null,impact=null,falling=false,netDone=false;
  const event=(kind,label,extra={})=>events.push({kind,label,t:s.t,p:s.p.slice(),...extra});
  event(serve?'release':'launch',serve?'Release':'Launch');
  states.push(copy(s));
  for(let i=1;i<850;i++) {
    const previous=copy(s);
    if(serve&&!impacted) {
      const t=Math.min(i*C.dt,hitTime);
      s.t=t;
      s.p=[-.1+config.offset*t/hitTime,releaseHeight+launchUp*t-.5*C.gravity*t*t,-1.15];
      s.v=[config.offset/hitTime,launchUp-C.gravity*t,0];
      if(!falling&&s.v[1]<=0){falling=true;event('falling','Falling');}
    } else flight(s,C.dt,config.magnus&&!noMagnus);
    if(!impacted&&s.t>=hitTime-1e-7) {
      if(serve) s.p[1]=config.contactHeight;
      impact=contact(s,racket);impacted=true;
      event('racket','Racket impact',{contact:impact});
    }
    if(impacted&&s.v[1]<0&&previous.p[1]>=C.tableHeight+C.radius&&s.p[1]<=C.tableHeight+C.radius&&onTable(s.p)) {
      const details=bounce(s); bounces++;
      event('bounce',bounces===1?'First bounce':bounces===2?'Second bounce':'Bounce '+bounces,{contact:details});
    }
    if(impacted&&!netDone&&previous.p[2]*s.p[2]<=0&&s.p[2]!==previous.p[2]&&Math.abs(s.p[0])<C.tableWidth/2+.15) {
      const u=-previous.p[2]/(s.p[2]-previous.p[2]);
      const y=previous.p[1]+(s.p[1]-previous.p[1])*u;
      if(y<C.tableHeight+C.netHeight+C.radius&&y>C.tableHeight-.05){
        s.p[2]=Math.sign(previous.p[2])*(C.radius+.004);
        s.v=[s.v[0]*.6,-Math.abs(s.v[1])*.3,-s.v[2]*.12];
        event('net-hit','Net contact');
      } else event('net','Net crossing');
      netDone=true;
    }
    if(s.p[1]<C.radius&&s.v[1]<0){
      s.p[1]=C.radius; s.v=[s.v[0]*.6,-s.v[1]*.35,s.v[2]*.6];
      if(groundTime===null){groundTime=s.t;event('floor','Floor');}
    }
    states.push(copy(s));
    if((groundTime!==null&&s.t-groundTime>.35)||(impacted&&s.t>(isBounce?2.1:hitTime+2.25)))break;
  }
  return {states,events,duration:states.at(-1).t,impactTime:impact?events.find(e=>e.kind==='racket').t:0,impact,config,racket};
}
export function sample(timeline,time) {
  const a=timeline.states;
  if(time<=a[0].t)return copy(a[0]);
  if(time>=a.at(-1).t)return copy(a.at(-1));
  let lo=0,hi=a.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(a[mid].t<=time)lo=mid;else hi=mid;}
  const x=a[lo],y=a[hi],u=clamp((time-x.t)/(y.t-x.t),0,1);
  // Never interpolate impulse discontinuities backward into the pre-contact state.
  const atEvent=timeline.events.some(e=>e.contact&&e.t>x.t+1e-8&&e.t<=y.t+1e-8);
  return {t:time,p:mix(x.p,y.p,u),v:atEvent?x.v.slice():mix(x.v,y.v,u),
    w:atEvent?x.w.slice():mix(x.w,y.w,u),q:qmix(x.q,y.q,u),displayQ:qmix(x.displayQ,y.displayQ,u)};
}
export function align(a,b) {
  const anchor=Math.max(a.impactTime,b.impactTime);
  return [a,b].map(t=>{
    const delay=anchor-t.impactTime;
    if(!delay)return t;
    const states=t.states.map(s=>({...s,t:s.t+delay}));
    states.unshift({...copy(t.states[0]),t:0});
    return {...t,states,events:t.events.map(e=>({...e,t:e.t+delay})),duration:t.duration+delay,impactTime:t.impactTime+delay};
  });
}
