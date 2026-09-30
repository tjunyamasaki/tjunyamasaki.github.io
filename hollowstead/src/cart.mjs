// Hand cart: a chest on wheels. A building of type 'cart' (world.buildings) with a store container.
// Any wanderer may open it or pull it; hostiles hunt carts exactly as they hunt wanderers.
// Pure simulation: import only content/progression/contracts/inventory. Never engine.mjs or the DOM.
//
// Cart fields (plain data, so saves and snapshots carry them to guests):
//   b.level     1..3 (CART_LEVELS): more slots, more hp, better wheels
//   b.towedBy   id of the wanderer holding the handle, or null. One puller per cart, one cart per wanderer.
//   b.frame     sprite sheet cell: (b.level>1 ? 3 : 0) + load (0 empty, 1 up to 60% of slots used, 2 more)
//   b.face      -1 / 1: the side the handle points to (the art draws it on the left, -1)
//   b.snag      seconds the cart has been stuck while its puller walks on (the handle slips after CART.slip)
// Host only (never sent): the puller's footsteps the cart follows, kept off the enumerable fields.
//
// Pulling: the cart follows the puller's own footsteps a rope length behind, so it rounds corners the
// way its puller did and never cuts through a trunk, a wall or water (it collides like a walker, with
// World.blockedAt). If something blocks it, the puller is held at the end of the handle; stuck for
// CART.slip seconds, the handle slips. A dodge lets go of the handle, and so does being downed.
import {STRUCTURES, label} from './content.mjs?v=harvest-18';
import {CART_SLOT_COUNTS, RANGES, inReach} from './contracts.mjs?v=harvest-18';
import {occupiedCount} from './inventory.mjs?v=harvest-18';

/** Handle and follow tuning. Lengths in units, times in seconds, speeds in units/s. */
export const CART = Object.freeze({
  rope: 1.6,       // the cart trails this far behind its puller
  stretch: .5,     // the handle gives this much before the puller is held back
  slip: 1.4,       // stuck this long while pulled: the handle slips out of the puller's hands
  crumb: .3,       // footstep spacing the cart follows
  follow: 9,       // top speed while catching up
  step: .2,        // longest collision step
  bench: RANGES.craft, // an upgrade needs a workbench this close to the wanderer
});

/** Levels 1..3: storage, health and wheels. Speed while pulling runs from `empty` to `full` with the share of slots in use. */
export const CART_LEVELS = Object.freeze([
  Object.freeze({level:1, name:'Hand cart', slots:CART_SLOT_COUNTS[0], hp:STRUCTURES.cart.hp, empty:.92, full:.62, cost:null}),
  Object.freeze({level:2, name:'Sturdy cart', slots:CART_SLOT_COUNTS[1], hp:320, empty:.94, full:.74, cost:Object.freeze({wood:10, ore:3, fiber:4})}),
  Object.freeze({level:3, name:'Iron-shod cart', slots:CART_SLOT_COUNTS[2], hp:420, empty:.96, full:.82, cost:Object.freeze({wood:12, ore:6, bone:4})}),
]);
export const CART_MAX_LEVEL = CART_LEVELS.length;

const active = p => !!(p && p.online && !p.down && !p.ghost && p.hp > 0);
const isCart = b => b?.type === 'cart';
/** Level spec of a cart (clamped, so odd saves still read sensibly). */
export function cartLevel(b){return CART_LEVELS[Math.min(CART_MAX_LEVEL, Math.max(1, b?.level|0))-1];}
/** Store slots for a cart level. */
export function cartSlots(level=1){return CART_LEVELS[Math.min(CART_MAX_LEVEL, Math.max(1, level|0))-1].slots;}
/** {used, slots, share}: how full the cart's store is. */
export function cartLoad(b){const slots=b?.store?.slots?.length||0,used=occupiedCount(b?.store);return {used, slots, share:slots?used/slots:0};}
/** Sheet cell: row 0 basic / row 1 reinforced; columns empty / partly (up to 60%) / full. */
export function cartFrame(b){const {used, share}=cartLoad(b);return ((b?.level|0)>1?3:0)+(used===0?0:share<=.6?1:2);}
/** The cart this wanderer is pulling, or null. */
export function towedBy(world, p){
  if(!p)return null;
  for(const b of world.buildings)if(b.towedBy===p.id&&isCart(b)&&b.hp>0)return b;
  return null;
}

