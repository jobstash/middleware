export type JobMarketDirection =
  | "up"
  | "down"
  | "flat"
  | "new"
  | "insufficient";

export interface JobMarketSalary {
  medianMonthlyUsd: number | null;
  meanMonthlyUsd: number | null;
  p25MonthlyUsd: number | null;
  p75MonthlyUsd: number | null;
  sampleCount: number;
  coverage: number;
  reliable: boolean;
}

export interface JobMarketPoint {
  date: string;
  activeJobs: number;
  hiringCompanies: number;
  newJobs: number;
  salary: JobMarketSalary;
  provenance: "reconstructed" | "snapshot";
  sampledAt: string;
}

export interface JobMarketMomentum {
  periodDays: 7;
  currentJobs: number;
  previousJobs: number;
  absoluteChange: number;
  percentChange: number | null;
  direction: JobMarketDirection;
}

export interface PillarMarketData {
  asOf: string;
  pillar: { kind: string; slug: string; label: string };
  current: JobMarketPoint;
  momentum: JobMarketMomentum;
  history: JobMarketPoint[];
}

export interface JobMarketTicker {
  kind: string;
  slug: string;
  label: string;
  current: JobMarketPoint;
  momentum: JobMarketMomentum;
  eligibleMover: boolean;
}

export interface JobMarketOverviewData {
  asOf: string;
  market: JobMarketTicker;
  classifications: JobMarketTicker[];
  movers: {
    bullish: JobMarketTicker[];
    cooling: JobMarketTicker[];
  };
}
