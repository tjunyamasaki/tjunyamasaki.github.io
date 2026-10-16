// Draws the nine critters in jar units. Each one nods to the game it opens.
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

export function shade(hex,amount){
  const n=parseInt(hex.slice(1),16), f=amount<0?0:255, p=Math.abs(amount);
  const c=[n>>16,n>>8&255,n&255].map(v=>Math.round(v+(f-v)*p));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function blobFill(ctx,r,color,alpha=1){
  const g=ctx.createRadialGradient(-r*.35,-r*.45,r*.1,0,0,r*1.08);
  g.addColorStop(0,shade(color,.45));g.addColorStop(.55,color);g.addColorStop(1,shade(color,-.18));
  ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fill();ctx.globalAlpha=1;
}

function eye(ctx,x,y,rx,ry,closed,sleeping){
  ctx.fillStyle=ctx.strokeStyle='#2b2340';
  if(sleeping){ctx.lineWidth=rx*.7;ctx.lineCap='round';ctx.beginPath();ctx.arc(x,y-ry*.2,rx*1.1,.15*Math.PI,.85*Math.PI);ctx.stroke();return;}
  if(closed){ctx.lineWidth=rx*.7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-rx,y);ctx.lineTo(x+rx,y);ctx.stroke();return;}
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x-rx*.3,y-ry*.4,rx*.42,0,TAU);ctx.fill();
}

function face(ctx,b,r,t,{eyes=2,y=-.08,spread=.34,sclera=false}={}){
  const sleeping=b.mode==='sleep', lx=(b.lookX||0)*r*.12, ly=(b.lookY||0)*r*.08;
  const ex=r*.11, ey=r*.15;
  for(let i=0;i<eyes;i++){
    const x=(eyes===1?0:(i/(eyes-1)-.5)*2*r*spread)+lx, yy=r*y+ly;
    const blink=((t+b.index*1.7+(eyes>2?i*.18:0))%4.6)<.13;
    if(sclera&&!sleeping){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,yy,ex*1.7,0,TAU);ctx.fill();}
    eye(ctx,x,yy,ex,ey,blink,sleeping);
  }
  ctx.fillStyle='rgba(255,120,150,.38)';
  for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*r*.55+lx*.5,r*.16,r*.15,r*.09,0,0,TAU);ctx.fill();}
  ctx.strokeStyle=ctx.fillStyle='#2b2340';ctx.lineWidth=r*.07;ctx.lineCap='round';
  const my=r*.22+ly*.5;
  if(sleeping){ctx.beginPath();ctx.arc(lx*.5,my,r*.05,0,TAU);ctx.fill();}
  else if(b.wobble>.35||b.mood==='wow'){ctx.beginPath();ctx.ellipse(lx*.5,my+r*.02,r*.08,r*.1*clamp(b.wobble+.4,.5,1.2),0,0,TAU);ctx.fill();}
  else{ctx.beginPath();ctx.arc(lx*.5-r*.07,my-r*.02,r*.07,.1*Math.PI,.9*Math.PI);ctx.arc(lx*.5+r*.07,my-r*.02,r*.07,.1*Math.PI,.9*Math.PI);ctx.stroke();}
}

function circle(ctx,r){ctx.beginPath();ctx.arc(0,0,r,0,TAU);}
function roundRect(ctx,x,y,w,h,rr){ctx.beginPath();ctx.roundRect(x,y,w,h,rr);}
export function heart(ctx,x,y,s){
  ctx.beginPath();ctx.moveTo(x,y+s*.35);
  ctx.bezierCurveTo(x-s*1.1,y-s*.4,x-s*.45,y-s*1.05,x,y-s*.45);
  ctx.bezierCurveTo(x+s*.45,y-s*1.05,x+s*1.1,y-s*.4,x,y+s*.35);ctx.closePath();
}

export function flame(ctx,x,y,s,t){
  const f=1+Math.sin(t*13)*.12+Math.sin(t*31)*.07, lean=Math.sin(t*5)*.18;
  const g=ctx.createLinearGradient(0,y,0,y-s*1.6*f);
  g.addColorStop(0,'#ff6b35');g.addColorStop(.5,'#ffb703');g.addColorStop(1,'rgba(255,240,170,.9)');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-s*.45,y);
  ctx.quadraticCurveTo(x-s*.55,y-s*.8,x+lean*s,y-s*1.6*f);
  ctx.quadraticCurveTo(x+s*.55,y-s*.8,x+s*.45,y);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(255,250,215,.85)';ctx.beginPath();ctx.ellipse(x,y-s*.3,s*.18,s*.35*f,0,0,TAU);ctx.fill();
}

