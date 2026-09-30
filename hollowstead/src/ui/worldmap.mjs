// The hollow's ground as the map shows it: water, thickets, shores, trails and the void, but only where
// someone has explored. One pixel per unit, cached per seed and filled in cell by cell as the explored
// set grows, so drawing the map is a single scaled drawImage.

import {RULES} from '../content.mjs?v=harvest-18';
import {groundColors} from '../worldgen.mjs?v=harvest-18';

const cache={key:'', palette:null, canvas:null, ctx:null, image:null, done:null, count:0};

/**
 * A canvas of the explored ground, (N*cell) pixels square, pixel (0,0) at world (-RULES.radius, -RULES.radius).
 * `explored` lists explore-grid indices (N cells a side, `cell` units each), as world.explored does.
 */
export function exploredGround(seed, palette, explored, N, cell){
  const size=N*cell,key=`${seed}|${N}|${cell}`;
  if(typeof document==='undefined')return null;
  if(cache.key!==key||cache.palette!==palette||explored.length<cache.count){
    cache.key=key;cache.palette=palette;cache.count=0;
    if(!cache.canvas||cache.canvas.width!==size){cache.canvas=document.createElement('canvas');cache.canvas.width=cache.canvas.height=size;cache.ctx=cache.canvas.getContext('2d');}
    cache.image=cache.ctx.createImageData(size,size);cache.done=new Uint8Array(N*N);
  }
  if(explored.length===cache.count)return cache.canvas;
  const g=groundColors(seed,palette),shift=g.extent-RULES.radius,data=cache.image.data,rgb=g.rgb;
  let dirty=false;
  for(const index of explored){
    if(!(index>=0&&index<N*N)||cache.done[index])continue;cache.done[index]=1;dirty=true;
    const gx=index%N,gz=Math.floor(index/N);
    for(let dz=0;dz<cell;dz++)for(let dx=0;dx<cell;dx++){
      const px=gx*cell+dx,pz=gz*cell+dz,ti=Math.floor((px+.5+shift)*g.res),tj=Math.floor((pz+.5+shift)*g.res),o=(pz*size+px)*4;
      if(ti<0||tj<0||ti>=g.size||tj>=g.size)continue;const q=(tj*g.size+ti)*3;
      data[o]=rgb[q];data[o+1]=rgb[q+1];data[o+2]=rgb[q+2];data[o+3]=255;
    }
  }
  cache.count=explored.length;
  if(dirty)cache.ctx.putImageData(cache.image,0,0);
  return cache.canvas;
}
