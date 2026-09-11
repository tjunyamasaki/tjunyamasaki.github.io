// A bounded indexed-color drawing: 4 KiB, shared once over reliable control.
export const SKIN_SIZE = 64;
export const INK = ['transparent','#ffffff','#152338','#ff759b','#ffd16f','#7cf0bb','#6fbaff','#bc98ff'];
export const blankSkin = () => '0'.repeat(SKIN_SIZE * SKIN_SIZE);
export const validSkin = value => typeof value === 'string' && /^[0-7]{4096}$/.test(value);
export function paintLine(pixels,from,to,color,size){
  const distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance*2));
  for(let i=0;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,y=from.y+(to.y-from.y)*i/steps;
    for(let yy=Math.floor(y-size);yy<=Math.ceil(y+size);yy++)for(let xx=Math.floor(x-size);xx<=Math.ceil(x+size);xx++){
      if(xx>=0&&yy>=0&&xx<SKIN_SIZE&&yy<SKIN_SIZE&&Math.hypot(xx-x,yy-y)<=size) pixels[yy*SKIN_SIZE+xx]=String(color);
    }
  }
}
export function skinCanvas(skin){
  if(!validSkin(skin))return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SKIN_SIZE;const ctx=canvas.getContext('2d');
  for(let i=0;i<skin.length;i++){const color=Number(skin[i]);if(color){ctx.fillStyle=INK[color];ctx.fillRect(i%SKIN_SIZE,Math.floor(i/SKIN_SIZE),1,1);}}
  return canvas;
}
export function createPainter(onSave){
  const $=id=>document.getElementById(id),dialog=$('paint-dialog'),canvas=$('paint-canvas'),ctx=canvas.getContext('2d');
  let saved=blankSkin(),pixels=saved.split(''),history=[],pointer=null,last=null,color=1;
  try{const stored=localStorage.getItem('bloom-skin');if(validSkin(stored))saved=stored;}catch{}
  function render(){ctx.clearRect(0,0,256,256);ctx.imageSmoothingEnabled=true;ctx.drawImage(skinCanvas(pixels.join('')),0,0,256,256);$('paint-undo').disabled=!history.length;}
  function remember(){history.push(pixels.join(''));if(history.length>24)history.shift();}
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*64,y:(e.clientY-r.top)/r.height*64};};
  canvas.onpointerdown=e=>{if(pointer!==null)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);remember();last=point(e);paintLine(pixels,last,last,color,Number($('brush-size').value));render();};
  canvas.onpointermove=e=>{if(e.pointerId!==pointer)return;const next=point(e);paintLine(pixels,last,next,color,Number($('brush-size').value));last=next;render();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===pointer)pointer=null;});
  for(let i=1;i<INK.length;i++){const b=document.createElement('button');b.type='button';b.style.background=INK[i];b.setAttribute('aria-label',['','White','Navy','Pink','Yellow','Mint','Blue','Purple'][i]);b.setAttribute('aria-pressed',String(i===color));b.onclick=()=>{color=i;for(const c of $('paint-colors').children)c.setAttribute('aria-pressed',String(c===b));$('paint-eraser').setAttribute('aria-pressed','false');};$('paint-colors').append(b);}
  $('paint-eraser').onclick=()=>{color=0;$('paint-eraser').setAttribute('aria-pressed','true');for(const c of $('paint-colors').children)c.setAttribute('aria-pressed','false');};
  $('paint-undo').onclick=()=>{if(history.length){pixels=history.pop().split('');render();}};
  $('paint-clear').onclick=()=>{remember();pixels=blankSkin().split('');render();};
  $('paint-save').onclick=()=>{saved=pixels.join('');try{localStorage.setItem('bloom-skin',saved);}catch{}onSave(saved);dialog.close();};
  $('paint-cancel').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>pointer=null);
  return {get value(){return saved;},open(){pixels=saved.split('');history=[];pointer=null;render();dialog.showModal();}};
}
