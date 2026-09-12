# Vendored dependencies

`majiang.mjs` contains Majiang core 1.4.1 and AI 1.2.0, bundled as a browser ES module. The included MIT license applies to both libraries. `../assets/tiles.svg` combines the public-domain regular tile artwork into 37 symbols, including the three red fives.

Pinned upstream revisions:

| Source | Git revision |
| --- | --- |
| https://github.com/kobalab/majiang-core | `7e964296dd8eb5ff5a32f8182acdc6a0c2a81cbb` |
| https://github.com/kobalab/majiang-ai | `e21ac9bdcb615857a7e3c8ae97e4357fc1452c7e` |
| https://github.com/FluffyStuff/riichi-mahjong-tiles | `26e127ba2117f45cdce5ea0225748cc0cfad3169` |

To rebuild, clone each source at the listed revision in a temporary directory. Install `esbuild@0.28.2` and `svgo@4.0.1` in a separate temporary build directory. Pass the three source paths and build directory to this script from the repository root:

```sh
node mahjong/vendor/build.mjs /path/to/majiang-core /path/to/majiang-ai /path/to/riichi-tiles /path/to/build-directory
```

The script writes the browser bundle, sprite, and license files. Upstream tests and development dependencies are not shipped in the site. GitHub Pages does not run this build script.
