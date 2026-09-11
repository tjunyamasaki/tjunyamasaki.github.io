import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSkin,validSkin,paintLine} from '../skin.mjs';
test('skins are bounded palette data, not executable image URLs',()=>{
 assert.ok(validSkin(blankSkin()));assert.ok(!validSkin('1'.repeat(4097)));assert.ok(!validSkin('8'.repeat(4096)));assert.ok(!validSkin('data:image/svg+xml,<svg>'));assert.ok(!validSkin(null));
});
test('brush strokes connect samples, stay in bounds, and can be erased',()=>{
 const p=blankSkin().split('');paintLine(p,{x:1,y:20},{x:62,y:20},3,1);
 for(let x=1;x<=62;x++)assert.equal(p[20*64+x],'3');
 paintLine(p,{x:1,y:20},{x:62,y:20},0,2);assert.ok(p.every(x=>x==='0'));
 paintLine(p,{x:-10,y:-10},{x:2,y:2},4,5);assert.equal(p.length,4096);assert.ok(validSkin(p.join('')));
});
