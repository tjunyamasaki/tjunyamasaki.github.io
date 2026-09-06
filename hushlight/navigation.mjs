import { obstaclesFor } from './state.mjs';

// Return a unit direction toward a tap, with a small detour around solid bases.
export function directionToTarget(player, target, mode = 'journey') {
  const px=player.x,pz=player.z,tx=target.x-px,tz=target.z-pz,len=Math.hypot(tx,tz);
  if(len<.12)return {x:0,z:0,arrived:true};
  let destination=target;
  const ux=tx/len,uz=tz/len;
  for(const obstacle of obstaclesFor(mode)){
    const ox=obstacle.x-px,oz=obstacle.z-pz,projection=ox*ux+oz*uz;
    const clearance=obstacle.radius+.42;
    if(projection>.02&&projection<len-.15&&Math.abs(ox*uz-oz*ux)<clearance){
      const side=(ux*oz-uz*ox)>0?-1:1;
      destination={x:obstacle.x-uz*clearance*side,z:obstacle.z+ux*clearance*side};break;
    }
  }
  const x=destination.x-px,z=destination.z-pz,distance=Math.hypot(x,z);
  return {x:distance?x/distance:0,z:distance?z/distance:0,arrived:false};
}
