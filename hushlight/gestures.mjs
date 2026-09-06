export const clampZoom = zoom => Math.min(2.6, Math.max(1, Number.isFinite(zoom) ? zoom : 1));

// A hold button has no click action. In particular, a trailing click cannot replay.
export function bindHoldButton(button, { canHold, onStart, onStop }) {
  let pointer = null;
  button.addEventListener('pointerdown', event => {
    if(event.button!==0 || pointer!==null || !canHold())return;
    event.preventDefault();pointer=event.pointerId;onStart();button.setPointerCapture(pointer);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>{
    if(event.pointerId!==pointer)return;pointer=null;onStop();
  });
}

// A tap moves only on release. Once two fingers touch, neither may become a tap.
export function createGroundGesture({ onTap, onZoom, onGesture, getZoom }) {
  const pointers = new Map();
  let multi = false, initialDistance = 0, initialZoom = 1;
  const distance = () => { const [a,b] = [...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
  function down(id,x,y) {
    pointers.set(id,{x,y,startX:x,startY:y});
    if(pointers.size>=2){multi=true;onGesture();initialDistance=distance();initialZoom=getZoom();}
  }
  function move(id,x,y) {
    const p=pointers.get(id);if(!p)return;
    p.x=x;p.y=y;
    if(pointers.size>=2&&initialDistance>0)onZoom(clampZoom(initialZoom*distance()/initialDistance));
  }
  function up(id,x,y,cancel=false) {
    const p=pointers.get(id);if(!p)return;
    if(!cancel&&!multi&&pointers.size===1&&Math.hypot(x-p.startX,y-p.startY)<12)onTap(x,y);
    pointers.delete(id);if(pointers.size===0)multi=false;
  }
  function clear(){pointers.clear();multi=false;}
  return {down,move,up,clear};
}
