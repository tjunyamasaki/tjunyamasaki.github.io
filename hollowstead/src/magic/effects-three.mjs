import * as THREE from '../../../hushlight/vendor/three.module.min.js';

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
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=order;
    scene.add(this.mesh);this.colorCache=new Map();
  }
  rgb(color){
    let rgb=this.colorCache.get(color);
    if(!rgb){const c=new THREE.Color(color);rgb=[c.r,c.g,c.b];this.colorCache.set(color,rgb);if(this.colorCache.size>512)this.colorCache.clear();}
    return rgb;
  }
  vertex(p,rgb,alpha){
    if(this.count>=this.capacity)return;
    const i=this.count++,j=i*3,k=i*4;
    this.positions[j]=p[0];this.positions[j+1]=p[1];this.positions[j+2]=p[2];
    this.colors[k]=rgb[0];this.colors[k+1]=rgb[1];this.colors[k+2]=rgb[2];this.colors[k+3]=alpha;
  }
  triangle(a,b,c,cmd){if(this.count+3>this.capacity)return;const rgb=this.rgb(cmd.color);this.vertex(a,rgb,cmd.alpha);this.vertex(b,rgb,cmd.alpha);this.vertex(c,rgb,cmd.alpha);}
  /** A triangle whose corners carry their own alpha (feathered edges). */
  shaded(a,aa,b,ba,c,ca,rgb){if(this.count+3>this.capacity)return;this.vertex(a,rgb,aa);this.vertex(b,rgb,ba);this.vertex(c,rgb,ca);}
  update(commands){
    this.count=0;
    // Camera looks along (0,-28,-27). These billboard bases match its up vector.
    const up=[0,.694,-.72];
    for(const cmd of commands){
      if(this.count>=this.capacity-6)break;
      if(cmd.kind==='orb'){
        const [x,y,z]=cmd.center,segments=cmd.radius>1.2?20:cmd.soft?14:12;
        const at=a=>{const s=Math.sin(a)*cmd.radius,c=Math.cos(a)*cmd.radius;return [x+c,y+(cmd.ground?0:s*up[1]),z+(cmd.ground?s:s*up[2])];};
        if(cmd.soft){
          const rgb=this.rgb(cmd.color);
          for(let i=0;i<segments;i++)this.shaded(cmd.center,cmd.alpha,at(i/segments*Math.PI*2),0,at((i+1)/segments*Math.PI*2),0,rgb);
        }else for(let i=0;i<segments;i++)this.triangle(cmd.center,at(i/segments*Math.PI*2),at((i+1)/segments*Math.PI*2),cmd);
      }else if(cmd.fill){
        // All filled shapes emitted here are convex OR paired arc ribbons. The
        // ribbons are handled as strips so their concave inner edge stays hollow.
        const pts=cmd.points;
        if(cmd.fill==='ribbon'){const last=pts.length-1;for(let i=0;i<pts.length/2-1;i++){this.triangle(pts[i],pts[i+1],pts[last-i],cmd);this.triangle(pts[i+1],pts[last-i-1],pts[last-i],cmd);}}
        else for(let i=1;i<pts.length-1;i++)this.triangle(pts[0],pts[i],pts[i+1],cmd);
      }else{
        const rgb=this.rgb(cmd.color),soft=!!cmd.soft,taper=cmd.taper||0,n=cmd.points.length;
        for(let i=1;i<n;i++){
          const a=cmd.points[i-1],b=cmd.points[i],dx=b[0]-a[0],dy=(b[1]-a[1])*.694-(b[2]-a[2])*.72;
          const span=Math.hypot(dx,dy)||1;
          // `taper` narrows a stroke toward its end: comet tails and blade trails.
          const wa=cmd.width*.5*(taper?1-taper*(i-1)/(n-1):1),wb=cmd.width*.5*(taper?1-taper*i/(n-1):1);
          const nx=-dy/span,ny=dx/span;
          const off=(p,w)=>[p[0]+nx*w,p[1]+ny*w*up[1],p[2]+ny*w*up[2]];
          const a0=off(a,-wa),a1=off(a,wa),b0=off(b,-wb),b1=off(b,wb);
          if(soft){
            this.shaded(a0,0,b0,0,a,cmd.alpha,rgb);this.shaded(a,cmd.alpha,b0,0,b,cmd.alpha,rgb);
            this.shaded(a,cmd.alpha,b,cmd.alpha,a1,0,rgb);this.shaded(a1,0,b,cmd.alpha,b1,0,rgb);
          }else{this.shaded(a0,cmd.alpha,b0,cmd.alpha,a1,cmd.alpha,rgb);this.shaded(a1,cmd.alpha,b0,cmd.alpha,b1,cmd.alpha,rgb);}
        }
      }
    }
    this.geometry.setDrawRange(0,this.count);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;
    this.mesh.visible=this.count>0;
  }
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
