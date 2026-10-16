// Pure terrarium logic: creature physics and moods, the day/night sky, surprise
// rolls and visit memory. Drawing and input live in main.js so this stays testable.

export const GAMES=[
  {id:'hollowstead',kind:'hollowstead',name:'Hollowstead',href:'/hollowstead/',tag:'Co-op survival',color:'#f4a261',accent:'#ffb703',bounce:.25,r:9.4,
    blurb:'Gather by day. Build a home. Keep the fire alive through five haunted nights, alone or with up to three friends.',
    bio:'Keeps a tiny fire on its head. Has never once let it go out.',emotes:['🔥','🪵','🏕️','👻','🌲']},
  {id:'bloom',kind:'bloom',name:'Bloom',href:'/ball-game/',tag:'Cell arena',color:'#8fdcab',accent:'#2f9e63',bounce:.45,r:9.2,
    blurb:'Eat, split, and survive in a luminous arena. Play with friends or add bots.',
    bio:'A hungry little cell. Will absolutely eat your crumbs.',emotes:['🫧','😋','🟢','✨','🍪']},
  {id:'hushlight',kind:'hushlight',name:'Hushlight',href:'/hushlight/',tag:'Night garden',color:'#8190e6',accent:'#ffe9a8',bounce:.3,r:9,
    blurb:'A floating night garden. Gather wandering lights and bring its sleeping shrines to life.',
    bio:'Carries its own little moon. Brightest after dark.',emotes:['🌙','🏮','✨','💤','🌌']},
  {id:'table-tennis',kind:'pingpong',name:'Table tennis',href:'/table-tennis/',tag:'Live scoreboard',color:'#fffaf0',accent:'#ff8a3d',bounce:.86,r:7.6,
    blurb:'Round-robin scoreboard. Host edits; friends watch live.',
    bio:'Bouncier than everyone else, and it knows it.',emotes:['🏓','💨','😤','🏆','🔁']},
  {id:'lobby',kind:'card',name:'Card lobby',href:'/lobby/',tag:'Shared card table',color:'#fbf5e9',accent:'#e05d6f',bounce:.3,r:9,
    blurb:'Free play, President, and Flip Seven on a shared table.',
    bio:'Shuffles itself when nervous. Is often nervous.',emotes:['🃏','♠️','♥️','🎲','🤝']},
  {id:'fodinha',kind:'fodinha',name:'Fodinha',href:'/fodinha/',tag:'Trick bidding',color:'#ffa3bb',accent:'#e63968',bounce:.35,r:8.8,
    blurb:'Bid your tricks. Miss, and you lose a life.',
    bio:'Has three lives. Spends them carelessly.',emotes:['❤️','🤞','😬','🃏','🙈']},
  {id:'presidente',kind:'presidente',name:'Presidente',href:'/presidente/',tag:'Shedding game',color:'#ffd56b',accent:'#e8a400',bounce:.3,r:9.2,
    blurb:'Shed your hand. First out is Presidente.',
    bio:'Was elected once. Has not stopped mentioning it.',emotes:['👑','🗳️','😌','📜','🎺']},
  {id:'count',kind:'count',name:'Count',href:'/count/',tag:'Party counting',color:'#cbaaff',accent:'#6e44c9',bounce:.35,r:9,
    blurb:'Watch the stage. Count what you saw. First correct or many winners.',
    bio:'Three eyes. Counts everything. Out loud.',emotes:['1️⃣','2️⃣','3️⃣','🤔','👀']},
  {id:'game-of-life',kind:'life',name:'Game of Life',href:'/game-of-life/',tag:'Cellular automaton',color:'#bfe3ff',accent:'#3f6fb0',bounce:.3,r:9,
    blurb:'Conway’s cellular automaton. Paint, stamp, and run.',
    bio:'Made of tiny cells that keep changing their minds.',emotes:['🧬','🔁','🌀','⬛','🧩']},
];

export const WIDTH=100, SOIL=22, GRAVITY=190, MAX_FOOD=6;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;

export function createRng(seed=1){
  let a=(seed>>>0)||1;
  return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}

export function createJar({aspect=1.5,rng=Math.random,games=GAMES}={}){
  const s={w:WIDTH,h:0,floor:0,gravity:{x:0,y:1},bodies:[],food:[],time:0,rng};
  setAspect(s,aspect);
  games.forEach((g,i)=>{
    const r=g.r||7.6;
    s.bodies.push({id:g.id,index:i,r,bounce:g.bounce??.35,x:r+rng()*(s.w-2*r),y:s.floor*(.1+rng()*.55),vx:(rng()-.5)*30,vy:0,
      mode:'idle',timer:.6+rng()*2.5,grounded:false,held:false,face:rng()<.5?-1:1,squash:0,wobble:0,spin:0,pokes:0});
  });
  return s;
}

