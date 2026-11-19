"use client";

import { CalendarClock, Gavel, Plus, Radio, Sparkles, Trash2, Trophy, Users, WalletCards } from "lucide-react";
import { canonicalRole, CURRENCY, money, points } from "@/lib/format";
import type { Auction, AuctionEvent, Player } from "@/lib/types";
import { Empty, Metric, Panel, PlayerPhoto, Stat, TeamCrest } from "./ui";

type Phase = { label: string; tone: string; live?: boolean };

export function auctionPhase(auction: Auction): Phase {
  const available = auction.players.filter((player) => player.status === "available").length;
  if (auction.live?.running) return { label: "Live now", tone: "#ff3b5c", live: true };
  if (auction.live) return { label: "On stage", tone: "#ffca5f", live: true };
  if (!auction.players.length || !auction.teams.length) return { label: "Draft", tone: "#94a3b8" };
  if (!available) return { label: "Completed", tone: "#34d399" };
  if (auction.history.some((event) => event.kind === "sold" || event.kind === "unsold")) return { label: "In progress", tone: "#39d6ff" };
  return { label: "Ready", tone: "#a78bfa" };
}

function PhaseTag({ phase }: { phase: Phase }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider"
      style={{ color: phase.tone, borderColor: `${phase.tone}55`, background: `${phase.tone}14` }}
    >
      <span className={`h-2 w-2 rounded-full ${phase.live ? "live-dot" : ""}`} style={{ background: phase.tone, color: phase.tone }} />
      {phase.label}
    </span>
  );
}

