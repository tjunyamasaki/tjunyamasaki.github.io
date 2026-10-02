// World generation: the walkable shape of the hollow, its borders (water, thickets, fences),
// how densely things grow where, and where every node and cache starts.
// Deterministic per seed and cached: guests rebuild the world from snapshots every frame, and
// walkableAt() runs inside every collision test, so it must stay an O(1) lookup.
// Pure: import only content/progression. Never engine.mjs, a renderer or the DOM.
//
// How a hollow is made. Everything comes from the seed through a seeded RNG, the integer-hash value
// noise and + - * / sqrt (all exact in IEEE doubles; no sin/cos/pow here), so host and guests build the
// same grid and the same node ids. (progression.regionAt uses atan2, but only to pick a region.)
//  1. An outline: a wobbly ring (a few Fourier terms plus warp noise) round the Heartfire at (0,0).
//  2. Border arcs round the outline: a lake (a bay that rounds off at its ends), thicket (impassable
//     dense forest) or an old fence, each with the wild wood behind it. The void of the world lies beyond.
//  3. Inland lakes and ponds (many more in the Mire), thicket clumps where the forest is thickest,
//     and a few old fences and ruined pens across the open fields.
//  4. Reachability: land cut off from the Heartfire gets a ford (or a trail through the thicket, or a
//     gap in the fence); slivers too small to matter are filled in.
//  5. A density field (0 open heath .. 1 thick forest) and a rockiness field make the patches:
//     forests, meadows, rocky fields and empty heath, with clearings cut into the forests.
//  6. Trails from the Heartfire towards the regions, spots for caches (forest clearings, lake
//     shores, fence ends, stone rings, lone heath) and props for the scenery layer.

import {NODES, RULES} from './content.mjs?v=harvest-18';
import {CACHE_LAYOUT, INNER_RING, NODE_POOLS, OUTER_RING, REGIONS, regionAt, valueNoise} from './progression.mjs?v=harvest-18';

/** Terrain kinds. Only 'ground' is walkable. */
export const TERRAIN = Object.freeze({ground:0, water:1, thicket:2, fence:3, void:4});
export const TERRAIN_NAMES = Object.freeze(['ground', 'water', 'thicket', 'fence', 'void']);
/** What grows on a patch of ground (patchAt). */
export const PATCH = Object.freeze({heath:0, meadow:1, rocky:2, forest:3});
export const PATCH_NAMES = Object.freeze(['heath', 'meadow', 'rocky', 'forest']);
/** Presentation flags on walkable cells (shape.detail): a ford through water, a worn trail. */
export const DETAIL = Object.freeze({ford:1, trail:2, ice:4, lava:8});

/** The terrain grid: square cells of CELL units covering [-EXTENT, EXTENT) on both axes. */
export const CELL = .5, EXTENT = RULES.radius+8, GRID_SIZE = Math.round(EXTENT*2/CELL);
/** Density, rockiness and edge fields live on a coarser lattice (points every LATTICE units, bilinear between). */
export const LATTICE = 2;
/** The meadow round the Heartfire: never flooded, fenced or grown shut. */
export const HEARTH_CLEAR = 30;

const N = GRID_SIZE, INV = 1/CELL, LN = Math.round(EXTENT*2/LATTICE)+1;
const G = TERRAIN.ground, W = TERRAIN.water, T = TERRAIN.thicket, F = TERRAIN.fence, V = TERRAIN.void;
/** Land never reaches past this radius (flyers and shots are clamped to the world disc). */
const LAND_MAX = RULES.radius-8, RBASE = RULES.radius-20, RMIN = RULES.radius-42, RMAX = RULES.radius-10;
const OUTLINE_AMP = [0, 0, 13, 9, 6, 4.5, 3.4, 2.6, 2];
/** A border lake bites this far into the land at its middle (a bay), rounding off towards its ends. */
const BAY = 5;
/** Region leanings: the woods grow thick, the crags and barrows lie open and stony. */
const DENSITY_BIAS = {meadow:-.03, woods:.08, graveyard:-.04, mire:.04, crags:-.1, barrow:-.12};
const ROCK_BIAS = {meadow:-.06, woods:-.04, graveyard:.1, mire:-.3, crags:.2, barrow:.06};
/** Walker clearance (engine blockedAt) and how close a wanderer must stand to harvest. */
const CLEARANCE = .33, HARVEST_REACH = 1.9;

function rngFor(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const smooth=(a,b,v)=>{const t=v<=a?0:v>=b?1:(v-a)/(b-a);return t*t*(3-2*t);};
const hash2=(x,z,s)=>{let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(s|0,2246822519);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};

/** A stand-in for the angle, 0..4 round the circle (0 at +x, 1 at +z): monotonic, arithmetic only. */
export function pseudoAngle(x,z){if(z>=0)return x>=0?(x+z>0?z/(x+z):0):1-x/(z-x);return x<0?2-z/(-x-z):3+x/(x-z);}
function pseudoDir(p){p=((p%4)+4)%4;let x,z;if(p<1){x=1-p;z=p;}else if(p<2){x=1-p;z=2-p;}else if(p<3){x=p-3;z=2-p;}else{x=p-3;z=p-4;}const l=Math.sqrt(x*x+z*z);return [x/l,z/l];}
const arcGap=(a,b)=>{const d=Math.abs(a-b)%4;return d>2?4-d:d;};
function randomDir(rng){for(;;){const x=rng()*2-1,z=rng()*2-1,l=x*x+z*z;if(l>.04&&l<=1){const s=Math.sqrt(l);return [x/s,z/s];}}}
function shuffle(list,rng){for(let i=list.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=list[i];list[i]=list[j];list[j]=t;}return list;}

function bilerp(lat,x,z){
  let u=(x+EXTENT)/LATTICE,v=(z+EXTENT)/LATTICE;
  if(u<0)u=0;else if(u>LN-1.0001)u=LN-1.0001;if(v<0)v=0;else if(v>LN-1.0001)v=LN-1.0001;
  const i=u|0,j=v|0,fu=u-i,fv=v-j,k=j*LN+i,a=lat[k],b=lat[k+1],c=lat[k+LN],d=lat[k+LN+1];
  return a+(b-a)*fu+(c-a)*fv+(a-b-c+d)*fu*fv;
}
/** Work buffers shared by every build (one world is generated at a time): no per-build garbage. */
let SCRATCH=null;
function scratch(){if(!SCRATCH)SCRATCH={seen:new Uint8Array(N*N),mark:new Uint8Array(N*N),queue:new Int32Array(N*N),comp:null,parent:null,dist:new Uint16Array(N*N)};return SCRATCH;}
const cellOf=(x,z)=>{const i=Math.floor((x+EXTENT)*INV),j=Math.floor((z+EXTENT)*INV);return i<0||j<0||i>=N||j>=N?-1:j*N+i;};
const cellX=k=>-EXTENT+((k%N)+.5)*CELL, cellZ=k=>-EXTENT+(((k/N)|0)+.5)*CELL;

/** Two-pass chamfer (3/4) distance, in thirds of a cell, from every cell where source(code) holds. */
function chamfer(grid,source,out=new Uint16Array(N*N)){
  const BIG=65535;
  for(let k=0;k<N*N;k++)out[k]=source[grid[k]]?0:BIG;
  for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){const k=j*N+i;let v=out[k];if(v===0)continue;const a=out[k-1]+3,b=out[k-N]+3,c=out[k-N-1]+4,d=out[k-N+1]+4;if(a<v)v=a;if(b<v)v=b;if(c<v)v=c;if(d<v)v=d;out[k]=v;}
  for(let j=N-2;j>0;j--)for(let i=N-2;i>0;i--){const k=j*N+i;let v=out[k];if(v===0)continue;const a=out[k+1]+3,b=out[k+N]+3,c=out[k+N+1]+4,d=out[k+N-1]+4;if(a<v)v=a;if(b<v)v=b;if(c<v)v=c;if(d<v)v=d;out[k]=v;}
  return out;
}
const DIST_UNIT = CELL/3;

/** 4-neighbour flood over ground from `start`, marking `mark` in `seen`. Returns the cells reached (in `queue`). */
function flood(grid,seen,queue,start,mark){
  let head=0,tail=0;seen[start]=mark;queue[tail++]=start;
  while(head<tail){const k=queue[head++];
    let n=k-1;if(!seen[n]&&grid[n]===G){seen[n]=mark;queue[tail++]=n;}
    n=k+1;if(!seen[n]&&grid[n]===G){seen[n]=mark;queue[tail++]=n;}
    n=k-N;if(!seen[n]&&grid[n]===G){seen[n]=mark;queue[tail++]=n;}
    n=k+N;if(!seen[n]&&grid[n]===G){seen[n]=mark;queue[tail++]=n;}
  }
  return tail;
}

/** Stamp a capsule of `radius` round a segment onto every cell whose code passes `over`. */
function capsule(grid,x0,z0,x1,z1,radius,code,over,detail=null,flag=0){
  const dx=x1-x0,dz=z1-z0,l2=dx*dx+dz*dz||1e-9;
  const i0=Math.max(1,Math.floor((Math.min(x0,x1)-radius+EXTENT)*INV)),i1=Math.min(N-2,Math.floor((Math.max(x0,x1)+radius+EXTENT)*INV));
  const j0=Math.max(1,Math.floor((Math.min(z0,z1)-radius+EXTENT)*INV)),j1=Math.min(N-2,Math.floor((Math.max(z0,z1)+radius+EXTENT)*INV));
  for(let j=j0;j<=j1;j++){const z=-EXTENT+(j+.5)*CELL;for(let i=i0;i<=i1;i++){const x=-EXTENT+(i+.5)*CELL;
    let t=((x-x0)*dx+(z-z0)*dz)/l2;t=t<0?0:t>1?1:t;const ex=x0+dx*t-x,ez=z0+dz*t-z;if(ex*ex+ez*ez>radius*radius)continue;
    const k=j*N+i;if(!over[grid[k]])continue;if(detail)detail[k]|=flag;else grid[k]=code;}}
}
/** A warped blob (lake, pond, thicket clump) stamped over ground. */
function blob(grid,cx,cz,rad,code,O,salt){
  const reach=rad*1.7,i0=Math.max(1,Math.floor((cx-reach+EXTENT)*INV)),i1=Math.min(N-2,Math.floor((cx+reach+EXTENT)*INV)),j0=Math.max(1,Math.floor((cz-reach+EXTENT)*INV)),j1=Math.min(N-2,Math.floor((cz+reach+EXTENT)*INV));
  const hr=HEARTH_CLEAR+2,ox=O[14]+salt*3.7,oz=O[15]-salt*5.3;
  for(let j=j0;j<=j1;j++){const z=-EXTENT+(j+.5)*CELL;for(let i=i0;i<=i1;i++){const x=-EXTENT+(i+.5)*CELL,k=j*N+i;if(grid[k]!==G||x*x+z*z<hr*hr)continue;
    const dx=x-cx,dz=z-cz,d=Math.sqrt(dx*dx+dz*dz)/rad,w=(valueNoise(x*.17+ox,z*.17+oz)-.5)*.6+(valueNoise(x*.06+oz,z*.06+ox)-.5)*.7;
    if(d+w<1)grid[k]=code;}}
}