export function setAspect(s,aspect){
  s.h=s.w*clamp(finite(aspect,1.5),1.1,1.9);
  s.floor=s.h-SOIL;
  for(const b of s.bodies)walls(s,b);
}

export function setGravity(s,x,y){
  const len=Math.hypot(x,y);
  s.gravity=len>1e-6&&Number.isFinite(len)?{x:x/len,y:y/len}:{x:0,y:1};
}

// The tangent points "right" relative to the current gravity, so hops stay sensible when the jar is tilted.
const tangent=g=>({x:g.y,y:-g.x});

function contact(s,b,nx,ny,speed){
  if(nx*s.gravity.x+ny*s.gravity.y>.5)b.grounded=true;
  if(speed>22)b.squash=Math.max(b.squash,Math.min(.38,speed/320));
}

function walls(s,b,events){
  const hit=(nx,ny,speed)=>{contact(s,b,nx,ny,speed);if(events&&speed>70)events.push({type:'bump',id:b.id,speed});};
  if(b.x<b.r){b.x=b.r;const v=-b.vx;if(b.vx<0)b.vx=v*b.bounce;hit(-1,0,v);}
  if(b.x>s.w-b.r){b.x=s.w-b.r;const v=b.vx;if(b.vx>0)b.vx=-v*b.bounce;hit(1,0,v);}
  if(b.y<b.r){b.y=b.r;const v=-b.vy;if(b.vy<0)b.vy=v*b.bounce;hit(0,-1,v);}
  if(b.y>s.floor-b.r){b.y=s.floor-b.r;const v=b.vy;if(b.vy>0)b.vy=-v*b.bounce;hit(0,1,v);}
}

function collide(s,a,b){
  let dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
  const min=a.r+b.r;
  if(d>=min)return;
  if(d<1e-6){dx=s.rng()-.5;dy=-.5;d=Math.hypot(dx,dy);}
  const nx=dx/d, ny=dy/d, overlap=min-d;
  const wa=a.held?0:b.held?1:.5, wb=1-wa;
  if(a.held&&b.held)return;
  a.x-=nx*overlap*wa;a.y-=ny*overlap*wa;b.x+=nx*overlap*wb;b.y+=ny*overlap*wb;
  const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(rv<0){
    const j=-(1+Math.min(a.bounce,b.bounce))*rv;
    if(!a.held){a.vx-=j*nx*wa;a.vy-=j*ny*wa;}
    if(!b.held){b.vx+=j*nx*wb;b.vy+=j*ny*wb;}
  }
  contact(s,a,nx,ny,-rv*.5);contact(s,b,-nx,-ny,-rv*.5);
}

function hop(s,b,side,up){
  const g=s.gravity, t=tangent(g);
  b.vx+=t.x*side-g.x*up;b.vy+=t.y*side-g.y*up;
  if(side)b.face=Math.sign(side);
  b.grounded=false;
}

function nearestFood(s,b){
  let best=null, bestD=Infinity;
  for(const f of s.food){const d=Math.hypot(f.x-b.x,f.y-b.y);if(d<bestD){bestD=d;best=f;}}
  return best;
}

function think(s,b,dt,night,events){
  b.timer-=dt;
  if(b.mode==='sleep'){
    const hungry=b.id==='bloom'&&s.food.length;
    if(hungry||(b.timer<=0&&(night<.6||s.rng()<.35))){b.mode='idle';b.timer=.3+s.rng();events.push({type:'wake',id:b.id});}
    return;
  }
  if(!b.grounded||b.timer>0)return;
  const rng=s.rng, food=nearestFood(s,b);
  if(food){
    const t=tangent(s.gravity), side=Math.sign((food.x-b.x)*t.x+(food.y-b.y)*t.y)||b.face;
    hop(s,b,side*(26+rng()*16),38+rng()*22);b.timer=.25+rng()*.35;
    events.push({type:'hop',id:b.id});
    return;
  }
  if((night>.6&&rng()<.4)||rng()<.03){
    b.mode='sleep';b.timer=night>.6?10+rng()*25:5+rng()*7;
    events.push({type:'sleep',id:b.id});
    return;
  }
  const big=rng()<.18;
  hop(s,b,(rng()<.5?-1:1)*(big?30:8+rng()*22),big?75+rng()*30:28+rng()*36);
  b.timer=1.2+rng()*4.2;
  events.push({type:'hop',id:b.id,big});
}