export function Dashboard({
  auctions,
  active,
  onOpen,
  onNew,
  onDelete,
  canEdit,
}: {
  auctions: Auction[];
  active?: Auction;
  canEdit: boolean;
  onOpen: (id: string, view?: "dashboard" | "room") => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const spotlight = auctions.find((item) => item.live?.running) ?? auctions.find((item) => item.live) ?? active ?? auctions[auctions.length - 1];
  const spotPlayer = spotlight?.players.find((player) => player.id === spotlight.live?.playerId);
  const spotBid = spotlight?.live?.bids[0];

  return (
    <>
      <section className="stage relative overflow-hidden rounded-[2rem] border border-white/10 p-6 md:p-10">
        <div className="stage-lines pointer-events-none absolute inset-0" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.24em] text-gold">
              <Sparkles size={16} /> CCL family presents
            </p>
            <h1 className="mt-3 font-display text-5xl font-extrabold uppercase italic leading-[.95] md:text-7xl">
              Carpool Cricket
              <span className="gold-text block">Player Auction</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
              Build the rooms, bring players to the stage and watch every paddle, purse and squad update live on every screen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {spotlight && (
                <button
                  onClick={() => onOpen(spotlight.id, "room")}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-gold to-gold2 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_14px_40px_-10px_rgb(var(--p-highlight)/.8)] transition hover:-translate-y-0.5"
                >
                  <Gavel size={17} /> {spotlight.live ? "Watch live" : "Enter auction room"}
                </button>
              )}
              {canEdit && (
                <button onClick={onNew} className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
                  <Plus size={17} /> New auction
                </button>
              )}
            </div>
          </div>

          {spotlight ? (
            <button onClick={() => onOpen(spotlight.id, "room")} className="group rounded-[1.75rem] border border-white/10 bg-black/30 p-5 text-left backdrop-blur transition hover:border-gold/40">
              <div className="flex items-center justify-between gap-3">
                <PhaseTag phase={auctionPhase(spotlight)} />
                <span className="text-xs text-slate-400">{spotlight.rules.scheduledAt ? new Date(spotlight.rules.scheduledAt).toLocaleString() : ""}</span>
              </div>
              <p className="mt-3 truncate font-display text-2xl font-semibold uppercase tracking-wide text-white">{spotlight.rules.name}</p>
              {spotPlayer ? (
                <div className="mt-4 flex items-center gap-4">
                  <PlayerPhoto player={spotPlayer} size="md" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">On stage</p>
                    <p className="truncate font-display text-xl font-semibold uppercase text-white">{spotPlayer.name}</p>
                    <p className="gold-text font-display text-3xl font-bold">
                      <span className="emoji mr-1.5 text-[.7em]">{CURRENCY}</span>
                      {points(spotBid?.amount ?? spotPlayer.base)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Teams" value={spotlight.teams.length} />
                  <Stat label="Players" value={spotlight.players.length} />
                  <Stat label="Sold" value={spotlight.players.filter((player) => player.status === "sold").length} />
                </div>
              )}
              <div className="mt-4 flex -space-x-2">
                {spotlight.teams.slice(0, 8).map((team) => (
                  <TeamCrest key={team.id} team={team} size="sm" />
                ))}
              </div>
            </button>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-black/20 p-8 text-center text-slate-400">
              <Gavel className="mx-auto text-gold" size={36} />
              <p className="mt-3">{canEdit ? "Create your first auction to get the hammer ready." : "No auction has been scheduled yet."}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">Auction rooms</h2>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{auctions.length} rooms</span>
        </div>
        {!auctions.length ? (
          <Empty text={canEdit ? "No auctions created. Select New auction to build your first room." : "No auctions yet. Check back once an admin creates one."} />
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {auctions.map((item) => {
              const sold = item.players.filter((player) => player.status === "sold").length;
              const done = item.players.filter((player) => player.status !== "available").length;
              const spend = item.teams.reduce((sum, team) => sum + team.spent, 0);
              const phase = auctionPhase(item);
              return (
                <article
                  key={item.id}
                  className={`group relative overflow-hidden rounded-[1.75rem] border p-5 transition hover:-translate-y-1 ${
                    active?.id === item.id ? "border-cyan/50 bg-cyan/[.07] shadow-glow" : "border-white/10 bg-white/[.045] hover:border-white/20"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 flex h-1">
                    {(item.teams.length ? item.teams : [{ id: "x", color: "#334155" }]).map((team) => (
                      <span key={team.id} className="flex-1" style={{ background: team.color }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <PhaseTag phase={phase} />
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <CalendarClock size={13} />
                      {item.rules.scheduledAt ? new Date(item.rules.scheduledAt).toLocaleDateString() : "Unscheduled"}
                    </span>
                  </div>
                  <h3 className="mt-3 truncate font-display text-2xl font-semibold uppercase tracking-wide">{item.rules.name}</h3>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Teams" value={item.teams.length} />
                    <Stat label="Sold" value={`${sold}/${item.players.length}`} />
                    <Stat label="Spent" value={money(spend)} />
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan to-gold" style={{ width: `${item.players.length ? (done / item.players.length) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => onOpen(item.id, "room")}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold to-gold2 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-950"
                    >
                      <Radio size={14} /> Auction room
                    </button>
                    <button onClick={() => onOpen(item.id)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/15">
                      Overview
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => onDelete(item.id)}
                        aria-label={`Delete ${item.rules.name}`}
                        title="Delete auction"
                        className="ml-auto flex items-center gap-1 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {active && <SubDashboard auction={active} />}
    </>
  );
}

const eventStyle: Record<AuctionEvent["kind"], { label: string; tone: string }> = {
  sold: { label: "Sold", tone: "#34d399" },
  unsold: { label: "Unsold", tone: "#f43f5e" },
  bid: { label: "Bid", tone: "#ffca5f" },
  opened: { label: "Open", tone: "#39d6ff" },
  undo: { label: "Undo", tone: "#94a3b8" },
};

export function SubDashboard({ auction, showTitle = true }: { auction: Auction; showTitle?: boolean }) {
  const sold = auction.players.filter((player) => player.status === "sold");
  const topBuys = [...sold].sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 5);
  const history = auction.history.slice(-8).reverse();
  const spend = auction.teams.reduce((sum, team) => sum + team.spent, 0);
  const maxPurse = Math.max(1, ...auction.teams.map((team) => team.purse + team.spent));

  return (
    <section className={showTitle ? "mt-12" : "mt-6"}>
      {showTitle && (
        <>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan">Overview</p>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{auction.rules.name}</h2>
        </>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<Users size={18} />} label="Teams" value={auction.teams.length} />
        <Metric label="Players left" value={auction.players.filter((player) => player.status === "available").length} hint={`${auction.players.length} in the pool`} />
        <Metric icon={<Trophy size={18} />} label="Sold" value={sold.length} hint={`${auction.players.filter((player) => player.status === "unsold").length} unsold`} />
        <Metric icon={<WalletCards size={18} />} label="Total spend" value={money(spend)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Top buys" className="lg:col-span-1">
          {topBuys.length ? (
            <ol className="space-y-2">
              {topBuys.map((player, index) => {
                const team = auction.teams.find((item) => item.name === player.team);
                return (
                  <li key={player.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-2.5">
                    <span className="w-5 text-center font-display text-lg font-bold text-gold">{index + 1}</span>
                    <PlayerPhoto player={player} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{player.name}</b>
                      <small className="flex items-center gap-1.5 text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: team?.color ?? "#94a3b8" }} />
                        {player.team}
                      </small>
                    </span>
                    <span className="font-display text-lg font-semibold text-gold">{money(player.price ?? 0)}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">The biggest buys will show up here.</p>
          )}
        </Panel>

        <Panel title="Purse race">
          <div className="space-y-4">
            {auction.teams.map((team) => (
              <div key={team.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamCrest team={team} size="sm" />
                    <b className="truncate">{team.name}</b>
                  </span>
                  <span className="shrink-0 font-display font-semibold">{money(team.purse)}</span>
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full" style={{ width: `${(team.purse / maxPurse) * 100}%`, background: team.color }} />
                  <div className="h-full bg-white/20" style={{ width: `${(team.spent / maxPurse) * 100}%` }} />
                </div>
              </div>
            ))}
            {!auction.teams.length && <p className="text-sm text-slate-500">No teams yet.</p>}
          </div>
        </Panel>

        <Panel title="Activity">
          {history.length ? (
            <ul className="space-y-2">
              {history.map((event) => {
                const style = eventStyle[event.kind] ?? eventStyle.bid;
                return (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase" style={{ color: style.tone, background: `${style.tone}1f` }}>
                      {style.label}
                    </span>
                    <span className="min-w-0">
                      <span className="block">{event.message}</span>
                      <span className="text-xs text-slate-500">{event.at}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing recorded yet.</p>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-2xl font-semibold uppercase tracking-wide">Squads</h2>
        <TeamSummaryCards auction={auction} />
      </div>
    </section>
  );
}

function LeaderBadge({ label }: { label: "Owner" | "Captain" }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${label === "Owner" ? "bg-gold/20 text-gold" : "bg-cyan/20 text-cyan"}`}
    >
      {label === "Captain" ? "C · Captain" : "Owner"}
    </span>
  );
}

/** Owner / captain row at the top of a squad (photo when the captain is one of the players). */
function LeaderRow({ name, label, player }: { name: string; label: "Owner" | "Captain"; player?: Player }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/20 bg-gold/[.06] px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <PlayerPhoto player={player ?? { name, role: "", photo: undefined }} size="xs" />
        <b className="truncate">{name}</b>
      </span>
      <LeaderBadge label={label} />
    </div>
  );
}

export function TeamSummaryCards({ auction }: { auction: Auction }) {
  if (!auction.teams.length) return <Empty text="Add teams to show purse cards and purchased squads." />;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {auction.teams.map((team) => {
        const bought = auction.players.filter((player) => player.status === "sold" && player.team === team.name);
        const isCaptain = (name: string) => !!team.captain && name.trim().toLowerCase() === team.captain.trim().toLowerCase();
        const captainPlayer = team.captain ? auction.players.find((player) => isCaptain(player.name)) : undefined;
        const captainBought = bought.some((player) => isCaptain(player.name));
        const total = team.purse + team.spent || 1;
        const pursePercent = Math.max(0, Math.min(100, (team.purse / total) * 100));

        return (
          <article key={team.id} className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[.05] p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl" style={{ background: `${team.color}40` }} />
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: team.color }} />
            <div className="relative flex items-center gap-4">
              <TeamCrest team={team} size="lg" />
              <div className="min-w-0">
                <h3 className="truncate font-display text-2xl font-semibold uppercase tracking-wide">{team.name}</h3>
                <p className="text-sm text-slate-400">
                  Owner · {team.owner}
                  {team.captain ? ` · Captain · ${captainPlayer?.name ?? team.captain}` : ""}
                </p>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
              <Stat label="Purse" value={money(team.purse)} />
              <Stat label="Spent" value={money(team.spent)} />
              <Stat label="Slots" value={team.slots} />
            </div>
            <div className="relative mt-4 h-2 rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${pursePercent}%`, background: team.color }} />
            </div>

            <div className="relative mt-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Squad · {bought.length}</p>
              <div className="mt-3 space-y-2">
                {/* Team leaders first: owner, then captain (unless the captain is one of the bought players, who is tagged below). */}
                {team.owner && <LeaderRow name={team.owner} label="Owner" />}
                {captainPlayer && !captainBought ? <LeaderRow name={captainPlayer.name} label="Captain" player={captainPlayer} /> : null}
                {team.captain && !captainPlayer ? <LeaderRow name={team.captain} label="Captain" /> : null}
                {bought.map((player) => (
                  <div key={player.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <PlayerPhoto player={player} size="xs" />
                      <span className="min-w-0">
                        <b className="flex items-center gap-1.5 truncate">
                          {player.name}
                          {isCaptain(player.name) && <LeaderBadge label="Captain" />}
                        </b>
                        <small className="text-slate-500">{canonicalRole(player.role)}</small>
                      </span>
                    </span>
                    <span className="font-display font-semibold text-gold">{money(player.price || 0)}</span>
                  </div>
                ))}
                {!bought.length && <p className="rounded-2xl border border-dashed border-white/15 px-3 py-4 text-sm text-slate-500">No players bought yet.</p>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
