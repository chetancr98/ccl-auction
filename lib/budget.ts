import type { Auction, Rules, Team } from "./types";

/*
 * Auction budget rules: a team must always keep enough purse to complete its minimum squad.
 *
 *   max bid = purse − (players still needed − 1) × cheapest price of a remaining player
 *
 * e.g. purse 2,000, minimum squad 11, nobody bought yet, cheapest player 50:
 *   max bid = 2,000 − 10 × 50 = 1,500 (keeping 500 for the other 10 players).
 */

/** Players each team must end up with (defaults to 11, never more than the squad limit). */
export const minSquadOf = (rules: Pick<Rules, "maxSlots" | "minSquad">) =>
  Math.max(0, Math.min(rules.minSquad ?? Math.min(11, rules.maxSlots), rules.maxSlots));

/** Lowest price any other remaining player can be bought for (their opening bid). */
export function cheapestRemaining(auction: Auction, excludePlayerId?: string) {
  const openings = auction.players
    .filter((player) => player.status === "available" && player.id !== excludePlayerId)
    .map((player) => Math.max(player.base, auction.rules.minimumBid));
  return openings.length ? Math.min(...openings) : Math.max(auction.rules.basePrice ?? 0, auction.rules.minimumBid);
}

export function teamBudget(auction: Auction, team: Team, currentPlayerId?: string) {
  const bought = auction.players.filter((player) => player.status === "sold" && player.team === team.name).length;
  const stillNeeded = Math.max(0, minSquadOf(auction.rules) - bought);
  const reserve = Math.max(0, stillNeeded - 1) * cheapestRemaining(auction, currentPlayerId);
  return { bought, stillNeeded, reserve, maxBid: Math.max(0, team.purse - reserve) };
}

/** Plain-language problems that would make the auction impossible to finish, for the Builder. */
export function feasibilityWarnings(rules: Rules, teams: Pick<Team, "name" | "purse" | "spent">[], playerCount: number, money: (n: number) => string) {
  const warnings: string[] = [];
  const minSquad = minSquadOf(rules);
  const cheapest = Math.max(rules.basePrice ?? 0, rules.minimumBid);
  if ((rules.minSquad ?? 0) > rules.maxSlots) warnings.push(`Minimum squad (${rules.minSquad}) is larger than the maximum squad size (${rules.maxSlots}).`);
  if (teams.length && playerCount < teams.length * minSquad)
    warnings.push(`${teams.length} teams × ${minSquad} players need at least ${teams.length * minSquad} players; there are ${playerCount}.`);
  for (const team of teams) {
    const total = team.purse + team.spent;
    if (total < minSquad * cheapest) warnings.push(`${team.name}: purse ${money(total)} can't buy ${minSquad} players at ${money(cheapest)} each.`);
  }
  return warnings;
}
