import * as THREE from '../../../hushlight/vendor/three.module.min.js';

// A single reusable buffer replaces per-frame Sprite/Texture/Material churn.
// Vertex alpha keeps mint ribbons translucent. No DOM overlay or full-screen bloom.
export class MagicMesh {
  constructor(scene){
    this.capacity=49152;this.count=0;
    this.positions=new Float32Array(this.capacity*3);this.colors=new Float32Array(this.capacity*4);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=4;
    scene.add(this.mesh);this.colorCache=new Map();
  }
  vertex(p,color,alpha){
    if(this.count>=this.capacity)return;
    let rgb=this.colorCache.get(color);
    if(!rgb){const c=new THREE.Color(color);rgb=[c.r,c.g,c.b];this.colorCache.set(color,rgb);}
    const i=this.count++;
    this.positions.set(p,i*3);this.colors.set([...rgb,alpha],i*4);
  }
  triangle(a,b,c,cmd){if(this.count+3>this.capacity)return;for(const p of [a,b,c])this.vertex(p,cmd.color,cmd.alpha);}
  update(commands){
    this.count=0;
    // Camera looks along (0,-28,-27). These billboard bases match its up vector.
    const up=[0,.694,-.72];
    for(const cmd of commands){
      if(cmd.kind==='orb'){
        const [x,y,z]=cmd.center,segments=12;
        const at=a=>{const s=Math.sin(a)*cmd.radius,c=Math.cos(a)*cmd.radius;return [x+c,y+(cmd.ground?0:s*up[1]),z+(cmd.ground?s:s*up[2])];};
        for(let i=0;i<segments;i++)this.triangle(cmd.center,at(i/segments*Math.PI*2),at((i+1)/segments*Math.PI*2),cmd);
      }else if(cmd.fill){
        // All filled shapes emitted here are convex OR paired arc ribbons. The
        // ribbons are handled as strips so their concave inner edge stays hollow.
        const pts=cmd.points;
        if(cmd.fill==='ribbon'){const last=pts.length-1;for(let i=0;i<pts.length/2-1;i++){this.triangle(pts[i],pts[i+1],pts[last-i],cmd);this.triangle(pts[i+1],pts[last-i-1],pts[last-i],cmd);}}
        else for(let i=1;i<pts.length-1;i++)this.triangle(pts[0],pts[i],pts[i+1],cmd);
      }else{
        for(let i=1;i<cmd.points.length;i++){
          const a=cmd.points[i-1],b=cmd.points[i],dx=b[0]-a[0],dy=(b[1]-a[1])*.694-(b[2]-a[2])*.72;
          const span=Math.hypot(dx,dy)||1,nx=-dy/span*cmd.width*.5,ny=dx/span*cmd.width*.5;
          const offset=(p,side)=>[p[0]+nx*side,p[1]+ny*up[1]*side,p[2]+ny*up[2]*side];
          const a0=offset(a,-1),a1=offset(a,1),b0=offset(b,-1),b1=offset(b,1);
          this.triangle(a0,b0,a1,cmd);this.triangle(a1,b0,b1,cmd);
        }
      }
    }
    this.geometry.setDrawRange(0,this.count);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;
    this.mesh.visible=this.count>0;
  }
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
