/** Shown before every amount. Change this one value to use another symbol (e.g. "💵" or "₹"). */
export const CURRENCY = "💰";
export const points = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
// The word joiner (U+2060) keeps the symbol and the number on the same line.
export const money = (n: number) => `${CURRENCY}⁠${points(n)}`;
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

/** The app's player roles. */
export const ROLES = ["Batter", "Bowler", "All-rounder", "Wicketkeeper"] as const;

const ROLE_COLORS: Record<string, string> = {
  Batter: "#38bdf8",
  Bowler: "#fb923c",
  "All-rounder": "#a78bfa",
  Wicketkeeper: "#facc15",
};

/**
 * Maps any spelling of a role to one of ROLES, so "All rounder", "Allrounder", "all-rounder",
 * "Batsman", "WK", "Spinner", "Fast bowler" or "Off spin" all match. Unknown text is kept as typed.
 */
export function canonicalRole(value: string | undefined) {
  const text = (value ?? "").trim();
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return "Batter";
  if (key.includes("keep") || key.startsWith("wk") || key.includes("wicketk")) return "Wicketkeeper";
  if (key.includes("allround") || /\ball\b/i.test(text)) return "All-rounder";
  if (["bowl", "spin", "fast", "pace", "seam", "medium", "legbreak", "offbreak", "swing"].some((word) => key.includes(word))) return "Bowler";
  if (key.includes("bat")) return "Batter";
  return text;
}

export const roleColor = (role: string) => ROLE_COLORS[canonicalRole(role)] ?? "#94a3b8";

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
