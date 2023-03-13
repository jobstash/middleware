export type JobListOrder = "asc" | "desc";
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
  | "headCount";
export type DateRange =
  | "today"
  | "this-week"
  | "this-month"
  | "past-2-weeks"
  | "past-3-months"
  | "past-6-months";
