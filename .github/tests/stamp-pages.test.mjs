import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stampPages, versionReferences} from '../scripts/stamp-pages.mjs';

test('deployment versions reach entry points, nested and dynamic imports, CSS and shared dependencies', ()=>{
  const original=`<script src="./src/main.mjs?v=harvest-18"></script>
<link href='./style.css?v=harvest-18'>
import {World} from './engine.mjs?v=harvest-18';
export {item} from '../content.mjs?v=harvest-18';
await import('../../js/signaling.js');
import {firebaseConfig} from './config.js';
import * as THREE from '../../hushlight/vendor/three.module.min.js';
const extra='./thing.mjs?mode=1&v=old#part';
const external='https://cdn.test/library.js?v=pinned';
const dynamic=\`./\${name}.mjs\`;
const label='theme.json';`;
  const stamped=versionReferences(original, 'commit-run-2');
  for(const path of ['./src/main.mjs','./style.css','./engine.mjs','../content.mjs','../../js/signaling.js','./config.js','../../hushlight/vendor/three.module.min.js'])assert.ok(stamped.includes(path+'?v=commit-run-2'), path);
  assert.ok(stamped.includes('./thing.mjs?mode=1&v=commit-run-2#part'));
  assert.ok(stamped.includes('https://cdn.test/library.js?v=pinned'));
  assert.ok(stamped.includes('`./${name}.mjs`'));
  assert.equal(versionReferences(stamped, 'commit-run-2'), stamped);
  assert.equal(stamped.includes('harvest-18'), false);
});

test('a staged release uses one version for modules, manifest and fetched art while preserving source', async t=>{
  const root=await mkdtemp(join(tmpdir(), 'hollowstead-release-'));
  t.after(()=>rm(root, {recursive:true, force:true}));
  await mkdir(join(root, 'hollowstead/src'), {recursive:true});
  const releaseUrl=new URL('../../hollowstead/src/release.mjs', import.meta.url);
  const source=await readFile(releaseUrl, 'utf8');
  await cp(releaseUrl, join(root, 'hollowstead/src/release.mjs'));
  await cp(new URL('../../hollowstead/src/assets.mjs', import.meta.url), join(root, 'hollowstead/src/assets.mjs'));
  await writeFile(join(root, 'hollowstead/index.html'), '<script src="./src/assets.mjs?v=harvest-18"></script>');
  await stampPages(root, 'commit-run-1');
  assert.deepEqual(JSON.parse(await readFile(join(root, 'hollowstead/version.json'), 'utf8')), {version:'commit-run-1'});
  assert.match(await readFile(join(root, 'hollowstead/index.html'), 'utf8'), /assets\.mjs\?v=commit-run-1/);
  const release=await import(pathToFileURL(join(root, 'hollowstead/src/release.mjs')));
  assert.equal(release.RELEASE, 'commit-run-1');
  assert.equal(await readFile(releaseUrl, 'utf8'), source, 'source is never stamped');

  const fetches=[];
  const previous={fetch:globalThis.fetch, location:globalThis.location};
  globalThis.location={href:'https://game.test/hollowstead/'};
  globalThis.fetch=async(url, options)=>{
    fetches.push({url:new URL(url), options});
    return {ok:true, blob:async()=>new Blob(['{"id":"harvest"}'])};
  };
  t.after(()=>{globalThis.fetch=previous.fetch;if(previous.location===undefined)delete globalThis.location;else globalThis.location=previous.location;});
  const assets=await import(pathToFileURL(join(root, 'hollowstead/src/assets.mjs')));
  const theme='https://game.test/hollowstead/themes/harvest/theme.json';
  assert.deepEqual(await assets.loadJson(theme), {id:'harvest'});
  await assets.loadJson(theme);
  await assets.loadBlob('https://game.test/hollowstead/themes/harvest/tree.svg?v=art3');
  assert.equal(fetches.length, 2, 'cache is retained within a release');
  assert.equal(fetches[0].url.searchParams.get('release'), 'commit-run-1');
  assert.equal(fetches[1].url.searchParams.get('v'), 'art3');
  assert.equal(fetches[1].url.searchParams.get('release'), 'commit-run-1');
  assert.ok(fetches.every(entry=>entry.options.cache==='force-cache'));
});

test('invalid release identifiers fail before touching the artifact', async()=>{
  await assert.rejects(stampPages('unused', '../bad'), /valid deployment version/);
});
