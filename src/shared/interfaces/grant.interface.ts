import { ApiProperty } from "@nestjs/swagger";
import { ApplicationStatus } from "src/grants/generated";

export class RawGrantProjectMetrics {
  @ApiProperty()
  project_id: string;

  @ApiProperty()
  project_source: string;

  @ApiProperty()
  project_namespace: string;

  @ApiProperty()
  project_name: string;

  @ApiProperty()
  display_name: string;

  @ApiProperty()
  event_source: string;

  @ApiProperty()
  repository_count: number;

  @ApiProperty()
  first_commit_date: {
    value: string;
  };

  @ApiProperty()
  last_commit_date: {
    value: string;
  };

  @ApiProperty()
  star_count: number;

  @ApiProperty()
  fork_count: number;

  @ApiProperty()
  contributor_count: number;

  @ApiProperty()
  contributor_count_6_months: number;

  @ApiProperty()
  new_contributor_count_6_months: number;

  @ApiProperty()
  fulltime_developer_average_6_months: number;

  @ApiProperty()
  active_developer_count_6_months: number;

  @ApiProperty()
  commit_count_6_months: number;

  @ApiProperty()
  opened_pull_request_count_6_months: number;

  @ApiProperty()
  merged_pull_request_count_6_months: number;

  @ApiProperty()
  opened_issue_count_6_months: number;

  @ApiProperty()
  closed_issue_count_6_months: number;
}

export class GrantProjectMetrics {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectSource: string;

  @ApiProperty()
  projectNamespace: string;

  @ApiProperty()
  projectName: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  eventSource: string;

  @ApiProperty()
  repositoryCount: number;

  @ApiProperty()
  firstCommitDate: number;

  @ApiProperty()
  lastCommitDate: number;

  @ApiProperty()
  starCount: number;

  @ApiProperty()
  forkCount: number;

  @ApiProperty()
  contributorCount: number;

  @ApiProperty()
  contributorCountSixMonths: number;

  @ApiProperty()
  newContributorCountSixMonths: number;

  @ApiProperty()
  fulltimeDeveloperAverageSixMonths: number;

  @ApiProperty()
  activeDeveloperCountSixMonths: number;

  @ApiProperty()
  commitCountSixMonths: number;

  @ApiProperty()
  openedPullRequestCountSixMonths: number;

  @ApiProperty()
  mergedPullRequestCountSixMonths: number;

  @ApiProperty()
  openedIssueCountSixMonths: number;

  @ApiProperty()
  closedIssueCountSixMonths: number;
}

export class GrantProject {
  @ApiProperty()
  name: string;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  metrics: GrantProjectMetrics;
}

export class Grantee {
  @ApiProperty()
  uniqueDonorsCount: number;

  @ApiProperty()
  totalDonationsCount: number;

  @ApiProperty()
  totalAmountDonatedInUsd: number;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  status: ApplicationStatus;

  @ApiProperty()
  project: GrantProject;
}

export class Grant {
  @ApiProperty()
  tags: string[];

  @ApiProperty()
  grantees: Grantee[];
}
