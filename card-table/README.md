# Card Table

A 3D, mobile-first sandbox for playing any card game with friends. Nothing
about any particular game is coded in: the table only knows physical actions
(move, flip, shuffle, deal, peek, take a random card, score, pass the turn,
undo), and players agree on the rules like they would at a real table.

## Layout

- `src/model.js` – the whole table state and every action as a pure reducer.
  Also builds per-player views (hidden faces become `null`) and the deck presets.
- `src/session.js` – host/guest sessions. The host applies actions and sends
  each player their own view; guests predict their moves locally and are
  corrected by the next host state.
- `src/net.js` – WebRTC data channels signalled through the site's Firebase
  Realtime Database (`rooms/<code>/guests/<id>`). Without Firebase config, or
  with `?local` in the URL, tables run between tabs of one browser instead.
- `src/scene.js` – three.js table, card meshes, camera fitting, the fanned hand
  in camera space, picking and drop targets.
- `src/input.js` – one pointer state machine: tap, long press, drag, pan, pinch.
- `src/main.js` – the controller: home screen, gestures to actions, sheets.
- `src/faces.js` – card faces and backs painted on canvas.

## Run locally

Serve the repository root (`npm start`) and open `/card-table/?local`, then
open the invite link in another tab to sit a second player down.

```
node --test card-table/tests/*.test.mjs
```