function offsets(seed){const r=rngFor(seed^0x9e3779b9),o=new Float64Array(32);for(let i=0;i<o.length;i++)o[i]=Math.floor(r()*4000)-2000+r();return o;}

/** Border arcs round the outline (in pseudo-angle): which kind, how deep before the void. */
function borderArcs(rng){
  const n=7+Math.floor(rng()*4),cuts=[];
  for(let tries=0;cuts.length<n&&tries<400;tries++){const p=rng()*4;if(cuts.every(c=>arcGap(c,p)>.2))cuts.push(p);}
  cuts.sort((a,b)=>a-b);
  const arcs=cuts.map((p0,i)=>{const p1=i+1<cuts.length?cuts[i+1]:cuts[0]+4;return {p0,p1,kind:W,depth:0};});
  for(const arc of arcs){
    const [dx,dz]=pseudoDir((arc.p0+arc.p1)/2),region=regionAt(dx*112,dz*112);
    const odds=region==='mire'?[.6,.3,.1]:region==='barrow'?[.25,.3,.45]:region==='crags'?[.25,.55,.2]:[.36,.36,.28];
    const roll=rng();arc.kind=roll<odds[0]?W:roll<odds[0]+odds[1]?T:F;
  }
  // Neighbours differ, and every hollow has all three kinds of border.
  for(let i=0;i<arcs.length;i++){const prev=arcs[(i+arcs.length-1)%arcs.length];if(arcs[i].kind===prev.kind)arcs[i].kind=[W,T,F].find(k=>k!==prev.kind&&k!==arcs[(i+1)%arcs.length].kind)??T;}
  for(const kind of [W,T,F])if(!arcs.some(a=>a.kind===kind)){const i=arcs.findIndex((a,j)=>arcs.filter(b=>b.kind===a.kind).length>1&&arcs[(j+arcs.length-1)%arcs.length].kind!==kind&&arcs[(j+1)%arcs.length].kind!==kind);if(i>=0)arcs[i].kind=kind;}
  // Old fences are never endless: a long fence arc gives way to thicket.
  for(const arc of arcs)if(arc.kind===F&&arc.p1-arc.p0>.42){arcs.push({p0:arc.p0+.42,p1:arc.p1,kind:T,depth:0});arc.p1=arc.p0+.42;}
  arcs.sort((a,b)=>a.p0-b.p0);
  for(const arc of arcs)arc.depth=arc.kind===W?9+rng()*8:arc.kind===T?6+rng()*5:5+rng()*4;
  return arcs;
}

/**
 * How each region leans (DENSITY_BIAS, ROCK_BIAS), softened across region borders. Regions are the same
 * for every seed, so this is built once: sampled every 4 lattice points, blurred, then bilinear.
 */
let REGION_BIAS=null;
function regionBias(){
  if(REGION_BIAS)return REGION_BIAS;
  const C=4,CN=Math.ceil((LN-1)/C)+1,cb=new Float32Array(CN*CN),cr=new Float32Array(CN*CN);
  for(let j=0;j<CN;j++)for(let i=0;i<CN;i++){const region=regionAt(-EXTENT+i*C*LATTICE,-EXTENT+j*C*LATTICE);cb[j*CN+i]=DENSITY_BIAS[region]||0;cr[j*CN+i]=ROCK_BIAS[region]||0;}
  const soften=a=>{const t=new Float32Array(a.length);for(let j=0;j<CN;j++)for(let i=0;i<CN;i++){let s=0,n=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const u=i+di,v=j+dj;if(u<0||v<0||u>=CN||v>=CN)continue;const w=di||dj?1:2;s+=a[v*CN+u]*w;n+=w;}t[j*CN+i]=s/n;}a.set(t);};
  soften(cb);soften(cr);
  const bias=new Float32Array(LN*LN),rbias=new Float32Array(LN*LN);
  for(let j=0;j<LN;j++){const v=j/C,cj=Math.min(CN-2,v|0),fv=v-cj;for(let i=0;i<LN;i++){const u=i/C,ci=Math.min(CN-2,u|0),fu=u-ci,q=cj*CN+ci,k=j*LN+i;
    bias[k]=(cb[q]*(1-fu)+cb[q+1]*fu)*(1-fv)+(cb[q+CN]*(1-fu)+cb[q+CN+1]*fu)*fv;
    rbias[k]=(cr[q]*(1-fu)+cr[q+1]*fu)*(1-fv)+(cr[q+CN]*(1-fu)+cr[q+CN+1]*fu)*fv;}}
  return REGION_BIAS={bias,rbias};
}

// ------------------------------------------------------------------ areas
/**
 * Areas: places laid over the rings from the seed (their own RNG stream), so every hollow hides them
 * somewhere new. Each is a disc with a wobbly edge (the throne's wall is exact).
 *   frostmere  a frozen lake in the middle or outer ring: its water turns to ice you slide across
 *   ashscar    a burnt crater in the outer ring: no thickets or fences, lava pooled in its low places
 *   briarlair  Mother Briar's throne against the wild edge, walled in thorn with one gate facing home
 */
export const AREAS = Object.freeze({
  frostmere: Object.freeze({ring:[58, 100], radius:[16, 20], sheet:.58}),
  ashscar: Object.freeze({ring:[72, 106], radius:[17, 21], pools:[3, 5]}),
  briarlair: Object.freeze({radius:13.5, wall:3, gate:6, inset:20, approach:12}),
});
/** Disc membership with a soft, noisy edge (the throne keeps an exact one). */
function inArea(a, x, z, pad=0){
  const dx=x-a.x, dz=z-a.z, d2=dx*dx+dz*dz, r=a.r+pad+(a.id==='briarlair'?a.wall:0);
  if(d2>(r+3)*(r+3))return false;
  if(a.id==='briarlair')return d2<r*r;
  const wob=(valueNoise(x*.11+a.x*.01+31, z*.11-a.z*.01-17)-.5)*5;
  return Math.sqrt(d2)+wob<r;
}
function makeAreas(grid,detail,outlineR,lakes,O,seed){
  const rng=rngFor((seed>>>0)^0xa4ea5),out=[];
  const apart=(p,min)=>out.every(a=>arcGap(a.p,p)>=min);
  const each=(x,z,reach,fn)=>{
    const i0=Math.max(1,Math.floor((x-reach+EXTENT)*INV)),i1=Math.min(N-2,Math.floor((x+reach+EXTENT)*INV)),j0=Math.max(1,Math.floor((z-reach+EXTENT)*INV)),j1=Math.min(N-2,Math.floor((z+reach+EXTENT)*INV));
    for(let j=j0;j<=j1;j++){const cz=-EXTENT+(j+.5)*CELL;for(let i=i0;i<=i1;i++){const cx=-EXTENT+(i+.5)*CELL;fn(j*N+i,cx,cz,Math.sqrt((cx-x)*(cx-x)+(cz-z)*(cz-z)));}}
  };
  // The Briar Throne, against the wild edge.
  {const A=AREAS.briarlair,p=rng()*4,[dx,dz]=pseudoDir(p),R=outlineR(dx,dz),d=R-A.inset,x=dx*d,z=dz*d,gx=-dx,gz=-dz;
    const lair={id:'briarlair',x,z,r:A.radius,wall:A.wall,p,gx,gz};out.push(lair);
    const rOut=A.radius+A.wall;
    each(x,z,rOut+.6,(k,cx,cz,dist)=>{
      if(dist<A.radius){grid[k]=G;detail[k]&=~DETAIL.ford;return;}
      if(dist<rOut){
        // The gate faces home: a gap in the thorn wall, then a worn way out through whatever lies beyond.
        const ox=(cx-x)/dist,oz=(cz-z)/dist,along=ox*gx+oz*gz,across=Math.abs(ox*gz-oz*gx)*dist;
        if(along>0&&across<A.gate/2){grid[k]=G;detail[k]|=DETAIL.trail;}else grid[k]=T;
      }
    });
    const ax=x+gx*(A.radius-1),az=z+gz*(A.radius-1),bx=x+gx*(rOut+A.approach),bz=z+gz*(rOut+A.approach);
    capsule(grid,ax,az,bx,bz,2.3,G,[0,1,1,1,0]);capsule(grid,ax,az,bx,bz,1.1,0,[1,0,0,0,0],detail,DETAIL.trail);
  }
  // Frostmere: the biggest lake in its ring (far enough from the throne), or a new one.
  {const A=AREAS.frostmere;let pick=null,x,z,rad;
    for(const l of lakes){const r=Math.sqrt(l.x*l.x+l.z*l.z);if(l.r<6||r<A.ring[0]||r>A.ring[1]||!apart(pseudoAngle(l.x,l.z),.9))continue;if(!pick||l.r>pick.r)pick=l;}
    if(pick){x=pick.x;z=pick.z;rad=Math.min(A.radius[1],Math.max(A.radius[0],pick.r+7));}
    else{
      for(let t=0;t<80&&x===undefined;t++){const p=rng()*4,[dx,dz]=pseudoDir(p),r=A.ring[0]+rng()*(A.ring[1]-A.ring[0]);if(apart(p,.9)){x=dx*r;z=dz*r;}}
      if(x===undefined){const [dx,dz]=pseudoDir(out[0].p+2);x=dx*80;z=dz*80;}
      rad=A.radius[0]+rng()*(A.radius[1]-A.radius[0]);blob(grid,x,z,9,W,O,91);lakes.push({x,z,r:9});
    }
    const mere={id:'frostmere',x,z,r:rad,p:pseudoAngle(x,z)};out.push(mere);
    // Its water freezes, and a broad sheet of ice spreads from the middle whatever lay there.
    each(x,z,rad+3,(k,cx,cz,dist)=>{const code=grid[k];if(code===V||code===F)return;const wob=(valueNoise(cx*.13-x*.01+5,cz*.13+z*.01+9)-.5)*4;
      if((code===W&&inArea(mere,cx,cz,-.5))||((code===G||code===T)&&dist+wob<rad*A.sheet)){grid[k]=G;detail[k]=(detail[k]&~(DETAIL.ford|DETAIL.trail))|DETAIL.ice;}});
  }
  // The Ashen Scar: burnt open, lava in its hollows.
  {const A=AREAS.ashscar;let x,z;
    for(let t=0;t<120&&x===undefined;t++){const p=rng()*4,[dx,dz]=pseudoDir(p),r=A.ring[0]+rng()*(A.ring[1]-A.ring[0]);if(apart(p,t<80?.85:.55)){x=dx*r;z=dz*r;}}
    if(x===undefined){const [dx,dz]=pseudoDir(out[0].p+1.3);x=dx*90;z=dz*90;}
    const rad=A.radius[0]+rng()*(A.radius[1]-A.radius[0]),scar={id:'ashscar',x,z,r:rad,p:pseudoAngle(x,z),pools:[]};out.push(scar);
    each(x,z,rad+3,(k,cx,cz)=>{const code=grid[k];if((code===T||code===F||code===W)&&inArea(scar,cx,cz,-1)){grid[k]=G;detail[k]&=~DETAIL.ford;}});
    const n=A.pools[0]+Math.floor(rng()*(A.pools[1]-A.pools[0]+1));
    for(let t=0;t<60&&scar.pools.length<n;t++){
      const [dx,dz]=randomDir(rng),off=(.2+rng()*.5)*rad,px=x+dx*off,pz=z+dz*off,pr=1.4+rng()*1.3;
      if(scar.pools.some(q=>(q.x-px)*(q.x-px)+(q.z-pz)*(q.z-pz)<(q.r+pr+3)*(q.r+pr+3)))continue;
      scar.pools.push({x:px,z:pz,r:pr});
      each(px,pz,pr+1.4,(k,cx,cz,dist)=>{const wob=(valueNoise(cx*.5+px,cz*.5-pz)-.5)*.9;if(grid[k]===G&&dist+wob<pr){grid[k]=W;detail[k]=(detail[k]&~DETAIL.trail)|DETAIL.lava;}});
    }
  }
  return out;
}
/** How an area leans the density and rockiness fields (built after the terrain settles). */
function areaFields(a,density,rock){
  const reach=a.r+(a.wall||0)+4;
  for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;if(Math.abs(z-a.z)>reach)continue;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE;if(Math.abs(x-a.x)>reach)continue;
    const d=Math.sqrt((x-a.x)*(x-a.x)+(z-a.z)*(z-a.z)),k=j*LN+i,t=1-smooth(a.r-3,a.r+3,d);if(t<=0)continue;
    if(a.id==='frostmere'){density[k]=density[k]*(1-.65*t);rock[k]+=.08*t;}
    else if(a.id==='ashscar'){density[k]=density[k]*(1-.92*t);rock[k]+=.3*t;}
    else if(a.id==='briarlair'&&d<a.r){density[k]=.5+(density[k]-.5)*.4;}}}
}

