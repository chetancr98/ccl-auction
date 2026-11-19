"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  Gavel,
  Home,
  ImageDown,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Radio,
  Sun,
  Trash2,
  Trophy,
  Wrench,
} from "lucide-react";

import { DriveFileError, downloadDriveFile, requestDriveAccess, toBrowserImage } from "@/lib/drive";
import { firebaseEnabled } from "@/lib/firebase";
import { deleteAuction as deleteRemoteAuction, saveAuction, signInWithEmail, signInWithGoogle, signOut, subscribeAuctions, watchAuth, type AuthState } from "@/lib/store";
import { canonicalRole, money, points, ROLES } from "@/lib/format";
import { detectColumns, driveFileId, isLink, normalizeRole, parseAge, photoFromLink, readSpreadsheet, tidyName } from "@/lib/playerImport";
import type { Auction, IncrementTier, Player, Rules, Team } from "@/lib/types";
import { Room } from "./components/room";
import { Empty, Input, Item, List, Panel, PlayerPhoto, TeamCrest } from "./components/ui";
import { Results } from "./components/results";
import { Dashboard } from "./components/views";

type Theme = "dark" | "light";

const emptyRules: Rules = {
  name: "",
  minimumBid: 10,
  increment: 5,
  basePrice: 10,
  maxSlots: 10,
  scheduledAt: "",
};

const DEFAULT_PURSE = "1000";
// Distinct, high-contrast team colours; new teams get the next unused one.
const TEAM_COLORS = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#6366f1", "#84cc16"];
const nextTeamColor = (used: Team[]) => TEAM_COLORS.find((color) => !used.some((team) => team.color === color)) ?? TEAM_COLORS[used.length % TEAM_COLORS.length];
const tabs = ["dashboard", "room", "registry", "builder"] as const;
const defaultPlayerForm = { name: "", role: "Batter", age: "20", base: "10", runs: "0", wickets: "0", photo: "" };
const withDefaults = (rules?: Partial<Rules>): Rules => ({
  ...emptyRules,
  ...rules,
  basePrice: rules?.basePrice ?? rules?.minimumBid ?? emptyRules.basePrice,
});

const normalizeFileName = (value = "") => value.trim().replace(/\\/g, "/").split("/").pop()?.toLowerCase() || "";

const readTextFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

