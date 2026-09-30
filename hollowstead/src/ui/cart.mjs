// Hand cart HUD (cart.mjs): while you pull a cart, a small chip under the minimap shows how full it is
// (and its health once something bites it). Tap the chip to open the cart; "Let go" drops the handle.
// Presentation only: reads the world, sends {type:'cart'} commands, never mutates the world.
import {cartLevel, cartLoad, towedBy} from '../cart.mjs?v=harvest-18';

let root=null, openButton=null, dropButton=null, iconEl=null, loadEl=null, levelEl=null, loadBar=null, hpBar=null, hpTrack=null;
let latest=null, sig='', cartId=null, iconSig='';

function el(tag, className, parent){const node=document.createElement(tag);if(className)node.className=className;parent?.append(node);return node;}

export function bind(ctx){
  if(root||typeof document==='undefined')return;
  const hud=document.getElementById('feature-hud');if(!hud)return;
  latest=ctx;
  root=el('div', 'cart-hud', hud);root.hidden=true;root.setAttribute('role', 'group');root.setAttribute('aria-label', 'Hand cart');
  openButton=el('button', 'cart-open', root);openButton.type='button';
  iconEl=el('span', 'cart-icon', openButton);iconEl.setAttribute('aria-hidden', 'true');
  const text=el('span', 'cart-text', openButton);
  loadEl=el('b', 'cart-load', text);levelEl=el('small', 'cart-level', text);
  const bars=el('span', 'cart-bars', text);bars.setAttribute('aria-hidden', 'true');
  loadBar=el('i', 'cart-bar cart-bar-load', el('span', 'cart-track', bars));
  hpTrack=el('span', 'cart-track cart-track-hp', bars);hpBar=el('i', 'cart-bar cart-bar-hp', hpTrack);
  dropButton=el('button', 'cart-drop', root);dropButton.type='button';dropButton.innerHTML='<span aria-hidden="true">✕</span><small>Let go</small>';dropButton.setAttribute('aria-label', 'Let go of the cart');
  // Pointer events stop here so a tap never also steers or targets the world underneath.
  for(const button of [openButton, dropButton])button.addEventListener('pointerdown', event=>event.stopPropagation());
  openButton.addEventListener('click', ()=>{
    if(!latest||!cartId)return;
    if(typeof latest.openChest==='function')void latest.openChest(cartId);
    else latest.toast?.('Tap the cart to open it');
  });
  dropButton.addEventListener('click', ()=>{if(latest&&cartId)void latest.send({type:'cart', op:'release', cartId});});
}

/** The cart the local wanderer is pulling, if any. */
export function pulledCart(world, localId){return world&&localId?towedBy(world, world.player(localId)):null;}

export function paint(ctx){
  latest=ctx;if(!root)bind(ctx);if(!root)return;
  const p=ctx.me, cart=p&&!p.down&&!p.ghost&&!ctx.world?.arena?pulledCart(ctx.world, ctx.localId):null;
  const show=!!cart&&!ctx.sheet;
  if(!show){if(!root.hidden){root.hidden=true;sig='';}cartId=null;return;}
  cartId=cart.id;
  const load=cartLoad(cart), spec=cartLevel(cart), hp=Math.max(0, Math.min(1, cart.hp/Math.max(1, cart.maxHp)));
  const next=`${cart.id}|${load.used}/${load.slots}|${spec.level}|${Math.round(hp*40)}`;
  if(next===sig&&!root.hidden)return;sig=next;root.hidden=false;
  const img=ctx.icon?.('cart')||'';if(img!==iconSig){iconSig=img;iconEl.innerHTML=img;}
  loadEl.textContent=`${load.used}/${load.slots}`;
  levelEl.textContent=spec.level>1?`Lv ${spec.level}`:'';
  loadBar.style.width=`${Math.round(load.share*100)}%`;
  root.classList.toggle('is-full', load.used>=load.slots);
  hpTrack.hidden=hp>=.999;hpBar.style.width=`${Math.round(hp*100)}%`;root.classList.toggle('is-hurt', hp<.35);
  openButton.setAttribute('aria-label', `Open the cart, ${load.used} of ${load.slots} slots used${hp<.999?`, ${Math.round(hp*100)} percent health`:''}`);
}

export function frame(ctx, dt){}
