// Host-authoritative rules; rendering never advances physics on guests.
export const RULES = Object.freeze({ baseY: 560, baseWidth: 174, maxPlayers: 6, maxBlocks: 80, turnSeconds: 45 });
export const COLORS = ['#eb775d', '#659eb6', '#b9abdc', '#e9bc54', '#87ab82', '#e99db8'];
export const SHAPES = [
  { name: 'Little brick', cells: [[0,0],[1,0]], unit: 34 },
  { name: 'The square', cells: [[0,0],[1,0],[0,1],[1,1]], unit: 32 },
  { name: 'Long fellow', cells: [[0,0],[1,0],[2,0]], unit: 34 },
  { name: 'The elbow', cells: [[0,0],[0,1],[1,1]], unit: 34 },
  { name: 'Tea time', cells: [[0,0],[1,0],[2,0],[1,1]], unit: 32 },
  { name: 'Ziggy', cells: [[0,0],[1,0],[1,1],[2,1]], unit: 31 },
  { name: 'Big elbow', cells: [[0,0],[0,1],[0,2],[1,2]], unit: 30 },
  { name: 'The step', cells: [[0,0],[1,0],[1,1]], unit: 35 },
];
export const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
export function shapeRects(shape) {
  const {cells,unit}=SHAPES[shape];
  const cx=cells.reduce((s,p)=>s+p[0],0)/cells.length,cy=cells.reduce((s,p)=>s+p[1],0)/cells.length;
  // Merge neighboring squares into horizontal strips to avoid collision seams.
  const rows=new Map();for(const [x,y] of cells){if(!rows.has(y))rows.set(y,[]);rows.get(y).push(x);}
  const rects=[];for(const [y,xs] of rows){xs.sort((a,b)=>a-b);let start=xs[0],end=start;
    const push=()=>rects.push({x:((start+end)/2-cx)*unit,y:(y-cy)*unit,w:(end-start+1)*unit,h:unit});
    for(const x of xs.slice(1)){if(x===end+1)end=x;else{push();start=end=x;}}push();}
  return rects;
}
export class TowerGame {
  constructor({Matter=globalThis.Matter,seed=Date.now(),mode='solo'}={}) {
    if(!Matter)throw new Error('Physics did not load. Please reload the game.');
    this.M=Matter;this.seed=seed>>>0;this.mode=mode;this.players=[];this.round=0;this.seq=0;
    this.phase='lobby';this.blocks=[];this.next=0;this.preview={x:0,angle:0,shape:0,y:400};
    this.time=0;this.placed=0;this.height=0;this.bestHeight=0;this.turn=0;this.lastDrop=null;
    this.result=null;this.event={id:0,type:'none'};this.resetPhysics();
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  resetPhysics(){
    const {Engine,Bodies,Composite}=this.M;if(this.engine){Composite.clear(this.engine.world,false);Engine.clear(this.engine);}
    this.engine=Engine.create({enableSleeping:true,positionIterations:10,velocityIterations:8});this.engine.gravity.y=1;this.engine.gravity.scale=.001;
    this.base=Bodies.rectangle(0,RULES.baseY+18,RULES.baseWidth,36,{isStatic:true,friction:.8,frictionStatic:1,restitution:0});
    Composite.add(this.engine.world,this.base);
  }
  addPlayer(id,name){
    if(this.players.some(p=>p.id===id))return true;
    if(this.phase!=='lobby'||this.players.length>=RULES.maxPlayers)return false;
    this.players.push({id,name:String(name||'Builder').trim().slice(0,18)||'Builder',color:this.players.length%COLORS.length,placed:0});return true;
  }
  removePlayer(id){
    const index=this.players.findIndex(p=>p.id===id);if(index<0)return;
    const wasCurrent=this.currentId===id;this.players.splice(index,1);
    if(index<this.turn)this.turn--;this.turn%=Math.max(1,this.players.length);
    if(wasCurrent&&this.phase==='settling')this.turn=(this.turn-1+this.players.length)%Math.max(1,this.players.length);
    if(wasCurrent&&this.phase==='aim'){this.turnStarted=this.time;this.preview.x=0;this.preview.angle=0;}
    if(!this.players.length)this.phase='lobby';
  }
  get currentId(){return this.players[this.turn]?.id;}
  makeBody(shape,x,y,angle=0){
    const {Bodies,Body}=this.M,options={friction:.65,frictionStatic:1,restitution:.04,frictionAir:.008,density:.002,slop:.015,sleepThreshold:70};
    const parts=shapeRects(shape).map(r=>Bodies.rectangle(r.x,r.y,r.w,r.h,options));
    const body=parts.length===1?parts[0]:Body.create({...options,parts});
    Body.setPosition(body,{x,y});Body.setAngle(body,angle);return body;
  }
  start(){
    if(!this.players.length)return false;
    this.resetPhysics();this.blocks=[];this.time=0;this.placed=0;this.height=0;this.bestHeight=0;this.turn=this.round%this.players.length;this.round++;
    this.result=null;this.lastDrop=null;this.next=0;for(const p of this.players)p.placed=0;
    this.phase='aim';this.nextTurn(true);this.emit('start');return true;
  }
  lobby(){this.phase='lobby';this.result=null;}
  emit(type,extra={}){this.event={id:this.event.id+1,type,...extra};}
  top(){return Math.min(RULES.baseY,...this.blocks.map(b=>b.body.bounds.min.y));}
  nextTurn(first=false){
    if(!first)this.turn=(this.turn+1)%this.players.length;
    const shape=this.next;this.next=this.placed<2?2:Math.floor(this.random()*SHAPES.length);
    this.preview={shape,x:0,angle:0,y:this.top()-125};this.turnStarted=this.time;this.phase='aim';this.quiet=0;
  }
  aim(id,{x,angle}){
    if(id!==this.currentId||this.phase!=='aim'||!Number.isFinite(x)||!Number.isFinite(angle))return false;
    this.preview.x=clamp(x,-190,190);this.preview.angle=Math.round(clamp(angle,-Math.PI*4,Math.PI*4)/(Math.PI/12))*(Math.PI/12);return true;
  }
  drop(id){
    if(this.phase!=='aim'||id!==this.currentId)return false;
    const p=this.preview,body=this.makeBody(p.shape,p.x,this.top()-125,p.angle);
    this.M.Composite.add(this.engine.world,body);this.blocks.push({id:this.blocks.length+1,shape:p.shape,color:this.players[this.turn].color,body,owner:id});
    this.lastDrop={id,name:this.players[this.turn].name};this.phase='settling';this.droppedAt=this.time;this.quiet=0;this.landed=false;this.emit('drop');return true;
  }
  finish(reason){
    if(this.phase==='over')return;this.phase='over';this.result={reason,loser:this.lastDrop?.name||'The tower',loserId:this.lastDrop?.id,blocks:this.placed,height:this.bestHeight};this.emit('collapse');
  }
  step(dt=1/60){
    if(this.phase==='lobby')return;
    if(this.phase==='over'&&this.time-this.overAt>3)return;
    this.time+=dt;this.M.Engine.update(this.engine,dt*1000);
    this.height=Math.max(0,(RULES.baseY-this.top())/20);
    if(this.phase==='over')return;
    // Fault stays with the most recent drop even if the next player is aiming.
    if(this.blocks.some(b=>b.body.bounds.min.y>RULES.baseY+90||Math.abs(b.body.position.x)>480)){
      this.overAt=this.time;this.finish('fell');return;
    }
    if(this.phase==='aim'){
      this.preview.y=this.top()-125;
      if(this.mode!=='solo'&&this.time-this.turnStarted>=RULES.turnSeconds)this.drop(this.currentId);
      return;
    }
    const latest=this.blocks.at(-1).body;
    const hit=this.M.Query.collides(latest,[this.base,...this.blocks.slice(0,-1).map(b=>b.body)]).length>0;
    if(hit&&!this.landed){this.landed=true;this.emit('land');}
    const quiet=this.blocks.every(b=>b.body.speed<.12&&b.body.angularSpeed<.009);
    this.quiet=quiet?this.quiet+dt:0;
    if(this.landed&&this.time-this.droppedAt>1&&this.quiet>.65){
      this.placed++;this.bestHeight=Math.max(this.bestHeight,this.height);const p=this.players.find(p=>p.id===this.lastDrop.id);if(p)p.placed++;
      this.emit('placed',{perfect:Math.abs(latest.angle%(Math.PI/2))<.04});
      if(this.placed>=RULES.maxBlocks){this.phase='over';this.overAt=this.time;this.result={reason:'complete',blocks:this.placed,height:this.bestHeight};}
      else this.nextTurn();
    }else if(this.time-this.droppedAt>10){this.overAt=this.time;this.finish('unstable');}
  }
  snapshot(){
    const q=n=>Math.round(n*100)/100;
    return {seq:++this.seq,phase:this.phase,mode:this.mode,round:this.round,time:q(this.time),players:this.players.map(p=>({...p})),currentId:this.currentId,preview:{...this.preview},next:this.next,placed:this.placed,height:q(this.height),bestHeight:q(this.bestHeight),remaining:Math.max(0,RULES.turnSeconds-(this.time-this.turnStarted)),result:this.result,event:this.event,
      wobble:Math.min(1,this.blocks.reduce((s,b)=>s+b.body.speed*.12+b.body.angularSpeed*5,0)),
      blocks:this.blocks.map(b=>({id:b.id,shape:b.shape,color:b.color,x:q(b.body.position.x),y:q(b.body.position.y),angle:b.body.angle}))};
  }
  destroy(){this.M.Composite.clear(this.engine.world,false);this.M.Engine.clear(this.engine);}
}
