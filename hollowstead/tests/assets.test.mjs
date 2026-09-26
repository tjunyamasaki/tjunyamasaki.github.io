import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedSrc, loadImage, preloadThemeAssets, resetAssetCache, themeAssetUrls} from '../src/assets.mjs';

class FakeImage {
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

function withAssetIO(t) {
  const fetches = [];
  let objectId = 0;
  const previous = {fetch: globalThis.fetch, Image: globalThis.Image, createObjectURL: globalThis.URL.createObjectURL};
  globalThis.Image = FakeImage;
  globalThis.URL.createObjectURL = () => `blob:hollowstead-${++objectId}`;
  globalThis.fetch = async url => {
    fetches.push(String(url));
    return {ok: true, blob: async () => new Blob(['<svg/>'], {type: 'image/svg+xml'})};
  };
  t.after(() => {
    resetAssetCache();
    globalThis.fetch = previous.fetch;
    globalThis.Image = previous.Image;
    globalThis.URL.createObjectURL = previous.createObjectURL;
  });
  resetAssetCache();
  return fetches;
}

function iconHTML(src) {
  return `<img class="item-icon rarity-common" src="${cachedSrc(src)}" alt="" draggable="false">`;
}

test('session cache fetches each icon URL once and reuses the decoded image', async t => {
  const fetches = withAssetIO(t);
  const wood = 'https://hollowstead.test/wood-icon.svg';
  const first = await loadImage(wood);
  const second = await loadImage(wood);
  assert.equal(first, second);
  assert.equal(first.src, 'blob:hollowstead-1');
  assert.deepEqual(fetches, [wood]);
});

test('a second chest-open icon insert does not refetch the same URLs', async t => {
  const fetches = withAssetIO(t);
  const theme = {
    sprites: {
      wood: {src: 'https://hollowstead.test/wood.svg', icon: 'https://hollowstead.test/wood-icon.svg'},
      berry: {src: 'https://hollowstead.test/berry.svg', icon: 'https://hollowstead.test/berry-icon.svg'},
    },
    audio: {},
  };
  assert.deepEqual(themeAssetUrls(theme), [
    'https://hollowstead.test/wood.svg',
    'https://hollowstead.test/wood-icon.svg',
    'https://hollowstead.test/berry.svg',
    'https://hollowstead.test/berry-icon.svg',
  ]);
  await preloadThemeAssets(theme);
  const firstOpen = ['wood', 'berry'].map(key => iconHTML(theme.sprites[key].icon));
  const secondOpen = ['wood', 'berry'].map(key => iconHTML(theme.sprites[key].icon));
  assert.deepEqual(firstOpen, secondOpen);
  assert.match(firstOpen[0], /src="blob:hollowstead-\d+"/);
  assert.match(firstOpen[1], /src="blob:hollowstead-\d+"/);
  assert.notEqual(firstOpen[0], firstOpen[1]);
  assert.equal(fetches.length, 4);
  assert.equal(fetches.filter(url => url.endsWith('icon.svg')).length, 2);
});