/** Walk speed multiplier for a wanderer (pulling a loaded cart is slower). */
export function cartSpeed(world, p){
  const b=towedBy(world, p);if(!b)return 1;
  const spec=cartLevel(b);
  return spec.empty-(spec.empty-spec.full)*cartLoad(b).share;
}

/** Carts hostiles may choose as prey, alongside wanderers (mobs.mjs). */
export function cartTargets(world){
  if(world.arena)return [];
  return world.buildings.filter(b=>isCart(b)&&b.hp>0);
}

// ------------------------------------------------------------------ pulling
/** The puller's footsteps, oldest first, as a flat [x0,z0,x1,z1,...]. Host only: never enumerable, never sent. */
function trailOf(b){
  if(!Array.isArray(b.trail))Object.defineProperty(b, 'trail', {value:[], writable:true, configurable:true, enumerable:false});
  return b.trail;
}

function release(world, b, p=null, notice=''){
  b.towedBy=null;b.snag=0;trailOf(b).length=0;
  if(p&&notice)world.tell(p, notice);
}

/** Move the cart's centre toward x,z in short steps; slides along whatever stops it. True when it got there. */
function slideTo(world, b, x, z, obstacles){
  const dx=x-b.x, dz=z-b.z, n=Math.max(1, Math.ceil(Math.hypot(dx, dz)/CART.step)), sx=dx/n, sz=dz/n;
  // A cart inside something (a wall raised on it) may always roll back out onto open ground.
  const free=(tx, tz)=>!world.blockedAt(tx, tz, obstacles, b.id);
  const trapped=!free(b.x, b.z);
  for(let i=0;i<n;i++){
    const tx=b.x+sx, tz=b.z+sz;
    if(free(tx, tz)||(trapped&&world.walkable(tx, tz))){b.x=tx;b.z=tz;continue;}
    if(Math.abs(sx)>1e-6&&free(b.x+sx, b.z))b.x+=sx;
    else if(Math.abs(sz)>1e-6&&free(b.x, b.z+sz))b.z+=sz;
    return false;
  }
  return true;
}

/** Roll the cart along the puller's footsteps until it trails a rope length behind. Returns false when it is stuck. */
function follow(world, b, p, dt, obstacles){
  const trail=trailOf(b), rope=CART.rope;
  if(Math.hypot(p.x-b.x, p.z-b.z)<=rope){trail.length=0;return true;}
  const n=trail.length;
  if(n<2||Math.hypot(p.x-trail[n-2], p.z-trail[n-1])>=CART.crumb)trail.push(p.x, p.z);
  if(trail.length>600)trail.splice(0, trail.length-600);
  // Path length from the cart through the footsteps to the puller.
  let length=0, x=b.x, z=b.z;
  for(let i=0;i<trail.length;i+=2){length+=Math.hypot(trail[i]-x, trail[i+1]-z);x=trail[i];z=trail[i+1];}
  length+=Math.hypot(p.x-x, p.z-z);
  let left=Math.min(length-rope, CART.follow*dt);
  while(left>1e-4){
    const tx=trail.length?trail[0]:p.x, tz=trail.length?trail[1]:p.z;
    const seg=Math.hypot(tx-b.x, tz-b.z);
    if(seg<1e-4){if(!trail.length)break;trail.splice(0, 2);continue;}
    const go=Math.min(left, seg);
    if(!slideTo(world, b, b.x+(tx-b.x)/seg*go, b.z+(tz-b.z)/seg*go, obstacles))return false;
    left-=go;
    if(go>=seg-1e-6){if(!trail.length)break;trail.splice(0, 2);}
  }
  return true;
}