const SHAPES=new Map();let lastShape=null;
function shapeFor(seed){
  if(lastShape!==null&&lastShape.seed===seed)return lastShape;
  let shape=SHAPES.get(seed);
  if(!shape){if(SHAPES.size>=4)SHAPES.delete(SHAPES.keys().next().value);shape=buildShape(seed);SHAPES.set(seed,shape);}
  lastShape=shape;return shape;
}

/**
 * The shape of the hollow for a seed, cached. Fields:
 *  grid (Uint8Array GRID_SIZE², TERRAIN codes, row-major from -EXTENT), detail (DETAIL flags),
 *  density / rock (Float32Array lattices), features (border props for the scenery layer:
 *  [{kind:'fence'|'thicket'|'reeds', x, z, angle, scale}]), lakes [{x,z,r}], fences [{points:[[x,z]..], border}],
 *  trails [[[x,z]..]], clearings [{x,z,r}], spots [{kind,x,z}] (cache places), stats.
 */
export function worldShape(seed){return shapeFor(seed);}

function buildShape(seed){
  const started=Date.now(),O=offsets(seed>>>0),rng=rngFor((seed>>>0)^0x51a9e5);
  const grid=new Uint8Array(N*N),detail=new Uint8Array(N*N);
  // ---- 1. density and rockiness (terrain nudges them afterwards)
  const density=new Float32Array(LN*LN),rock=new Float32Array(LN*LN),{bias,rbias}=regionBias();
  for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE,k=j*LN+i;
    density[k]=.62*valueNoise(x*.03+O[0],z*.03+O[1])+.38*valueNoise(x*.085+O[2],z*.085+O[3]);
    rock[k]=.68*valueNoise(x*.05+O[4],z*.05+O[5])+.32*valueNoise(x*.13+O[6],z*.13+O[7]);}}
  for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE,k=j*LN+i,r=Math.sqrt(x*x+z*z);
    let d=smooth(.3,.7,density[k]+bias[k]);const core=smooth(12,34,r);d=.4+(d-.4)*core;density[k]=d;rock[k]+=rbias[k];}}
  // ---- 2. outline and border arcs
  const fa=new Float64Array(9),fb=new Float64Array(9);for(let k=2;k<=8;k++){const amp=OUTLINE_AMP[k]*(.45+rng()*.9);fa[k]=(rng()*2-1)*amp;fb[k]=(rng()*2-1)*amp;}
  const outlineR=(c,s)=>{let r=RBASE,ck=c,sk=s;for(let k=2;k<=8;k++){const c2=ck*c-sk*s,s2=sk*c+ck*s;ck=c2;sk=s2;r+=fa[k]*ck+fb[k]*sk;}return r<RMIN?RMIN:r>RMAX?RMAX:r;};
  const arcs=borderArcs(rng),bins=new Uint8Array(1024);
  for(let b=0;b<1024;b++){const p=(b+.5)/256;let idx=arcs.length-1;for(let a=0;a<arcs.length;a++){const arc=arcs[a];if((p>=arc.p0&&p<arc.p1)||(p+4>=arc.p0&&p+4<arc.p1)){idx=a;break;}}bins[b]=idx;}
  const fenceArcs=arcs.filter(a=>a.kind===F);
  const taper=p=>{let best=9;for(const a of fenceArcs){const inside=(p>=a.p0&&p<a.p1)||(p+4>=a.p0&&p+4<a.p1);const d=inside?0:Math.min(arcGap(p,a.p0),arcGap(p,a.p1%4));if(d<best)best=d;}return smooth(0,.07,best);};
  const edge=new Float32Array(LN*LN);
  for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE,k=j*LN+i,r=Math.sqrt(x*x+z*z);
    if(r<1){edge[k]=-RBASE;continue;}
    const warp=((valueNoise(x*.042+O[8],z*.042+O[9])-.5)*13+(valueNoise(x*.12+O[10],z*.12+O[11])-.5)*4)*taper(pseudoAngle(x,z));
    const e=r-outlineR(x/r,z/r)+warp;edge[k]=e>r-LAND_MAX?e:r-LAND_MAX;}}
  // Only the band round the outline needs work: a lattice square whose corners all lie inland is
  // ground throughout (bilinear values never pass their corners) and the grid starts as ground.
  const R2=HEARTH_CLEAR*HEARTH_CLEAR,OUT2=(RULES.radius-3)*(RULES.radius-3),SUB=LATTICE/CELL,DEEPEST=Math.max(...arcs.map(a=>a.depth))+6.6;
  for(let lj=0;lj<LN-1;lj++)for(let li=0;li<LN-1;li++){const q=lj*LN+li;
    if(edge[q]<-BAY-.1&&edge[q+1]<-BAY-.1&&edge[q+LN]<-BAY-.1&&edge[q+LN+1]<-BAY-.1)continue;
    if(edge[q]>DEEPEST&&edge[q+1]>DEEPEST&&edge[q+LN]>DEEPEST&&edge[q+LN+1]>DEEPEST){for(let j=lj*SUB;j<lj*SUB+SUB&&j<N;j++)grid.fill(V,j*N+li*SUB,j*N+Math.min(N,li*SUB+SUB));continue;}
    for(let j=lj*SUB;j<lj*SUB+SUB&&j<N;j++){const z=-EXTENT+(j+.5)*CELL;for(let i=li*SUB;i<li*SUB+SUB&&i<N;i++){const x=-EXTENT+(i+.5)*CELL,k=j*N+i,r2=x*x+z*z;
      if(r2<R2)continue;
      if(r2>OUT2||i===0||j===0||i===N-1||j===N-1){grid[k]=V;continue;}
      const e=bilerp(edge,x,z);if(e<-BAY-.1)continue;
      const p=pseudoAngle(x,z),arc=arcs[bins[(p*256)|0]],wobble=(valueNoise(x*.06+O[12],z*.06+O[13])-.5)*6;
      if(arc.kind===W){
        // A border lake: a lens that rounds off towards the ends of its arc, bites a bay into the land and has
        // the wild wood standing behind it.
        const pa=p<arc.p0?p+4:p,taper=smooth(0,.1,Math.min(pa-arc.p0,arc.p1-pa)),wd=arc.depth*taper+wobble*taper;
        grid[k]=e<-BAY*taper*taper?G:e<wd?W:e<Math.max(7+wobble*.6,wd+3)?T:V;
      }else if(e<-.6)continue;
      else grid[k]=arc.kind===F?(e<arc.depth+wobble?T:V):e<0?G:e<arc.depth+wobble?arc.kind:V;}}}
  // Fences along the fence arcs: straight runs between posts on the outline.
  const fences=[];const overLand=[1,0,1,0,0];overLand[G]=1;overLand[T]=1;
  for(const arc of fenceArcs){
    const len=(arc.p1-arc.p0)*RBASE*1.5708,m=Math.max(2,Math.ceil(len/9)),points=[];
    for(let t=0;t<=m;t++){const [dx,dz]=pseudoDir(arc.p0+(arc.p1-arc.p0)*t/m),R=outlineR(dx,dz);points.push([dx*R,dz*R]);}
    for(let s=0;s+1<points.length;s++)capsule(grid,points[s][0],points[s][1],points[s+1][0],points[s+1][1],.6,F,overLand);
    fences.push({points,border:true});
  }
  // ---- 3. inland water, thicket clumps, old fences
  const lakes=[],inland=(x,z,margin)=>bilerp(edge,x,z)< -margin;
  const place=(count,rMin,rMax,radMin,radMax,gap,ok)=>{for(let placed=0,tries=0;placed<count&&tries<count*60;tries++){
    const rad=radMin+rng()*(radMax-radMin),lo=Math.max(rMin,HEARTH_CLEAR+rad+4),r=Math.sqrt(lo*lo+rng()*(rMax*rMax-lo*lo)),[dx,dz]=randomDir(rng),x=dx*r,z=dz*r;
    if(!ok(x,z,rad)||lakes.some(l=>{const ex=l.x-x,ez=l.z-z;return ex*ex+ez*ez<(l.r+rad+gap)*(l.r+rad+gap);}))continue;
    lakes.push({x,z,r:rad});blob(grid,x,z,rad,W,O,lakes.length);placed++;}};
  place(2+Math.floor(rng()*3),INNER_RING+8,118,7,14,9,(x,z,rad)=>inland(x,z,rad*.4));
  place(7+Math.floor(rng()*5),HEARTH_CLEAR+6,124,2.2,4.5,6,(x,z,rad)=>inland(x,z,rad+2));
  place(9+Math.floor(rng()*6),OUTER_RING-8,132,1.8,3.8,3,(x,z,rad)=>inland(x,z,rad+1)&&regionAt(x,z)==='mire');
  const lat=(x,z)=>{const i=Math.round((x+EXTENT)/LATTICE),j=Math.round((z+EXTENT)/LATTICE);return j*LN+i;};
  const clumps=[];{const picks=[];for(let j=0;j<LN;j+=2)for(let i=0;i<LN;i+=2){const k=j*LN+i,x=-EXTENT+i*LATTICE,z=-EXTENT+j*LATTICE,r=Math.sqrt(x*x+z*z);if(density[k]>=.84&&r>INNER_RING+4&&r<122&&inland(x,z,8))picks.push([x,z]);}
    const want=3+Math.floor(rng()*4);for(const [x,z] of shuffle(picks,rng)){if(clumps.length>=want)break;if(clumps.some(c=>(c.x-x)**2+(c.z-z)**2<28*28))continue;const rad=2.5+rng()*2.8;clumps.push({x,z,r:rad});blob(grid,x,z,rad,T,O,40+clumps.length);}}
  const overGround=[1,0,0,0,0];
  {const want=3+Math.floor(rng()*3),spots=[];
    for(let tries=0;spots.length<want&&tries<300;tries++){
      const r=Math.sqrt((HEARTH_CLEAR+14)**2+rng()*(112*112-(HEARTH_CLEAR+14)**2)),[dx,dz]=randomDir(rng),x=dx*r,z=dz*r;
      if(!inland(x,z,12)||bilerp(density,x,z)>.5||spots.some(s=>(s[0]-x)**2+(s[1]-z)**2<30*30)||lakes.some(l=>(l.x-x)**2+(l.z-z)**2<(l.r+10)**2))continue;
      spots.push([x,z]);
      const [ux,uz]=randomDir(rng),vx=-uz,vz=ux,lines=[];
      if(rng()<.4){
        // A ruined pen: four sides, one or two of them broken by a gap.
        const a=(8+rng()*6)/2,b=(7+rng()*5)/2,C=[[x-ux*a-vx*b,z-uz*a-vz*b],[x+ux*a-vx*b,z+uz*a-vz*b],[x+ux*a+vx*b,z+uz*a+vz*b],[x-ux*a+vx*b,z-uz*a+vz*b]];
        const g=Math.floor(rng()*4),at=(s,t)=>[C[s][0]+(C[(s+1)%4][0]-C[s][0])*t,C[s][1]+(C[(s+1)%4][1]-C[s][1])*t],sideLen=s=>Math.sqrt((C[(s+1)%4][0]-C[s][0])**2+(C[(s+1)%4][1]-C[s][1])**2);
        const gap=1.9/sideLen(g),mid=.3+rng()*.4,points=[at(g,mid+gap)];for(let s=1;s<=4;s++)points.push(C[(g+s)%4]);
        if(rng()<.4){const h=(g+2)%4,gap2=1.9/sideLen(h),cut=points.findIndex(p=>p===C[h]);lines.push([...points.slice(0,cut+1),at(h,.5-gap2)]);lines.push([at(h,.5+gap2),...points.slice(cut+1),at(g,mid-gap)]);}
        else lines.push([...points,at(g,mid-gap)]);
      }else{
        // A straggling run of fence with a bend in it.
        const len=11+rng()*13,t=.4+rng()*.2,bend=rng()*.8-.4,mx=x+ux*len*t,mz=z+uz*len*t,bl=Math.sqrt(1+bend*bend),ex=mx+(ux+vx*bend)/bl*len*(1-t),ez=mz+(uz+vz*bend)/bl*len*(1-t);
        lines.push([[x-ux*len*.5*t,z-uz*len*.5*t],[mx,mz],[ex,ez]]);
      }
      for(const points of lines){for(let s=0;s+1<points.length;s++)capsule(grid,points[s][0],points[s][1],points[s+1][0],points[s+1][1],.6,F,overGround);fences.push({points,border:false});}
    }}
  // ---- 3b. areas: Frostmere, the Ashen Scar and the Briar Throne, somewhere new in every hollow
  const areas=makeAreas(grid,detail,outlineR,lakes,O,seed);
  // ---- 4. reachability: everything walkable is reached from the Heartfire
  const S=scratch(),{seen,queue}=S,hearthCell=cellOf(0,0);
  seen.fill(0);flood(grid,seen,queue,hearthCell,1);
  let fords=0,filled=0;
  for(let start=0;start<N*N;start++){
    if(grid[start]!==G||seen[start])continue;
    // A pocket cut off from the Heartfire (rare): the pocket buffers are made the first time one is needed.
    const comp=S.comp||(S.comp=new Int32Array(N*N)),parent=S.parent||(S.parent=new Int32Array(N*N));
    const size=flood(grid,seen,comp,start,2);
    if(size>=100&&carve(grid,detail,seen,comp,size,parent,queue)){fords++;continue;}
    const counts=[0,0,0,0,0];for(let c=0;c<size;c++){const k=comp[c];counts[grid[k-1]]++;counts[grid[k+1]]++;counts[grid[k-N]]++;counts[grid[k+N]]++;}
    const kind=counts[W]>=counts[T]&&counts[W]>=counts[F]&&counts[W]>0?W:counts[F]>counts[T]?F:T;
    for(let c=0;c<size;c++)grid[comp[c]]=kind===F?T:kind;filled++;
  }
  if(fords){seen.fill(0);flood(grid,seen,queue,hearthCell,1);for(let k=0;k<N*N;k++)if(grid[k]===G&&!seen[k]){grid[k]=T;filled++;}}
  // ---- 5. the patches settle round the terrain: forest thickens at thickets, opens at water
  const blocked=chamfer(grid,[0,1,1,1,1]);
  {const nearT=new Float32Array(LN*LN).fill(99),nearW=new Float32Array(LN*LN).fill(99);
    for(let j=0;j<LN;j++)for(let i=0;i<LN;i++){const k=cellOf(-EXTENT+i*LATTICE,-EXTENT+j*LATTICE);if(k<0)continue;if(grid[k]===T)nearT[j*LN+i]=0;else if(grid[k]===W)nearW[j*LN+i]=0;}
    latticeDistance(nearT);latticeDistance(nearW);
    for(let k=0;k<LN*LN;k++){let d=density[k];d=Math.max(d,(1-nearT[k]/9)*.92);d*=.62+.38*smooth(0,7,nearW[k]);density[k]=d;}}
  // The areas lean their own way: the mere lies open under snow, the scar is burnt bare, the throne is overgrown.
  for(const a of areas)areaFields(a,density,rock);
  const clearOf=k=>blocked[k]*DIST_UNIT;
  const clearings=[];{const picks=[];for(let j=0;j<LN;j++)for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE,z=-EXTENT+j*LATTICE,r=Math.sqrt(x*x+z*z),k=cellOf(x,z);if(density[j*LN+i]>=.72&&r>26&&r<132&&k>=0&&grid[k]===G&&clearOf(k)>=6)picks.push([x,z]);}
    for(const [x,z] of shuffle(picks,rng)){if(clearings.length>=16)break;if(clearings.some(c=>(c.x-x)**2+(c.z-z)**2<22*22))continue;clearings.push({x,z,r:3.5+rng()*2.5});}
    for(const c of clearings){const reach=c.r+4;for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;if(Math.abs(z-c.z)>reach)continue;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE;if(Math.abs(x-c.x)>reach)continue;const d=Math.sqrt((x-c.x)**2+(z-c.z)**2);density[j*LN+i]*=.12+.88*smooth(c.r,c.r+3.5,d);}}}}
  // ---- 6. trails, cache spots, border props
  const trails=makeTrails(grid,detail,blocked,density);
  const water=chamfer(grid,[0,1,0,0,0],S.dist);
  const spots=makeSpots(grid,detail,blocked,water,density,fences,clearings,rng);
  const shape={seed, radius:RULES.radius, extent:EXTENT, cell:CELL, size:N, lattice:LATTICE, latticeSize:LN,
    grid, detail, density, rock, blocked, features:null, lakes, clumps, fences, trails, clearings, spots, areas, arcs:arcs.map(a=>({p0:a.p0,p1:a.p1,kind:TERRAIN_NAMES[a.kind],depth:a.depth})), stats:null};
  const counts=[0,0,0,0,0];
  shape.features=makeFeatures(shape,rngFor((seed>>>0)^0xfea7),chamfer(grid,[1,0,0,0,0],S.dist),counts);
  shape.stats={ms:Date.now()-started, land:counts[G]*CELL*CELL, water:counts[W]*CELL*CELL, fords, filled};
  return shape;
}

