const fs=require('fs'),path=require('path');
const sharp=require('sharp');
// Optional arguments: source PNG, destination directory. Paths default beside this script.
const out=process.argv[3]?path.resolve(process.argv[3]):path.join(__dirname,'generated');
const source=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'cleric-original.png');
fs.mkdirSync(out,{recursive:true});
(async()=>{
const original=await sharp(source).ensureAlpha().raw().toBuffer();
const {data}=await sharp(source).resize(45,38,{kernel:'nearest'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let y=0;y<228;y++)for(let x=0;x<270;x++)for(let c=0;c<4;c++)if(original[(y*270+x)*4+c]!==data[(Math.floor(y/6)*45+Math.floor(x/6))*4+c])throw Error('Nonuniform source pixel');
const palette=new Set();for(let i=0;i<data.length;i+=4)if(data[i+3])palette.add([...data.slice(i,i+4)].join(','));
const W=64,H=48,ox=8,oy=8;
const layers={body:[],shield:[],arm:[],feet:[]};
for(let y=0;y<38;y++)for(let x=0;x<45;x++){let c=[...data.slice((y*45+x)*4,(y*45+x)*4+4)];if(!c[3])continue;
let layer=(x>=24&&y<22)||(x>=22&&y>=22)?'arm':(y>=21&&x<=13)?'shield':y>=33?'feet':'body';layers[layer].push({x,y,c});}
const poses=[{name:'Ready',ms:500,a:0,dx:0,dy:0},{name:'Brace',ms:130,a:-8,dx:-1,dy:1},{name:'Lift',ms:130,a:-8,dx:0,dy:0,ay:-2},{name:'Charge',ms:190,a:0,dx:0,dy:0,ay:-2,fx:1},{name:'Release',ms:90,a:27,dx:1,dy:0,fx:2},{name:'Follow through',ms:130,a:29,dx:1,dy:1,fx:3},{name:'Recover',ms:140,a:12,dx:0,dy:0,fx:4},{name:'Settle',ms:150,a:0,dx:0,dy:0}];
const frames=[];
for(let index=0;index<poses.length;index++){
const p=poses[index],buf=Buffer.alloc(W*H*4);
function put(x,y,c){x=Math.round(x);y=Math.round(y);if(x<0||x>=W||y<0||y>=H)throw Error('Clipped pixel');for(let k=0;k<4;k++)buf[(y*W+x)*4+k]=c[k];}
function draw(layer,dx=0,dy=0,angle=0){const t=angle*Math.PI/180,co=Math.cos(t),si=Math.sin(t),lookup=new Map(layer.map(v=>[v.x+','+v.y,v.c]));for(let y=0;y<H;y++)for(let x=0;x<W;x++){let xx=x-ox-dx-22,yy=y-oy-dy-23;let sx=Math.round(co*xx+si*yy+22),sy=Math.round(-si*xx+co*yy+23);const c=lookup.get(sx+','+sy);if(c)put(x,y,c);}}
draw(layers.feet);draw(layers.body,p.dx,p.dy);
draw(layers.arm,p.dx,p.dy+(p.ay||0),p.a);
draw(layers.shield,p.dx,p.dy);
const gold=[217,156,44,255],light=[253,232,178,255],warm=[227,169,59,255];
const a=p.a*Math.PI/180;
const tx=Math.round(ox+p.dx+22+Math.cos(a)*7-Math.sin(a)*-16),ty=Math.round(oy+p.dy+(p.ay||0)+23+Math.sin(a)*7+Math.cos(a)*-16);
function cross(x,y,r){for(let n=-r;n<=r;n++){put(x+n,y,gold);put(x,y+n,gold)}for(let n=-r+1;n<r;n++){put(x+n,y,light);put(x,y+n,light)}}
if(p.fx===1){cross(tx,ty,2);put(tx-4,ty-3,warm);put(tx+4,ty+2,warm)}
if(p.fx===2){cross(tx+1,ty,5);put(tx+6,ty-3,warm);put(tx-4,ty+4,warm);put(tx+5,ty+4,warm)}
if(p.fx===3){cross(tx,ty,2);cross(tx+10,ty,3);for(let j=4;j<8;j++)put(tx+j,ty,gold);put(tx+7,ty-3,warm);put(tx+5,ty+3,warm)}
if(p.fx===4){put(57,22,warm);put(59,21,light);put(55,24,gold)}
for(let i=0;i<buf.length;i+=4)if(buf[i+3]&&!palette.has([...buf.slice(i,i+4)].join(',')))throw Error('Palette violation');
frames.push(buf);await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,`frame-${index+1}.png`));
}
// First and last poses reconstruct every source pixel exactly, on the padded canvas.
for(const fi of [0,7])for(let y=0;y<38;y++)for(let x=0;x<45;x++)for(let c=0;c<4;c++)if(data[(y*45+x)*4+c]!==frames[fi][((y+oy)*W+x+ox)*4+c])throw Error('Rest pose differs from source');
const sheet=Buffer.alloc(W*4*H*2*4);frames.forEach((b,i)=>{for(let y=0;y<H;y++)b.copy(sheet,(((Math.floor(i/4)*H+y)*W*4)+(i%4)*W)*4,y*W*4,(y+1)*W*4)});
await sharp(sheet,{raw:{width:W*4,height:H*2,channels:4}}).png().toFile(path.join(out,'cleric-cast-sheet.png'));
await sharp(sheet,{raw:{width:W*4,height:H*2,channels:4}}).resize(W*4*4,H*2*4,{kernel:'nearest'}).png().toFile(path.join(out,'contact-sheet.png'));
const largeFrames=await Promise.all(frames.map(b=>sharp(b,{raw:{width:W,height:H,channels:4}}).resize(W*6,H*6,{kernel:'nearest'}).raw().toBuffer()));
await sharp(Buffer.concat(largeFrames),{raw:{width:W*6,height:H*6*8,channels:4,pageHeight:H*6}}).gif({loop:0,delay:poses.map(p=>p.ms),dither:0}).toFile(path.join(out,'cleric-cast.gif'));
fs.copyFileSync(source,path.join(out,'cleric-original.png'));
fs.writeFileSync(path.join(out,'animation.json'),JSON.stringify({width:W,height:H,columns:4,rows:2,palette:[...palette],frames:poses.map(({name,ms},i)=>({file:`frame-${i+1}.png`,name,duration:ms}))},null,2));
const urls=await Promise.all(frames.map(b=>sharp(b,{raw:{width:W,height:H,channels:4}}).png().toBuffer().then(b=>'data:image/png;base64,'+b.toString('base64'))));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cleric · casting study</title><style>*{box-sizing:border-box}body{margin:0;background:#181a1d;color:#eee;font:15px system-ui;padding:24px}main{max-width:850px;margin:auto}h1{font-size:20px;font-weight:550}#stage{height:360px;display:grid;place-items:center;background:#26292e;border:1px solid #444}img{image-rendering:pixelated;image-rendering:crisp-edges}#sprite{width:384px;height:288px;max-width:100%;object-fit:contain}button,select{font:inherit;color:inherit;background:#34383e;border:1px solid #626770;border-radius:4px;padding:8px 12px;cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid #e3a93b}nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}#frames{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}#frames button{padding:4px 0}#frames img{width:100%;display:block}#frames .active{border-color:#e3a93b;background:#4b4030}p{color:#b9bec5;line-height:1.5}label{display:flex;gap:8px;align-items:center}small{font-size:11px}@media(max-width:600px){#frames{grid-template-columns:repeat(4,1fr)}body{padding:12px}}</style><main><h1>Cleric · casting study</h1><div id="stage"><img id="sprite" alt="Cleric casting a golden spell"></div><nav><button id="play">Pause</button><button id="step">Next frame</button><label>Speed <select id="speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label>Background <select id="bg"><option value="#26292e">Slate</option><option value="#000000">Black</option><option value="#d6d1c6">Light</option></select></label><span id="status"></span></nav><div id="frames"></div><p>8 frames · 64 × 48 logical pixels · original 13-color palette.<br>Select a frame to pause and inspect. Space plays or pauses; arrow keys step.</p></main><script>const frames=${JSON.stringify(urls)},poses=${JSON.stringify(poses)};let index=0,playing=true,timer;const sprite=document.getElementById('sprite'),status=document.getElementById('status'),play=document.getElementById('play'),speed=document.getElementById('speed');function show(){sprite.src=frames[index];status.textContent=(index+1)+' / 8 · '+poses[index].name;document.querySelectorAll('#frames button').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index))})}function schedule(){clearTimeout(timer);if(playing)timer=setTimeout(()=>{index=(index+1)%8;show();schedule()},poses[index].ms/Number(speed.value))}function pause(){playing=false;play.textContent='Play';clearTimeout(timer)}function step(n){pause();index=(index+n+8)%8;show()}frames.forEach((src,i)=>{const b=document.createElement('button');b.title=poses[i].name;b.setAttribute('aria-label','Frame '+(i+1)+': '+poses[i].name);b.innerHTML='<img alt="" src="'+src+'"><small>'+(i+1)+'</small>';b.onclick=()=>{pause();index=i;show()};document.getElementById('frames').append(b)});play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';schedule()};document.getElementById('step').onclick=()=>step(1);speed.onchange=schedule;document.getElementById('bg').onchange=e=>document.getElementById('stage').style.background=e.target.value;document.addEventListener('keydown',e=>{if(['SELECT','BUTTON'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();play.click()}if(e.code==='ArrowRight')step(1);if(e.code==='ArrowLeft')step(-1)});show();schedule();</script></html>`;
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Verified 6× source grid, original palette, and exact first/last pose reconstruction. Exported eight 64×48 frames, sheet, GIF, standalone page.');
})();
