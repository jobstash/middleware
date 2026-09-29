import type { JobListResult } from "src/shared/types";

export interface JobFeedTitle {
  id: string;
  shortUUID: string;
  title: string;
  location: string | null;
  seniority: string | null;
  classification: string | null;
}

export interface JobFeedGroup {
  key: string;
  organizationId: string | null;
  totalJobs: number;
  importRunId?: string | null;
  jobTitles?: JobFeedTitle[];
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
