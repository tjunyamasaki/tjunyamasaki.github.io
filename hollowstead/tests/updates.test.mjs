import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateChecker} from '../src/updates.mjs';
import {releaseAssetUrl} from '../src/release.mjs';

function setup(overrides={}){
  const requests=[], reloads=[];
  const check=createUpdateChecker({
    release:'old-build', canReload:()=>true,
    pageUrl:()=> 'https://game.test/hollowstead/?camp=ABCDE&look=mask#guide',
    now:()=>100000,
    fetchVersion:async (url, options)=>{requests.push({url:new URL(url), options});return {ok:true, json:async()=>({version:'new-build'})};},
    reload:url=>reloads.push(new URL(url)),
    ...overrides,
  });
  return {check, requests, reloads};
}

test('a new deployment loads fresh HTML, preserving invite links and appearance choices', async()=>{
  const {check, requests, reloads}=setup();
  assert.equal(await check(), true);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].url.searchParams.get('check'), '100000');
  assert.ok(requests[0].url.pathname.endsWith('/hollowstead/version.json'));
  assert.equal(reloads[0].searchParams.get('_release'), 'new-build');
  assert.equal(reloads[0].searchParams.get('camp'), 'ABCDE');
  assert.equal(reloads[0].searchParams.get('look'), 'mask');
  assert.equal(reloads[0].hash, '#guide');
  assert.equal(await check(), false, 'only navigate once');
});

test('development and an unchanged deployment do not reload', async()=>{
  const dev=setup({release:'development'});
  assert.equal(await dev.check(), false);
  assert.equal(dev.requests.length, 0);
  const current=setup({release:'new-build'});
  assert.equal(await current.check(), false);
  assert.equal(current.reloads.length, 0);
});

test('checks wait for the title screen and recheck after a slow response', async()=>{
  let atTitle=false, finish;
  const {check, reloads}=setup({
    canReload:()=>atTitle,
    fetchVersion:()=>new Promise(resolve=>{finish=resolve;}),
  });
  assert.equal(await check(), false, 'never interrupt a game');
  atTitle=true;
  const pending=check();
  assert.equal(await check(), false, 'one request at a time');
  atTitle=false; // The player started a game while the check was in flight.
  finish({ok:true,json:async()=>({version:'new-build'})});
  assert.equal(await pending, false);
  assert.equal(reloads.length, 0);
  atTitle=true;
  const next=check();
  finish({ok:true,json:async()=>({version:'new-build'})});
  assert.equal(await next, true, 'apply the update when safely back at the title');
});

test('offline, missing, invalid and malformed manifests leave the game usable', async()=>{
  for(const fetchVersion of [
    async()=>{throw new Error('offline');},
    async()=>({ok:false}),
    async()=>({ok:true,json:async()=>{throw new Error('not JSON');}}),
    async()=>({ok:true,json:async()=>({version:'../../unsafe'})}),
    async()=>({ok:true,json:async()=>({})}),
  ]){
    const {check, reloads}=setup({fetchVersion});
    assert.equal(await check(), false);
    assert.equal(reloads.length, 0);
  }
});

test('stale HTML cannot cause a reload loop during CDN propagation; a later check retries', async()=>{
  let time=100100;
  const {check, reloads}=setup({
    pageUrl:()=> 'https://game.test/hollowstead/?_release=new-build&_updated=100000',
    now:()=>time,
  });
  assert.equal(await check(), false);
  assert.equal(reloads.length, 0);
  time+=60000;
  assert.equal(await check(), true);
  assert.equal(reloads[0].searchParams.get('_updated'), String(time));
});

test('theme, sprites, icons and audio have release-specific URLs without losing art variants', ()=>{
  const base='https://game.test/hollowstead/';
  for(const path of ['./themes/harvest/theme.json','./sprites/tree.svg?v=art3#variant','./sound.mp3']){
    const first=new URL(releaseAssetUrl(path, 'build-one', base));
    const next=new URL(releaseAssetUrl(path, 'build-two', base));
    assert.equal(first.searchParams.get('release'), 'build-one');
    assert.equal(next.searchParams.get('release'), 'build-two');
    assert.equal(first.pathname, next.pathname);
    assert.equal(releaseAssetUrl(first.href, 'build-one', base), first.href);
  }
  const sprite=new URL(releaseAssetUrl('./sprites/tree.svg?v=art3#variant', 'build-one', base));
  assert.equal(sprite.searchParams.get('v'), 'art3');
  assert.equal(sprite.hash, '#variant');
  for(const url of ['blob:game-icon','data:image/svg+xml,icon','https://cdn.test/icon.svg']){
    assert.equal(releaseAssetUrl(url, 'build-one', base), url);
  }
  assert.equal(releaseAssetUrl('./theme.json', 'development', base), './theme.json');
});
