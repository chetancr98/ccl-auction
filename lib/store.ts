import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, writeBatch, type Firestore, type WriteBatch } from "firebase/firestore";
import { getFirebase } from "./firebase";
import type { Auction, AuctionEvent, Player, Team } from "./types";

/*
 * Firestore layout (one document per item keeps every document well under the 1 MB limit,
 * even with compressed player photos):
 *
 *   auctions/{auctionId}                 rules, createdAt, live
 *   auctions/{auctionId}/teams/{id}      Team + order
 *   auctions/{auctionId}/players/{id}    Player + order
 *   auctions/{auctionId}/events/{id}     AuctionEvent + order
 */

const SUBCOLLECTIONS = ["teams", "players", "events"] as const;
type Sub = (typeof SUBCOLLECTIONS)[number];
type Item = { id: string };
type AuctionDoc = Pick<Auction, "rules" | "createdAt" | "live">;

const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch.

function requireDb(): Firestore {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase is not configured.");
  return fb.db;
}

const auctionDoc = (auction: Auction): AuctionDoc => ({ rules: auction.rules, createdAt: auction.createdAt, live: auction.live });
const subItems = (auction: Auction | undefined, sub: Sub): Item[] =>
  !auction ? [] : sub === "teams" ? auction.teams : sub === "players" ? auction.players : auction.history;

const withoutOrder = <T,>(data: Record<string, unknown>, id: string) => {
  const { order: _order, ...rest } = data;
  return { ...rest, id } as T;
};

// Firestore also rejects a single commit over ~10 MB. Player photos are ~50–100 KB each, so a save
// with hundreds of photos is split by size as well as by count.
const BATCH_BYTES = 6 * 1024 * 1024;

type Op = { apply: (batch: WriteBatch) => void; bytes: number };
const op = (apply: (batch: WriteBatch) => void, data?: unknown): Op => ({ apply, bytes: data === undefined ? 200 : JSON.stringify(data).length + 200 });

/** Splits writes into commits of at most BATCH_LIMIT writes and about BATCH_BYTES each. */
export function splitIntoBatches<T extends { bytes: number }>(ops: T[], maxCount = BATCH_LIMIT, maxBytes = BATCH_BYTES) {
  const batches: T[][] = [];
  let chunk: T[] = [];
  let bytes = 0;
  for (const item of ops) {
    if (chunk.length && (chunk.length >= maxCount || bytes + item.bytes > maxBytes)) {
      batches.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(item);
    bytes += item.bytes;
  }
  if (chunk.length) batches.push(chunk);
  return batches;
}

async function commitInChunks(db: Firestore, ops: Op[]) {
  for (const chunk of splitIntoBatches(ops)) {
    const batch = writeBatch(db);
    chunk.forEach((item) => item.apply(batch));
    await batch.commit();
  }
}

/** Live view of every auction. Returns an unsubscribe function. */
export function subscribeAuctions(onChange: (auctions: Auction[]) => void, onError: (error: Error) => void) {
  const db = requireDb();
  type Entry = { data?: AuctionDoc; teams: Team[]; players: Player[]; events: AuctionEvent[]; unsubs: (() => void)[] };
  const entries = new Map<string, Entry>();

  const emit = () => {
    const auctions: Auction[] = [];
    entries.forEach((entry, id) => {
      if (!entry.data) return;
      auctions.push({ id, ...entry.data, teams: entry.teams, players: entry.players, history: entry.events });
    });
    auctions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    onChange(auctions);
  };

  const listen = (id: string, entry: Entry, sub: Sub) =>
    onSnapshot(
      collection(db, "auctions", id, sub),
      (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ order: Number(item.data().order) || 0, value: item.data(), id: item.id }))
          .sort((a, b) => a.order - b.order)
          .map(({ value, id: itemId }) => withoutOrder<never>(value, itemId));
        if (sub === "teams") entry.teams = items;
        else if (sub === "players") entry.players = items;
        else entry.events = items;
        emit();
      },
      onError,
    );

  const stopTop = onSnapshot(
    collection(db, "auctions"),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === "removed") {
          entries.get(id)?.unsubs.forEach((stop) => stop());
          entries.delete(id);
          return;
        }
        let entry = entries.get(id);
        if (!entry) {
          entry = { teams: [], players: [], events: [], unsubs: [] };
          entries.set(id, entry);
          const created = entry;
          created.unsubs = SUBCOLLECTIONS.map((sub) => listen(id, created, sub));
        }
        entry.data = change.doc.data() as AuctionDoc;
      });
      emit();
    },
    onError,
  );

  return () => {
    stopTop();
    entries.forEach((entry) => entry.unsubs.forEach((stop) => stop()));
    entries.clear();
  };
}

/** Writes only what changed between `previous` (what is stored) and `next`. */
export async function saveAuction(previous: Auction | undefined, next: Auction) {
  const db = requireDb();
  const ops: Op[] = [];

  const nextDoc = auctionDoc(next);
  if (!previous || JSON.stringify(auctionDoc(previous)) !== JSON.stringify(nextDoc)) {
    ops.push(op((batch) => batch.set(doc(db, "auctions", next.id), nextDoc), nextDoc));
  }

  for (const sub of SUBCOLLECTIONS) {
    const before = new Map(subItems(previous, sub).map((item, order) => [item.id, JSON.stringify({ ...item, order })]));
    subItems(next, sub).forEach((item, order) => {
      const data = { ...item, order };
      if (before.get(item.id) !== JSON.stringify(data)) {
        ops.push(op((batch) => batch.set(doc(db, "auctions", next.id, sub, item.id), data), data));
      }
      before.delete(item.id);
    });
    before.forEach((_, id) => ops.push(op((batch) => batch.delete(doc(db, "auctions", next.id, sub, id)))));
  }

  await commitInChunks(db, ops);
}

/** Deletes the auction and everything under it (Firestore does not cascade deletes). */
export async function deleteAuction(id: string) {
  const db = requireDb();
  const ops: Op[] = [];
  for (const sub of SUBCOLLECTIONS) {
    const snapshot = await getDocs(collection(db, "auctions", id, sub));
    snapshot.docs.forEach((item) => ops.push(op((batch) => batch.delete(item.ref))));
  }
  ops.push(op((batch) => batch.delete(doc(db, "auctions", id))));
  await commitInChunks(db, ops);
}

export type AuthState = { user: User | null; isAdmin: boolean; ready: boolean };

/** Admins are users whose UID has a document in the `admins` collection. */
export function watchAuth(onChange: (state: AuthState) => void) {
  const fb = getFirebase();
  if (!fb) {
    onChange({ user: null, isAdmin: true, ready: true });
    return () => {};
  }
  return onAuthStateChanged(fb.auth, async (user) => {
    if (!user) {
      onChange({ user: null, isAdmin: false, ready: true });
      return;
    }
    try {
      const admin = await getDoc(doc(fb.db, "admins", user.uid));
      onChange({ user, isAdmin: admin.exists(), ready: true });
    } catch {
      onChange({ user, isAdmin: false, ready: true });
    }
  });
}

export async function signInWithGoogle() {
  const fb = getFirebase();
  if (!fb) return;
  await signInWithPopup(fb.auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string) {
  const fb = getFirebase();
  if (!fb) return;
  await signInWithEmailAndPassword(fb.auth, email, password);
}

export async function signOut() {
  const fb = getFirebase();
  if (fb) await firebaseSignOut(fb.auth);
}
