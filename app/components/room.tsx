"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Maximize2, Minimize2, Pause, Play, RotateCcw, Search, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, points, stamp, textOn } from "@/lib/format";
import type { Auction, AuctionEvent, Bid, Player, Team } from "@/lib/types";
import { Empty, PlayerPhoto, RoleTag, TeamCrest } from "./ui";

const ROLES = ["All", "Batter", "All-rounder", "Fast bowler", "Spinner", "Wicketkeeper"];
const MOMENT_MS = 4500;
const MOMENT_FRESH_MS = 15_000;

/** Shows a SOLD / UNSOLD moment on every screen when a lot closes (events sync through Firestore). */
function useClosingMoment(history: AuctionEvent[] | undefined) {
  const last = history?.[history.length - 1];
  const seen = useRef<string | undefined>(undefined);
  const [moment, setMoment] = useState<AuctionEvent>();

  useEffect(() => {
    if (!last || last.id === seen.current) return;
    seen.current = last.id;
    const fresh = last.ts !== undefined && Math.abs(Date.now() - last.ts) < MOMENT_FRESH_MS;
    if ((last.kind === "sold" || last.kind === "unsold") && fresh) setMoment(last);
  }, [last]);

  // Separate effect so re-renders (e.g. new Firestore snapshots) never cancel the auto-close.
  useEffect(() => {
    if (!moment) return;
    const timer = window.setTimeout(() => setMoment(undefined), MOMENT_MS);
    return () => window.clearTimeout(timer);
  }, [moment]);

  return [moment, () => setMoment(undefined)] as const;
}

