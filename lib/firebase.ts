import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from "firebase/firestore";

// NEXT_PUBLIC_* values are inlined at build time, so each one must be referenced literally.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true";
// Leave unset to use the project's "(default)" Firestore database.
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || undefined;

/** When false the app runs fully offline and keeps auctions in this browser's localStorage. */
export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let services: { app: FirebaseApp; auth: Auth; db: Firestore } | undefined;

export function getFirebase() {
  if (!firebaseEnabled || typeof window === "undefined") return undefined;
  if (!services) {
    const app = getApps()[0] ?? initializeApp(config);
    // Optional fields such as player.team are often undefined; let Firestore skip them.
    const db = databaseId
      ? initializeFirestore(app, { ignoreUndefinedProperties: true }, databaseId)
      : initializeFirestore(app, { ignoreUndefinedProperties: true });
    const auth = getAuth(app);
    if (useEmulator) {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    services = { app, auth, db };
  }
  return services;
}
