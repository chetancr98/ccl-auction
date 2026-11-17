import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { initials, roleColor, textOn } from "@/lib/format";
import type { Player, Team } from "@/lib/types";

export function PlayerPhoto({
  player,
  size = "md",
}: {
  player: Pick<Player, "name" | "role" | "photo">;
  size?: "xs" | "sm" | "md" | "lg" | "hero";
}) {
  const sizes = {
    xs: "h-9 w-9 rounded-xl text-xs",
    sm: "h-12 w-12 rounded-2xl text-sm",
    md: "h-16 w-16 rounded-2xl text-lg",
    lg: "h-24 w-24 rounded-3xl text-2xl",
    hero: "h-40 w-40 rounded-[2rem] text-5xl md:h-56 md:w-56",
  };
  const tone = roleColor(player.role);

  return (
    <span
      className={`${sizes[size]} relative grid shrink-0 place-items-center overflow-hidden border border-white/15 shadow-[0_16px_45px_rgba(0,0,0,.28)]`}
      style={{ background: `linear-gradient(145deg, ${tone}55, #0b1226 70%)` }}
    >
      {player.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.photo} alt={player.name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-display font-bold tracking-wide text-white/90">{initials(player.name)}</span>
      )}
    </span>
  );
}

export function TeamCrest({ team, size = "md" }: { team: Pick<Team, "short" | "color" | "name">; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-11 w-11 text-sm", lg: "h-16 w-16 text-xl" };
  return (
    <span
      title={team.name}
      className={`${sizes[size]} grid shrink-0 place-items-center rounded-full font-display font-bold tracking-wider ring-2 ring-white/20`}
      style={{ background: `radial-gradient(circle at 30% 25%, ${team.color}, ${team.color}cc 55%, #0b1020 140%)`, color: textOn(team.color) }}
    >
      {team.short}
    </span>
  );
}

export function RoleTag({ role }: { role: string }) {
  const tone = roleColor(role);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: tone, borderColor: `${tone}55`, background: `${tone}14` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      {role}
    </span>
  );
}

export function StatusTag({ status, team }: { status: string; team?: string }) {
  const styles: Record<string, string> = {
    sold: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    unsold: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    available: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  };
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles[status] ?? styles.available}`}>
      {status === "sold" && team ? `Sold · ${team}` : status}
    </span>
  );
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.75rem] border border-white/10 bg-white/[.045] p-5 shadow-[0_18px_70px_rgba(0,0,0,.2)] backdrop-blur ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, icon, hint }: { label: string; value: string | number; icon?: ReactNode; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.05] p-5">
      <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[.16em] text-slate-400">
        <p>{label}</p>
        {icon ? <span className="text-cyan">{icon}</span> : null}
      </div>
      <b className="mt-2 block font-display text-4xl font-semibold tracking-wide">{value}</b>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <b className="mt-1 block font-display text-lg font-semibold tracking-wide">{value}</b>
    </div>
  );
}

export function Input({
  label,
  value,
  on,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  on: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-semibold text-slate-300">
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => on(event.target.value)}
        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm outline-none transition focus:border-cyan focus:bg-black/30"
      />
    </label>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="mt-4 max-h-56 overflow-auto pr-1">{children}</div>;
}

export function Item({ label, lead, edit, del }: { label: string; lead?: ReactNode; edit: () => void; del: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-sm last:border-0">
      <span className="flex min-w-0 items-center gap-2">
        {lead}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button type="button" onClick={edit} aria-label={`Edit ${label}`} className="text-cyan transition hover:text-white">
          <Pencil size={15} />
        </button>
        <button type="button" onClick={del} aria-label={`Delete ${label}`} className="text-red-300 transition hover:text-red-200">
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );
}

export function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="mt-7 rounded-[1.75rem] border border-dashed border-white/15 bg-white/[.025] p-10 text-center text-slate-400">
      {text}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}