// Player photos: JPEG keeps them small (640px is sharp on the big stage card and well under
// Firestore's 1 MB document limit). Team logos: PNG keeps transparent backgrounds.
const compressImage = (file: Blob & { name?: string }, maxSize = 640, quality = 0.72, type: "image/jpeg" | "image/png" = "image/jpeg") =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not prepare image"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(type, quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name ?? "image"} (unsupported format such as HEIC?)`));
    };
    image.src = url;
  });

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);

  const [headers = [], ...data] = rows;
  const keys = headers.map((header) => header.toLowerCase());
  return data.map((values) =>
    keys.reduce<Record<string, string>>((acc, key, index) => {
      acc[key] = values[index] || "";
      return acc;
    }, {}),
  );
};

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("dashboard");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [active, setActive] = useState<string>();
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);
  const [loaded, setLoaded] = useState(!firebaseEnabled);
  const [authState, setAuthState] = useState<AuthState>({ user: null, isAdmin: !firebaseEnabled, ready: !firebaseEnabled });
  const [syncError, setSyncError] = useState<string>();
  // Auctions saved in this browser before Firebase was configured, waiting to be uploaded.
  const [deviceAuctions, setDeviceAuctions] = useState<Auction[]>([]);
  // Last state reported by Firestore (including this device's pending writes); used to diff saves.
  const stored = useRef<Auction[]>([]);
  const canEdit = authState.isAdmin;

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("ccl-auction-v5") || "{}");
      if (firebaseEnabled) setDeviceAuctions(data.auctions || []);
      else setAuctions(data.auctions || []);
      setActive(data.active);
      setTheme(data.theme === "light" ? "light" : "dark");
    } catch {
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => watchAuth(setAuthState), []);

  useEffect(() => {
    if (!firebaseEnabled || loaded) return;
    // Firestore retries silently when it cannot reach the database, so tell the user after a while.
    const timer = window.setTimeout(
      () =>
        setSyncError(
          `Still connecting to Firebase. Check that the Firestore database "${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)"}" exists in project "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}" and that you are online. The browser console has details.`,
        ),
      12000,
    );
    return () => window.clearTimeout(timer);
  }, [loaded]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return subscribeAuctions(
      (next) => {
        stored.current = next;
        setAuctions(next);
        setLoaded(true);
        setSyncError((current) => (current?.startsWith("Still connecting") ? undefined : current));
      },
      (error) => {
        setLoaded(true);
        setSyncError(`Could not load auctions from Firebase: ${error.message}`);
      },
    );
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // In development a service worker would serve stale code, so remove any that is registered.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
      return;
    }
    const canRegisterWorker = window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (canRegisterWorker) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Could not register service worker", error);
      });
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      // With Firebase the auctions live in Firestore; only per-device preferences stay here.
      const local = firebaseEnabled ? deviceAuctions : auctions;
      localStorage.setItem("ccl-auction-v5", JSON.stringify({ auctions: local, active, theme }));
    } catch (error) {
      console.warn("Could not save auction data. Try using fewer or smaller player photos.", error);
    }
  }, [auctions, deviceAuctions, active, theme, hydrated]);

  const reportWriteError = (error: unknown) => {
    setAuctions(stored.current);
    setSyncError(`Could not save to Firebase: ${error instanceof Error ? error.message : String(error)}`);
  };

  const auction = auctions.find((x) => x.id === active);
  const save = (next: Auction) => {
    setAuctions((current) => current.map((item) => (item.id === next.id ? next : item)));
    if (firebaseEnabled) {
      saveAuction(
        stored.current.find((item) => item.id === next.id),
        next,
      ).catch(reportWriteError);
    }
  };
  const create = (next: Auction) => {
    setAuctions((current) => [...current, next]);
    setActive(next.id);
    if (firebaseEnabled) saveAuction(undefined, next).catch(reportWriteError);
  };
  const open = (id: string, view: "dashboard" | "room" = "dashboard") => {
    setActive(id);
    setTab(view);
  };
  const newAuction = () => {
    setActive(undefined);
    setTab("builder");
  };
  const deleteAuction = (id: string) => {
    const target = auctions.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`Delete "${target.rules.name}"? All its teams, players and bid history will be removed. This cannot be undone.`)) return;
    setAuctions((current) => current.filter((item) => item.id !== id));
    if (firebaseEnabled) deleteRemoteAuction(id).catch(reportWriteError);
    if (active === id) {
      setActive(undefined);
      setTab("dashboard");
    }
  };
  const anyLive = auctions.some((item) => item.live?.running);
  const visibleTabs = tabs.filter((item) => item !== "builder" || canEdit);
  const uploadDeviceAuctions = async () => {
    try {
      for (const item of deviceAuctions) {
        await saveAuction(undefined, { ...item, rules: withDefaults(item.rules) });
      }
      setDeviceAuctions([]);
    } catch (error) {
      reportWriteError(error);
    }
  };

  return (
    <main data-theme={theme} className="app-theme min-h-screen overflow-hidden">
      <div className="app-backdrop pointer-events-none fixed inset-0" />
      <header className="app-header sticky top-0 z-30 border-b backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => setTab("dashboard")} className="group flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-gold to-orange-500 text-slate-950 shadow-[0_8px_24px_-6px_rgba(255,202,95,.7)] transition group-hover:rotate-[-8deg]">
              <Gavel size={20} />
            </span>
            <span className="text-left leading-none">
              <span className="block font-display text-xl font-bold tracking-wider">CCL</span>
              <span className="block text-[10px] font-bold uppercase tracking-[.3em] text-slate-400">Auctions</span>
            </span>
          </button>
          <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/[.04] p-1 md:flex">
            {visibleTabs.map((item) => (
              <NavButton key={item} tab={item} active={tab === item} live={item === "room" && anyLive} onClick={() => setTab(item)} />
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="theme-toggle grid h-10 w-10 place-items-center rounded-2xl border transition hover:-translate-y-0.5"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {firebaseEnabled && <AuthMenu state={authState} />}
          </div>
        </div>
      </header>
      {/* Bottom tab bar on phones */}
      <nav className="app-header fixed inset-x-0 bottom-0 z-40 flex justify-around border-t px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-2xl md:hidden">
        {visibleTabs.map((item) => (
          <NavButton key={item} tab={item} active={tab === item} live={item === "room" && anyLive} onClick={() => setTab(item)} compact />
        ))}
      </nav>
      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 md:py-8">
        {syncError && (
          <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <span>{syncError}</span>
            <button onClick={() => setSyncError(undefined)} className="shrink-0 text-xs font-bold underline">
              Dismiss
            </button>
          </div>
        )}
        {canEdit && deviceAuctions.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <span>
              {deviceAuctions.length} auction{deviceAuctions.length === 1 ? " is" : "s are"} saved only on this device from before Firebase was connected.
            </span>
            <span className="flex gap-2">
              <button onClick={uploadDeviceAuctions} className="rounded-xl bg-gold px-3 py-2 text-xs font-black text-slate-950">
                Upload to Firebase
              </button>
              <button
                onClick={() => window.confirm("Discard the auctions saved on this device? This cannot be undone.") && setDeviceAuctions([])}
                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"
              >
                Discard
              </button>
            </span>
          </div>
        )}
        {!loaded ? (
          <Empty text="Loading auctions…" />
        ) : (
          <>
            {tab === "dashboard" && <Dashboard auctions={auctions} active={auction} canEdit={canEdit} onOpen={open} onNew={newAuction} onDelete={deleteAuction} />}
            {tab === "builder" &&
              (canEdit ? (
                <Builder key={active || "new"} auction={auction} onCreate={create} onSave={save} onDelete={deleteAuction} />
              ) : (
                <Empty text="Only admins can build or edit auctions. Sign in with an admin account to continue." />
              ))}
            {tab === "registry" && <Results auction={auction} />}
            {tab === "room" && <Room auction={auction} canEdit={canEdit} onSave={save} />}
          </>
        )}
      </div>
    </main>
  );
}

/** "From X points, raise by Y" rows that make the bid increment grow as the price climbs. */
function IncrementTiersEditor({ rules, onChange }: { rules: Rules; onChange: (tiers: IncrementTier[]) => void }) {
  const tiers = rules.incrementTiers ?? [];
  const update = (index: number, patch: Partial<IncrementTier>) => onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  const add = () => {
    const last = tiers[tiers.length - 1];
    const from = last ? last.from * 2 : Math.max(rules.minimumBid * 5, 100);
    const step = last ? last.step * 2 : Math.max(rules.increment * 2, 1);
    onChange([...tiers, { from, step }]);
  };
  const sorted = [...tiers].filter((tier) => tier.from > 0 && tier.step > 0).sort((a, b) => a.from - b.from);
  const summary = [
    `Below ${sorted[0] ? points(sorted[0].from) : "∞"}: +${points(rules.increment)}`,
    ...sorted.map((tier, index) => `${points(tier.from)}${sorted[index + 1] ? `–${points(sorted[index + 1].from - 1)}` : "+"}: +${points(tier.step)}`),
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-300">Bigger increments as the price rises</p>
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold transition hover:bg-white/15">
          <Plus size={12} /> Add step-up
        </button>
      </div>
      {tiers.length > 0 && (
        <div className="mt-2 space-y-2">
          {tiers.map((tier, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-slate-400">
              <span className="shrink-0">From</span>
              <input
                type="number"
                min={1}
                value={String(tier.from)}
                onChange={(event) => update(index, { from: Number(event.target.value) })}
                aria-label={`Step-up ${index + 1} starts at`}
                className="w-20 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan"
              />
              <span className="shrink-0">pts, raise by</span>
              <input
                type="number"
                min={1}
                value={String(tier.step)}
                onChange={(event) => update(index, { step: Number(event.target.value) })}
                aria-label={`Step-up ${index + 1} increment`}
                className="w-16 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan"
              />
              <button
                type="button"
                onClick={() => onChange(tiers.filter((_, i) => i !== index))}
                aria-label={`Remove step-up ${index + 1}`}
                className="ml-auto text-red-300 transition hover:text-red-200"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-5 text-slate-500">{tiers.length ? summary.join(" · ") : `Every raise is +${points(rules.increment)}. Add a step-up to raise faster at higher prices.`}</p>
    </div>
  );
}

const TAB_META: Record<(typeof tabs)[number], { label: string; icon: ReactNode }> = {
  dashboard: { label: "Home", icon: <Home size={17} /> },
  room: { label: "Live room", icon: <Radio size={17} /> },
  registry: { label: "Results", icon: <Trophy size={17} /> },
  builder: { label: "Builder", icon: <Wrench size={17} /> },
};

function NavButton({ tab, active, live, onClick, compact }: { tab: (typeof tabs)[number]; active: boolean; live?: boolean; onClick: () => void; compact?: boolean }) {
  const meta = TAB_META[tab];
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? `relative flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-bold transition ${active ? "text-gold" : "text-slate-400"}`
          : `relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${active ? "bg-gold text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`
      }
    >
      {meta.icon}
      {meta.label}
      {live && <span className="live-dot absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-live text-live" aria-label="Live now" />}
    </button>
  );
}

function AuthMenu({ state }: { state: AuthState }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!state.ready) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("Firebase: ", "") : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (state.user) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs">
        <span className="hidden max-w-[10rem] truncate text-slate-300 sm:inline" title={state.user.email || undefined}>
          {state.user.email || state.user.displayName}
        </span>
        <span className={`rounded-lg px-2 py-0.5 font-black ${state.isAdmin ? "bg-cyan text-slate-950" : "bg-white/10 text-slate-300"}`}>
          {state.isAdmin ? "Admin" : "Viewer"}
        </span>
        <button onClick={() => signOut()} className="flex items-center gap-1 font-bold text-slate-300 hover:text-white">
          <LogOut size={13} /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-black transition hover:bg-white/10"
      >
        <LogIn size={14} /> <span className="hidden sm:inline">Admin sign in</span><span className="sm:hidden">Sign in</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 space-y-3 rounded-2xl border border-white/10 bg-[#0d1428] p-4 shadow-glow">
          <button
            disabled={busy}
            onClick={() => run(signInWithGoogle)}
            className="w-full rounded-xl bg-white py-2.5 text-sm font-black text-slate-900 disabled:opacity-50"
          >
            Continue with Google
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(() => signInWithEmail(email, password));
            }}
            className="space-y-2"
          >
            <Input label="Email" type="email" value={email} on={setEmail} />
            <Input label="Password" type="password" value={password} on={setPassword} />
            <button disabled={busy} className="w-full rounded-xl bg-cyan py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in with email"}
            </button>
          </form>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Builder({
  auction,
  onCreate,
  onSave,
  onDelete,
}: {
  auction?: Auction;
  onCreate: (x: Auction) => void;
  onSave: (x: Auction) => void;
  onDelete: (id: string) => void;
}) {
  const [rules, setRules] = useState<Rules>(withDefaults(auction?.rules));
  const [teams, setTeams] = useState<Team[]>(auction?.teams || []);
  const [players, setPlayers] = useState<Player[]>(auction?.players || []);
  const [editingTeam, setEditingTeam] = useState<string>();
  const [editingPlayer, setEditingPlayer] = useState<string>();
  const [teamForm, setTeamForm] = useState({ name: "", owner: "", short: "", purse: DEFAULT_PURSE, color: nextTeamColor(auction?.teams ?? []), logo: "" });
  const [playerForm, setPlayerForm] = useState({ ...defaultPlayerForm, base: String(rules.basePrice) });
  const [importing, setImporting] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFailures, setDriveFailures] = useState<string[]>([]);
  const driveStop = useRef(false);
  // Always the newest saved version of this auction (it can change in the live room while photos load).
  const latestAuction = useRef(auction);
  latestAuction.current = auction;
  const [driveMessage, setDriveMessage] = useState("");
  const [importMessage, setImportMessage] = useState("Choose the Google Form responses as Excel (.xlsx) or CSV. You can add image files too.");

  const defaultBase = () => Math.max(rules.basePrice || 0, rules.minimumBid || 0);

  // Changing the default base price updates every unsold player still on the old default.
  // Players whose base price was edited individually keep their custom value.
  const changeBasePrice = (value: string) => {
    const previous = rules.basePrice;
    const next = Number(value);
    setRules({ ...rules, basePrice: next });
    if (!Number.isFinite(next)) return;
    setPlayers((current) => current.map((player) => (player.status === "available" && player.base === previous ? { ...player, base: next } : player)));
    setPlayerForm((current) => (!editingPlayer && Number(current.base) === previous ? { ...current, base: String(next) } : current));
  };

  const applyBaseToAll = () => {
    const base = defaultBase();
    setPlayers((current) => current.map((player) => (player.status === "available" ? { ...player, base } : player)));
  };

  const addTeam = (event: FormEvent) => {
    event.preventDefault();
    const existing = teams.find((item) => item.id === editingTeam);
    if (!teamForm.name || !teamForm.owner) return;

    const spent = existing?.spent || 0;
    const totalPurse = Number(teamForm.purse) || 0;
    const next: Team = {
      id: editingTeam || crypto.randomUUID(),
      name: teamForm.name,
      owner: teamForm.owner,
      short: teamForm.short.toUpperCase().slice(0, 3) || teamForm.name.slice(0, 3).toUpperCase(),
      color: teamForm.color,
      logo: teamForm.logo || undefined,
      purse: Math.max(totalPurse - spent, 0),
      spent,
      slots: existing?.slots || rules.maxSlots,
    };

    const updated = editingTeam ? teams.map((item) => (item.id === editingTeam ? next : item)) : [...teams, next];
    setTeams(updated);
    setTeamForm({ name: "", owner: "", short: "", purse: DEFAULT_PURSE, color: nextTeamColor(updated), logo: "" });
    setEditingTeam(undefined);
  };

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    const existing = players.find((item) => item.id === editingPlayer);
    if (!playerForm.name) return;

    const next: Player = {
      id: editingPlayer || crypto.randomUUID(),
      name: playerForm.name,
      role: playerForm.role,
      age: +playerForm.age,
      base: Math.max(+playerForm.base, rules.minimumBid),
      runs: +playerForm.runs,
      wickets: +playerForm.wickets,
      status: existing?.status || "available",
      team: existing?.team,
      price: existing?.price,
      photo: (isLink(playerForm.photo) ? photoFromLink(playerForm.photo) : playerForm.photo) || existing?.photo,
    };

    setPlayers((current) => (editingPlayer ? current.map((item) => (item.id === editingPlayer ? next : item)) : [...current, next]));
    setPlayerForm({ ...defaultPlayerForm, base: String(rules.basePrice) });
    setEditingPlayer(undefined);
  };

  const handleLogo = async (file?: File) => {
    if (!file) return;
    const logo = await compressImage(file, 200, 0.9, "image/png");
    setTeamForm((current) => ({ ...current, logo }));
  };

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    const photo = await compressImage(file);
    setPlayerForm((current) => ({ ...current, photo }));
  };

  // Players whose photo is still a Google Drive link (private form uploads need loading with Drive access).
  const drivePlayers = players.filter((player) => player.photo && driveFileId(player.photo));

  const loadDrivePhotos = async () => {
    const targets = players.filter((player) => player.photo && driveFileId(player.photo));
    if (!targets.length) return;
    driveStop.current = false;
    setDriveBusy(true);
    setDriveFailures([]);
    setDriveMessage("Choose a Google account that can open the photos…");

    const loaded = new Map<string, string>();
    const failed: string[] = [];
    let pending = new Map<string, string>();
    let fatal: string | undefined;

    // Merge finished photos into the builder and, for a saved auction, into the live data in
    // small batches, so progress is kept even if loading stops and nothing sold meanwhile is undone.
    const flush = () => {
      if (!pending.size) return;
      const batch = pending;
      pending = new Map();
      setPlayers((current) => current.map((player) => (batch.has(player.id) ? { ...player, photo: batch.get(player.id) } : player)));
      const latest = latestAuction.current;
      if (latest) onSave({ ...latest, players: latest.players.map((player) => (batch.has(player.id) ? { ...player, photo: batch.get(player.id) } : player)) });
    };

    try {
      const access = await requestDriveAccess();
      const who = access.email ? ` as ${access.email}` : "";
      const queue = [...targets];
      let done = 0;
      setDriveMessage(`Loading photos${who}… 0/${targets.length}`);

      const worker = async () => {
        while (queue.length && !driveStop.current && !fatal) {
          const player = queue.shift()!;
          try {
            const blob = await downloadDriveFile(driveFileId(player.photo!)!, access.token);
            const photo = await compressImage(await toBrowserImage(blob));
            loaded.set(player.id, photo);
            pending.set(player.id, photo);
            if (pending.size >= 25) flush();
          } catch (error) {
            const message = error instanceof Error ? error.message : "error";
            // These affect every file, so stop instead of failing hundreds of times.
            if (error instanceof DriveFileError && (error.status === 401 || message.includes("not enabled"))) fatal = message;
            else failed.push(`${player.name}: ${message}`);
          }
          done += 1;
          setDriveMessage(`Loading photos${who}… ${done}/${targets.length}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker));
      flush();

      const left = targets.length - loaded.size - failed.length;
      setDriveFailures(failed);
      setDriveMessage(
        [
          fatal ?? (driveStop.current ? "Stopped." : ""),
          `Loaded ${loaded.size} of ${targets.length} photos${who}.`,
          failed.length ? `${failed.length} could not be loaded (listed below).` : "",
          left > 0 ? `${left} not tried yet; click Load again to continue.` : "",
          loaded.size ? (auction ? "Saved to the auction." : "Click “Create auction” to keep them.") : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (error) {
      flush();
      setDriveMessage(error instanceof Error ? error.message : "Could not load photos from Google Drive.");
    } finally {
      setDriveBusy(false);
    }
  };

  const importPlayers = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setImporting(true);
    setImportMessage("Reading player file and preparing photos...");

    try {
      const images = new Map<string, string>();
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));

      for (const file of imageFiles) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const compressed = await compressImage(file);
        images.set(normalizeFileName(file.name), compressed);
        images.set(normalizeFileName(path), compressed);
      }

      const csv = files.find((file) => file.name.toLowerCase().endsWith(".csv"));
      const json = files.find((file) => file.name.toLowerCase().endsWith(".json"));
      const sheet = files.find((file) => /.xls[xm]$/i.test(file.name));
      if (!csv && !sheet && files.some((file) => /.xls$/i.test(file.name)))
        throw new Error("Old .xls files are not supported. Save it as .xlsx (Excel) or .csv and try again.");
      let imported: Player[] = [];

      // Only name, role, age and photo are read from the file. Every imported
      // player starts at the auction's default base price (editable afterwards).
      const toPlayer = (row: { name?: unknown; role?: unknown; age?: unknown }, photo?: string): Player | undefined => {
        const name = tidyName(String(row.name ?? ""));
        if (!name) return undefined;
        return {
          id: crypto.randomUUID(),
          name,
          role: normalizeRole(String(row.role ?? "")),
          age: parseAge(String(row.age ?? "")),
          base: defaultBase(),
          runs: 0,
          wickets: 0,
          status: "available",
          photo,
        };
      };
      // A photo cell can be a link (Google Form upload / Drive / any image URL) or a file name.
      const photoFor = (cell = "") => (isLink(cell) ? photoFromLink(cell) : images.get(normalizeFileName(cell)));
      let detail = "";

      if (csv || sheet) {
        const rows = csv ? parseCsv(await readTextFile(csv)) : await readSpreadsheet(sheet!);
        const columns = detectColumns(Object.keys(rows[0] ?? {}));
        if (!columns.name) throw new Error("Could not find a name column. Add a column called “Name” (or “Full name”).");
        imported = rows
          .map((row) =>
            toPlayer(
              { name: row[columns.name!], role: columns.role ? row[columns.role] : "", age: columns.age ? row[columns.age] : "" },
              columns.photo ? photoFor(row[columns.photo]) : undefined,
            ),
          )
          .filter(Boolean) as Player[];
        // Google Forms often has repeat submissions; keep the latest row for each name.
        const byName = new Map<string, Player>();
        imported.forEach((player) => byName.set(player.name.toLowerCase(), player));
        const repeats = imported.length - byName.size;
        imported = [...byName.values()].filter((player) => !players.some((existing) => existing.name.toLowerCase() === player.name.toLowerCase()));
        const skipped = byName.size - imported.length;
        const used = (["name", "role", "age", "photo"] as const)
          .map((key) => `${key} ← “${columns[key] ?? "not found"}”`)
          .join(", ");
        detail = ` Columns: ${used}.${repeats ? ` Merged ${repeats} repeat submissions.` : ""}${skipped ? ` Skipped ${skipped} already in the list.` : ""}`;
      } else if (json) {
        const payload = JSON.parse(await readTextFile(json));
        const rows = Array.isArray(payload) ? payload : payload.players;
        if (!Array.isArray(rows)) throw new Error("JSON must be an array or contain a players array.");
        imported = rows
          .map((row: { name?: string; role?: string; age?: number | string; photo?: string; photoFile?: string }) => {
            const photo = row.photo?.startsWith("data:") ? row.photo : photoFor(row.photo || row.photoFile);
            return toPlayer(row, photo);
          })
          .filter(Boolean) as Player[];
      } else {
        throw new Error("Select an Excel (.xlsx), CSV or JSON file with the players.");
      }

      if (!imported.length) throw new Error(`No new players found in the import file.${detail}`);
      setPlayers((current) => [...current, ...imported]);
      const linked = imported.filter((player) => player.photo && isLink(player.photo)).length;
      const uploaded = imported.filter((player) => player.photo && !isLink(player.photo)).length;
      setImportMessage(
        `Imported ${imported.length} players. Photos: ${linked} from links, ${uploaded} from uploaded files, ${imported.length - linked - uploaded} without.${detail}`,
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not import players.");
    } finally {
      setImporting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!rules.name) return;
    const next: Auction = {
      id: auction?.id || crypto.randomUUID(),
      rules: { ...rules, incrementTiers: (rules.incrementTiers ?? []).filter((tier) => tier.from > 0 && tier.step > 0).sort((a, b) => a.from - b.from) },
      teams,
      players: players.map((player) => ({ ...player, role: canonicalRole(player.role) })),
      history: auction?.history || [],
      createdAt: auction?.createdAt || new Date().toISOString(),
      // Keep the player currently on stage; saving rules or teams must not end a live lot.
      live: auction?.live,
    };
    auction ? onSave(next) : onCreate(next);
  };

  return (
    <>
      <p className="text-xs font-bold tracking-[.18em] text-cyan">{auction ? "EDIT AUCTION" : "NEW AUCTION"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">{auction ? auction.rules.name : "Build a fresh auction room"}</h1>
      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        <Panel title="Auction rules">
          <form onSubmit={submit} className="space-y-3">
            <Input label="Auction name" value={rules.name} on={(value) => setRules({ ...rules, name: value })} />
            <Input label="Scheduled time (optional)" type="datetime-local" required={false} value={rules.scheduledAt} on={(value) => setRules({ ...rules, scheduledAt: value })} />
            <Input label="Minimum bid (points)" type="number" value={String(rules.minimumBid)} on={(value) => setRules({ ...rules, minimumBid: +value })} />
            <Input label="Bid increment (points)" type="number" value={String(rules.increment)} on={(value) => setRules({ ...rules, increment: +value })} />
            <IncrementTiersEditor rules={rules} onChange={(incrementTiers) => setRules({ ...rules, incrementTiers })} />
            <div>
              <Input label="Default base price for every player (points)" type="number" value={String(rules.basePrice)} on={changeBasePrice} />
              <div className="mt-1 flex items-center justify-between gap-2">
                <small className="text-[11px] text-slate-500">Applied to all players. You can still edit any player individually.</small>
                <button
                  type="button"
                  onClick={applyBaseToAll}
                  disabled={!players.length}
                  className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset all
                </button>
              </div>
            </div>
            <Input label="Maximum squad size" type="number" value={String(rules.maxSlots)} on={(value) => setRules({ ...rules, maxSlots: +value })} />
            <button className="w-full rounded-2xl bg-cyan py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5">
              {auction ? "Save auction" : "Create auction"}
            </button>
            {auction && (
              <button
                type="button"
                onClick={() => onDelete(auction.id)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
              >
                <Trash2 size={15} /> Delete auction
              </button>
            )}
          </form>
        </Panel>

        <Panel title="Teams">
          <form onSubmit={addTeam} className="grid gap-2">
            <Input label="Team name" value={teamForm.name} on={(value) => setTeamForm({ ...teamForm, name: value })} />
            <Input label="Owner" value={teamForm.owner} on={(value) => setTeamForm({ ...teamForm, owner: value })} />
            <Input label="Short code" value={teamForm.short} on={(value) => setTeamForm({ ...teamForm, short: value })} />
            <Input label="Total purse (points)" type="number" value={teamForm.purse} on={(value) => setTeamForm({ ...teamForm, purse: value })} />
            <div className="text-xs font-semibold text-slate-300">
              Team colour
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2.5">
                {TEAM_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use colour ${color}`}
                    onClick={() => setTeamForm({ ...teamForm, color })}
                    className={`h-7 w-7 rounded-full transition ${teamForm.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#0b1226]" : "hover:scale-110"}`}
                    style={{ background: color }}
                  />
                ))}
                <input
                  type="color"
                  value={teamForm.color}
                  onChange={(event) => setTeamForm({ ...teamForm, color: event.target.value })}
                  aria-label="Custom team colour"
                  className="h-7 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <TeamCrest team={{ name: teamForm.name || "Team", short: (teamForm.short || teamForm.name.slice(0, 3) || "TM").toUpperCase().slice(0, 3), color: teamForm.color, logo: teamForm.logo }} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-300">Team logo (optional)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">PNG with transparent background works best.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer rounded-xl bg-white/10 px-3 py-1.5 text-center text-xs font-bold transition hover:bg-white/15">
                  {teamForm.logo ? "Change" : "Upload"}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => handleLogo(event.currentTarget.files?.[0])} />
                </label>
                {teamForm.logo && (
                  <button type="button" onClick={() => setTeamForm({ ...teamForm, logo: "" })} className="rounded-xl px-3 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/10">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <button className="rounded-2xl bg-white/10 py-3 text-sm font-bold transition hover:bg-white/15">{editingTeam ? "Save team" : "Add team"}</button>
          </form>
          <List>
            {teams.map((item) => (
              <Item
                key={item.id}
                lead={<TeamCrest team={item} size="sm" />}
                label={`${item.name} · ${money(item.purse)} left`}
                edit={() => {
                  setEditingTeam(item.id);
                  setTeamForm({
                    name: item.name,
                    owner: item.owner,
                    short: item.short,
                    purse: String(item.purse + item.spent),
                    color: item.color,
                    logo: item.logo || "",
                  });
                }}
                del={() => setTeams((current) => current.filter((team) => team.id !== item.id))}
              />
            ))}
          </List>
        </Panel>

        <Panel title="Players">
          <form onSubmit={addPlayer} className="grid gap-2">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <PlayerPhoto player={{ name: playerForm.name || "Player", role: playerForm.role, photo: playerForm.photo }} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-300">Player photo</p>
                <p className="mt-1 text-xs text-slate-500">Used in queue, squad cards, and live bidding.</p>
              </div>
              <label className="cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/15">
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.currentTarget.files?.[0])} />
              </label>
            </div>
            <Input
              label="…or paste a photo link (Google Drive / image URL)"
              type="url"
              required={false}
              value={isLink(playerForm.photo) ? playerForm.photo : ""}
              on={(value) => setPlayerForm({ ...playerForm, photo: value.trim() })}
            />
            <Input label="Player name" value={playerForm.name} on={(value) => setPlayerForm({ ...playerForm, name: value })} />
            <select
              value={playerForm.role}
              onChange={(event) => setPlayerForm({ ...playerForm, role: event.target.value })}
              className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-cyan"
            >
              {ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <Input label="Age" type="number" value={playerForm.age} on={(value) => setPlayerForm({ ...playerForm, age: value })} />
            <Input label="Base price (points)" type="number" value={playerForm.base} on={(value) => setPlayerForm({ ...playerForm, base: value })} />
            <button className="rounded-2xl bg-white/10 py-3 text-sm font-bold transition hover:bg-white/15">{editingPlayer ? "Save player" : "Add player"}</button>
          </form>
          <List>
            {players.map((item) => (
              <Item
                key={item.id}
                label={`${item.photo ? "Photo · " : ""}${item.name} · ${canonicalRole(item.role)} · ${money(item.base)}`}
                edit={() => {
                  setEditingPlayer(item.id);
                  setPlayerForm({
                    name: item.name,
                    role: canonicalRole(item.role),
                    age: String(item.age),
                    base: String(item.base),
                    runs: String(item.runs),
                    wickets: String(item.wickets),
                    photo: item.photo || "",
                  });
                }}
                del={() => setPlayers((current) => current.filter((player) => player.id !== item.id))}
              />
            ))}
          </List>
        </Panel>
      </div>
      <div className="mt-5">
        <Panel title="Bulk player import">
          <div className="grid gap-4 lg:grid-cols-[1fr_.9fr]">
            <div className="rounded-2xl border border-dashed border-cyan/30 bg-cyan/[.04] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan text-slate-950">
                  <FileUp size={20} />
                </span>
                <div>
                  <h3 className="font-black">Import players from a Google Form or spreadsheet</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    In the form&apos;s response sheet choose <b>File → Download → Microsoft Excel (.xlsx)</b> or <b>CSV</b> and select it here. Photo links from the form are used directly. You can also
                    select image files together with the CSV and put their file names in the photo column.
                  </p>
                </div>
              </div>
              <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan to-blue-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5">
                <FileUp size={16} /> {importing ? "Importing..." : "Choose Excel / CSV (and photos)"}
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls,.csv,.json,image/*"
                  multiple
                  className="hidden"
                  disabled={importing}
                  onChange={(event) => importPlayers(event.currentTarget.files)}
                />
              </label>
              <p className="mt-3 text-sm text-slate-400">{importMessage}</p>
              {(drivePlayers.length > 0 || driveMessage) && (
                <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 p-4">
                  <p className="text-sm font-bold text-gold">
                    {drivePlayers.length ? drivePlayers.length === 1 ? "1 player photo is a Google Drive link" : `${drivePlayers.length} player photos are Google Drive links` : "Google Drive photos"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Form uploads are private, so load them once with your Google account (the one that owns the form). The app downloads each photo and stores
                    it with the player, so everyone can see it. Nothing in Drive is changed or made public.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {drivePlayers.length > 0 && (
                      <button
                        type="button"
                        onClick={loadDrivePhotos}
                        disabled={driveBusy}
                        className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        <ImageDown size={16} /> {driveBusy ? "Loading…" : "Load photos from Google Drive"}
                      </button>
                    )}
                    {driveBusy && (
                      <button
                        type="button"
                        onClick={() => {
                          driveStop.current = true;
                        }}
                        className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold transition hover:bg-white/15"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">
                    In the popup, pick a Google account that can open the photos (one of the form owners). Your admin login stays as it is.
                  </p>
                  {driveMessage && <p className="mt-2 text-xs leading-5 text-slate-200">{driveMessage}</p>}
                  {driveFailures.length > 0 && (
                    <details className="mt-2 text-xs text-slate-300">
                      <summary className="cursor-pointer font-bold text-rose-300">Photos that could not be loaded ({driveFailures.length})</summary>
                      <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5">
                        {driveFailures.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">What gets read</p>
              <ul className="mt-3 space-y-1.5 text-sm leading-6 text-slate-400">
                <li>
                  <b className="text-slate-200">Name, role, age, photo</b>: found by their headings (e.g. “Full Name”, “Playing role”, “Age” or “Date of birth”,
                  “Upload your photo”). Other columns are ignored.
                </li>
                <li>Roles like “All rounder”, “Batsman”, “WK” or “Off spin” are tidied into the app&apos;s roles. Repeat submissions keep the latest one.</li>
                <li>Every imported player starts at the default base price ({money(defaultBase())}).</li>
              </ul>
              <div className="mt-4 rounded-xl border border-gold/25 bg-gold/10 p-3 text-xs leading-5 text-slate-300">
                <b className="text-gold">Google Drive photos:</b> form uploads are private. After importing, use <b>Load photos from Google Drive</b> (signed in with
                the Google account that owns the form). Alternatively share the upload folder as <b>Anyone with the link (Viewer)</b>.
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <p className="mt-4 text-sm text-slate-400">You can add players and teams before creating the auction. Each New auction is separate and can be opened independently.</p>
    </>
  );
}