export function step(s,dt,{night=0}={}){
  const events=[];
  if(!(dt>0))return events;
  dt=Math.min(dt,.05);
  s.time+=dt;
  const g=s.gravity, damp=Math.exp(-.7*dt);
  for(const b of s.bodies){
    if(!b.held){
      think(s,b,dt,night,events);
      b.vx=(b.vx+g.x*GRAVITY*dt)*damp;b.vy=(b.vy+g.y*GRAVITY*dt)*damp;
      b.x+=b.vx*dt;b.y+=b.vy*dt;
    }
    b.grounded=false;
  }
  for(let iter=0;iter<4;iter++){
    for(let i=0;i<s.bodies.length;i++)for(let j=i+1;j<s.bodies.length;j++)collide(s,s.bodies[i],s.bodies[j]);
    for(const b of s.bodies)walls(s,b,iter===0?events:null);
  }
  const fr=Math.exp(-7*dt), t=tangent(g);
  for(const b of s.bodies){
    if(b.grounded&&!b.held){
      // Floor friction only damps motion along the surface, so bounces stay lively.
      const along=b.vx*t.x+b.vy*t.y, lost=along*(1-fr);
      b.vx-=t.x*lost;b.vy-=t.y*lost;
    }
    b.spin+=(b.vx*t.x+b.vy*t.y)/b.r*dt;
    b.squash*=Math.exp(-9*dt);b.wobble*=Math.exp(-3.2*dt);
    if(![b.x,b.y,b.vx,b.vy].every(Number.isFinite)){b.x=s.w/2;b.y=b.r;b.vx=0;b.vy=0;}
  }
  stepFood(s,dt,events);
  return events;
}

function stepFood(s,dt,events){
  const g=s.gravity;
  for(const f of s.food){
    f.age+=dt;
    if(!f.rest){f.vx+=g.x*GRAVITY*.45*dt;f.vy+=g.y*GRAVITY*.45*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;}
    const r=1.3, nx=clamp(f.x,r,s.w-r), ny=clamp(f.y,r,s.floor-r);
    if(nx!==f.x||ny!==f.y){f.x=nx;f.y=ny;f.vx=f.vy=0;f.rest=true;}
    if(f.rest&&Math.abs(g.x)>.3&&!(f.x<=r+.01||f.x>=s.w-r-.01))f.rest=false;
  }
  s.food=s.food.filter(f=>{
    if(f.age>30)return false;
    for(const b of s.bodies){
      if(b.mode==='sleep'||b.held)continue;
      if(Math.hypot(f.x-b.x,f.y-b.y)<b.r+1.6){events.push({type:'eat',id:b.id,x:f.x,y:f.y});b.wobble=Math.max(b.wobble,.6);return false;}
    }
    return true;
  });
}

export function dropFood(s,x,y){
  if(s.food.length>=MAX_FOOD)s.food.shift();
  const f={x:clamp(finite(x,s.w/2),1.3,s.w-1.3),y:clamp(finite(y,2),1.3,s.floor-1.3),vx:0,vy:0,age:0,rest:false};
  s.food.push(f);
  return f;
}

export function hitBody(s,x,y,pad=0){
  let best=null, bestD=Infinity;
  for(const b of s.bodies){const d=Math.hypot(x-b.x,y-b.y);if(d<b.r+pad&&d<bestD){best=b;bestD=d;}}
  return best;
}

export function poke(s,b){
  b.pokes++;b.mode='idle';b.wobble=1;b.timer=.5+s.rng();
  hop(s,b,(s.rng()-.5)*24,48+s.rng()*24);
  return b;
}

export function fling(b,vx,vy,max=280){
  const v=Math.hypot(vx,vy), k=v>max?max/v:1;
  b.vx=finite(vx*k);b.vy=finite(vy*k);b.mode='idle';b.timer=.8;
}

export function shake(s,strength=1){
  for(const b of s.bodies){
    if(b.held)continue;
    b.mode='idle';b.timer=.6+s.rng()*1.2;b.wobble=1;
    b.vx+=(s.rng()-.5)*220*strength;b.vy+=-(70+s.rng()*130)*strength;
  }
  for(const f of s.food){f.rest=false;f.vx+=(s.rng()-.5)*60;f.vy-=40*strength;}
}

// ── Sky ────────────────────────────────────────────────────────────────────
export const SKIES={
  night:{top:'#0a0f2e',bottom:'#2c2f6b',night:1},
  dawn:{top:'#ffb9a6',bottom:'#c2b8ff',night:.3},
  day:{top:'#8ecbff',bottom:'#fff0cf',night:0},
  dusk:{top:'#ff9c86',bottom:'#55468a',night:.6},
};
const STOPS=[[0,'night'],[5,'night'],[6.5,'dawn'],[8.5,'day'],[17,'day'],[18.8,'dusk'],[20.3,'night'],[24,'night']];
const hex=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
export function mixHex(a,b,t){
  const A=hex(a), B=hex(b);
  return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*clamp(t,0,1)).toString(16).padStart(2,'0')).join('');
}
export function skyAt(hours){
  const h=(((+hours)%24)+24)%24||0;
  let i=0;
  while(i<STOPS.length-2&&h>=STOPS[i+1][0])i++;
  const [h0,a]=STOPS[i], [h1,b]=STOPS[i+1], x=(h-h0)/(h1-h0), t=x*x*(3-2*x), A=SKIES[a], B=SKIES[b];
  return {top:mixHex(A.top,B.top,t),bottom:mixHex(A.bottom,B.bottom,t),night:A.night+(B.night-A.night)*t,phase:t<.5?a:b};
}

