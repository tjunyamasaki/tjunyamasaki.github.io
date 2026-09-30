import * as THREE from '../../../hushlight/vendor/three.module.min.js';

// Preserve the original angles (including the closing vertex) at double precision.
// Every orb reuses one of these three rings instead of evaluating trig per triangle.
const CIRCLES=new Map([12,14,20].map(segments=>{
  const ring=new Float64Array((segments+1)*2);
  for(let i=0;i<=segments;i++){const angle=i/segments*Math.PI*2;ring[i*2]=Math.cos(angle);ring[i*2+1]=Math.sin(angle);}
  return [segments,ring];
}));

// A single reusable buffer replaces per-frame Sprite/Texture/Material churn.
// Vertex alpha keeps mint ribbons translucent. No DOM overlay or full-screen bloom.
// `additive` meshes add light instead of covering (flashes, glows, beams: src/fx).
// Commands flagged `soft` fade to nothing at their edges: an orb becomes a radial glow and a
// stroke becomes a feathered beam.
export class MagicMesh {
  constructor(scene, {additive=false, capacity=49152, order=4}={}){
    this.capacity=capacity;this.count=0;
    this.positions=new Float32Array(this.capacity*3);this.colors=new Float32Array(this.capacity*4);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
      blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
    // Transparent objects sort by their bounding-sphere centre. Pin it to the mesh's origin: the
    // vertices change every frame, and a mesh placed at a body must sort at that body.
    this.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),1e4);
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=order;
    scene.add(this.mesh);this.colorCache=new Map();this.ox=0;this.oy=0;this.oz=0;
  }
  rgb(color){
    let rgb=this.colorCache.get(color);
    if(!rgb){const c=new THREE.Color(color);rgb=[c.r,c.g,c.b];this.colorCache.set(color,rgb);if(this.colorCache.size>512)this.colorCache.clear();}
    return rgb;
  }
  vertex(p,rgb,alpha){
    this.vertexXYZ(p[0],p[1],p[2],rgb,alpha);
  }
  vertexXYZ(x,y,z,rgb,alpha){
    if(this.count>=this.capacity)return;
    const i=this.count++,j=i*3,k=i*4;
    this.positions[j]=x-this.ox;this.positions[j+1]=y-this.oy;this.positions[j+2]=z-this.oz;
    this.colors[k]=rgb[0];this.colors[k+1]=rgb[1];this.colors[k+2]=rgb[2];this.colors[k+3]=alpha;
  }
  triangle(a,b,c,cmd){if(this.count+3>this.capacity)return;const rgb=this.rgb(cmd.color);this.vertex(a,rgb,cmd.alpha);this.vertex(b,rgb,cmd.alpha);this.vertex(c,rgb,cmd.alpha);}
  /** A triangle whose corners carry their own alpha (feathered edges). */
  shaded(a,aa,b,ba,c,ca,rgb){if(this.count+3>this.capacity)return;this.vertex(a,rgb,aa);this.vertex(b,rgb,ba);this.vertex(c,rgb,ca);}
  shadedXYZ(ax,ay,az,aa,bx,by,bz,ba,cx,cy,cz,ca,rgb){
    if(this.count+3>this.capacity)return;
    this.vertexXYZ(ax,ay,az,rgb,aa);this.vertexXYZ(bx,by,bz,rgb,ba);this.vertexXYZ(cx,cy,cz,rgb,ca);
  }
  /**
   * Rebuild from world-space commands. `origin` moves the mesh there (vertices are kept relative to
   * it), so a mesh that belongs to one body sorts against sprites by that body's depth.
   */
  update(commands, origin=null){
    this.count=0;
    this.ox=origin?.x||0;this.oy=origin?.y||0;this.oz=origin?.z||0;this.mesh.position.set(this.ox,this.oy,this.oz);
    // Camera looks along (0,-28,-27). These billboard bases match its up vector.
    const upY=.694,upZ=-.72;
    for(const cmd of commands){
      if(this.count>=this.capacity-6)break;
      const rgb=this.rgb(cmd.color),alpha=cmd.alpha;
      if(cmd.kind==='orb'){
        const [x,y,z]=cmd.center,segments=cmd.radius>1.2?20:cmd.soft?14:12;
        const ring=CIRCLES.get(segments),radius=cmd.radius,ground=cmd.ground,edgeAlpha=cmd.soft?0:alpha;
        let s=ring[1]*radius,c=ring[0]*radius,ax=x+c,ay=y+(ground?0:s*upY),az=z+(ground?s:s*upZ);
        for(let i=0;i<segments&&this.count+3<=this.capacity;i++){
          const next=(i+1)*2;s=ring[next+1]*radius;c=ring[next]*radius;
          const bx=x+c,by=y+(ground?0:s*upY),bz=z+(ground?s:s*upZ);
          this.shadedXYZ(x,y,z,alpha,ax,ay,az,edgeAlpha,bx,by,bz,edgeAlpha,rgb);
          ax=bx;ay=by;az=bz;
        }
      }else if(cmd.fill){
        // All filled shapes emitted here are convex OR paired arc ribbons. The
        // ribbons are handled as strips so their concave inner edge stays hollow.
        const pts=cmd.points;
        if(cmd.fill==='ribbon'){const last=pts.length-1;for(let i=0;i<pts.length/2-1&&this.count+3<=this.capacity;i++){this.shaded(pts[i],alpha,pts[i+1],alpha,pts[last-i],alpha,rgb);this.shaded(pts[i+1],alpha,pts[last-i-1],alpha,pts[last-i],alpha,rgb);}}
        else for(let i=1;i<pts.length-1&&this.count+3<=this.capacity;i++)this.shaded(pts[0],alpha,pts[i],alpha,pts[i+1],alpha,rgb);
      }else{
        const soft=!!cmd.soft,taper=cmd.taper||0,n=cmd.points.length;
        for(let i=1;i<n&&this.count+3<=this.capacity;i++){
          const a=cmd.points[i-1],b=cmd.points[i],dx=b[0]-a[0],dy=(b[1]-a[1])*.694-(b[2]-a[2])*.72;
          const span=Math.hypot(dx,dy)||1;
          // `taper` narrows a stroke toward its end: comet tails and blade trails.
          const wa=cmd.width*.5*(taper?1-taper*(i-1)/(n-1):1),wb=cmd.width*.5*(taper?1-taper*i/(n-1):1);
          const nx=-dy/span,ny=dx/span;
          const a0x=a[0]+nx*-wa,a0y=a[1]+ny*-wa*upY,a0z=a[2]+ny*-wa*upZ;
          const a1x=a[0]+nx*wa,a1y=a[1]+ny*wa*upY,a1z=a[2]+ny*wa*upZ;
          const b0x=b[0]+nx*-wb,b0y=b[1]+ny*-wb*upY,b0z=b[2]+ny*-wb*upZ;
          const b1x=b[0]+nx*wb,b1y=b[1]+ny*wb*upY,b1z=b[2]+ny*wb*upZ;
          if(soft){
            this.shadedXYZ(a0x,a0y,a0z,0,b0x,b0y,b0z,0,a[0],a[1],a[2],alpha,rgb);
            this.shadedXYZ(a[0],a[1],a[2],alpha,b0x,b0y,b0z,0,b[0],b[1],b[2],alpha,rgb);
            this.shadedXYZ(a[0],a[1],a[2],alpha,b[0],b[1],b[2],alpha,a1x,a1y,a1z,0,rgb);
            this.shadedXYZ(a1x,a1y,a1z,0,b[0],b[1],b[2],alpha,b1x,b1y,b1z,0,rgb);
          }else{
            this.shadedXYZ(a0x,a0y,a0z,alpha,b0x,b0y,b0z,alpha,a1x,a1y,a1z,alpha,rgb);
            this.shadedXYZ(a1x,a1y,a1z,alpha,b0x,b0y,b0z,alpha,b1x,b1y,b1z,alpha,rgb);
          }
        }
      }
    }
    this.geometry.setDrawRange(0,this.count);
    const position=this.geometry.attributes.position,color=this.geometry.attributes.color;
    position.clearUpdateRanges();color.clearUpdateRanges();
    if(this.count>0){
      position.addUpdateRange(0,this.count*3);color.addUpdateRange(0,this.count*4);
      position.needsUpdate=true;color.needsUpdate=true;
    }
    this.mesh.visible=this.count>0;
  }
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
