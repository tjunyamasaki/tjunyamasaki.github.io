# Lobby MVP

Browser lobby to validate: **GitHub Pages** (static app) + **Firebase Realtime Database** (WebRTC signaling only) + **Player 1 as host** (game/lobby state in their tab).

There is no card game yet. Host and guests share a player list, a Ready flag, and a counter.

## What you need

1. A Firebase project on the **Spark** (no-cost) plan.
2. **Realtime Database** enabled.
3. This repo served over HTTPS (GitHub Pages) or `localhost` (WebRTC requires a secure context).

## Firebase setup

1. [Firebase console](https://console.firebase.google.com/) → create a project (Spark is enough).
2. Add a **Web** app. Copy the config object.
3. **Local:** copy [`js/config.example.js`](js/config.example.js) to `js/config.js` (gitignored) and paste your keys.
4. **GitHub Pages:** store the same values as **repository secrets** (see below). Actions writes `config.js` on deploy so it is not in git. The live site still contains the keys in downloaded JS.
5. Build → Realtime Database → create database. Use the rules below for the MVP.

Never commit a service account JSON.

### GitHub Actions (keep keys out of the repo)

Public repos get GitHub-hosted Actions minutes at **no extra charge** for this kind of deploy. Private repos have a monthly free-minutes quota.

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

   | Secret | Firebase field |
   |--------|----------------|
   | `FIREBASE_API_KEY` | `apiKey` |
   | `FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `FIREBASE_DATABASE_URL` | `databaseURL` |
   | `FIREBASE_PROJECT_ID` | `projectId` |
   | `FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `FIREBASE_APP_ID` | `appId` |

2. Repo → **Settings → Pages → Build and deployment → Source** → **GitHub Actions** (not “Deploy from a branch”).
3. If `js/config.js` was already committed, remove it from git (keep the local file): `git rm --cached js/config.js`
4. Push to `master`. The [deploy workflow](.github/workflows/deploy-pages.yml) generates `config.js` and publishes Pages.

Keys that already landed in git history stay there until you rewrite history or accept they were public once. Rotating the Firebase web key is optional for this threat model.

### Realtime Database rules (MVP only)

These allow anyone who can guess a room code to read/write `rooms`. That is enough to test a table; it is **not** production-safe.

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

No Auth, Cloud Functions, or Firebase Hosting required. GitHub Pages still serves the site.

## Local test

Open the folder with any static server, for example:

```bash
npx --yes serve .
```

Then visit the printed URL (not `file://`).

## Hotspot test (success = MVP done)

1. Push to GitHub Pages and open the site on Player 1 and 2–3 other phones.
2. Player 1 starts a **Wi-Fi hotspot**; others join that network (internet still on so GitHub + Firebase work).
3. Player 1 taps **Host lobby** and reads the room code.
4. Others enter a nickname + code and tap **Join**.
5. Names appear on every screen. **Toggle ready** and **Bump counter** update everywhere.
6. Close the host tab: guests should show **host gone**.

Optional: on Chrome, `chrome://webrtc-internals` — look for **host** ICE candidates like `192.168.x.x` to confirm play traffic is local, not Firebase.

## Limits

- Max **15** players (host + 14 guests). Extra joins are rejected.
- Host tab must stay open (and preferably in the foreground on phones).
- Same-hotspot play should not need TURN. Cellular-only join is out of scope for this MVP.
