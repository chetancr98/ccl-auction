import { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup, signInWithPopup, type UserCredential } from "firebase/auth";
import { getFirebase } from "./firebase";

/*
 * Google Form uploads live privately in the form owner's Drive, so a plain link cannot be shown
 * to everyone. Instead an admin grants read-only Drive access once; the app downloads each photo
 * with that access and stores a compressed copy with the player.
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Asks the signed-in admin (via a Google popup) for read-only Drive access and returns a short-lived token. */
export async function requestDriveAccess() {
  const fb = getFirebase();
  if (!fb) throw new Error("Loading Drive photos needs Firebase sign-in. Add the Firebase settings first.");

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  const user = fb.auth.currentUser;
  if (user?.email) provider.setCustomParameters({ login_hint: user.email });

  let result: UserCredential;
  try {
    if (!user) result = await signInWithPopup(fb.auth, provider);
    // Keep the same app account: re-confirm a Google sign-in, or attach Google to an email/password admin.
    else if (user.providerData.some((item) => item.providerId === "google.com")) result = await reauthenticateWithPopup(user, provider);
    else result = await linkWithPopup(user, provider);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code.includes("popup-closed") || code.includes("cancelled")) throw new Error("Google sign-in was closed before finishing.");
    if (code.includes("popup-blocked")) throw new Error("The browser blocked the Google popup. Allow popups for this site and try again.");
    if (code.includes("credential-already-in-use"))
      throw new Error("That Google account is already used by another app login. Sign out, sign in with that Google account, and try again.");
    if (code.includes("user-mismatch")) throw new Error("Pick the same Google account you are signed in with.");
    throw error;
  }

  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error("Google did not grant Drive access. Please allow “See and download your Google Drive files”.");
  return token;
}

export class DriveFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Downloads one Drive file's bytes using the admin's token. */
export async function downloadDriveFile(id: string, token: string) {
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
    throw new DriveFileError("The Google Drive API is not enabled for this Firebase project yet (see DEPLOY.md).", 403);
  if (response.status === 404) throw new DriveFileError("not found, or this Google account cannot open it", 404);
  if (response.status === 401) throw new DriveFileError("Google access expired; run Load photos again", 401);
  throw new DriveFileError(reason || `Drive returned ${response.status}`, response.status);
}
