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
  marketRelativeScore: number | null;
  activeJobsChange: number | null;
  hiringCompaniesChange: number | null;
}

export type JobMarketSegment = "remote" | "local";

export interface JobMarketCompensation {
  segment: JobMarketSegment;
  regionSlug: string;
  regionLabel: string;
  medianMonthlyUsd: number | null;
  p25MonthlyUsd: number | null;
  p75MonthlyUsd: number | null;
  adjustedPremiumPercent: number | null;
  sampleCount: number;
  employerCount: number;
  onsiteCount: number;
  hybridCount: number;
  remoteCount: number;
  activeJobs: number;
  hiringCompanies: number;
  activeOnsiteJobs: number;
  activeHybridJobs: number;
  activeRemoteJobs: number;
  reliable: boolean;
}

export type JobMarketSkillStatus =
  | "rising"
  | "falling"
  | "stable"
  | "insufficient";

export interface JobMarketSkillSignal {
  asOf: string;
  segment: JobMarketSegment;
  status: JobMarketSkillStatus;
  currentMedianMonthlyUsd: number | null;
  baselineMedianMonthlyUsd: number | null;
  rawChangePercent: number | null;
  adjustedChangePercent: number | null;
  confidenceLowPercent: number | null;
  confidenceHighPercent: number | null;
  qValue: number | null;
  recentJobCount: number;
  baselineJobCount: number;
  recentEmployerCount: number;
  baselineEmployerCount: number;
  signalSince: string | null;
}

export interface PillarMarketData {
  asOf: string;
  pillar: { kind: string; slug: string; label: string };
  current: JobMarketPoint;
  momentum: JobMarketMomentum;
  history: JobMarketPoint[];
  compensation: JobMarketCompensation[];
  skillSignals: JobMarketSkillSignal[];
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

export interface JobMarketStateData extends JobMarketOverviewData {
  completeThrough: string;
  methodologyVersion: "market-state-v2";
  selectedClassification: string;
  range: "90" | "365" | "max";
  geography: JobMarketCompensation[];
}

export interface JobMarketSkillSummary {
  slug: string;
  label: string;
  segment: JobMarketSegment;
  current: JobMarketCompensation;
  signal: JobMarketSkillSignal | null;
  momentum: JobMarketMomentum;
  activeJobs: number;
  hiringCompanies: number;
  strongBreakout: boolean;
}

export interface JobMarketSkillListData {
  asOf: string;
  completeThrough: string;
  methodologyVersion: "market-state-v2";
  segment: JobMarketSegment;
  sort: "breakout" | "repricing" | "salary" | "demand" | "cooling";
  query: string;
  skills: JobMarketSkillSummary[];
}

export interface JobMarketSkillWeeklyPoint {
  weekStart: string;
  segment: JobMarketSegment;
  regionSlug: string;
  regionLabel: string;
  medianMonthlyUsd: number | null;
  p25MonthlyUsd: number | null;
  p75MonthlyUsd: number | null;
  adjustedPremiumPercent: number | null;
  sampleCount: number;
  employerCount: number;
  onsiteCount: number;
  hybridCount: number;
  remoteCount: number;
  reliable: boolean;
}

export interface JobMarketSkillDetailData {
  asOf: string;
  completeThrough: string;
  methodologyVersion: "market-state-v2";
  skill: { slug: string; label: string };
  signals: JobMarketSkillSignal[];
  compensation: JobMarketCompensation[];
  history: JobMarketSkillWeeklyPoint[];
}