/** Chamfer distance (in units) on the lattice, from points already at 0. */
function latticeDistance(d){
  const s=LATTICE,dg=LATTICE*1.4142;
  for(let j=0;j<LN;j++)for(let i=0;i<LN;i++){const k=j*LN+i;let v=d[k];if(i>0&&d[k-1]+s<v)v=d[k-1]+s;if(j>0){if(d[k-LN]+s<v)v=d[k-LN]+s;if(i>0&&d[k-LN-1]+dg<v)v=d[k-LN-1]+dg;if(i<LN-1&&d[k-LN+1]+dg<v)v=d[k-LN+1]+dg;}d[k]=v;}
  for(let j=LN-1;j>=0;j--)for(let i=LN-1;i>=0;i--){const k=j*LN+i;let v=d[k];if(i<LN-1&&d[k+1]+s<v)v=d[k+1]+s;if(j<LN-1){if(d[k+LN]+s<v)v=d[k+LN]+s;if(i<LN-1&&d[k+LN+1]+dg<v)v=d[k+LN+1]+dg;if(i>0&&d[k+LN-1]+dg<v)v=d[k+LN-1]+dg;}d[k]=v;}
}

/** Cut a ford (water), trail (thicket) or gap (fence) from a cut-off pocket to reached land. */
function carve(grid,detail,seen,comp,size,parent,queue){
  parent.fill(-1);let head=0,tail=0;
  for(let c=0;c<size;c++){parent[comp[c]]=-2;queue[tail++]=comp[c];}
  const OUT=(RULES.radius-5)*(RULES.radius-5);
  let hit=-1;
  search: while(head<tail&&tail<60000){const k=queue[head++];
    for(const n of [k-1,k+1,k-N,k+N]){
      if(parent[n]!==-1)continue;const code=grid[n];
      if(code===G){if(seen[n]===1){hit=k;parent[n]=k;break search;}continue;}
      if(code===V)continue;const x=cellX(n),z=cellZ(n);if(x*x+z*z>OUT)continue;
      parent[n]=k;queue[tail++]=n;}
  }
  if(hit<0)return false;
  const brush=2.4;
  for(let k=hit;k>=0&&parent[k]!==-2;k=parent[k]){const i=k%N,j=(k/N)|0;
    for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++){if(di*di+dj*dj>brush*brush)continue;const n=(j+dj)*N+i+di,code=grid[n];
      if(code===W){grid[n]=G;detail[n]|=DETAIL.ford;}else if(code===T){grid[n]=G;detail[n]|=DETAIL.trail;}else if(code===F)grid[n]=G;}}
  return true;
}

