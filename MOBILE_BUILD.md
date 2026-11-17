# Mobile And Laptop Builds

This project supports two installable options:

- PWA for Android phones and laptops.
- Android APK through Capacitor.

## First-Time Setup

Install the new Capacitor packages:

```bash
npm install
```

## PWA

Build the static app:

```bash
npm run pwa:build
```

The static output is generated in `out`.

To install as an app, open the hosted app in Chrome or Edge and choose **Install app**. Android users can use **Add to Home screen**.

## Android APK

Install Android Studio first, including the Android SDK.

Create the Android project once:

```bash
npm run android:add
```

After every app change, sync the latest web build into Android:

```bash
npm run android:sync
```

Open Android Studio:

```bash
npm run android:open
```

Build a debug APK directly:

```bash
npm run android:apk
```

The debug APK will be under:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For Play Store or production sharing, create a signed release build from Android Studio.

## Data Note

When the `NEXT_PUBLIC_FIREBASE_*` variables are set at build time, every install (web, PWA, APK) shares the same live Firestore data. In the Android app, admins should sign in with email/password, because Google sign-in popups do not work inside the app. See DEPLOY.md.
