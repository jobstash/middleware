export interface ApplicantEnrichmentData {
  login: string;
  organizations: OrganizationWorkHistory[];
}

export interface OrganizationWorkHistory {
  login: string;
  name: string;
  repositories: AggregatedRepositoryWorkHistory[];
}

export interface RepositoryWorkHistory {
  name: string;
  data: {
    actor_login: string;
    org_login: string;
    org_name: string;
    repo_name: string;
    type:
      | "CreateEvent"
      | "DeleteEvent"
      | "IssuesEvent"
      | "PullRequestEvent"
      | "PushEvent"
      | null;
    action?: "opened" | "closed" | null;
    merged?: "true" | "false" | null;
    commit_count?: number | null;
    count: string;
    first: { value: string };
    last: { value: string };
  }[];
}

export interface AggregatedRepositoryWorkHistory {
  name: string;
  commits: {
    count: number | null;
    first: number | null;
    last: number | null;
  };
  issues: {
    count: number | null;
    first: number | null;
    last: number | null;
  };
  pull_requests: {
    count: number | null;
    first: number | null;
    last: number | null;
  };
}