const crownPts=[[-1,0],[-1,-.9],[-.5,-.45],[0,-1.1],[.5,-.45],[1,-.9],[1,0]];

export function drawCreature(ctx,b,g,t,{rot=0,shiny=false}={}){
  const r=b.r, sleeping=b.mode==='sleep';
  const wob=Math.sin(t*19)*b.wobble*.16, breathe=Math.sin(t*(sleeping?1.3:2.2)+b.index)*(sleeping?.045:.025);
  const sq=clamp(b.squash,0,.4)+wob;
  ctx.save();
  ctx.translate(b.x,b.y);ctx.rotate(rot);ctx.translate(0,r);
  if(g.kind==='card')ctx.rotate(clamp((b.vx||0)*.004,-.25,.25)+Math.sin(t*1.5+b.index)*.03);
  ctx.scale(1+sq*.85+breathe,1-sq-breathe*.6);ctx.translate(0,-r);
  switch(g.kind){
    case 'hollowstead':
      circle(ctx,r);blobFill(ctx,r,g.color);
      ctx.fillStyle='rgba(120,60,20,.18)';for(const [x,y] of [[-.4,.45],[.35,.55],[.55,.1]]){ctx.beginPath();ctx.arc(x*r,y*r,r*.06,0,TAU);ctx.fill();}
      flame(ctx,0,-r*.9,r*.42,t+b.index);
      face(ctx,b,r,t);break;
    case 'bloom':{
      ctx.beginPath();
      for(let i=0;i<=24;i++){const a=i/24*TAU, rr=r*(1+Math.sin(a*3+t*2.6)*.05+Math.sin(a*5-t*1.7)*.03);i?ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.moveTo(rr,0);}
      ctx.closePath();blobFill(ctx,r,g.color,.82);
      ctx.strokeStyle='rgba(47,158,99,.55)';ctx.lineWidth=r*.07;ctx.stroke();
      ctx.fillStyle='rgba(47,158,99,.28)';ctx.beginPath();ctx.arc(r*.32,r*.3,r*.3,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<3;i++){const a=t*.8+i*2.1;ctx.beginPath();ctx.arc(Math.cos(a)*r*.55,Math.sin(a)*r*.5+r*.1,r*.07,0,TAU);ctx.fill();}
      face(ctx,b,r,t);break;}
    case 'hushlight':{
      circle(ctx,r);blobFill(ctx,r,g.color);
      ctx.fillStyle='rgba(255,255,255,.55)';for(const [x,y] of [[-.5,-.4],[.45,-.55],[.6,.3],[-.2,.6]]){ctx.beginPath();ctx.arc(x*r,y*r,r*.045,0,TAU);ctx.fill();}
      const ox=r*.62+Math.sin(t*1.6)*r*.08, oy=-r*1.55+Math.sin(t*2.1)*r*.1;
      ctx.strokeStyle=shade(g.color,-.25);ctx.lineWidth=r*.07;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.quadraticCurveTo(r*.05,-r*1.6,ox,oy+r*.2);ctx.stroke();
      ctx.fillStyle=g.accent;ctx.beginPath();ctx.arc(ox,oy+r*.32,r*.24,0,TAU);ctx.fill();
      face(ctx,b,r,t);break;}
    case 'pingpong':{
      circle(ctx,r);blobFill(ctx,r,g.color);
      ctx.save();circle(ctx,r);ctx.clip();ctx.rotate(b.spin||0);
      ctx.strokeStyle=g.accent;ctx.lineWidth=r*.26;ctx.beginPath();ctx.ellipse(0,0,r*1.1,r*.45,0,Math.PI*.05,Math.PI*.95);ctx.stroke();ctx.restore();
      ctx.strokeStyle='rgba(0,0,0,.06)';ctx.lineWidth=r*.05;circle(ctx,r*.98);ctx.stroke();
      face(ctx,b,r,t,{y:-.18});break;}
    case 'card':{
      const w=r*1.55, h=r*2;
      roundRect(ctx,-w/2,-h/2,w,h,r*.28);blobFill(ctx,r,g.color);
      ctx.strokeStyle='rgba(224,93,111,.45)';ctx.lineWidth=r*.07;ctx.stroke();
      ctx.fillStyle=g.accent;ctx.font=`${r*.42}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('♥',-w*.32,-h*.34);ctx.fillStyle='#2b2340';ctx.fillText('♠',w*.32,h*.34);
      face(ctx,b,r,t,{y:-.05,spread:.3});break;}
    case 'fodinha':{
      circle(ctx,r);blobFill(ctx,r,g.color);
      const lives=b.lives??3;
      for(let i=0;i<3;i++){
        const x=(i-1)*r*.55, y=-r*1.38+Math.sin(t*3+i)*r*.06;
        heart(ctx,x,y,r*.22);
        if(i<lives){ctx.fillStyle=g.accent;ctx.fill();}else{ctx.strokeStyle='rgba(230,57,104,.5)';ctx.lineWidth=r*.05;ctx.stroke();}
      }
      face(ctx,b,r,t);break;}
    case 'presidente':{
      circle(ctx,r);blobFill(ctx,r,g.color);
      ctx.save();ctx.translate(0,-r*.82);ctx.rotate(-.12);
      ctx.beginPath();crownPts.forEach(([x,y],i)=>i?ctx.lineTo(x*r*.5,y*r*.55):ctx.moveTo(x*r*.5,y*r*.55));ctx.closePath();
      ctx.fillStyle='#ffc93c';ctx.fill();ctx.strokeStyle=g.accent;ctx.lineWidth=r*.05;ctx.stroke();
      ctx.fillStyle='#e05d6f';ctx.beginPath();ctx.arc(0,-r*.2,r*.07,0,TAU);ctx.fill();
      ctx.fillStyle='#4ea8de';for(const x of [-.5,.5]){ctx.beginPath();ctx.arc(x*r*.5,-r*.1,r*.05,0,TAU);ctx.fill();}
      ctx.restore();
      face(ctx,b,r,t);break;}
    case 'count':
      circle(ctx,r);blobFill(ctx,r,g.color);
      ctx.fillStyle='rgba(110,68,201,.18)';ctx.beginPath();ctx.ellipse(0,-r*.95,r*.12,r*.25,0,0,TAU);ctx.fill();
      face(ctx,b,r,t,{eyes:3,spread:.42,sclera:true,y:-.12});break;
    case 'life':{
      roundRect(ctx,-r,-r,r*2,r*2,r*.5);blobFill(ctx,r,g.color);
      ctx.save();roundRect(ctx,-r,-r,r*2,r*2,r*.5);ctx.clip();
      const n=6, c=r*2/n, cells=b.cells;
      if(cells){ctx.fillStyle='rgba(63,111,176,.42)';for(let i=0;i<n*n;i++)if(cells[i])ctx.fillRect(-r+(i%n)*c+c*.12,-r+Math.floor(i/n)*c+c*.12,c*.76,c*.76);}
      ctx.restore();
      face(ctx,b,r,t,{sclera:true});break;}
    default:
      circle(ctx,r);blobFill(ctx,r,g.color);face(ctx,b,r,t);
  }
  if(shiny){
    ctx.fillStyle='rgba(255,255,255,.9)';
    for(let i=0;i<3;i++){const a=t*1.4+i*2.1, s=r*(.12+.08*Math.sin(t*5+i));star(ctx,Math.cos(a)*r*1.25,Math.sin(a)*r*1.25,s);}
  }
  ctx.restore();
}

export function star(ctx,x,y,s){
  ctx.beginPath();
  for(let i=0;i<8;i++){const a=i/8*TAU, rr=i%2?s*.35:s;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}
  ctx.closePath();ctx.fill();
}

function glowAt(ctx,x,y,r,color,alpha){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,color.replace('A',alpha.toFixed(3)));g.addColorStop(1,color.replace('A','0'));
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
}

// Additive light for the flame, the little moon and Bloom's soft shine. Brightest at night.
export function drawGlow(ctx,b,g,t,night,rot=0){
  const r=b.r, k=.18+night*.82;
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(rot);
  if(g.kind==='hollowstead')glowAt(ctx,0,-r*1.35,r*(2.6+Math.sin(t*13)*.15),'rgba(255,170,60,A)',.5*k);
  if(g.kind==='hushlight')glowAt(ctx,r*.62+Math.sin(t*1.6)*r*.08,-r*1.23+Math.sin(t*2.1)*r*.1,r*2.4,'rgba(255,236,170,A)',.55*k);
  if(g.kind==='bloom')glowAt(ctx,0,0,r*1.9,'rgba(140,240,180,A)',.28*night);
  ctx.restore();
}
