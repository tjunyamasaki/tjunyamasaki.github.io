# Yoru — Riichi Mahjong

A mobile-first, four-seat Japanese riichi table at `/mahjong/`.

## Playing

- **Play with bots** starts a private match against three strategic opponents. No sign-in or signaling service is needed for solo play.
- **Host a table** opens a lobby. Share the room code or invite link, then deal when ready. Empty seats can be filled by bots; turn off that option to wait for four humans.
- Tap a tile to select it, then tap it again or press **Discard**. Riichi highlights eligible discards. Legal chi, pon, kan, ron, and tsumo decisions appear automatically.
- Optional discard advice, English tile labels, sound, haptics, reduced effects, and an in-game guide are included. The hand uses two rows on phones; arrow keys move through tiles on a keyboard.
- Inspect any player's river to enlarge their discards and open melds. Win screens show the winning hand, yaku, han/fu, dora, and all point transfers.

## Rules

Uses the Majiang core 1.4.1 Japanese rules and scoring implementation, with Majiang AI 1.2.0 bots. The default is an East match; East/South and one-hand matches are also available. Starting scores are 25,000, with one red five per suit, open tanyao, ippatsu, ura/kan dora, furiten, abortive and exhaustive draws, noten payments, dealer repeats, double ron, and yakuman. Wind extensions are disabled. All other rule defaults are preserved. One-hand games can repeat after a draw.

Bots evaluate only their own concealed tiles and publicly visible information. Bot computation and game progression run inside a dedicated module Web Worker. Vendored code and SVG tile artwork load from this site; there is no runtime package CDN dependency. Animations primarily use opacity and transforms, and respect reduced-motion preferences.

## Multiplayer

`network.mjs` reuses `../js/signaling.js`: Firebase signaling and reliable, ordered WebRTC data channels. The host runs the authoritative worker. Each peer receives a separate snapshot containing only their hand, public table information, and their legal decisions. The live wall and opponents' concealed hands never enter network snapshots. Replies are bound to the connection identity and an outstanding decision token, then validated against the server-generated options.

The host must keep the page open. Guest disconnections are replaced by bots. Online decisions have a 60-second timeout that passes calls or discards a legal tile; offline play has no clock. Solo pauses when hidden or while reading the guide/settings. Online play continues while menus are open. As with other games in this repository, the existing STUN-only configuration may not connect across some restrictive networks; no TURN relay is configured. This is a friends' table: the authoritative host is trusted.

## Deployment

The `feat/riichi-mahjong` branch is based on the deployed `feat/wob-tower` branch so it includes the existing arcade. `.github/workflows/deploy-pages.yml` deploys pushes to this feature branch and stages `/mahjong/` alongside the other games. Firebase configuration still comes from the existing GitHub secrets. No new test files or test steps were added. Existing arcade test steps are retained.

The site remains vanilla ES modules, with no build step required to play or deploy. `vendor/build.mjs` is only for updating the vendored dependencies; see `vendor/README.md`.

## Credits

- Rules/scoring: [kobalab/majiang-core](https://github.com/kobalab/majiang-core), MIT, Satoshi Kobayashi.
- AI: [kobalab/majiang-ai](https://github.com/kobalab/majiang-ai), MIT, Satoshi Kobayashi.
- Japanese tile artwork: [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles), CC0 public domain. Optimized and combined into one SVG sprite.
- Original Yoru presentation, UI, audio synthesis, worker adapter, and multiplayer integration for this repository.
