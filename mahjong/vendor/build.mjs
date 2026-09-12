// Maintenance utility. Runtime/deployment uses the committed bundle and sprite.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const [coreArg, aiArg, tilesArg, buildArg] = process.argv.slice(2);
if (![coreArg, aiArg, tilesArg, buildArg].every(Boolean)) throw new Error('Usage: node build.mjs CORE_DIR AI_DIR TILES_DIR BUILD_DIR');
const core = resolve(coreArg), ai = resolve(aiArg), tiles = resolve(tilesArg);
const require = createRequire(join(resolve(buildArg), 'package.json'));
const {build} = require('esbuild'), {optimize} = require('svgo');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(out, 'assets'), {recursive: true});
await build({
  stdin: {contents: `export {default as Majiang} from ${JSON.stringify(join(core, 'lib/index.js'))}; export {default as AI} from ${JSON.stringify(join(ai, 'lib/player.js'))};`, resolveDir: core},
  alias: {'@kobalab/majiang-core': join(core, 'lib/index.js')},
  bundle: true, format: 'esm', minify: true, outfile: join(out, 'vendor/majiang.mjs'),
  banner: {js: '/*! Majiang core 1.4.1 & AI 1.2.0 | Copyright Satoshi Kobayashi | MIT | See LICENSE */'}
});
writeFileSync(join(out, 'vendor/LICENSE'), readFileSync(join(core, 'LICENSE')));
const symbols = [];
const artwork = [];
for (const [suit, name] of Object.entries({m: 'Man', p: 'Pin', s: 'Sou'})) {
  for (let n = 0; n <= 9; n++) artwork.push([suit + n, name + (n || 5) + (n === 0 ? '-Dora' : '')]);
}
['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'].forEach((name, i) => artwork.push(['z' + (i + 1), name]));
for (const [id, name] of artwork) {
  const svg = optimize(readFileSync(join(tiles, 'Regular', name + '.svg'), 'utf8'), {
    multipass: true, plugins: ['preset-default', {name: 'prefixIds', params: {prefix: id}}]
  }).data;
  // The white dragon is intentionally blank and optimizes to a self-closing SVG.
  const content = svg.replace(/^<svg\b[^>]*\/>$/, '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  symbols.push(`<symbol id="${id}" viewBox="0 0 300 400">${content}</symbol>`);
}
writeFileSync(join(out, 'assets/tiles.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${symbols.join('')}</svg>`);
writeFileSync(join(out, 'assets/LICENSE'), 'Japanese tile artwork by FluffyStuff. Public domain (CC0).\nhttps://github.com/FluffyStuff/riichi-mahjong-tiles\nhttps://creativecommons.org/publicdomain/zero/1.0/\n');