/** Worn trails from the Heartfire towards each region, found on the lattice (Dijkstra), smoothed and stamped. */
function makeTrails(grid,detail,blocked,density){
  const M=LN*LN,dist=new Float32Array(M).fill(Infinity),from=new Int32Array(M).fill(-1),open=new Uint8Array(M),cost=new Float32Array(M);
  for(let j=1;j<LN-1;j++)for(let i=1;i<LN-1;i++){const k=j*LN+i,g=cellOf(-EXTENT+i*LATTICE,-EXTENT+j*LATTICE);if(g<0||grid[g]!==G)continue;const clear=blocked[g]*DIST_UNIT;if(clear<.9)continue;open[k]=1;cost[k]=1+1.4*density[k]+(clear<2.5?1.6:0);}
  const heapK=new Int32Array(M*4),heapD=new Float32Array(M*4);let size=0;
  const push=(k,d)=>{let i=size++;while(i>0){const p=(i-1)>>1;if(heapD[p]<=d)break;heapK[i]=heapK[p];heapD[i]=heapD[p];i=p;}heapK[i]=k;heapD[i]=d;};
  const pop=()=>{const top=heapK[0],k=heapK[--size],d=heapD[size];let i=0;for(;;){let c=2*i+1;if(c>=size)break;if(c+1<size&&heapD[c+1]<heapD[c])c++;if(heapD[c]>=d)break;heapK[i]=heapK[c];heapD[i]=heapD[c];i=c;}heapK[i]=k;heapD[i]=d;return top;};
  const home=Math.round(EXTENT/LATTICE)*LN+Math.round(EXTENT/LATTICE);dist[home]=0;push(home,0);
  const STEP=[1,-1,LN,-LN,LN+1,1-LN,LN-1,-LN-1],LEN=[1,1,1,1,1.4142,1.4142,1.4142,1.4142];
  while(size>0){const d0=heapD[0],k=pop();if(d0>dist[k])continue;
    for(let s=0;s<8;s++){const n=k+STEP[s];if(!open[n])continue;const d=d0+LEN[s]*(cost[k]+cost[n])*.5;if(d<dist[n]){dist[n]=d;from[n]=k;push(n,d);}}}
  const S3=Math.sqrt(3)/2,mid=(INNER_RING+OUTER_RING)/2,far=OUTER_RING+16;
  const targets=[[mid,0],[-mid,0],[far*.5,far*S3],[-far,0],[far*.5,-far*S3]];
  const trails=[];
  for(const [tx,tz] of targets){
    let best=-1,bestD=Infinity;const ti=Math.round((tx+EXTENT)/LATTICE),tj=Math.round((tz+EXTENT)/LATTICE);
    for(let dj=-8;dj<=8;dj++)for(let di=-8;di<=8;di++){const n=(tj+dj)*LN+ti+di;if(n<0||n>=M||!isFinite(dist[n]))continue;const e=di*di+dj*dj;if(e<bestD){bestD=e;best=n;}}
    if(best<0)continue;
    let pts=[];for(let k=best;k>=0;k=from[k])pts.push([-EXTENT+(k%LN)*LATTICE,-EXTENT+((k/LN)|0)*LATTICE]);
    if(pts.length<8)continue;
    pts=pts.filter((p,i)=>i%2===0||i===pts.length-1).reverse();
    for(let pass=0;pass<3;pass++){const next=[pts[0]];for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}next.push(pts[pts.length-1]);pts=next;}
    trails.push(pts);
    for(let i=0;i+1<pts.length;i++)capsule(grid,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],.8,0,[1,0,0,0,0],detail,DETAIL.trail);
  }
  return trails;
}

/** Places a cache would like to sit: forest clearings, lake shores, fence ends, stone rings, lone heath. */
function makeSpots(grid,detail,blocked,water,density,fences,clearings,rng){
  const spots=[],clear=k=>blocked[k]*DIST_UNIT,open=(x,z,need)=>{const k=cellOf(x,z);return k>=0&&grid[k]===G&&!(detail[k]&DETAIL.trail)&&clear(k)>=need;};
  const far=(x,z,gap)=>spots.every(s=>(s.x-x)**2+(s.z-z)**2>=gap*gap);
  for(const c of clearings)if(open(c.x,c.z,3))spots.push({kind:'clearing',x:c.x,z:c.z});
  {const picks=[];for(let j=4;j<N-4;j+=4)for(let i=4;i<N-4;i+=4){const k=j*N+i,d=water[k]*DIST_UNIT;if(grid[k]!==G||d<1.6||d>2.6||clear(k)<1.5||(detail[k]&DETAIL.trail))continue;const x=cellX(k),z=cellZ(k);if(x*x+z*z<(HEARTH_CLEAR+4)**2)continue;picks.push([x,z]);}
    let shores=0;for(const [x,z] of shuffle(picks,rng)){if(shores>=26)break;if(!far(x,z,14))continue;spots.push({kind:'shore',x,z});shores++;}}
  for(const f of fences){const P=f.points;for(const [a,b] of [[P[0],P[1]],[P[P.length-1],P[P.length-2]]]){
    const dx=a[0]-b[0],dz=a[1]-b[1],l=Math.sqrt(dx*dx+dz*dz)||1,ux=dx/l,uz=dz/l;
    for(const [ox,oz] of [[ux*1.9,uz*1.9],[-uz*1.9,ux*1.9],[uz*1.9,-ux*1.9],[ux*1.4-uz*1.4,uz*1.4+ux*1.4],[ux*1.4+uz*1.4,uz*1.4-ux*1.4]]){const x=a[0]+ox,z=a[1]+oz;if(open(x,z,1.2)&&far(x,z,8)){spots.push({kind:'fence',x,z});break;}}}}
  {const picks=[];for(let j=0;j<LN;j++)for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE,z=-EXTENT+j*LATTICE,r2=x*x+z*z,d=density[j*LN+i];if(r2<40*40||r2>134*134)continue;if(d>=.1&&d<.5&&open(x,z,6.5))picks.push(['stones',x,z]);else if(d<.1&&open(x,z,4))picks.push(['heath',x,z]);}
    let rings=0,heath=0;for(const [kind,x,z] of shuffle(picks,rng)){if(kind==='stones'){if(rings>=12||!far(x,z,24))continue;rings++;}else{if(heath>=10||!far(x,z,20))continue;heath++;}spots.push({kind,x,z});}}
  return spots;
}

/** Border props for the scenery layer: reeds on the shores, thicket clumps along the wild edge, fence posts. */
function makeFeatures(shape,rng,land,counts){
  const {grid}=shape,features=[],buckets=new Map(),B=3;
  const room=(x,z,gap)=>{const bi=Math.floor(x/B),bj=Math.floor(z/B);for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const list=buckets.get((bi+di)*4096+bj+dj);if(list)for(const f of list)if((f.x-x)**2+(f.z-z)**2<gap*gap)return false;}return true;};
  const add=f=>{features.push(f);const key=Math.floor(f.x/B)*4096+Math.floor(f.z/B);let list=buckets.get(key);if(!list)buckets.set(key,list=[]);list.push(f);};
  for(const f of shape.fences){const P=f.points;for(let s=0;s+1<P.length;s++){const [x0,z0]=P[s],[x1,z1]=P[s+1],dx=x1-x0,dz=z1-z0,l=Math.sqrt(dx*dx+dz*dz),steps=Math.max(1,Math.round(l/1.8)),angle=Math.atan2(dz,dx);
    for(let t=s===0?0:1;t<=steps;t++){const x=x0+dx*t/steps,z=z0+dz*t/steps,k=cellOf(x,z);if(k<0||grid[k]!==F)continue;add({kind:'fence',x,z,angle,scale:1});}}}
  const lim=(RULES.radius-2)**2;
  for(let j=2;j<N-2;j++)for(let i=2;i<N-2;i++){const k=j*N+i,code=grid[k];counts[code]++;
    if(code===W){if(shape.detail[k]&DETAIL.lava)continue;if(grid[k-1]!==G&&grid[k+1]!==G&&grid[k-N]!==G&&grid[k+N]!==G)continue;const x=cellX(k),z=cellZ(k);if(valueNoise(x*.21+11,z*.21-7)<.4||!room(x,z,2.1))continue;add({kind:'reeds',x,z,angle:rng()*Math.PI*2,scale:+(.75+rng()*.5).toFixed(2)});}
    else if(code===T){const d=land[k]*DIST_UNIT;if(d>4.6||(i+j)%2)continue;const x=cellX(k),z=cellZ(k);if(x*x+z*z>lim)continue;const gap=d<1.3?2.3:3.1;if(!room(x,z,gap))continue;add({kind:'thicket',x,z,angle:rng()*Math.PI*2,scale:+(.9+Math.min(1,d/4.6)*.4+rng()*.25).toFixed(2)});}}
  return features;
}

/** The seeded area (AREAS) at a world position, or null. Cheap: three disc tests on the cached shape. */
export function areaAt(seed, x, z){const s=lastShape!==null&&lastShape.seed===seed?lastShape:shapeFor(seed);for(const a of s.areas)if(inArea(a,x,z))return a.id;return null;}
/** Region or area at a world position: what the HUD names, what lives and grows there. */
export function zoneAt(seed, x, z){return areaAt(seed,x,z)||regionAt(x,z);}
/** The areas of a hollow: [{id, x, z, r, ...}] (the throne also has its wall, gate direction gx/gz; the scar its lava pools). */
export function areasOf(seed){return shapeFor(seed).areas;}
/** True on ice (Frostmere): walkers slide. */
export function iceAt(seed, x, z){const s=lastShape!==null&&lastShape.seed===seed?lastShape:shapeFor(seed);const k=cellOf(x,z);return k>=0&&(s.detail[k]&DETAIL.ice)!==0;}

/** Terrain kind code (TERRAIN) at a world position. */
export function terrainAt(seed, x, z){const s=lastShape!==null&&lastShape.seed===seed?lastShape:shapeFor(seed);const i=(x+EXTENT)*INV|0,j=(z+EXTENT)*INV|0;return x+EXTENT>=0&&z+EXTENT>=0&&i<N&&j<N?s.grid[j*N+i]:V;}

/** True where a walker's centre may stand. Hot path: a cached grid lookup. */
export function walkableAt(seed, x, z){const s=lastShape!==null&&lastShape.seed===seed?lastShape:shapeFor(seed);const i=(x+EXTENT)*INV|0,j=(z+EXTENT)*INV|0;return x+EXTENT>=0&&z+EXTENT>=0&&i<N&&j<N&&s.grid[j*N+i]===G;}

/** 0 (open heath) .. 1 (thick forest): how densely things grow here. Shared by nodes and scenery. */
export function densityAt(seed, x, z){return bilerp(shapeFor(seed).density,x,z);}

