// Mechanical asset validation. This does NOT judge anatomy, continuity, grip, or motion.
// Usage: node tools/validate-animation.cjs path/to/manifest.json
const fs=require('fs'),path=require('path'),sharp=require('sharp');
const fail=message=>{throw new Error(message)};
function int(n,min=0){return Number.isInteger(n)&&n>=min;}
async function rgba(file){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.channels!==4)fail('Expected RGBA decode: '+file);
 // Transparent RGB does not contribute to appearance; normalize it for comparison.
 for(let i=0;i<data.length;i+=4){if(data[i+3]!==0&&data[i+3]!==255)fail('Partial alpha: '+file);if(!data[i+3])data.fill(0,i,i+3);}
 return {data,width:info.width,height:info.height};
}
function sample(src,x,y){return src.data.subarray((y*src.width+x)*4,(y*src.width+x)*4+4)}
function equalPixel(a,b){return a.every((v,k)=>v===b[k])}
async function main(){
 const manifestPath=path.resolve(process.argv[2]||'example/manifest.json'),dir=path.dirname(manifestPath);
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const resolve=f=>path.resolve(dir,f);
 if(m.schemaVersion!==1)fail('Unsupported manifest schemaVersion');
 const {width:w,height:h,origin}=m.canvas;
 if(!int(w,1)||!int(h,1)||!int(origin.x)||!int(origin.y))fail('Invalid canvas or origin');
 const scale=m.source.scale;
 if(!int(scale,1))fail('source.scale must be an integer >= 1');
 const physical=await rgba(resolve(m.source.file));
 if(physical.width%scale||physical.height%scale)fail('Source dimensions not divisible by scale');
 const sw=physical.width/scale,sh=physical.height/scale;
 if(sw+origin.x>w||sh+origin.y>h)fail('Source canvas does not fit at origin');
 const source={width:sw,height:sh,data:Buffer.alloc(sw*sh*4)};
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)sample(physical,x*scale,y*scale).copy(source.data,(y*sw+x)*4);
 for(let y=0;y<physical.height;y++)for(let x=0;x<physical.width;x++)if(!equalPixel(sample(physical,x,y),sample(source,Math.floor(x/scale),Math.floor(y/scale))))fail('Source is not a uniform integer pixel grid');
 const allowed=new Set();for(let i=0;i<source.data.length;i+=4)if(source.data[i+3])allowed.add([...source.data.subarray(i,i+4)].join(','));
 const extra=m.extraPalette||[];
 if(extra.length&&!m.extraPaletteReason)fail('Added colors require extraPaletteReason');
 for(const color of extra){if(color.length!==4||color[3]!==255||color.some(c=>!int(c)||c>255))fail('Invalid extraPalette color');allowed.add(color.join(','))}
 if(!Array.isArray(m.frames)||m.frames.length<1)fail('No frames');
 if(!Array.isArray(m.restFrameIndices)||m.restFrameIndices.some(i=>!int(i)||i>=m.frames.length))fail('Invalid restFrameIndices');
 const rest=Buffer.alloc(w*h*4);for(let y=0;y<sh;y++)source.data.copy(rest,((y+origin.y)*w+origin.x)*4,y*sw*4,(y+1)*sw*4);
 const frames=[],warnings=[];
 for(let index=0;index<m.frames.length;index++){
  const item=m.frames[index];if(!int(item.durationMs,1))fail('Frame '+index+': invalid durationMs');
  const frame=await rgba(resolve(item.file));if(frame.width!==w||frame.height!==h)fail('Frame '+index+': inconsistent canvas');
  let touchesEdge=false;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=sample(frame,x,y);if(p[3]){if(!allowed.has([...p].join(',')))fail('Frame '+index+': color outside declared palette');if(!x||!y||x===w-1||y===h-1)touchesEdge=true;}}
  if(touchesEdge)warnings.push('Frame '+index+' touches canvas edge: inspect for clipping.');
  if(m.restFrameIndices.includes(index)&&!frame.data.equals(rest))fail('Frame '+index+': full-canvas rest mismatch');
  if(item.previewFile){
    const s=m.previewScale;if(!int(s,1))fail('previewScale required for previewFile');
    const preview=await rgba(resolve(item.previewFile));if(preview.width!==w*s||preview.height!==h*s)fail('Wrong preview dimensions');
    for(let y=0;y<h*s;y++)for(let x=0;x<w*s;x++)if(!equalPixel(sample(preview,x,y),sample(frame,Math.floor(x/s),Math.floor(y/s))))fail('Preview is not exact nearest neighbor');
  }
  frames.push(frame);
 }
 if(m.sheet){
  const {columns,rows}=m.sheet;if(!int(columns,1)||!int(rows,1)||columns*rows<m.frames.length)fail('Invalid sheet layout');
  const sheet=await rgba(resolve(m.sheet.file));if(sheet.width!==columns*w||sheet.height!==rows*h)fail('Wrong sheet dimensions');
  for(let cell=0;cell<columns*rows;cell++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const p=sample(sheet,(cell%columns)*w+x,Math.floor(cell/columns)*h+y),expected=cell<frames.length?sample(frames[cell],x,y):Buffer.alloc(4);
   if(!equalPixel(p,expected))fail('Sheet cell '+cell+' does not match its frame / empty padding');
  }
 }
 if(m.gif){
  const g=await sharp(resolve(m.gif.file),{animated:true}).metadata(),s=m.gif.scale;
  if(!int(s,1)||g.width!==w*s||(g.pageHeight||g.height)!==h*s)fail('Wrong GIF frame dimensions');
  if((g.pages||1)!==frames.length)warnings.push('GIF frame count differs; optimizer may have merged duplicate frames. Inspect timeline.');
  const wanted=m.frames.reduce((sum,f)=>sum+f.durationMs,0),actual=(g.delay||[]).reduce((a,b)=>a+b,0);
  if(Math.abs(wanted-actual)>10*frames.length)fail('GIF total duration differs materially from manifest');
  if(g.delay?.length===frames.length&&g.delay.some((d,i)=>Math.abs(d-m.frames[i].durationMs)>10))fail('GIF frame delays differ materially from manifest');
  if(m.gif.loop!==undefined&&g.loop!==m.gif.loop)fail('GIF loop metadata mismatch');
 }
 const report={status:'passed',manifest:manifestPath,sourceLogical:[sw,sh],canvas:[w,h],frames:frames.length,durationMs:m.frames.reduce((s,f)=>s+f.durationMs,0),warnings,limitations:['No semantic continuity, anatomy, or grip validation.','An already-clipped render can pass. Check oversized staging bounds before cropping.','Palette checks cannot prove important markings or objects remain visible.','GIF metadata is checked; GIF frame pixel identity is not.','No browser interaction test is performed.']};
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error('VALIDATION FAILED: '+e.message);process.exitCode=1});
