"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Crown, Search, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { canonicalRole, money, points } from "@/lib/format";
import type { Auction, Player, Team } from "@/lib/types";
import { Empty, PlayerPhoto, RoleTag, StatusTag, TeamCrest } from "./ui";
import { SubDashboard, TeamSummaryCards } from "./views";

const SECTIONS = ["overview", "sold", "unsold", "teams", "players"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = { overview: "Overview", sold: "Sold", unsold: "Unsold", teams: "Teams", players: "All players" };

type SortKey = "name" | "team" | "role" | "base" | "price" | "status";
type Column = { key: SortKey | "rank"; label: string; align?: "right"; className?: string };

export function Results({ auction }: { auction?: Auction }) {
  const [section, setSection] = useState<Section>("sold");
  const [teamFilter, setTeamFilter] = useState<string | "top" | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "price", dir: -1 });

  const teamByName = useMemo(() => new Map((auction?.teams ?? []).map((team) => [team.name, team])), [auction?.teams]);

  const rows = useMemo(() => {
    if (!auction) return [];
    const needle = query.trim().toLowerCase();
    let list = auction.players.filter((player) => {
      if (section === "sold" && player.status !== "sold") return false;
      if (section === "unsold" && player.status !== "unsold") return false;
      if (section === "sold" && teamFilter !== "all" && teamFilter !== "top" && player.team !== teamFilter) return false;
      return !needle || player.name.toLowerCase().includes(needle);
    });
    const value = (player: Player): string | number => {
      switch (sort.key) {
        case "name":
          return player.name.toLowerCase();
        case "team":
          return (player.team ?? "~").toLowerCase();
        case "role":
          return canonicalRole(player.role);
        case "base":
          return player.base;
        case "status":
          return player.status;
        default:
          return player.price ?? -1;
      }
    };
    list = [...list].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.name.localeCompare(b.name);
    });
    if (section === "sold" && teamFilter === "top") list = [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 10);
    return list;
  }, [auction, section, teamFilter, query, sort]);

  if (!auction) return <Empty text="Select an auction from Home to see its results." />;

  const counts: Record<Section, number> = {
    overview: 0,
    sold: auction.players.filter((player) => player.status === "sold").length,
    unsold: auction.players.filter((player) => player.status === "unsold").length,
    teams: auction.teams.length,
    players: auction.players.length,
  };
  const totalSpend = auction.teams.reduce((sum, team) => sum + team.spent, 0);
  const topBuy = [...auction.players].filter((player) => player.status === "sold").sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];

  const columns: Column[] =
    section === "unsold"
      ? [{ key: "rank", label: "#" }, { key: "name", label: "Player" }, { key: "role", label: "Role", className: "hidden sm:table-cell" }, { key: "base", label: "Base price", align: "right" }]
      : section === "players"
        ? [
            { key: "rank", label: "#" },
            { key: "name", label: "Player" },
            { key: "status", label: "Status", className: "hidden md:table-cell" },
            { key: "team", label: "Team" },
            { key: "role", label: "Role", className: "hidden lg:table-cell" },
            { key: "base", label: "Base", align: "right", className: "hidden sm:table-cell" },
            { key: "price", label: "Winning bid", align: "right" },
          ]
        : [
            { key: "rank", label: "#" },
            { key: "name", label: "Player" },
            { key: "team", label: "Team" },
            { key: "role", label: "Role", className: "hidden md:table-cell" },
            { key: "base", label: "Base", align: "right", className: "hidden sm:table-cell" },
            { key: "price", label: "Winning bid", align: "right" },
          ];

  const toggleSort = (key: SortKey) => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "price" || key === "base" ? -1 : 1 }));

  return (
    <>
      {/* Banner */}
      <section className="stage relative overflow-hidden rounded-[2rem] border border-white/10">
        <div className="stage-lines pointer-events-none absolute inset-0" />
        <BannerArt />
        <div className="relative px-6 pb-0 pt-8 md:px-10 md:pt-10">
          <p className="text-xs font-bold uppercase tracking-[.26em] text-gold">Auction results</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold uppercase italic leading-none md:text-5xl">
            {auction.rules.name}
          </h1>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <BannerStat label="Players sold" value={counts.sold} />
            <BannerStat label="Total spend" value={money(totalSpend)} />
            {topBuy && <BannerStat label="Top buy" value={`${topBuy.name} · ${money(topBuy.price ?? 0)}`} />}
          </div>
          <nav className="-mx-2 mt-7 flex gap-1 overflow-x-auto">
            {SECTIONS.map((item) => (
              <button
                key={item}
                onClick={() => setSection(item)}
                className={`relative shrink-0 px-3 pb-3.5 pt-1 text-sm font-bold transition ${section === item ? "text-white" : "text-slate-400 hover:text-white"}`}
              >
                {SECTION_LABEL[item]}
                {item !== "overview" && <span className="ml-1.5 text-xs text-slate-500">{counts[item]}</span>}
                {section === item && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-gold" />}
              </button>
            ))}
          </nav>
        </div>
      </section>

      {section === "overview" && <SubDashboard auction={auction} showTitle={false} />}
      {section === "teams" && (
        <div className="mt-6">
          <TeamSummaryCards auction={auction} />
        </div>
      )}

      {(section === "sold" || section === "unsold" || section === "players") && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {section === "sold" && (
              <>
                <Chip active={teamFilter === "all"} onClick={() => setTeamFilter("all")} icon={<Users size={14} />}>
                  All players
                </Chip>
                <Chip active={teamFilter === "top"} onClick={() => setTeamFilter("top")} icon={<Crown size={14} />}>
                  Top buys
                </Chip>
                <span className="mx-1 hidden h-6 w-px bg-white/15 sm:block" />
                {auction.teams.map((team) => (
                  <Chip key={team.id} active={teamFilter === team.name} onClick={() => setTeamFilter(team.name)} icon={<TeamCrest team={team} size="xs" />}>
                    {team.short}
                  </Chip>
                ))}
              </>
            )}
            <label className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/[.05] px-3.5 py-2 text-sm sm:ml-auto sm:w-60">
              <Search size={15} className="text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" className="w-full bg-transparent outline-none placeholder:text-slate-500" />
            </label>
          </div>

          {rows.length ? (
            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.035]">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} className={`px-3 py-3.5 font-bold first:pl-5 last:pr-5 ${column.align === "right" ? "text-right" : ""} ${column.className ?? ""}`}>
                        {column.key === "rank" ? (
                          column.label
                        ) : (
                          <button onClick={() => toggleSort(column.key as SortKey)} className={`inline-flex items-center gap-1 hover:text-white ${sort.key === column.key ? "text-white" : ""}`}>
                            {column.label}
                            {sort.key === column.key ? sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-50" />}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[.06]">
                  {rows.map((player, index) => {
                    const team = player.team ? teamByName.get(player.team) : undefined;
                    return (
                      <tr key={player.id} className="transition hover:bg-white/[.04]">
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={`px-3 py-3 first:pl-5 last:pr-5 ${column.align === "right" ? "text-right" : ""} ${column.className ?? ""}`}
                          >
                            <Cell column={column.key} player={player} team={team} rank={index + 1} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text={section === "unsold" ? "No unsold players." : section === "sold" ? "No players sold yet." : "No players match."} />
          )}
        </>
      )}
    </>
  );
}

function Cell({ column, player, team, rank }: { column: Column["key"]; player: Player; team?: Team; rank: number }) {
  switch (column) {
    case "rank":
      return <span className="font-display text-base font-bold text-slate-500">{rank}</span>;
    case "name":
      return (
        <span className="flex min-w-0 items-center gap-3">
          <PlayerPhoto player={player} size="sm" />
          <span className="min-w-0">
            <b className="block truncate font-display text-lg font-bold uppercase tracking-wide">{player.name}</b>
            <span className="text-xs text-slate-500 md:hidden">{canonicalRole(player.role)}</span>
          </span>
        </span>
      );
    case "team":
      return team ? (
        <span className="inline-flex items-center gap-2">
          <TeamCrest team={team} size="sm" />
          <span className="hidden font-bold sm:inline">{team.short}</span>
        </span>
      ) : (
        <span className="text-slate-500">—</span>
      );
    case "role":
      return <RoleTag role={player.role} />;
    case "status":
      return <StatusTag status={player.status} />;
    case "base":
      return <span className="font-display text-base font-semibold text-slate-300">{money(player.base)}</span>;
    case "price":
      return player.price !== undefined ? <span className="font-display text-xl font-extrabold italic text-gold">{money(player.price)}</span> : <span className="text-slate-500">—</span>;
    default:
      return null;
  }
}

function Chip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3.5 text-xs font-bold transition ${
        active ? "border-white bg-white text-slate-900" : "border-white/10 bg-white/[.05] text-slate-200 hover:bg-white/10"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function BannerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">{label}</p>
      <p className="font-display text-2xl font-bold uppercase tracking-wide text-white">{value}</p>
    </div>
  );
}

/** Decorative stumps, bat and ball line art on the right of the banner. */
function BannerArt() {
  return (
    <svg viewBox="0 0 420 260" className="pointer-events-none absolute -right-6 top-0 hidden h-full w-auto opacity-60 md:block" aria-hidden="true">
      <defs>
        <linearGradient id="art-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#art-gold)" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="300" cy="120" r="105" strokeOpacity=".25" />
        <circle cx="300" cy="120" r="70" strokeOpacity=".35" strokeDasharray="4 10" />
        <path d="M250 60v140M280 52v148M310 60v140" />
        <path d="M244 58h72" />
        <path d="M352 210l40-150 14 4-40 150z" />
        <path d="M392 60l8-28" strokeWidth="5" />
      </g>
      <circle cx="198" cy="186" r="15" fill="url(#art-gold)" opacity=".85" />
      <path d="M186 180c8 4 16 6 24 4" stroke="#7c2d12" strokeWidth="1.5" fill="none" />
      <g fill="#ffca5f" opacity=".5">
        {Array.from({ length: 18 }, (_, i) => (
          <circle key={i} cx={30 + (i % 6) * 22} cy={30 + Math.floor(i / 6) * 22} r={2.2} />
        ))}
      </g>
    </svg>
  );
}
