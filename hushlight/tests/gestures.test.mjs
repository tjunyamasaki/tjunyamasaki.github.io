import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroundGesture,clampZoom,bindHoldButton } from '../gestures.mjs';
import {createState,step} from '../state.mjs';
import { MOONLIT,EMBER,paletteColor } from '../palettes.mjs';
function harness(){let zoom=1,taps=[],stops=0;const gesture=createGroundGesture({getZoom:()=>zoom,onZoom:z=>zoom=z,onGesture:()=>stops++,onTap:(x,y)=>taps.push([x,y])});return {gesture,taps,get zoom(){return zoom;},get stops(){return stops;}};}
test('single-finger taps move only on release, while drags and cancellation never move',()=>{
  const h=harness();h.gesture.down(1,20,30);assert.equal(h.taps.length,0);h.gesture.up(1,23,31);assert.deepEqual(h.taps,[[23,31]]);
  h.gesture.down(2,20,30);h.gesture.move(2,80,80);h.gesture.up(2,80,80);
  h.gesture.down(3,20,30);h.gesture.up(3,20,30,true);assert.equal(h.taps.length,1);
});
test('pinch doubles zoom and releasing either finger cannot trigger a tap',()=>{
  const h=harness();h.gesture.down(1,0,0);h.gesture.down(2,100,0);h.gesture.move(2,200,0);
  assert.equal(h.zoom,2);assert.equal(h.stops,1);h.gesture.up(2,200,0);h.gesture.up(1,0,0);assert.equal(h.taps.length,0);
  h.gesture.down(3,25,25);h.gesture.up(3,25,25);assert.equal(h.taps.length,1);
});
test('zoom is bounded and interrupted gestures cannot leak into a new input',()=>{
  const h=harness();h.gesture.down(1,0,0);h.gesture.down(2,100,0);h.gesture.move(2,1000,0);assert.equal(h.zoom,2.6);
  h.gesture.move(2,10,0);assert.equal(h.zoom,1);h.gesture.clear();h.gesture.up(1,0,0);assert.equal(h.taps.length,0);
  assert.equal(clampZoom(NaN),1);assert.equal(clampZoom(-4),1);assert.equal(clampZoom(3),2.6);
});
test('spooky colors explicitly remap night, terrain and lights; original palette is recoverable',()=>{
  assert.equal(paletteColor(MOONLIT.night,'ember'),EMBER.night);
  assert.equal(paletteColor(MOONLIT.gold,'ember'),EMBER.gold);
  assert.equal(paletteColor(0x30565b,'ember'),0x473225);
  assert.equal(paletteColor(0x30565b,'moonlit'),0x30565b);
});
test('release and trailing click after the final ritual preserve the completed scene',()=>{
  const state=createState();state.phase='playing';state.lit=2;
  state.shrines[0].lit=state.shrines[1].lit=true;
  state.lights.forEach((l,i)=>l.status=i<6?'delivered':'following');
  Object.assign(state.player,{x:1.2,z:-5.4});
  const button=new EventTarget();button.setPointerCapture=()=>{};let held=false;
  bindHoldButton(button,{canHold:()=>state.phase==='playing',onStart:()=>held=true,onStop:()=>held=false});
  const dispatch=type=>{const event=new Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:1});button.dispatchEvent(event);};
  dispatch('pointerdown');assert.equal(held,true);
  for(let i=0;i<300;i++)step(state,{kindle:held},.02);
  assert.equal(state.phase,'complete');const completedAt=state.completedAt;
  dispatch('pointerup');dispatch('click');assert.equal(held,false);
  assert.equal(state.phase,'complete');assert.equal(state.completedAt,completedAt);assert.equal(state.lit,3);
  dispatch('pointerdown');assert.equal(held,false);
});