/** Called by World.tick() once per tick after wanderers move (never in the arena). */
export function stepCarts(world, dt, obstacles){
  for(const b of world.buildings){
    if(!isCart(b))continue;
    if(b.towedBy===undefined)b.towedBy=null;
    if(!(b.face===1||b.face===-1))b.face=-1;
    if(!Number.isFinite(b.snag))b.snag=0;
    if(b.towedBy!==null){
      const p=world.player(b.towedBy);
      if(!(b.hp>0)||!active(p))release(world, b);
      else if(p.dash>0)release(world, b, p, 'You let go of the cart to dodge');
      else{
        const moving=follow(world, b, p, dt, obstacles);
        const dx=p.x-b.x, dz=p.z-b.z, d=Math.hypot(dx, dz), hold=CART.rope+CART.stretch;
        if(Math.abs(dx)>.15)b.face=dx>0?1:-1;
        if(d>hold){
          // Stuck behind something: the handle holds the puller back until it slips.
          const hx=b.x+dx/d*hold, hz=b.z+dz/d*hold;
          if(!world.blockedAt(hx, hz, obstacles, p.id)){p.x=hx;p.z=hz;}
          b.snag+=dt;
          if(b.snag>=CART.slip||Math.hypot(p.x-b.x, p.z-b.z)>hold+.8)release(world, b, p, 'The cart snagged and the handle slipped');
        }else b.snag=moving?Math.max(0, b.snag-dt):b.snag+dt*.25;
      }
    }
    b.frame=cartFrame(b);
  }
}

// ------------------------------------------------------------------ commands
/** Why this wanderer cannot upgrade this cart right now, or '' when they can. Needs world.canPay. */
export function upgradeBlock(world, p, b){
  const next=CART_LEVELS[cartLevel(b).level];
  if(!next)return 'This cart is fully upgraded';
  if(!world.buildings.some(s=>s.type==='bench'&&s.hp>0&&Math.hypot(s.x-p.x, s.z-p.z)<CART.bench))return 'Pull it beside a workbench to upgrade';
  if(!world.canPay(p, next.cost))return `Needs ${Object.entries(next.cost).map(([id, n])=>`${n} ${label(id).toLowerCase()}`).join(', ')}`;
  return '';
}

/** Facts the context buttons need about a cart (ui/actions.mjs describeContext). Read-only. */
export function cartFacts(world, p, b){
  const puller=b?.towedBy?world.player(b.towedBy):null, spec=cartLevel(b), next=CART_LEVELS[spec.level]||null;
  const reason=p&&b?upgradeBlock(world, p, b):'';
  return {
    towing:!!p&&b?.towedBy===p.id, towedByOther:!!(puller&&puller.id!==p?.id&&active(puller)),
    level:spec.level, maxLevel:CART_MAX_LEVEL, cartName:spec.name, nextCost:next?.cost||null,
    canUpgrade:!!next&&!reason, upgradeReason:reason, ...cartLoad(b),
  };
}

/** World.action(id, {type:'cart', op:'pull'|'release'|'upgrade', cartId}). */
export function cartAction(world, p, cmd){
  if(!['pull','release','upgrade'].includes(cmd?.op)||typeof cmd.cartId!=='string')return {ok:false, code:'invalidCommand'};
  const b=world.buildings.find(entry=>entry.id===cmd.cartId&&isCart(entry)&&entry.hp>0);
  if(!b)return {ok:false, code:'rejected'};
  if(cmd.op==='release'){
    if(b.towedBy===p.id)release(world, b);
    return {ok:true, code:'ok'};
  }
  if(!inReach(Math.hypot(p.x-b.x, p.z-b.z)))return {ok:false, code:'outOfRange'};
  if(cmd.op==='pull'){
    if(b.towedBy===p.id)return {ok:true, code:'ok'};
    const other=b.towedBy?world.player(b.towedBy):null;
    if(other&&active(other)){world.tell(p, `${other.name} is pulling that cart`);return {ok:false, code:'rejected'};}
    const held=towedBy(world, p);if(held)release(world, held);
    release(world, b);b.towedBy=p.id;p.rest=false;
    return {ok:true, code:'ok'};
  }
  const reason=upgradeBlock(world, p, b);
  if(reason){world.tell(p, reason);return {ok:false, code:reason.startsWith('Pull it')?'stationRequired':'rejected'};}
  const next=CART_LEVELS[cartLevel(b).level];
  if(!world.pay(p, next.cost)){world.tell(p, 'Needs more materials');return {ok:false, code:'rejected'};}
  b.level=next.level;
  while(b.store.slots.length<next.slots)b.store.slots.push(null);
  b.store.revision++;
  b.maxHp=next.hp;b.hp=next.hp;b.frame=cartFrame(b);p.cooldown=.4;
  world.event('build', b.x, b.z, `${next.name} • ${next.slots} slots`);
  world.assertItems();
  return {ok:true, code:'ok'};
}

/** Label for the engine's nearest-target hint (World.buildingLabel). */
export function cartLabel(b){return `${cartLevel(b).name} · ${cartLoad(b).used}/${cartLoad(b).slots}`;}