// ── Surprises ──────────────────────────────────────────────────────────────
export const RARITIES=[
  {tier:'legendary',label:'Legendary',chance:.03,stars:4},
  {tier:'epic',label:'Epic',chance:.1,stars:3},
  {tier:'rare',label:'Rare',chance:.27,stars:2},
  {tier:'common',label:'Common',chance:.6,stars:1},
];
export function rollRarity(rng=Math.random){
  const r=rng();let acc=0;
  for(const x of RARITIES){acc+=x.chance;if(r<acc)return x;}
  return RARITIES.at(-1);
}
export function pickIndex(rng,length,avoid=-1){
  if(length<=1)return 0;
  let i=Math.floor(rng()*length)%length;
  if(i===avoid)i=(i+1+Math.floor(rng()*(length-1)))%length;
  return i;
}

const EVENTS=[['chat',30],['snail',12],['butterfly',14,'day'],['rain',9],['mushrooms',10],['meteors',16,'night'],['golden',5],['party',3]];
export function pickEvent(rng=Math.random,night=0){
  const pool=EVENTS.filter(([,,when])=>!when||(when==='day'?night<.5:night>=.5));
  let r=rng()*pool.reduce((sum,[,w])=>sum+w,0);
  for(const [name,w] of pool){r-=w;if(r<0)return name;}
  return pool.at(-1)[0];
}

// ── Life (the Game of Life critter's insides) ──────────────────────────────
export function lifeStep(cells,n){
  const out=new Uint8Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let c=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)c+=cells[((y+dy+n)%n)*n+(x+dx+n)%n];
    out[y*n+x]=c===3||(c===2&&cells[y*n+x])?1:0;
  }
  return out;
}

// ── Visit memory ───────────────────────────────────────────────────────────
export function readMemory(raw,rng=Math.random){
  let d={};
  try{d=JSON.parse(raw)||{};}catch{d={};}
  if(typeof d!=='object'||Array.isArray(d))d={};
  const n=(v,max=1e9)=>Number.isFinite(+v)?clamp(Math.floor(+v),0,max):0;
  const pokes={};
  for(const g of GAMES)pokes[g.id]=n(d.pokes&&typeof d.pokes==='object'?d.pokes[g.id]:0);
  return {seed:n(d.seed,2**31)||1+Math.floor(rng()*2**30),visits:n(d.visits),last:n(d.last,1e15),pokes,
    golden:n(d.golden),wishes:n(d.wishes),spins:n(d.spins),growth:clamp(finite(+d.growth),0,1)};
}

export function formatAway(ms){
  const min=Math.max(1,Math.round(ms/6e4)), h=Math.round(ms/36e5), d=Math.round(ms/864e5);
  if(min<60)return `${min} min`;
  if(h<48)return h===1?'an hour':`${h} hours`;
  return `${d} days`;
}

const AWAY=[
  (a,b)=>`${a} rearranged all the pebbles. ${b} put them back.`,
  (a,b)=>`${a} and ${b} held a very serious meeting about crumbs.`,
  (a,b,n)=>`${a} tried to count the stars. Got to ${n}.`,
  ()=>'Presidente declared itself ruler of the moss. Again.',
  a=>`a snail passed through. It tipped its hat to ${a}.`,
  (a,b)=>`${a} grew a tiny bit. Nobody noticed except ${b}.`,
  a=>`the moss got greener. ${a} is taking full credit.`,
  a=>`${a} napped through most of it.`,
  (a,b)=>`${a} lost a game of hide-and-seek to ${b}. There is nowhere to hide in a jar.`,
];

export function arrive(memory,now,rng=Math.random){
  const m=structuredClone(memory), away=memory.last?Math.max(0,now-memory.last):0;
  m.visits++;m.last=now;
  m.growth=clamp(m.growth+.05+Math.min(away/36e5/48,.2),0,1);
  let message=null;
  if(memory.visits===0)message='Welcome to the jar. Nine little games live here. Tap one to say hi.';
  else if(away>=12e4){
    const a=pickIndex(rng,GAMES.length), b=pickIndex(rng,GAMES.length,a);
    const line=AWAY[Math.floor(rng()*AWAY.length)%AWAY.length](GAMES[a].name,GAMES[b].name,40+Math.floor(rng()*400));
    message=`While you were gone (${formatAway(away)}), ${line}`;
  }
  return {memory:m,message};
}