export function Room({ auction, canEdit, onSave }: { auction?: Auction; canEdit: boolean; onSave: (x: Auction) => void }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All");
  const [queueView, setQueueView] = useState<"available" | "unsold">("available");
  const [presenting, setPresenting] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const [moment, closeMoment] = useClosingMoment(auction?.history);

  useEffect(() => {
    const sync = () => setPresenting(document.fullscreenElement === shell.current && !!shell.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const queue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (auction?.players ?? []).filter(
      (item) => item.status === queueView && (role === "All" || item.role === role) && (!needle || item.name.toLowerCase().includes(needle)),
    );
  }, [auction?.players, query, role, queueView]);

  if (!auction) return <Empty text="Open an auction room from the Dashboard to start the live auction." />;

  // The lot on the block is saved with the auction, so every device watching sees the same bids.
  const live = auction.live;
  const player = auction.players.find((item) => item.id === live?.playerId && item.status === "available");
  const bids = live?.bids ?? [];
  const running = Boolean(live?.running) && Boolean(player);
  const high = bids[0];
  const leader = auction.teams.find((team) => team.id === high?.teamId);
  const openingBid = player ? Math.max(player.base, auction.rules.minimumBid) : 0;
  const nextAmount = high ? high.amount + auction.rules.increment : openingBid;
  const total = auction.players.length;
  const closed = auction.players.filter((item) => item.status !== "available").length;
  const soldCount = auction.players.filter((item) => item.status === "sold").length;
  const availableCount = auction.players.filter((item) => item.status === "available").length;
  const unsoldCount = auction.players.filter((item) => item.status === "unsold").length;
  const results = auction.history.filter((event) => event.kind === "sold" || event.kind === "unsold").slice(-12).reverse();

  const log = (event: Omit<AuctionEvent, "id" | "at" | "ts"> & { at?: string }): AuctionEvent => ({ id: crypto.randomUUID(), at: stamp(), ts: Date.now(), ...event });

  const blockReason = (team: Team) => {
    if (high?.teamId === team.id) return "Leading";
    if (team.slots < 1) return "Squad full";
    if (team.purse < nextAmount) return "Purse short";
    return undefined;
  };

  const select = (target: Player) => {
    if (!canEdit) return;
    // Picking an unsold player brings them back into the auction.
    const players = target.status === "unsold" ? auction.players.map((item) => (item.id === target.id ? { ...item, status: "available" } : item)) : auction.players;
    onSave({ ...auction, players, live: { playerId: target.id, running: false, bids: [] } });
    if (target.status === "unsold") setQueueView("available");
  };

  const place = (team: Team) => {
    if (!canEdit || !running || !player || !live || blockReason(team)) return;
    const bid: Bid = { teamId: team.id, team: team.name, amount: nextAmount, at: stamp() };
    onSave({
      ...auction,
      live: { ...live, bids: [bid, ...bids] },
      history: [
        ...auction.history,
        log({ at: bid.at, kind: "bid", message: `${team.name} bid ${money(nextAmount)} for ${player.name}`, playerId: player.id, teamId: team.id, amount: nextAmount }),
      ],
    });
  };

  const undoLastBid = () => {
    if (!canEdit || !player || !live || !bids.length) return;
    const [removed, ...remaining] = bids;
    const history = [...auction.history];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const event = history[index];
      if (event.kind === "bid" && event.playerId === player.id && event.teamId === removed.teamId && event.amount === removed.amount) {
        history.splice(index, 1);
        break;
      }
    }
    onSave({
      ...auction,
      live: { ...live, bids: remaining },
      history: [
        ...history,
        log({ kind: "undo", message: `Reverted ${removed.team}'s ${money(removed.amount)} bid for ${player.name}`, playerId: player.id, teamId: removed.teamId, amount: removed.amount }),
      ],
    });
  };

  const toggleBidding = () => {
    if (!canEdit || !player || !live) return;
    onSave({
      ...auction,
      live: { ...live, running: !live.running },
      history: live.running ? auction.history : [...auction.history, log({ kind: "opened", message: `Opened lot for ${player.name}`, playerId: player.id })],
    });
  };

  const close = (sold: boolean) => {
    if (!canEdit || !player) return;
    if (sold && !high) return;
    if (!sold && !window.confirm(`Mark ${player.name} as UNSOLD?`)) return;

    const teams = sold
      ? auction.teams.map((team) => (team.id === high.teamId ? { ...team, purse: team.purse - high.amount, spent: team.spent + high.amount, slots: team.slots - 1 } : team))
      : auction.teams;
    const players = auction.players.map((item) =>
      item.id !== player.id ? item : sold ? { ...item, status: "sold", team: high.team, price: high.amount } : { ...item, status: "unsold", team: undefined, price: undefined },
    );

    onSave({
      ...auction,
      teams,
      players,
      live: undefined,
      history: [
        ...auction.history,
        log({
          kind: sold ? "sold" : "unsold",
          message: sold ? `${player.name} SOLD to ${high.team} for ${money(high.amount)}` : `${player.name} marked UNSOLD`,
          playerId: player.id,
          teamId: sold ? high.teamId : undefined,
          amount: sold ? high.amount : undefined,
        }),
      ],
    });
  };

  const togglePresent = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch {
      // Fullscreen can be blocked (e.g. inside some embedded browsers); the room still works.
    }
  };

  const status = !player ? { label: "Waiting for next lot", tone: "#94a3b8" } : running ? { label: "Bidding open", tone: "#ff3b5c" } : { label: "Bidding paused", tone: "#ffca5f" };
  const showAdmin = canEdit && !presenting;

  return (
    <div ref={shell} className="room-shell">
      {/* Scoreboard strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em]" style={{ color: status.tone }}>
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "live-dot" : ""}`} style={{ background: status.tone, color: status.tone }} />
            {running ? "Live · " : ""}
            {status.label}
          </p>
          <h1 className="mt-1 truncate font-display text-3xl font-bold uppercase tracking-wide md:text-4xl">{auction.rules.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="Lots done" value={`${closed}/${total}`} />
          <Chip label="Sold" value={soldCount} />
          <Chip label="Unsold" value={unsoldCount} />
          <button
            onClick={togglePresent}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold transition hover:bg-white/10"
            title="Full-screen view for a projector or TV"
          >
            {presenting ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {presenting ? "Exit big screen" : "Big screen"}
          </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan to-gold transition-all duration-700" style={{ width: `${total ? (closed / total) * 100 : 0}%` }} />
      </div>

      <div className={`mt-5 grid gap-5 ${showAdmin ? "xl:grid-cols-[300px_1fr]" : ""}`}>
        {/* Player queue (auctioneer only) */}
        {showAdmin && (
          <aside className="order-3 rounded-[1.75rem] border border-white/10 bg-white/[.045] p-4 xl:order-none">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/20 p-1 text-xs font-bold">
              {(["available", "unsold"] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setQueueView(view)}
                  className={`rounded-xl px-3 py-2 transition ${queueView === view ? "bg-cyan text-slate-950" : "text-slate-400 hover:text-white"}`}
                >
                  {view === "available" ? `Up next · ${availableCount}` : `Unsold · ${unsoldCount}`}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm">
              <Search size={15} className="text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" className="w-full bg-transparent outline-none placeholder:text-slate-500" />
            </label>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ROLES.map((item) => (
                <button
                  key={item}
                  onClick={() => setRole(item)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${role === item ? "border-cyan bg-cyan/15 text-cyan" : "border-white/10 text-slate-400 hover:text-white"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-[560px] space-y-2 overflow-auto pr-1">
              {queue.length ? (
                queue.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => select(item)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                      player?.id === item.id ? "border-cyan bg-cyan/15 shadow-glow" : "border-white/10 bg-white/[.04] hover:border-cyan/40 hover:bg-white/10"
                    }`}
                  >
                    <PlayerPhoto player={item} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{item.name}</b>
                      <small className="block text-slate-400">
                        {item.role} · Base {money(item.base)}
                      </small>
                    </span>
                    {queueView === "unsold" && <RotateCcw size={15} className="shrink-0 text-gold" aria-label="Re-auction" />}
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-500">
                  {queueView === "unsold" ? "No unsold players." : query || role !== "All" ? "No players match." : "Every player has been auctioned."}
                </p>
              )}
            </div>
          </aside>
        )}

        <div className="min-w-0 space-y-5">
          {/* Main stage */}
          <section className="stage relative overflow-hidden rounded-[2rem] border border-white/10 p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,.7)] md:p-8">
            <div className="stage-lines pointer-events-none absolute inset-0" />
            {!player ? (
              <div className="relative grid min-h-[380px] place-items-center text-center">
                <div>
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                    <Gavel size={36} />
                  </span>
                  <p className="mt-5 font-display text-3xl font-bold uppercase tracking-wide">{availableCount ? "Next lot coming up" : "Auction complete"}</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {!availableCount
                      ? `${soldCount} players sold · ${unsoldCount} unsold`
                      : canEdit
                        ? "Pick a player from the queue to bring them on stage."
                        : "Stay tuned. The auctioneer is bringing out the next player."}
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}
                  className="relative grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center"
                >
                  <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
                    <PlayerPhoto player={player} size="hero" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleTag role={player.role} />
                      <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">Age {player.age}</span>
                      <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-gold">
                        Base {money(player.base)}
                      </span>
                    </div>
                    <h2 className="mt-3 break-words font-display text-5xl font-bold uppercase leading-[.95] tracking-wide md:text-7xl">{player.name}</h2>

                    <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                      {/* Current bid */}
                      <div
                        className="relative overflow-hidden rounded-3xl border p-5 transition-colors duration-500"
                        style={{
                          borderColor: leader ? `${leader.color}88` : "rgba(255,255,255,.12)",
                          background: leader ? `linear-gradient(135deg, ${leader.color}33, rgba(0,0,0,.35) 70%)` : "rgba(0,0,0,.3)",
                        }}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[.22em] text-gold">{high ? "Current bid" : "Opening bid"}</p>
                        <AnimatePresence mode="popLayout">
                          <motion.p
                            key={high ? `${high.teamId}-${high.amount}` : "open"}
                            initial={{ scale: 1.25, opacity: 0, y: 8 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ type: "spring", stiffness: 420, damping: 22 }}
                            className="gold-text mt-1 font-display text-6xl font-bold leading-none md:text-7xl"
                          >
                            {points(high ? high.amount : openingBid)}
                            <span className="ml-2 text-2xl">pts</span>
                          </motion.p>
                        </AnimatePresence>
                        <div className="mt-4 flex items-center gap-3">
                          {leader ? (
                            <>
                              <TeamCrest team={leader} size="sm" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Leading</p>
                                <p className="truncate font-display text-xl font-semibold uppercase tracking-wide">{leader.name}</p>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-slate-400">{running ? "Waiting for the first paddle…" : "Bidding opens when the auctioneer starts the lot."}</p>
                          )}
                        </div>
                      </div>

                      {/* Bid ladder */}
                      <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[.22em] text-slate-400">Bid ladder · {bids.length}</p>
                        <div className="mt-3 space-y-1.5">
                          <AnimatePresence initial={false}>
                            {bids.slice(0, 5).map((bid, index) => {
                              const team = auction.teams.find((item) => item.id === bid.teamId);
                              return (
                                <motion.div
                                  key={`${bid.teamId}-${bid.amount}`}
                                  layout
                                  initial={{ opacity: 0, x: -16 }}
                                  animate={{ opacity: index === 0 ? 1 : 0.55, x: 0 }}
                                  exit={{ opacity: 0 }}
                                  className="flex items-center justify-between gap-2 rounded-xl bg-white/[.04] px-3 py-2 text-sm"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: team?.color ?? "#94a3b8" }} />
                                    <span className="truncate font-semibold">{bid.team}</span>
                                  </span>
                                  <span className="font-display font-semibold text-gold">{points(bid.amount)}</span>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                          {!bids.length && <p className="py-4 text-center text-sm text-slate-500">No bids yet</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </section>

          {/* Auctioneer controls */}
          {showAdmin && player && (
            <div className="on-dark sticky bottom-20 z-20 grid grid-cols-2 md:bottom-3 gap-2 rounded-[1.5rem] border border-white/10 bg-[#0a1124]/90 p-2 shadow-2xl backdrop-blur-xl sm:grid-cols-4">
              <ControlButton onClick={toggleBidding} tone={running ? "neutral" : "go"} icon={running ? <Pause size={17} /> : <Play size={17} />}>
                {running ? "Pause" : bids.length ? "Resume" : "Open bidding"}
              </ControlButton>
              <ControlButton onClick={undoLastBid} disabled={!bids.length} icon={<Undo2 size={17} />}>
                Undo bid
              </ControlButton>
              <ControlButton onClick={() => close(false)} tone="danger" icon={<X size={17} />}>
                Unsold
              </ControlButton>
              <ControlButton onClick={() => close(true)} disabled={!high} tone="gold" icon={<Gavel size={17} />}>
                {high ? `Sold · ${points(high.amount)}` : "Sold"}
              </ControlButton>
            </div>
          )}

          {/* Team paddles */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-semibold uppercase tracking-wide">Team paddles</h2>
              {player && <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Next bid · <span className="text-gold">{money(nextAmount)}</span></p>}
            </div>
            {auction.teams.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {auction.teams.map((team) => {
                  const reason = player ? blockReason(team) : undefined;
                  const leading = high?.teamId === team.id;
                  const bought = auction.players.filter((item) => item.status === "sold" && item.team === team.name).length;
                  const usable = canEdit && running && !reason;
                  return (
                    <button
                      key={team.id}
                      onClick={() => place(team)}
                      disabled={!usable}
                      style={{ ["--team" as string]: `${team.color}aa` }}
                      className={`on-dark group relative overflow-hidden rounded-[1.5rem] border p-4 text-left transition ${
                        leading ? "paddle-leading border-transparent" : "border-white/10"
                      } ${usable ? "hover:-translate-y-0.5 active:translate-y-0" : "cursor-default"} ${!leading && player && reason && reason !== "Leading" ? "opacity-50" : ""}`}
                    >
                      <span className="absolute inset-0 opacity-90" style={{ background: `linear-gradient(150deg, ${team.color}${leading ? "55" : "26"}, rgba(10,16,34,.92) 62%)` }} />
                      <span className="absolute inset-x-0 top-0 h-1" style={{ background: team.color }} />
                      <span className="relative flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <TeamCrest team={team} />
                        <span className="min-w-0">
                          <b className="line-clamp-2 font-display text-base font-semibold uppercase leading-tight tracking-wide text-white sm:text-lg">{team.name}</b>
                          <small className="text-slate-300">
                            {bought} bought · {team.slots} left
                          </small>
                        </span>
                      </span>
                      <span className="relative mt-4 flex items-end justify-between gap-2">
                        <span>
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Purse</span>
                          <span className="font-display text-2xl font-semibold text-white">{points(team.purse)}</span>
                        </span>
                        {player && (
                          <span
                            className="rounded-xl px-2.5 py-1.5 text-xs font-black uppercase tracking-wide"
                            style={
                              leading
                                ? { background: team.color, color: textOn(team.color) }
                                : reason
                                  ? { background: "rgba(255,255,255,.08)", color: "#cbd5e1" }
                                  : { background: "#ffca5f", color: "#0b1020" }
                            }
                          >
                            {leading ? "Leading" : reason ?? (canEdit && running ? `Bid ${points(nextAmount)}` : `${points(nextAmount)}`)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty text="No teams in this auction yet. Add teams in the Auction builder." />
            )}
          </section>

          {/* Results ticker */}
          {results.length > 0 && (
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[.035] p-3">
              <p className="px-1 text-[11px] font-bold uppercase tracking-[.2em] text-slate-400">Latest results</p>
              <div className="ticker mt-2 flex gap-2 overflow-x-auto pb-1">
                {results.map((event) => {
                  const who = auction.players.find((item) => item.id === event.playerId);
                  const team = auction.teams.find((item) => item.id === event.teamId);
                  return (
                    <span key={event.id} className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/25 py-1 pl-1 pr-3 text-sm">
                      {who ? <PlayerPhoto player={who} size="xs" /> : null}
                      <b className="max-w-[9rem] truncate">{who?.name ?? "Player"}</b>
                      {event.kind === "sold" ? (
                        <>
                          <span className="h-2 w-2 rounded-full" style={{ background: team?.color ?? "#94a3b8" }} />
                          <span className="text-slate-300">{team?.short ?? "—"}</span>
                          <span className="font-display font-semibold text-gold">{points(event.amount ?? 0)}</span>
                        </>
                      ) : (
                        <span className="text-xs font-bold uppercase text-rose-300">Unsold</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      <ClosingMoment auction={auction} moment={moment} onClose={closeMoment} />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-2xl border border-white/10 bg-white/[.05] px-3 py-1.5 text-xs">
      <span className="font-bold uppercase tracking-wider text-slate-400">{label} </span>
      <b className="font-display text-base">{value}</b>
    </span>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  icon,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  tone?: "neutral" | "go" | "danger" | "gold";
}) {
  const tones = {
    neutral: "bg-white/10 text-white hover:bg-white/15",
    go: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
    danger: "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
    gold: "bg-gradient-to-r from-gold to-orange-400 text-slate-950 shadow-[0_10px_30px_-8px_rgba(255,202,95,.7)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3.5 text-sm font-black uppercase tracking-wide transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function ClosingMoment({ auction, moment, onClose }: { auction: Auction; moment?: AuctionEvent; onClose: () => void }) {
  const who = auction.players.find((item) => item.id === moment?.playerId);
  const team = auction.teams.find((item) => item.id === moment?.teamId);
  const sold = moment?.kind === "sold";
  const tone = sold ? team?.color ?? "#ffca5f" : "#f43f5e";

  return (
    <AnimatePresence>
      {moment && who && (
        <motion.div
          key={moment.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-[60] grid cursor-pointer place-items-center bg-[#030611]/80 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="stage relative w-full max-w-xl overflow-hidden rounded-[2rem] border p-8 text-center"
            style={{ borderColor: `${tone}aa`, boxShadow: `0 0 120px -20px ${tone}` }}
          >
            <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: tone }} />
            <div className="relative mx-auto w-fit">
              <PlayerPhoto player={who} size="lg" />
              <motion.span
                initial={{ scale: 2.6, rotate: -18, opacity: 0 }}
                animate={{ scale: 1, rotate: -10, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 380, damping: 16 }}
                className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border-4 px-4 py-1 font-display text-4xl font-bold uppercase tracking-widest"
                style={{ borderColor: tone, color: tone, background: "#050814" }}
              >
                {sold ? "Sold" : "Unsold"}
              </motion.span>
            </div>
            <p className="mt-10 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">{who.name}</p>
            {sold && team ? (
              <>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <TeamCrest team={team} />
                  <p className="font-display text-2xl font-semibold uppercase tracking-wide">{team.name}</p>
                </div>
                <p className="gold-text mt-4 font-display text-6xl font-bold">
                  {points(moment.amount ?? 0)}
                  <span className="ml-2 text-2xl">pts</span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-slate-400">No bids this round. {who.name} can come back in the unsold round.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