/** How stony the ground is (0..~1.3), for rocky fields. */
export function rockAt(seed, x, z){return bilerp(shapeFor(seed).rock,x,z);}

const patchOf=(d,rock)=>d>=.62?PATCH.forest:d<.15?PATCH.heath:rock>.64?PATCH.rocky:PATCH.meadow;
/** PATCH code at a world position: forest, meadow, rocky field or empty heath. */
export function patchAt(seed, x, z){const s=shapeFor(seed);return patchOf(bilerp(s.density,x,z),bilerp(s.rock,x,z));}

/** Units from a position to the nearest non-walkable cell (0 when not walkable). */
export function clearanceAt(seed, x, z){const s=shapeFor(seed),k=cellOf(x,z);return k<0?0:s.blocked[k]*DIST_UNIT;}

/** The nearest walkable point to (x,z) within maxR units, or null. Nudges a stray walker back onto land. */
export function landNear(seed, x, z, maxR=6){
  const s=shapeFor(seed);if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  {const k=cellOf(x,z);if(k>=0&&s.grid[k]===G)return {x,z};}
  const ci=Math.floor((x+EXTENT)*INV),cj=Math.floor((z+EXTENT)*INV),R=Math.ceil(maxR*INV);
  let best=null,bestD=Infinity;
  for(let ring=0;ring<=R;ring++){
    for(let dj=-ring;dj<=ring;dj++)for(let di=-ring;di<=ring;di++){
      if(Math.abs(di)!==ring&&Math.abs(dj)!==ring)continue;const i=ci+di,j=cj+dj;if(i<1||j<1||i>=N-1||j>=N-1||s.grid[j*N+i]!==G)continue;
      const x0=-EXTENT+i*CELL+.02,x1=x0+CELL-.04,z0=-EXTENT+j*CELL+.02,z1=z0+CELL-.04,px=x<x0?x0:x>x1?x1:x,pz=z<z0?z0:z>z1?z1:z,d=(px-x)**2+(pz-z)**2;
      if(d<bestD){bestD=d;best={x:px,z:pz};}}
    // Anything in a later ring is at least (ring)*CELL away.
    if(best&&Math.sqrt(bestD)<=ring*CELL)break;
  }
  return best&&bestD<=maxR*maxR?best:null;
}

// ------------------------------------------------------------------ ground colours
const SAND=[196,184,150],FOAM=[168,188,190],EARTH=[88,70,54],BRIAR=[84,40,46];
const TONE_KEYS=['meadow','woods','graveyard','mire','crags','barrow','path','water','shore','thicket','void','frostmere','ashscar','briarlair','ice','lava'];
const DEFAULT_TONES={meadow:'#7d735d',woods:'#565e55',graveyard:'#746977',mire:'#5c6a4e',crags:'#6c6679',barrow:'#655862',path:'#9c8968',water:'#3f5566',shore:'#6f7a6a',thicket:'#3c4a40',void:'#1f1d27',
  frostmere:'#97a3ad',ashscar:'#4d4340',briarlair:'#4f5c3c',ice:'#b4d3e2',lava:'#e8662a'};
const toRGB=h=>{const n=parseInt(String(h).replace('#',''),16);return Number.isFinite(n)?[n>>16&255,n>>8&255,n&255]:[128,128,128];};
const REGION_TONES=new Map(),GROUND=new Map();
/** Region colour on the lattice (seed independent, so built once per palette), blended across borders by bilerp. */
function regionTones(tones,key){
  let lat=REGION_TONES.get(key);if(lat)return lat;
  lat=[new Float32Array(LN*LN),new Float32Array(LN*LN),new Float32Array(LN*LN)];
  for(let j=0;j<LN;j++)for(let i=0;i<LN;i++){const c=tones[regionAt(-EXTENT+i*LATTICE,-EXTENT+j*LATTICE)]||tones.meadow,k=j*LN+i;lat[0][k]=c[0];lat[1][k]=c[1];lat[2][k]=c[2];}
  if(REGION_TONES.size>=4)REGION_TONES.clear();REGION_TONES.set(key,lat);return lat;
}
/**
 * The colour of the ground, one texel per grid cell (GROUND_RES texels a unit over [-EXTENT, EXTENT)), for a
 * theme palette: the region's tint, the patch (dark forest floor, pale heath, stony fields), worn trails and
 * fords, a soft shore, deep water darker than the shallows, thicket undergrowth and the void. Texels match the
 * walkable grid, so a filtered texture of them puts every shore exactly where walking stops. Cached per seed
 * and palette and shared by the WebGL ground texture, the Canvas2D tiles and the map, so all three agree.
 * Returns {size, extent, res, rgb:Uint8Array(size*size*3), land:Uint8Array(size*size)} where land is
 * 1 for walkable ground (a fence line counts: its posts stand on it), 2 water, 3 thicket, 4 void.
 */
export const GROUND_RES = 1/CELL;
export function groundColors(seed, palette={}){
  const toneKey=TONE_KEYS.map(k=>palette[k]||'').join(','),key=seed+'|'+toneKey;
  let out=GROUND.get(key);if(out)return out;
  const s=shapeFor(seed),{grid,detail}=s,tones={};for(const k of TONE_KEYS)tones[k]=toRGB(palette[k]||DEFAULT_TONES[k]);
  const region=regionTones(tones,toneKey),{path,water,shore,thicket}=tones,dark=tones.void,stone=[118,114,122],grass=[104,116,78];
  // Land colour on the lattice: region, then the patch.
  const L0=new Float32Array(LN*LN),L1=new Float32Array(LN*LN),L2=new Float32Array(LN*LN),c=[0,0,0],mix=(t,col)=>{c[0]+=(col[0]-c[0])*t;c[1]+=(col[1]-c[1])*t;c[2]+=(col[2]-c[2])*t;};
  for(let k=0;k<LN*LN;k++){c[0]=region[0][k];c[1]=region[1][k];c[2]=region[2][k];
    const dens=s.density[k],forest=smooth(.5,.86,dens),heath=1-smooth(.07,.22,dens),rocky=smooth(.56,.82,s.rock[k])*(1-forest),meadow=(1-forest)*(1-heath)*(1-rocky);
    mix(.1*meadow,grass);mix(.4*forest,thicket);mix(.2*heath,path);mix(.24*rocky,stone);const shade=1-.12*forest;L0[k]=c[0]*shade;L1[k]=c[1]*shade;L2[k]=c[2]*shade;}
  // Areas (seeded) tint their ground: snow round the mere, ash in the scar, deep moss inside the throne.
  for(const a of s.areas){const tone=tones[a.id];if(!tone)continue;const reach=a.r+(a.wall||0)+4;
    for(let j=0;j<LN;j++){const z=-EXTENT+j*LATTICE;if(Math.abs(z-a.z)>reach)continue;for(let i=0;i<LN;i++){const x=-EXTENT+i*LATTICE;if(Math.abs(x-a.x)>reach)continue;
      const d=Math.sqrt((x-a.x)*(x-a.x)+(z-a.z)*(z-a.z))+(a.id==='briarlair'?0:(valueNoise(x*.11+a.x*.01+31,z*.11-a.z*.01-17)-.5)*5),t=(a.id==='briarlair'?1-smooth(a.r-1,a.r+1.5,d):1-smooth(a.r-3,a.r+2,d))*.82;if(t<=0)continue;
      const k=j*LN+i;L0[k]+=(tone[0]-L0[k])*t;L1[k]+=(tone[1]-L1[k])*t;L2[k]+=(tone[2]-L2[k])*t;}}}
  const iceTone=tones.ice,lavaTone=tones.lava,lair=s.areas.find(a=>a.id==='briarlair');
  // How far each cell lies from water, from dry land and from ground (in grid thirds, see chamfer).
  const S=scratch();S.dist2||(S.dist2=new Uint16Array(N*N));S.dist3||(S.dist3=new Uint16Array(N*N));
  const toWater=chamfer(grid,[0,1,0,0,0],S.dist),fromShore=chamfer(grid,[1,0,1,1,1],S.dist2),toGround=chamfer(grid,[1,0,0,0,0],S.dist3);
  // Fence lines and worn trails are drawn from their polylines, so their edges stay smooth on the diagonal.
  const lineDist=(lines,reach)=>{const out=new Float32Array(N*N).fill(9);
    for(const P of lines)for(let a=0;a+1<P.length;a++){const [x0,z0]=P[a],[x1,z1]=P[a+1],dx=x1-x0,dz=z1-z0,l2=dx*dx+dz*dz||1e-9;
      const i0=Math.max(0,Math.floor((Math.min(x0,x1)-reach+EXTENT)*INV)),i1=Math.min(N-1,Math.floor((Math.max(x0,x1)+reach+EXTENT)*INV)),j0=Math.max(0,Math.floor((Math.min(z0,z1)-reach+EXTENT)*INV)),j1=Math.min(N-1,Math.floor((Math.max(z0,z1)+reach+EXTENT)*INV));
      for(let j=j0;j<=j1;j++){const z=-EXTENT+(j+.5)*CELL;for(let i=i0;i<=i1;i++){const x=-EXTENT+(i+.5)*CELL;let t=((x-x0)*dx+(z-z0)*dz)/l2;t=t<0?0:t>1?1:t;const ex=x0+dx*t-x,ez=z0+dz*t-z,d=Math.sqrt(ex*ex+ez*ez),k=j*N+i;if(d<out[k])out[k]=d;}}}
    return out;};
  const fenceLine=lineDist(s.fences.map(f=>f.points),1.2),trailLine=lineDist(s.trails,1.6);
  const rgb=new Uint8Array(N*N*3),land=new Uint8Array(N*N);
  for(let j=0;j<N;j++){const z=-EXTENT+(j+.5)*CELL;let v=(z+EXTENT)/LATTICE;if(v>LN-1.0001)v=LN-1.0001;const lj=v|0,fv=v-lj;
    for(let i=0;i<N;i++){const k=j*N+i,code=grid[k];let r,g,b;
      if(code===G||code===F){
        const x=-EXTENT+(i+.5)*CELL;let u=(x+EXTENT)/LATTICE;if(u>LN-1.0001)u=LN-1.0001;const li=u|0,fu=u-li,q=lj*LN+li,w00=(1-fu)*(1-fv),w10=fu*(1-fv),w01=(1-fu)*fv,w11=fu*fv;
        c[0]=L0[q]*w00+L0[q+1]*w10+L0[q+LN]*w01+L0[q+LN+1]*w11;c[1]=L1[q]*w00+L1[q+1]*w10+L1[q+LN]*w01+L1[q+LN+1]*w11;c[2]=L2[q]*w00+L2[q+1]*w10+L2[q+LN]*w01+L2[q+LN+1]*w11;
        const worn=1-smooth(.5,1.15,trailLine[k]),dug=1-smooth(.2,.8,fenceLine[k]);if(worn>0)mix(.5*worn,path);if(detail[k]&DETAIL.ford)mix(.55,shore);if(dug>0)mix(.55*dug,EARTH);
        const wd=toWater[k]*DIST_UNIT;if(wd<2.6){mix(.6*(1-wd/2.6),shore);if(wd<.9)mix(.22,SAND);}
        // Frostmere's ice: pale, with long cracks of deeper blue.
        if(detail[k]&DETAIL.ice){mix(.66,iceTone);const crack=Math.abs(valueNoise(x*.21+7,z*.21-3)-.5),sheen=valueNoise(x*.08-2,z*.08+5);mix(.25*(1-smooth(.01,.045,crack)),water);mix(.18*smooth(.55,.85,sheen),FOAM);}
        r=c[0];g=c[1];b=c[2];land[k]=1;
      }else if(code===W&&(detail[k]&DETAIL.lava)){
        // Lava: a dark crust at the rim, molten and bright in the middle.
        const e=Math.min(1,fromShore[k]*DIST_UNIT/1.6),x=-EXTENT+(i+.5)*CELL,flow=valueNoise(x*.6+3,z*.6-5)*.3;
        const hot=Math.min(1,e*.85+flow);r=40+(lavaTone[0]-40)*hot+(hot>.75?(255-lavaTone[0])*(hot-.75)*2.4:0);g=24+(lavaTone[1]-24)*hot+(hot>.75?(196-lavaTone[1])*(hot-.75)*2.4:0);b=22+(lavaTone[2]-22)*hot*.6;land[k]=2;
      }else if(code===W){
        // Shallows lighter, a pale rim where the water laps the bank, deep water dark.
        const e=fromShore[k]*DIST_UNIT,t=Math.min(1,e/5),m=.5+.5*t,dim=1.12-.42*t;c[0]=(shore[0]+(water[0]-shore[0])*m)*dim;c[1]=(shore[1]+(water[1]-shore[1])*m)*dim;c[2]=(shore[2]+(water[2]-shore[2])*m)*dim;
        if(e<.9)mix(.3,FOAM);r=c[0];g=c[1];b=c[2];land[k]=2;}
      else if(code===T){const t=Math.min(1,toGround[k]*DIST_UNIT/3.5),m=1.08-.3*t;r=thicket[0]*m;g=thicket[1]*m;b=thicket[2]*m;land[k]=3;
        // The throne's wall: briar, darker and redder than any thicket.
        if(lair){const x=-EXTENT+(i+.5)*CELL,dx=x-lair.x,dz=z-lair.z,d2=dx*dx+dz*dz,rIn=lair.r-.2,rOut=lair.r+lair.wall+.4;if(d2>rIn*rIn&&d2<rOut*rOut){r=r*.55+BRIAR[0]*.45;g=g*.55+BRIAR[1]*.45;b=b*.55+BRIAR[2]*.45;}}}
      else{const t=Math.min(1,toGround[k]*DIST_UNIT/6),m=.45*(1-t);r=dark[0]+(thicket[0]-dark[0])*m;g=dark[1]+(thicket[1]-dark[1])*m;b=dark[2]+(thicket[2]-dark[2])*m;land[k]=4;}
      // A faint mottle so broad patches do not read as flat paint.
      const mo=code===V?1:.96+hash2(i>>1,j>>1,seed)*.08;
      rgb[k*3]=Math.min(255,r*mo);rgb[k*3+1]=Math.min(255,g*mo);rgb[k*3+2]=Math.min(255,b*mo);
    }}
  // Soften the stair-steps: where kinds of ground meet, a texel takes its neighbourhood's average.
  // Ice edges count as a change of ground too, so the mere's rim is softened like a shore.
  const iceAt_=k=>(detail[k]&DETAIL.ice)?8:0,cls=k=>land[k]|iceAt_(k);
  {const src=rgb.slice();for(let pass=0;pass<2;pass++){const from=pass?rgb.slice():src;for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){const k=j*N+i,a=cls(k);if(cls(k-1)===a&&cls(k+1)===a&&cls(k-N)===a&&cls(k+N)===a)continue;if(pass&&!(iceAt_(k)||iceAt_(k-1)||iceAt_(k+1)||iceAt_(k-N)||iceAt_(k+N)))continue;
    for(let ch=0;ch<3;ch++){const o=k*3+ch;rgb[o]=(from[o]*4+from[o-3]*2+from[o+3]*2+from[o-N*3]*2+from[o+N*3]*2+from[o-N*3-3]+from[o-N*3+3]+from[o+N*3-3]+from[o+N*3+3])/16;}}}}
  out={seed,size:N,extent:EXTENT,res:GROUND_RES,rgb,land,hex:null};
  if(GROUND.size>=3)GROUND.delete(GROUND.keys().next().value);GROUND.set(key,out);return out;
}
/** '#rrggbb' of the ground texel under (x,z) from groundColors(), memoized for Canvas2D fills. */
export function groundHex(colors, x, z){
  const i=Math.floor((x+colors.extent)*colors.res),j=Math.floor((z+colors.extent)*colors.res),size=colors.size;if(i<0||j<0||i>=size||j>=size)return null;
  const q=j*size+i;if(!colors.hex)colors.hex=new Array(size*size);let h=colors.hex[q];
  if(h===undefined){const n=(colors.rgb[q*3]<<16)|(colors.rgb[q*3+1]<<8)|colors.rgb[q*3+2];h=colors.hex[q]='#'+n.toString(16).padStart(6,'0');}
  return h;
}

