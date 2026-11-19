export type Team = {
  id: string;
  name: string;
  owner: string;
  short: string;
  color: string;
  /** Compressed image data URL shown next to the team name. */
  logo?: string;
  purse: number;
  spent: number;
  slots: number;
};

export type Player = {
  id: string;
  name: string;
  role: string;
  age: number;
  base: number;
  runs: number;
  wickets: number;
  status: "available" | "sold" | "unsold" | string;
  team?: string;
  price?: number;
  photo?: string;
};

/** Once the current bid reaches `from` points, each raise is `step` points. */
export type IncrementTier = { from: number; step: number };

export type Rules = {
  name: string;
  minimumBid: number;
  /** Raise used below the first tier. */
  increment: number;
  incrementTiers?: IncrementTier[];
  basePrice: number;
  maxSlots: number;
  /** Players each team must buy; bids are capped so every team can still reach it. */
  minSquad?: number;
  scheduledAt: string;
};

export type Bid = { teamId: string; team: string; amount: number; at: string };

export type AuctionEvent = {
  id: string;
  at: string;
  kind: "bid" | "sold" | "unsold" | "opened" | "undo";
  message: string;
  playerId?: string;
  teamId?: string;
  amount?: number;
  /** Epoch ms when it happened; used to replay SOLD/UNSOLD moments on every screen. */
  ts?: number;
};

/** The lot currently on the block. Stored with the auction so every screen sees the same bids. */
export type LiveLot = {
  playerId: string;
  running: boolean;
  bids: Bid[];
};

export type Auction = {
  id: string;
  rules: Rules;
  teams: Team[];
  players: Player[];
  history: AuctionEvent[];
  createdAt: string;
  live?: LiveLot;
};
