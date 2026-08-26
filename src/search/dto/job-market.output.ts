export type JobMarketDirection =
  | "up"
  | "down"
  | "flat"
  | "new"
  | "insufficient";

export type JobMarketEvidenceLevel = "insufficient" | "limited" | "strong";

export interface JobMarketFilter {
  paramKey:
    | "tags"
    | "classifications"
    | "commitments"
    | "workModes"
    | "organizations"
    | "seniority"
    | "investors"
    | "fundingRounds"
    | "fundingStages"
    | "cities"
    | "regions"
    | "countries"
    | "continents"
    | "timezones"
    | "collaborationHours";
  value: string;
}

export interface JobMarketSalary {
  medianMonthlyUsd: number | null;
  meanMonthlyUsd: number | null;
  p25MonthlyUsd: number | null;
  p75MonthlyUsd: number | null;
  sampleCount: number;
  coverage: number;
  evidenceLevel: JobMarketEvidenceLevel;
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

export interface JobMarketChangeMetric {
  current: number;
  baseline: number;
  absoluteChange: number;
  percentChange: number | null;
  direction: JobMarketDirection;
}

export interface JobMarketActivity {
  newPostings: JobMarketChangeMetric & {
    currentWindowDays: 7;
    baselineWindowDays: 7;
  };
  openInventory: JobMarketChangeMetric & {
    currentWindowDays: 7;
    baselineWindowDays: 28;
  };
  hiringEmployers: JobMarketChangeMetric & {
    currentWindowDays: 7;
    baselineWindowDays: 28;
  };
  marketComparison: {
    openInventoryPercentagePoints: number | null;
    hiringEmployersPercentagePoints: number | null;
    newPostingsPercentagePoints: number | null;
  };
}

export type JobMarketSegment = "remote" | "local";

export interface JobMarketCompensation {
  segment: JobMarketSegment;
  regionSlug: string;
  regionLabel: string;
  regionType:
    | "remote"
    | "aggregate"
    | "continent"
    | "country"
    | "region"
    | "city";
  filter: JobMarketFilter | null;
  countryCode: string | null;
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
  evidenceLevel: JobMarketEvidenceLevel;
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
  pillar: {
    kind: string;
    slug: string;
    label: string;
    filter: JobMarketFilter | null;
  };
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
  history: JobMarketPoint[];
  momentum: JobMarketMomentum;
  activity: JobMarketActivity;
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
  methodologyVersion: "market-state-v3";
  selectedClassification: string;
  selectedClassificationLabel: string;
  range: "90" | "365" | "max";
  geography: JobMarketCompensation[];
  compensationBands: JobMarketCompensationBand[];
}

export interface JobMarketCompensationBand {
  segment: JobMarketSegment;
  senioritySlug: string;
  seniorityLabel: string;
  medianMonthlyUsd: number | null;
  p25MonthlyUsd: number | null;
  p75MonthlyUsd: number | null;
  sampleCount: number;
  employerCount: number;
  reliable: boolean;
}

export interface JobMarketTopPayingBreakdown {
  slug: string;
  label: string;
  jobCount: number;
  sharePercent: number;
  medianMonthlyUsd: number;
}

export interface JobMarketTopPayingJob {
  id: string;
  shortUuid: string;
  title: string;
  href: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  classificationSlug: string;
  classificationLabel: string;
  senioritySlug: string | null;
  seniorityLabel: string | null;
  location: string | null;
  workModes: string[];
  publishedAt: string | null;
  salaryMonthlyUsd: number;
  tags: Array<{ slug: string; label: string }>;
}

export interface JobMarketTopPayingData {
  asOf: string;
  methodologyVersion: "market-top-pay-v1";
  scope: {
    classification: string;
    classificationLabel: string;
    segment: JobMarketSegment;
    regionSlug: string;
    regionLabel: string;
    regionType: JobMarketCompensation["regionType"];
    filter: JobMarketFilter | null;
  };
  availableRegions: Array<{
    regionSlug: string;
    regionLabel: string;
    regionType: Exclude<JobMarketCompensation["regionType"], "remote">;
    activeJobs: number;
    salarySampleCount: number;
  }>;
  openJobsInScope: number;
  salaryJobCount: number;
  salaryCoveragePercent: number;
  topDecileThresholdMonthlyUsd: number | null;
  topDecileJobCount: number;
  medianTopDecileMonthlyUsd: number | null;
  breakdowns: {
    classifications: JobMarketTopPayingBreakdown[];
    seniorities: JobMarketTopPayingBreakdown[];
    tags: JobMarketTopPayingBreakdown[];
  };
  jobs: JobMarketTopPayingJob[];
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
  openJobShare: number;
  strongBreakout: boolean;
}

export interface JobMarketSkillListData {
  asOf: string;
  completeThrough: string;
  methodologyVersion: "market-state-v3";
  classification: string;
  classificationLabel: string;
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