// ------------------------------------------------------------------ nodes
const CATEGORY={tree:'tree',rock:'stone',ore:'stone',shardrock:'stone',grave:'stone',bones:'stone',grass:'plant',bush:'plant',pumpkin:'plant',mushroom:'plant',glowcap:'plant'};
const categoryOf=type=>NODES[type]?.night?'night':CATEGORY[type]||(NODES[type]?.radius>.3?'stone':'plant');
/** Night-only finds grow beside their host: glowsprouts under trees, wisps among graves. */
const NIGHT_HOSTS={glowsprout:'tree', gravewisp:'grave'}, NIGHT_MIN={glowsprout:50, gravewisp:26};
const PATCH_MIX=[
  {plant:.7, stone:.3, tree:0},      // heath
  {plant:.82, tree:.1, stone:.08},   // meadow
  {stone:.8, plant:.14, tree:.06},   // rocky
  {tree:.84, plant:.16, stone:0},    // forest
];
const PATCH_ODDS=[.012, .075, .2, 0];
const poolCache=new WeakMap();
function poolsFor(region){
  const pool=NODE_POOLS[region]||NODE_POOLS.meadow;let split=poolCache.get(pool);
  if(!split){split={tree:[],stone:[],plant:[],night:[]};for(const type of pool)if(NODES[type])split[categoryOf(type)].push(type);poolCache.set(pool,split);}
  return split;
}
function pickType(rng,region,patch){
  const split=poolsFor(region),mix=PATCH_MIX[patch];let roll=rng(),cat='plant';
  for(const key of ['tree','stone','plant']){roll-=mix[key];if(roll<0){cat=key;break;}}
  const order=cat==='tree'?['tree','stone','plant']:cat==='stone'?['stone','plant','tree']:['plant','stone','tree'];
  for(const key of order)if(split[key].length)return split[key][Math.floor(rng()*split[key].length)];
  return null;
}

