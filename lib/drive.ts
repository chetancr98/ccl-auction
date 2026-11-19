import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getDriveHelperAuth } from "./firebase";
import { compressImage } from "./image";

/*
 * Google Form uploads live privately in the form owners' Drive, so a Drive link cannot be shown
 * to everyone. During import, an owner grants read-only Drive access once; the app downloads every
 * photo with that access and stores a compressed copy with the player in the database.
 *
 * The Google sign-in here is separate from the admin's app login (see getDriveHelperAuth), so any
 * admin can borrow either owner account's access without being logged out.
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type DriveAccess = { token: string; email: string | null };

/**
 * Gets the separate Google sign-in ready ahead of time. Browsers only allow a popup straight after
 * a click, so if this preparation happened during the click the popup could be blocked silently.
 */
export async function prepareDriveAccess() {
  const auth = getDriveHelperAuth();
  if (auth) await auth.authStateReady();
}

/** Opens a Google popup (with an account chooser) and returns a short-lived read-only Drive token. */
export async function requestDriveAccess(): Promise<DriveAccess> {
  const auth = getDriveHelperAuth();
  if (!auth) throw new Error("Loading Drive photos needs Firebase. Add the Firebase settings first.");

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    const email = result.user.email;
    // The token keeps working after this; signing out just drops the helper session.
    await signOut(auth);
    if (!token) throw new Error("Google did not grant Drive access. Please allow “See and download your Google Drive files”.");
    return { token, email };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code.includes("popup-closed") || code.includes("cancelled")) throw new Error("Google sign-in was closed before finishing.");
    if (code.includes("popup-blocked")) throw new Error("The browser blocked the Google popup. Allow popups for this site and try again.");
    if (code.includes("unauthorized-domain")) throw new Error("This web address is not in Firebase → Authentication → Authorized domains yet.");
    if (code.includes("operation-not-supported")) throw new Error("This screen can't open Google sign-in (e.g. the installed app). Open the site in Chrome and try again.");
    throw error;
  }
}

export class DriveFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when retrying the same file later could work (rate limits, server hiccups). */
    readonly retryable = false,
  ) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOnce(id: string, token: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) return response.blob();

  let reason = "";
  try {
    const body = await response.json();
    reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? "";
  } catch {
    // Body was not JSON; the status code is enough.
  }
  if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reason))
    throw new DriveFileError("The Google Drive API is not enabled for this Firebase project yet (see DEPLOY.md, section 7).", 403);
  if (response.status === 429 || response.status >= 500 || /rateLimit|userRateLimit|backendError/i.test(reason))
    throw new DriveFileError("Google is busy (rate limit)", response.status, true);
  if (response.status === 404) throw new DriveFileError("not found, or this Google account cannot open it", 404);
  if (response.status === 403) throw new DriveFileError("this Google account has no access to it", 403);
  if (response.status === 401) throw new DriveFileError("Google access expired; import the file again to continue", 401);
  throw new DriveFileError(reason || `Drive returned ${response.status}`, response.status);
}

/** Downloads one Drive file's bytes, retrying rate limits and temporary errors with back-off. */
async function downloadDriveFile(id: string, token: string, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchOnce(id, token);
    } catch (error) {
      const retry = error instanceof DriveFileError ? error.retryable : error instanceof TypeError; // TypeError = network blip
      if (!retry || attempt >= attempts) throw error;
      await wait(1000 * 2 ** (attempt - 1) + Math.random() * 400);
    }
  }
}

/** iPhone photos (HEIC/HEIF) cannot be drawn by most browsers; convert them to JPEG first. */
async function toBrowserImage(blob: Blob) {
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const brand = String.fromCharCode(...head.slice(4, 12));
  const isHeic = /heic|heif/i.test(blob.type) || /ftyp(heic|heix|hevc|heim|heis|mif1|msf1)/.test(brand);
  if (!isHeic) return blob;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
  return Array.isArray(converted) ? converted[0] : converted;
}

export type DrivePhotoJob = { key: string; fileId: string; label: string };

/**
 * Downloads and shrinks many Drive photos (6 at a time) with one access token.
 * Returns the finished photos by key and a reason for each one that failed. Stops early when
 * `shouldStop` says so or when a problem affects every file (expired access, Drive API disabled).
 */
export async function downloadDrivePhotos(
  jobs: DrivePhotoJob[],
  token: string,
  { onProgress, shouldStop }: { onProgress?: (done: number) => void; shouldStop?: () => boolean } = {},
) {
  const photos = new Map<string, string>();
  const failures: string[] = [];
  let fatal: string | undefined;
  let done = 0;
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length && !fatal && !shouldStop?.()) {
      const job = queue.shift()!;
      try {
        photos.set(job.key, await compressImage(await toBrowserImage(await downloadDriveFile(job.fileId, token))));
      } catch (error) {
        const message = error instanceof Error ? error.message : "error";
        if (error instanceof DriveFileError && (error.status === 401 || message.includes("not enabled"))) fatal = message;
        else failures.push(`${job.label}: ${message}`);
      }
      done += 1;
      onProgress?.(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
  return { photos, failures, fatal };
}
