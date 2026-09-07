# Vendored libraries

Do not replace these files with minified copies from other games.

## Three.js 0.180.0 (r180)

MIT licensed. Official unminified `build/` modules from the 0.180.0 release, downloaded 7 September 2026. `three.module.js` imports `./three.core.js`; both files are required. License headers in the JS files were left intact.

| File | Source URL | SHA-256 |
| --- | --- | --- |
| `three/three.module.js` | https://unpkg.com/three@0.180.0/build/three.module.js | `c8211c69345d2e9949dc7a8ac969380497aa0600a5a8ac6a459c8cd02dd9cb8a` |
| `three/three.core.js` | https://unpkg.com/three@0.180.0/build/three.core.js | `eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20` |
| `three/LICENSE` | https://unpkg.com/three@0.180.0/LICENSE | `bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601` |

Matching release URLs (not used for this copy, same version):

- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE
- https://raw.githubusercontent.com/mrdoob/three.js/r180/build/three.module.js
- https://raw.githubusercontent.com/mrdoob/three.js/r180/build/three.core.js
- https://raw.githubusercontent.com/mrdoob/three.js/r180/LICENSE

## Import-only preview difference

The original handoff fragment imported Three from:

`https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js`

The executable wrapper at `../reference/original-preview.html` uses only:

`../vendor/three/three.module.js`

That path change is the only source-level behavior change from the fragment.

## Reference handoff copy

`../reference/anime-slime-handoff.md` is a byte-for-byte copy of the planning-pack handoff.

- Actual SHA-256: `87640e527a8f0b53997bd3752ac78b07870e137546e22346fa0b984db2b5d46c`
- START-HERE claimed: `11CA552EEE43B246BBE4405C7F68D38F5F8242BCF1CF5F5B40F85381E8D6D4B2`

The copy was not rewritten to force a hash match.
