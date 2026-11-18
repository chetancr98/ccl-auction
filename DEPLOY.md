# Firebase + Vercel setup

## How the app uses Firebase

- **Config present** (`NEXT_PUBLIC_FIREBASE_*` set): auctions are stored in Firestore
  and update live on every screen, including the lot on the block and each bid.
  Anyone can watch; only signed-in **admins** can create, edit, delete or run bidding.
  Signed-out visitors see a read-only view and an **Admin sign in** button.
- **No config**: the app runs exactly as before, saving to this browser's
  `localStorage`, with everyone treated as admin. Handy for offline testing.
- **Moving existing data**: auctions you created on a device before Firebase was
  configured show a banner after an admin signs in: **Upload to Firebase** or
  **Discard**.

Code: `lib/firebase.ts` (setup), `lib/store.ts` (reads, writes, sign-in),
`lib/types.ts` (data shapes).

---

## Part 1 — Create the Firebase database

### 1. Create the project
1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it (e.g. `ccl-auctions`). Google Analytics is optional — you can turn it off.
3. Stay on the free **Spark** plan; it is enough for this app.

### 2. Register the web app and copy the config
1. In the project overview click the **Web** icon (`</>`).
2. Nickname: `ccl-auctions-web`. Leave "Firebase Hosting" unticked (we use Vercel).
3. Firebase shows a `firebaseConfig` object. Keep these six values — they go into
   environment variables:

   | firebaseConfig key   | Environment variable                         |
   |----------------------|----------------------------------------------|
   | `apiKey`             | `NEXT_PUBLIC_FIREBASE_API_KEY`               |
   | `authDomain`         | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`           |
   | `projectId`          | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`            |
   | `storageBucket`      | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`        |
   | `messagingSenderId`  | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`   |
   | `appId`              | `NEXT_PUBLIC_FIREBASE_APP_ID`                |

   For local development put them in a file named `.env.local` in the project
   root (already git-ignored by the `.env*` line in `.gitignore`):

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

   These web keys are not secrets (they ship to every browser); the
   **security rules** below are what protect the data.

### 3. Create the Firestore database
1. Left menu → **Build → Firestore Database → Create database**.
2. Location: pick the region closest to your players, e.g. `asia-south1 (Mumbai)`.
   This cannot be changed later.
3. Start in **production mode** (everything locked), then set rules in step 5.

### 4. Turn on admin sign-in
1. **Build → Authentication → Get started**.
2. Enable **Google** and **Email/Password** (Sign-in method tab).
   - Google sign-in uses a popup, which does **not** work inside the Android
     (Capacitor) app. Admins should use email/password there.
   - For email/password admins, create the account yourself under
     **Authentication → Users → Add user** (the app has no public sign-up).
3. Start the app (`npm run dev`), click **Admin sign in**, sign in once, then copy
   your user **UID** from **Authentication → Users**. You'll show as "Viewer" until
   step 4 is done; sign out and back in afterwards.
4. In Firestore, create a collection `admins` with a document whose ID is that UID
   (any field, e.g. `name: "Your name"`). Everyone listed in `admins` can create,
   edit and delete auctions.

### 5. Security rules
**Firestore Database → Rules**, paste and **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // Anyone can watch auctions live; only admins can change or delete them.
    match /auctions/{auctionId} {
      allow read: if true;
      allow write: if isAdmin();

      match /{sub=**} {
        allow read: if true;
        allow write: if isAdmin();
      }
    }

    match /admins/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false; // manage admins from the console only
    }
  }
}
```

### 6. Data layout (created automatically by the app)
Firestore documents are limited to 1 MB, and player photos are stored as
compressed images, so each player gets its own document:

```
auctions/{auctionId}                 rules, createdAt, live (current lot + bids)
auctions/{auctionId}/teams/{teamId}  name, owner, short, color, purse, spent, slots
auctions/{auctionId}/players/{id}    name, role, age, base, status, team, price, photo
auctions/{auctionId}/events/{id}     kind, message, playerId, teamId, amount, at
```

Photos are already compressed to ~360 px in the app (roughly 20–40 KB each), so
they fit inside player documents on the free plan. (Firebase Storage would need
the paid Blaze plan.)

---

### 7. Photos from Google Form uploads (one-time setup)

Files uploaded through a Google Form are private to the form owner, so the app downloads them
with the owner's permission (**Builder → Bulk player import → Load photos from Google Drive**).
This needs the Google Drive API switched on once for the Firebase project:

1. Open <https://console.cloud.google.com/apis/library/drive.googleapis.com?project=ccl-auction-f5c1f>
   (signed in with the account that owns the Firebase project) and click **Enable**.
2. Open **Google Auth Platform → Audience** (or **APIs & Services → OAuth consent screen**):
   - If **Publishing status** is **Testing**, add the Google account that owns the form under
     **Test users**.
   - Read-only Drive access is a sensitive permission, so Google may show
     **"Google hasn't verified this app"** the first time. Click **Advanced → Go to … (unsafe)**;
     this is your own project, and the app only reads files.
3. In the app: sign in as admin, import the form's Excel/CSV, click **Load photos from Google Drive**,
   choose the Google account that owns the form, allow **See and download your Google Drive files**,
   then click **Save auction**.

The app stores a compressed copy of each photo with the player; nothing in Drive is changed or
made public. Admins who normally sign in with email/password get Google linked to their account.

## Part 2 — Deploy on Vercel

The project is a static Next.js export (`output: "export"` in `next.config.ts`),
which Vercel supports out of the box.

### 1. Put the code on GitHub
The project uses npm (`package-lock.json`), so Vercel installs the same versions you tested.

```bash
git add -A
git commit -m "Prepare for Vercel deploy"
git push origin main
```

### 2. Import into Vercel
1. Sign in at <https://vercel.com> with GitHub.
2. **Add New → Project** → pick this repository → **Import**.
3. Framework preset: **Next.js** (auto-detected). Leave build command and output
   directory on their defaults.
4. If the repo contains more than this app, set **Root Directory** to the folder
   that holds `package.json`.
5. Open **Environment Variables** and add the six `NEXT_PUBLIC_FIREBASE_*` values
   from Part 1, step 2, plus `NEXT_PUBLIC_FIREBASE_DATABASE_ID` if your Firestore
   database is not named `(default)` (this project uses `ccl-aution`). Without them the live site falls back to per-browser
   storage. If you add or change them later, redeploy: they are baked in at build time.
6. Click **Deploy**. You get a URL like `https://ccl-auctions.vercel.app`.

Every push to `main` redeploys automatically; pushes to other branches get
preview URLs.

### 3. Allow the Vercel domain in Firebase
Firebase console → **Authentication → Settings → Authorized domains → Add domain**
→ `ccl-auctions.vercel.app` (and any custom domain). Without this, Google sign-in
fails on the live site.

### Alternative: deploy from the terminal
```bash
npx vercel
```
then `npx vercel --prod` for production. Add env vars with `npx vercel env add`.
