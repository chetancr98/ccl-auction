export const points = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const money = (n: number) => `${points(n)} pts`;
export const stamp = () => new Date().toLocaleString();

/** The raise that applies when the current bid is `amount` (highest tier whose `from` has been reached). */
export function incrementAt(rules: { increment: number; incrementTiers?: { from: number; step: number }[] }, amount: number) {
  let step = rules.increment;
  let reached = -Infinity;
  for (const tier of rules.incrementTiers ?? []) {
    if (tier.step > 0 && amount >= tier.from && tier.from >= reached) {
      step = tier.step;
      reached = tier.from;
    }
  }
  return step;
}

export const initials =(name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const ROLE_COLORS: Record<string, string> = {
  Batter: "#38bdf8",
  "All-rounder": "#a78bfa",
  "Fast bowler": "#fb923c",
  Spinner: "#34d399",
  Wicketkeeper: "#facc15",
};

export const roleColor = (role: string) => ROLE_COLORS[role] ?? "#94a3b8";

/** Picks dark or light text for a solid background colour. */
export function textOn(hex: string) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#ffffff";
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0b1020" : "#ffffff";
}
