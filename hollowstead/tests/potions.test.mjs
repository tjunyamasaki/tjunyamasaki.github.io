import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {potionHotbar, keyboardAction} from '../src/ui/actions.mjs';

test('potion hotbar counts only carried draughts and respects unavailable modes', () => {
  const p = {inventory: {revision: 8, slots: [null, {uid:'a',itemId:'elixir',quantity:2}, {uid:'b',itemId:'elixir',quantity:3}, {uid:'c',itemId:'bandage',quantity:9}]}, recovery: {slots:[{itemId:'elixir',quantity:10}]}};
  assert.equal(keyboardAction('h'), 'potion');
  assert.equal(potionHotbar(p).quantity, 5);
  assert.deepEqual(potionHotbar(p).command, {type:'consumeItem',uid:'a',inventoryRevision:8});
  for (const options of [{pending:true}, {arena:true}, ...['paused','disconnected','downed','ghost','end','placement','maintenance'].map(mode=>({mode}))]) {
    assert.equal(potionHotbar(p, options).command, null);
  }
  assert.equal(potionHotbar({...p, down:10}).command, null);
  assert.equal(potionHotbar({...p, ghost:true}).command, null);
  assert.equal(potionHotbar(null).command, null);
  assert.equal(potionHotbar({inventory:{slots:[]}}).quantity, 0);
});

test('hotbar potion consumes one through the host intent, rejects stale revision, and advances stacks', () => {
  const w = new World(12), p = w.addPlayer('host'); w.start(); w.clearPack(p);
  const first=w.mintStack('elixir',1), second=w.mintStack('elixir',2);
  p.inventory.slots[0]=first; p.inventory.slots[1]=second; p.inventory.revision++;
  p.hp=10; p.courage=30; p.cooldown=0;
  const session=createActionSession({getWorld:()=>w,actorId:p.id}); let request=0;
  const send=cmd=>session.execute({...cmd,requestId:`${session.sessionId}:${++request}`,worldId:w.networkId});
  const command=potionHotbar(p).command;
  assert.equal(send(command).ok,true);
  assert.equal(p.hp,70); assert.equal(p.courage,50);
  assert.equal(potionHotbar(p).quantity,2);
  assert.equal(potionHotbar(p).command.uid,second.uid);
  assert.equal(send(command).code,'staleRevision');
  assert.equal(potionHotbar(p).quantity,2);
  p.cooldown=0;
  assert.equal(send(potionHotbar(p).command).ok,true);
  assert.equal(potionHotbar(p).quantity,1);
});
