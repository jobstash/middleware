export interface ApplicantEnrichmentData {
  id: string;
  login: string;
  organizations: OrganizationWorkHistory[];
}

export interface OrganizationWorkHistory {
  id: string;
  login: string;
  name: string;
  repositories: RepositoryWorkHistory[];
}

export interface RepositoryWorkHistory {
  id: string;
  name: string;
  commits: {
    authored: {
      count: number | null;
      first: string | null;
      last: string | null;
    };
    committed: {
      count: number | null;
      first: string | null;
      last: string | null;
    };
  };
  issues: {
    authored: {
      count: number | null;
      first: string | null;
      last: string | null;
    };
  };
  pull_requests: {
    authored: {
      count: number | null;
      first: string | null;
      last: string | null;
    };
    merged: {
      count: number | null;
      first: string | null;
      last: string | null;
    };
  };
}
