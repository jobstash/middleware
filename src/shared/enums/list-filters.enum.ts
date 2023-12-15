export type ListOrder = "asc" | "desc";
export type JobListOrderBy =
  | "publicationDate"
  | "tvl"
  | "salary"
  | "fundingDate"
  | "monthlyVolume"
  | "monthlyFees"
  | "monthlyRevenue"
  | "audits"
  | "hacks"
  | "chains"
  | "teamSize"
  | "headcountEstimate";

export type ProjectListOrderBy =
  | "tvl"
  | "monthlyVolume"
  | "monthlyFees"
  | "monthlyRevenue"
  | "audits"
  | "hacks"
  | "chains"
  | "teamSize";

export type OrgListOrderBy =
  | "recentFundingDate"
  | "headcountEstimate"
  | "recentJobDate"
  | "rating";
export type DateRange =
  | "today"
  | "this-week"
  | "this-month"
  | "past-2-weeks"
  | "past-3-months"
  | "past-6-months";
