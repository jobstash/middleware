import type { JobListResult } from "src/shared/types";

export interface JobFeedGroup {
  key: string;
  organizationId: string | null;
  totalJobs: number;
  jobs: JobListResult[];
}

export interface JobFeedPage<T> {
  page: number;
  count: number;
  total: number;
  totalJobs: number;
  data: T[];
}

export type JobFeedResult =
  | (JobFeedPage<JobFeedGroup> & { mode: "grouped" })
  | (JobFeedPage<JobListResult> & { mode: "individual" });
