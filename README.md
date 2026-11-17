# CCL Auctions

A live cricket player-auction app for the CCL family, built with Next.js and Firebase.

## Features

- **Live auction room** in a broadcast style: player on stage, animated current bid, bid ladder, team paddles with
  purse and squad checks, SOLD / UNSOLD moments, results ticker and a full-screen **Big screen** mode for a projector or TV
- **Real-time sync** through Firestore: every screen sees the same lot, bids and results
- **Admins vs. viewers**: anyone can watch; only admins (listed in Firestore) can build auctions and run bidding
- **Auction builder**: rules in points, a default base price applied to every player, team colours, and bulk import
  (CSV/JSON with `name, role, age, photo` plus image files)
- **Re-auction** unsold players, undo bids, delete auctions
- Dashboard with top buys, purse race and activity; player registry with filters; light and dark themes
- Works on phones (bottom tab bar), as an installable PWA, and as an Android app via Capacitor

## Run locally

Install Node.js 20+, then:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Without Firebase settings the app runs in local mode and saves to the browser. To use Firebase, create `.env.local`
with the `NEXT_PUBLIC_FIREBASE_*` values described in [DEPLOY.md](DEPLOY.md), then restart `npm run dev`.

## Production build

```bash
npm run build
```

This creates a static export in `out/`.

## Deploy

Firebase setup, security rules, admin accounts and Vercel deployment: see [DEPLOY.md](DEPLOY.md).
Android/PWA builds: see [MOBILE_BUILD.md](MOBILE_BUILD.md).

## Project layout

```text
app/
  page.tsx               app shell, sign-in, auction builder
  components/room.tsx    live auction room
  components/views.tsx   dashboard, overview, registry, squads
  components/ui.tsx      shared UI pieces
  layout.tsx, globals.css
lib/
  firebase.ts            Firebase setup (falls back to local mode when unset)
  store.ts               Firestore reads/writes and sign-in
  types.ts, format.ts
public/sw.js             offline cache (network-first)
```
