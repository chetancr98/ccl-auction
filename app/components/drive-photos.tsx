"use client";

import { CloudDownload, ImageOff } from "lucide-react";
import { useRef, useState } from "react";
import { DriveFileError, downloadDriveFile, requestDriveAccess, toBrowserImage } from "@/lib/drive";
import { compressImage } from "@/lib/image";
import { driveFileId } from "@/lib/playerImport";
import type { Auction } from "@/lib/types";

/** Players whose photo is still a Google Drive link (only Drive owners can see those). */
export const drivePhotoPlayers = (auction?: Auction) => (auction?.players ?? []).filter((player) => player.photo && driveFileId(player.photo));

/**
 * Shown to admins on every page while any player's photo is still a private Google Drive link.
 * One click (with a Google account that can open the files) downloads every photo, shrinks it and
 * stores it in the app's database, so everyone can see it.
 */
export function DrivePhotoBanner({ auction, onPhotos }: { auction: Auction; onPhotos: (auctionId: string, photos: Map<string, string>) => void }) {
  const pending = drivePhotoPlayers(auction);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  const stop = useRef(false);

  if (!pending.length && !message) return null;

  const run = async () => {
    const targets = drivePhotoPlayers(auction);
    if (!targets.length) return;
    stop.current = false;
    setBusy(true);
    setFailures([]);
    setMessage("Choose a Google account that can open the photos…");

    // Every photo loaded so far; each save sends all of them, so no round can undo another.
    const loaded = new Map<string, string>();
    let unsaved = 0;
    const failed: string[] = [];
    let fatal: string | undefined;
    const flush = () => {
      if (!unsaved) return;
      unsaved = 0;
      onPhotos(auction.id, new Map(loaded));
    };

    try {
      const access = await requestDriveAccess();
      const who = access.email ? ` as ${access.email}` : "";
      const queue = [...targets];
      let done = 0;
      setMessage(`Saving photos${who}… 0/${targets.length}`);
      const worker = async () => {
        while (queue.length && !stop.current && !fatal) {
          const player = queue.shift()!;
          try {
            const blob = await downloadDriveFile(driveFileId(player.photo!)!, access.token);
            loaded.set(player.id, await compressImage(await toBrowserImage(blob)));
            unsaved += 1;
            if (unsaved >= 20) flush();
          } catch (error) {
            const text = error instanceof Error ? error.message : "error";
            if (error instanceof DriveFileError && (error.status === 401 || text.includes("not enabled"))) fatal = text;
            else failed.push(`${player.name}: ${text}`);
          }
          done += 1;
          setMessage(`Saving photos${who}… ${done}/${targets.length}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker));
      flush();

      const left = targets.length - loaded.size - failed.length;
      setFailures(failed);
      setMessage(
        [
          fatal ?? (stop.current ? "Stopped." : ""),
          `Saved ${loaded.size} of ${targets.length} photos to the app${who}. Everyone can see them now.`,
          failed.length ? `${failed.length} could not be loaded (see the list).` : "",
          left > 0 ? `${left} not done yet; click the button again to continue.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (error) {
      flush();
      setMessage(error instanceof Error ? error.message : "Could not load photos from Google Drive.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-2">
          <ImageOff size={18} className="mt-0.5 shrink-0 text-gold" />
          <span>
            {pending.length ? (
              <>
                <b>{pending.length === 1 ? "1 player photo is still a Google Drive link" : `${pending.length} player photos are still Google Drive links`}</b>{" "}
                in “{auction.rules.name}”. Only people with Drive access can see {pending.length === 1 ? "it" : "them"}. Save them into the app so everyone can.
              </>
            ) : (
              <b>All Drive photos are saved in the app.</b>
            )}
          </span>
        </p>
        <span className="flex gap-2">
          {pending.length > 0 && (
            <button
              onClick={run}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              <CloudDownload size={16} /> {busy ? "Saving…" : "Save photos to the app"}
            </button>
          )}
          {busy && (
            <button
              onClick={() => {
                stop.current = true;
              }}
              className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold transition hover:bg-white/15"
            >
              Stop
            </button>
          )}
          {!busy && !pending.length && (
            <button onClick={() => setMessage("")} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">
              Dismiss
            </button>
          )}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        In the Google popup, pick an account that can open the form&apos;s uploads (one of the owners) and allow Drive access. Your admin login stays as it is.
      </p>
      {message && <p className="mt-2 text-xs leading-5 text-slate-200">{message}</p>}
      {failures.length > 0 && (
        <details className="mt-2 text-xs text-slate-300">
          <summary className="cursor-pointer font-bold text-rose-300">Photos that could not be loaded ({failures.length})</summary>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5">
            {failures.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
