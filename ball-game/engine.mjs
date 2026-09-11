// Shared deterministic rules. Only the host runs collisions and awards mass.
export const RULES = Object.freeze({ size: 4200, food: 900, viruses: 22, maxCells: 16, maxHumans: 8, maxBots: 16, startMass: 25, splitMass: 36, ejectMass: 35, eatRatio: 1.15 });
export const radius = mass => Math.sqrt(mass) * 4;
export const speed = mass => 320 * Math.pow(Math.max(mass, 10), -0.18);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const totalMass = p => p.cells.reduce((n, c) => n + c.m, 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function center(p) {
  const m = totalMass(p);
  return m ? { x: p.cells.reduce((n,c)=>n+c.x*c.m,0)/m, y:p.cells.reduce((n,c)=>n+c.y*c.m,0)/m } : {x:2100,y:2100};
}
function hash(n) { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return ((n ^ n >>> 16) >>> 0) / 4294967296; }
export function foodAt(seed, id, generation = 0) {
  const key = (seed + id * 7919 + generation * 104729) | 0;
  return { id, x: 30 + hash(key) * (RULES.size-60), y:30 + hash(key+12345) * (RULES.size-60), hue:id%6 };
}
export class SpatialGrid {
  constructor(size=128) { this.size=size; this.buckets=new Map(); }
  clear() { this.buckets.clear(); }
  insert(o) { const key=`${Math.floor(o.x/this.size)},${Math.floor(o.y/this.size)}`; const bucket=this.buckets.get(key); if(bucket) bucket.push(o); else this.buckets.set(key,[o]); }
  *near(x,y,r) { for(let i=Math.floor((x-r)/this.size);i<=Math.floor((x+r)/this.size);i++) for(let j=Math.floor((y-r)/this.size);j<=Math.floor((y+r)/this.size);j++) { const b=this.buckets.get(`${i},${j}`); if(b) yield* b; } }
}
export class World {
  constructor(seed = (Math.random()*1e9)|0) {
    this.seed=seed; this.time=0; this.nextId=1; this.players=new Map(); this.generations=Array(RULES.food).fill(0);
    this.food=this.generations.map((g,i)=>foodAt(seed,i,g)); this.foodGrid=new SpatialGrid(); this.cellGrid=new SpatialGrid(200);
    this.viruses=[]; this.ejected=[]; this.botClock=0;
    for(let i=0;i<RULES.viruses;i++) this.viruses.push(this.virus());
  }
  random() { return hash(this.seed + this.nextId++ * 16381); }
  position() { return 120+this.random()*(RULES.size-240); }
  cell(x,y,m) { return {id:this.nextId++,x,y,m,vx:0,vy:0,mergeAt:0,born:this.time}; }
  virus() { return {id:this.nextId++,x:this.position(),y:this.position(),m:100,feeds:0,vx:0,vy:0}; }
  addPlayer(id,name,bot=false,hue=0) {
    if(this.players.has(id)) return this.players.get(id);
    if([...this.players.values()].filter(p=>p.bot===bot).length >= (bot?RULES.maxBots:RULES.maxHumans)) return null;
    const p={id,name:String(name||'Wanderer').slice(0,18),bot,hue:clamp(Math.floor(hue)||0,0,5),cells:[],input:{x:0,y:0},lastInput:this.time,lastSplit:-1,lastEject:-1,deadAt:0,kills:0,peak:0};
    this.players.set(id,p); this.spawn(p); return p;
  }
  spawn(p) {
    let x,y;
    for(let i=0;i<40;i++) { x=this.position();y=this.position(); if(![...this.players.values()].some(o=>o.cells.some(c=>c.m>RULES.startMass*RULES.eatRatio && Math.hypot(c.x-x,c.y-y)<radius(c.m)+240))) break; }
    p.cells=[this.cell(x,y,RULES.startMass)];p.deadAt=0;p.input={x:0,y:0};p.peak=RULES.startMass;p.kills=0;
  }
  setBots(count) {
    count=clamp(Math.floor(Number(count))||0,0,RULES.maxBots);
    const bots=[...this.players.values()].filter(p=>p.bot);
    for(const p of bots.slice(count)) this.players.delete(p.id);
    const names=['Mochi','Nova','Orbit','Yuzu','Echo','Comet','Luma','Pluto','Miso','Vega','Koi','Sol','Aster','Pip','Io','Nori'];
    for(let i=bots.length;i<count;i++) this.addPlayer(`bot-${this.nextId++}`,names[i],true,i%6);
  }
  input(id,raw) {
    const p=this.players.get(id); if(!p||!raw||!Number.isFinite(raw.x)||!Number.isFinite(raw.y)) return;
    const length=Math.max(1,Math.hypot(raw.x,raw.y));p.input={x:raw.x/length,y:raw.y/length};p.lastInput=this.time;
  }
  action(id,type) {
    const p=this.players.get(id);if(!p)return;
    if(type==='respawn') { if(!p.cells.length && this.time-p.deadAt>=1.5) this.spawn(p);return; }
    let {x,y}=p.input; const d=Math.hypot(x,y); if(d<0.01){x=1;y=0;}else{x/=d;y/=d;}
    if(type==='split' && this.time-p.lastSplit>=0.22) {
      p.lastSplit=this.time;
      for(const c of [...p.cells]) { if(c.m<RULES.splitMass||p.cells.length>=RULES.maxCells)continue;
        c.m/=2;c.mergeAt=this.time+30+c.m*0.02;
        const n=this.cell(c.x+x*radius(c.m)*0.6,c.y+y*radius(c.m)*0.6,c.m);n.vx=x*700;n.vy=y*700;n.mergeAt=c.mergeAt;p.cells.push(n);
      }
    }
    if(type==='eject' && this.time-p.lastEject>=0.16) {
      p.lastEject=this.time;
      for(const c of p.cells) { if(c.m<RULES.ejectMass||this.ejected.length>=256)continue;c.m-=16;
        this.ejected.push({id:this.nextId++,x:c.x+x*(radius(c.m)+18),y:c.y+y*(radius(c.m)+18),m:12,vx:x*500,vy:y*500,born:this.time,owner:id,hue:p.hue});
      }
    }
  }
  pop(p,c) {
    c.m+=100;
    const parts=Math.min(RULES.maxCells-p.cells.length+1,Math.floor(c.m/18));
    if(parts<2)return;
    c.m/=parts;c.mergeAt=this.time+30+c.m*0.02;
    for(let i=1;i<parts;i++) {const a=i/parts*Math.PI*2;const n=this.cell(c.x,c.y,c.m);n.vx=Math.cos(a)*450;n.vy=Math.sin(a)*450;n.mergeAt=c.mergeAt;p.cells.push(n);}
  }
  think() {
    const cells=[...this.players.values()].flatMap(p=>p.cells.map(c=>({c,p})));
    for(const p of this.players.values()) {if(!p.bot)continue;if(!p.cells.length){if(this.time-p.deadAt>3)this.spawn(p);continue;}
      const c=p.cells.reduce((a,b)=>a.m>b.m?a:b),pos=center(p);let target=null,score=-Infinity,escape=null;
      for(const other of cells) {if(other.p===p)continue;const d=distance(c,other.c);
        if(other.c.m>c.m*1.15 && d<radius(other.c.m)+340) {escape=other.c;break;}
        if(c.m>other.c.m*1.3&&d<700){const s=other.c.m/(d+30);if(s>score){target=other.c;score=s;}}
      }
      if(!escape && c.m>115) escape=this.viruses.find(v=>distance(c,v)<radius(c.m)+100);
      if(escape) this.input(p.id,{x:pos.x-escape.x,y:pos.y-escape.y});
      else {if(!target){let nearest=Infinity;for(const f of this.foodGrid.near(pos.x,pos.y,600)){const d=distance(pos,f);if(d<nearest){nearest=d;target=f;}}}
        if(target){this.input(p.id,{x:target.x-pos.x,y:target.y-pos.y});if(target.m&&c.m>target.m*2.7&&distance(c,target)<310&&p.cells.length<4&&this.random()<0.15)this.action(p.id,'split');}
        else this.input(p.id,{x:2100-pos.x,y:2100-pos.y});
      }
    }
  }
  step(dt=1/60) {
    this.time+=dt;
    this.foodGrid.clear();for(const f of this.food)this.foodGrid.insert(f);
    this.botClock-=dt;if(this.botClock<=0){this.botClock=0.2;this.think();}
    const all=[];
    for(const p of this.players.values()) {
      if(!p.bot&&this.time-p.lastInput>0.5)p.input={x:0,y:0};
      const group=center(p);
      for(const c of p.cells){const s=speed(c.m);
        // Once eligible, fragments converge even when equal-size siblings have
        // identical movement speed. Otherwise split fragments never reunite.
        if(p.cells.length>1 && this.time>=c.mergeAt){const dx=group.x-c.x,dy=group.y-c.y,d=Math.hypot(dx,dy);if(d>0.01){const pull=Math.min(s*.65,d*2)*dt;c.x+=dx/d*pull;c.y+=dy/d*pull;}}
        c.x+=(p.input.x*s+c.vx)*dt;c.y+=(p.input.y*s+c.vy)*dt;c.vx*=Math.exp(-5*dt);c.vy*=Math.exp(-5*dt);c.m=Math.max(10,c.m*(1-0.002*dt));this.bound(c);all.push({c,p});}
      // Own cells repel until their merge timers expire.
      for(let i=0;i<p.cells.length;i++)for(let j=i+1;j<p.cells.length;j++){
        const a=p.cells[i],b=p.cells[j];if(!a.m||!b.m)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);const sum=radius(a.m)+radius(b.m);
        if(this.time>=Math.max(a.mergeAt,b.mergeAt)&&d<sum*0.65){const m=a.m+b.m;a.x=(a.x*a.m+b.x*b.m)/m;a.y=(a.y*a.m+b.y*b.m)/m;a.m=m;b.m=0;}
        else if(this.time<Math.max(a.mergeAt,b.mergeAt)&&d<sum&&this.time-Math.max(a.born,b.born)>0.5){if(d<0.01){dx=1;dy=0;d=1;}const push=(sum-d)*Math.min(0.5,dt*8);a.x-=dx/d*push;a.y-=dy/d*push;b.x+=dx/d*push;b.y+=dy/d*push;}
      }
    }
    for(const e of [...this.ejected,...this.viruses]){e.x+=e.vx*dt;e.y+=e.vy*dt;e.vx*=Math.exp(-4*dt);e.vy*=Math.exp(-4*dt);this.bound(e);}
    for(const e of this.ejected){if(!e.m)continue;for(const v of this.viruses){if(distance(e,v)<radius(v.m)){e.m=0;v.feeds++;v.m+=12;if(v.feeds>=7){v.feeds=0;v.m=100;if(this.viruses.length<64){const a=Math.atan2(e.vy,e.vx);this.viruses.push({...this.virus(),x:v.x,y:v.y,vx:Math.cos(a)*520,vy:Math.sin(a)*520});}}break;}}}
    for(const {c,p} of all){if(c.m<=0)continue;
      for(const f of this.foodGrid.near(c.x,c.y,radius(c.m))){if(this.food[f.id]!==f)continue;if(distance(c,f)<radius(c.m)){c.m+=1;this.generations[f.id]++;this.food[f.id]=foodAt(this.seed,f.id,this.generations[f.id]);}}
      for(const e of this.ejected){if(!e.m|| (e.owner===p.id&&this.time-e.born<0.5))continue;if(distance(c,e)<radius(c.m)-radius(e.m)*0.3){c.m+=e.m;e.m=0;}}
      for(const v of this.viruses){if(v.m&&c.m>v.m*RULES.eatRatio&&distance(c,v)<radius(c.m)-radius(v.m)*0.3){this.pop(p,c);v.m=0;}}
    }
    this.cellGrid.clear();for(const o of all)if(o.c.m>0)this.cellGrid.insert({x:o.c.x,y:o.c.y,...o});
    // Larger cells resolve first, preventing duplicate consumption.
    all.sort((a,b)=>b.c.m-a.c.m);
    for(const {c,p} of all){if(!c.m)continue;for(const {c:other,p:owner} of this.cellGrid.near(c.x,c.y,radius(c.m))){if(owner===p||!other.m||c.m<=other.m*RULES.eatRatio)continue;if(distance(c,other)<radius(c.m)-radius(other.m)*0.35){c.m+=other.m;other.m=0;if(owner.cells.every(x=>x.m===0))p.kills++;}}}
    for(const p of this.players.values()){const wasAlive=p.cells.length>0;p.cells=p.cells.filter(c=>c.m>0);if(wasAlive&&!p.cells.length)p.deadAt=this.time;for(const c of p.cells)this.bound(c);p.peak=Math.max(p.peak,totalMass(p));}
    this.ejected=this.ejected.filter(e=>e.m>0&&this.time-e.born<45);
    this.viruses=this.viruses.filter(v=>v.m>0);while(this.viruses.length<RULES.viruses)this.viruses.push(this.virus());
  }
  bound(c) {const r=radius(c.m);c.x=clamp(c.x,r,RULES.size-r);c.y=clamp(c.y,r,RULES.size-r);}
  snapshot() {
    const q=n=>Math.round(n*10)/10;
    return {type:'frame',time:q(this.time),players:[...this.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,hue:p.hue,kills:p.kills,peak:q(p.peak),deadAt:p.deadAt,cells:p.cells.map(c=>[c.id,q(c.x),q(c.y),q(c.m),q(c.vx),q(c.vy),q(c.mergeAt)])})),viruses:this.viruses.map(v=>[v.id,q(v.x),q(v.y),v.m]),ejected:this.ejected.map(e=>[e.id,q(e.x),q(e.y),e.m,e.hue])};
  }
}
export function decodeFrame(frame) {
  return {...frame,players:frame.players.map(p=>({...p,cells:p.cells.map(c=>({id:c[0],x:c[1],y:c[2],m:c[3],vx:c[4],vy:c[5],mergeAt:c[6]}))})),viruses:frame.viruses.map(c=>({id:c[0],x:c[1],y:c[2],m:c[3]})),ejected:frame.ejected.map(c=>({id:c[0],x:c[1],y:c[2],m:c[3],hue:c[4]}))};
}