/** Every node and cache at the start of a world. Ids are `n<index>`. */
export function generateNodes(seed){
  const shape=shapeFor(seed),{grid,detail,blocked}=shape,rng=rngFor(seed),nodes=[],B=4,BN=Math.ceil(EXTENT*2/B)+1,buckets=new Array(BN*BN);
  // Nothing grows on Frostmere's ice, and the throne's floor is kept open for the fight.
  const lair=shape.areas.find(a=>a.id==='briarlair'),arena=(x,z)=>!!lair&&(x-lair.x)*(x-lair.x)+(z-lair.z)*(z-lair.z)<(lair.r-2.5)*(lair.r-2.5);
  const clear=(x,z)=>{const k=cellOf(x,z);return k<0||grid[k]!==G||(detail[k]&DETAIL.ice)||arena(x,z)?0:blocked[k]*DIST_UNIT;};
  const zone=(x,z)=>{for(const a of shape.areas)if(inArea(a,x,z))return a.id;return regionAt(x,z);};
  const onTrail=(x,z)=>{const k=cellOf(x,z);return k>=0&&(detail[k]&DETAIL.trail)!==0;};
  const bucketOf=(x,z)=>Math.floor((z+EXTENT)/B)*BN+Math.floor((x+EXTENT)/B);
  const add=(type,x,z)=>{const node={id:`n${nodes.length}`,type,x,z,hits:NODES[type].hits,ready:0};nodes.push(node);const b=bucketOf(x,z);(buckets[b]||(buckets[b]=[])).push(node);return node;};
  const solid=type=>NODES[type].radius>.3,caches=new Set(CACHE_LAYOUT.map(c=>c.type));
  const gapTo=(type,other)=>caches.has(other.type)||caches.has(type)?3:solid(type)&&solid(other.type)?2.3:NODES[type].night||NODES[other.type].night?.9:1.2;
  const free=(type,x,z)=>{const bi=Math.floor((x+EXTENT)/B),bj=Math.floor((z+EXTENT)/B);for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const list=buckets[(bj+dj)*BN+bi+di];if(!list)continue;for(const n of list){const g=gapTo(type,n);if((n.x-x)**2+(n.z-z)**2<g*g)return false;}}return true;};
  // The first clearing guarantees every basic material within a short walk.
  // Scaled out so the plaza around the Heartfire stays open.
  for(const [t,x,z] of [['tree',-4,-3],['tree',-7,1],['rock',4,-3],['grass',-2,3],['grass',3,3],['bush',5,2],['pumpkin',-4,5],['rock',7,-1],['tree',-6,-6],['grass',1,5],['mushroom',-7,5]])add(t,x*1.6,z*1.6);
  add('crate',9,6);
  // Caches in the interesting places; the best tiers first so they get the far spots.
  const spots=shape.spots,used=new Set(),placedCaches=[];
  const PREFER={reliquary:['stones','clearing','shore','fence'],moonchest:['clearing','shore','stones','fence'],ironchest:['fence','shore','clearing','stones','heath'],crate:['heath','fence','shore','clearing','stones']};
  for(const {type,count,min,max} of [...CACHE_LAYOUT].reverse()){
    const gap=type==='crate'?9:16,prefer=PREFER[type]||['clearing','shore','fence','stones','heath'];
    const fits=(x,z)=>{const r=Math.sqrt(x*x+z*z);return r>=min&&r<=max&&clear(x,z)>0&&placedCaches.every(c=>(c.x-x)**2+(c.z-z)**2>=gap*gap)&&free(type,x,z);};
    let placed=0,kindAt=Math.floor(rng()*prefer.length);
    for(let round=0;placed<count&&round<prefer.length*3;round++){
      const kind=prefer[(kindAt+round)%prefer.length],options=spots.filter(s=>s.kind===kind&&!used.has(s)&&fits(s.x,s.z));if(!options.length)continue;
      // Aim for a distance spread evenly across the tier's band (not its area), so every tier keeps its own ring.
      const want=min+rng()*(Math.min(max,RULES.radius)-min);let spot=options[0],off=Infinity;for(const o of options){const d=Math.abs(Math.sqrt(o.x*o.x+o.z*o.z)-want);if(d<off){off=d;spot=o;}}used.add(spot);
      if(kind==='stones'){const stone=pickType(rng,zone(spot.x,spot.z),PATCH.rocky),ring=6+Math.floor(rng()*3),turn=rng();for(let s=0;s<ring;s++){const [dx,dz]=pseudoDir((s+turn)/ring*4),x=spot.x+dx*3.6,z=spot.z+dz*3.6;if(stone&&solid(stone)&&clear(x,z)>=1.2)add(stone,x,z);}}
      placedCaches.push(add(type,spot.x,spot.z));placed++;
    }
    for(let i=0;i<count*400&&placed<count;i++){
      const r=min+rng()*(max-min),[dx,dz]=randomDir(rng),x=dx*r,z=dz*r;
      if(clear(x,z)<2.5||onTrail(x,z)||!fits(x,z))continue;placedCaches.push(add(type,x,z));placed++;
    }
  }
  // Old burial plots in the graveyard: rows of graves with wisps drifting between them at night.
  {const want=5+Math.floor(rng()*3),plots=[];
    for(let tries=0;plots.length<want&&tries<400;tries++){
      const r=Math.sqrt(INNER_RING*INNER_RING+rng()*(OUTER_RING*OUTER_RING-INNER_RING*INNER_RING)),[dx,dz]=randomDir(rng),x=dx*r,z=dz*r;
      if(regionAt(x,z)!=='graveyard'||clear(x,z)<5||onTrail(x,z)||plots.some(p=>(p[0]-x)**2+(p[1]-z)**2<20*20))continue;
      plots.push([x,z]);
      const [ux,uz]=randomDir(rng),vx=-uz,vz=ux,rows=2+Math.floor(rng()*2),cols=2+Math.floor(rng()*2);
      for(let a=0;a<rows;a++)for(let b=0;b<cols;b++){if(rng()<.15)continue;
        const ox=(a-(rows-1)/2)*2.5+(rng()-.5)*.4,oz=(b-(cols-1)/2)*2.5+(rng()-.5)*.4,gx=x+ux*oz+vx*ox,gz=z+uz*oz+vz*ox;
        if(clear(gx,gz)>=1.5&&!onTrail(gx,gz)&&free('grave',gx,gz))add('grave',gx,gz);}
      for(let w=2+Math.floor(rng()*3),tries2=0;w>0&&tries2<20;tries2++){const [ex,ez]=randomDir(rng),l=rng()*3.4,gx=x+ex*l,gz=z+ez*l;if(clear(gx,gz)>=.8&&!onTrail(gx,gz)&&free('gravewisp',gx,gz)){add('gravewisp',gx,gz);w--;}}
    }}
  // Everything that grows, by patch: thick forest, open meadow, rocky field, empty heath.
  const S=1.6,M=Math.floor(EXTENT*2/S),hosts=[];
  for(let gj=0;gj<M;gj++)for(let gi=0;gi<M;gi++){
    const x=-EXTENT+(gi+rng())*S,z=-EXTENT+(gj+rng())*S,roll=rng(),r2=x*x+z*z;
    if(r2<8.5*8.5)continue;const k=cellOf(x,z);if(k<0||grid[k]!==G||(detail[k]&DETAIL.ice))continue;
    const d=bilerp(shape.density,x,z),patch=patchOf(d,bilerp(shape.rock,x,z));
    const odds=patch===PATCH.forest?.12+.36*smooth(.62,1,d):PATCH_ODDS[patch];if(roll>=odds)continue;
    const region=zone(x,z),type=pickType(rng,region,patch);if(!type)continue;
    if(clear(x,z)<(solid(type)?1.5:.8)||(detail[k]&DETAIL.trail)||!free(type,x,z))continue;
    const node=add(type,x,z);if(patch===PATCH.forest||type==='grave')hosts.push([node,region]);
  }
  // The areas' own finds: Frostmere's crystals stand round the ice, the Ashen Scar's vents across its bare ground.
  for(const [id,type,want] of [['frostmere','rimecrystal',14],['ashscar','embervent',14]]){
    const a=shape.areas.find(entry=>entry.id===id);if(!a)continue;
    let have=0;for(const n of nodes)if(n.type===type)have++;
    for(let t=0;t<want*40&&have<want;t++){const [dx,dz]=randomDir(rng),r=Math.sqrt(rng())*a.r,x=a.x+dx*r,z=a.z+dz*r;if(!inArea(a,x,z,-1)||clear(x,z)<1.5||onTrail(x,z)||!free(type,x,z))continue;add(type,x,z);have++;}
  }
  // Night-only finds beside their hosts, where the region grows them.
  for(const [host,region] of hosts){
    const night=poolsFor(region).night.find(t=>NIGHT_HOSTS[t]===host.type);if(!night)continue;if(!night||rng()>(host.type==='tree'?.2:.45))continue;
    const [dx,dz]=randomDir(rng),l=1+rng()*.5,x=host.x+dx*l,z=host.z+dz*l;
    if(clear(x,z)<.7||onTrail(x,z)||!free(night,x,z))continue;add(night,x,z);
  }
  // Every hollow keeps a fair night harvest: top up beside any host in a region that grows it.
  for(const night of Object.keys(NIGHT_HOSTS)){
    let have=0;for(const n of nodes)if(n.type===night)have++;if(have>=NIGHT_MIN[night])continue;
    const hostsOf=shuffle(nodes.filter(n=>n.type===NIGHT_HOSTS[night]&&poolsFor(zone(n.x,n.z)).night.includes(night)),rng);
    for(let pass=0;pass<2&&have<NIGHT_MIN[night];pass++)for(const host of hostsOf){if(have>=NIGHT_MIN[night])break;
      const [dx,dz]=randomDir(rng),l=1+rng()*.6,x=host.x+dx*l,z=host.z+dz*l;if(clear(x,z)<.7||onTrail(x,z)||!free(night,x,z))continue;add(night,x,z);have++;}
  }
  // Landmarks, from their own stream so the rest of the hollow keeps its ids: the Briar Throne at the heart
  // of its lair (Mother Briar sleeps on it, briar.mjs) and the Sunken Stair down into a delve (delve.mjs),
  // somewhere out in the outer ring.
  {const lrng=rngFor((seed>>>0)^0x1a4d);
    if(lair)add('briarthrone',lair.x-lair.gx*2.4,lair.z-lair.gz*2.4);
    let stair=null;
    for(let pass=0;pass<3&&!stair;pass++)for(let t=0;t<400&&!stair;t++){
      const r=96+lrng()*(pass<2?26:32),[dx,dz]=randomDir(lrng),x=dx*r,z=dz*r,region=regionAt(x,z);
      if(pass<2&&!['mire','crags','barrow'].includes(region))continue;
      if(shape.areas.some(a=>inArea(a,x,z,6))||clear(x,z)<(pass?2.4:3.2)||onTrail(x,z)||!free('delve',x,z))continue;
      stair={x,z};
    }
    if(stair)add('delve',stair.x,stair.z);}
  return reachableOnly(shape,nodes);
}

/**
 * Drop any solid node that walls land off from the Heartfire and any node no wanderer can reach
 * to harvest, then renumber so ids stay `n<index>`.
 */
function reachableOnly(shape,nodes){
  const {grid}=shape,S=scratch(),open=S.seen,seen=S.mark,queue=S.queue;
  seen.fill(0);let list=nodes;
  const stamp=(n,value)=>{const rad=(NODES[n.type].radius||0)+CLEARANCE,i0=Math.floor((n.x-rad+EXTENT)*INV),i1=Math.floor((n.x+rad+EXTENT)*INV),j0=Math.floor((n.z-rad+EXTENT)*INV),j1=Math.floor((n.z+rad+EXTENT)*INV);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=-EXTENT+(i+.5)*CELL-n.x,z=-EXTENT+(j+.5)*CELL-n.z;if(x*x+z*z<rad*rad)open[j*N+i]=value;}};
  const solid=n=>NODES[n.type].radius>.3,R=Math.ceil(HARVEST_REACH*INV),reach2=HARVEST_REACH*HARVEST_REACH,caches=new Set(CACHE_LAYOUT.map(c=>c.type));
  for(let pass=1;pass<=3;pass++){
    // open[k]: 0 where a walker may stand; seen[k]===pass once reached from beside the Heartfire.
    for(let k=0;k<N*N;k++)open[k]=grid[k]===G?0:1;
    for(const n of list)if(solid(n))stamp(n,1);
    stamp({type:'crate',x:0,z:0},1);open[cellOf(0,0)]=1;
    let head=0,tail=0;for(const [x,z] of [[0,2],[2,0],[0,-2],[-2,0]]){const k=cellOf(x,z);if(!open[k]&&seen[k]!==pass){seen[k]=pass;queue[tail++]=k;}}
    while(head<tail){const k=queue[head++];
      let n=k-1;if(!open[n]&&seen[n]!==pass){seen[n]=pass;queue[tail++]=n;}
      n=k+1;if(!open[n]&&seen[n]!==pass){seen[n]=pass;queue[tail++]=n;}
      n=k-N;if(!open[n]&&seen[n]!==pass){seen[n]=pass;queue[tail++]=n;}
      n=k+N;if(!open[n]&&seen[n]!==pass){seen[n]=pass;queue[tail++]=n;}}
    // A solid node beside open ground nobody reaches walls a pocket off: it goes.
    let walls=0;const keep=[];
    for(const n of list){
      const ci=Math.floor((n.x+EXTENT)*INV),cj=Math.floor((n.z+EXTENT)*INV);
      if(solid(n)&&!caches.has(n.type)){const W2=Math.ceil((NODES[n.type].radius+CLEARANCE+.6)*INV);let pocket=false;
        for(let dj=-W2;dj<=W2&&!pocket;dj++)for(let di=-W2;di<=W2;di++){const k=(cj+dj)*N+ci+di;if(grid[k]===G&&!open[k]&&seen[k]!==pass){pocket=true;break;}}
        if(pocket){walls++;continue;}}
      let reached=false;for(let dj=-R;dj<=R&&!reached;dj++)for(let di=-R;di<=R;di++){if((di*di+dj*dj)*CELL*CELL>reach2)continue;if(seen[(cj+dj)*N+ci+di]===pass){reached=true;break;}}
      if(reached)keep.push(n);
    }
    const done=keep.length===list.length&&!walls;list=keep;if(done)break;
  }
  list.forEach((n,i)=>{n.id=`n${i}`;});
  return list;
}
