import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Client, createClient } from "./generated";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import {
  Grant,
  GrantProjectMetrics,
  RawGrantProjectMetrics,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { uniq } from "lodash";

@Injectable()
export class GrantsService {
  private readonly logger = new CustomLogger(GrantsService.name);
  private readonly GRANT_ID =
    "bafkreihfl3dqpsmrnbrhuxufflbjwozrln3nbdxe7fidfwnyilg4y6kkzu";
  private client: Client;

  constructor(
    readonly configService: ConfigService,
    private readonly googleBigQueryService: GoogleBigQueryService,
  ) {
    this.client = createClient({
      url: configService.get("GRANTS_STACK_INDEXER_URL"),
      batch: true,
      cache: "reload",
      mode: "cors",
    });
  }

  async getGrantsListResults(): Promise<Grant[]> {
    try {
      const result = await this.client.query({
        rounds: {
          __args: {
            filter: {
              roundMetadataCid: {
                equalTo: this.GRANT_ID,
              },
            },
          },
          tags: true,
          applications: {
            __args: {
              filter: {
                status: {
                  equalTo: "APPROVED",
                },
              },
            },
            uniqueDonorsCount: true,
            totalDonationsCount: true,
            totalAmountDonatedInUsd: true,
            tags: true,
            status: true,
            project: {
              name: true,
              tags: true,
            },
          },
        },
      });

      const projects = uniq(
        result.rounds.reduce((acc, round) => {
          const projects = round.applications.map(m =>
            m.project.name.toLowerCase(),
          );
          return [...acc, ...projects];
        }, [] as string[]),
      );

      const metrics = await this.googleBigQueryService.getGrantProjectsMetrics(
        projects,
      );

      const grants = result.rounds.map(x => ({
        tags: x.tags,
        grantees: x.applications.map(app => {
          const projectMetrics = (metrics.find(
            m => m.display_name === app.project.name,
          ) ?? {}) as RawGrantProjectMetrics;
          const parsedMetrics = (
            projectMetrics
              ? {
                  projectId: projectMetrics?.project_id,
                  projectSource: projectMetrics?.project_source,
                  projectNamespace: projectMetrics?.project_namespace,
                  projectName: projectMetrics?.project_name,
                  displayName: projectMetrics?.display_name,
                  eventSource: projectMetrics?.event_source,
                  repositoryCount: projectMetrics?.repository_count,
                  starCount: projectMetrics?.star_count,
                  forkCount: projectMetrics?.fork_count,
                  contributorCount: projectMetrics?.contributor_count,
                  contributorCountSixMonths:
                    projectMetrics?.contributor_count_6_months,
                  newContributorCountSixMonths:
                    projectMetrics?.new_contributor_count_6_months,
                  fulltimeDeveloperAverageSixMonths:
                    projectMetrics?.fulltime_developer_average_6_months,
                  activeDeveloperCountSixMonths:
                    projectMetrics?.active_developer_count_6_months,
                  commitCountSixMonths: projectMetrics?.commit_count_6_months,
                  openedPullRequestCountSixMonths:
                    projectMetrics?.opened_pull_request_count_6_months,
                  mergedPullRequestCountSixMonths:
                    projectMetrics?.merged_pull_request_count_6_months,
                  openedIssueCountSixMonths:
                    projectMetrics?.opened_issue_count_6_months,
                  closedIssueCountSixMonths:
                    projectMetrics?.closed_issue_count_6_months,
                  firstCommitDate: projectMetrics?.first_commit_date?.value
                    ? new Date(
                        projectMetrics?.first_commit_date?.value,
                      ).getTime()
                    : undefined,
                  lastCommitDate: projectMetrics?.last_commit_date?.value
                    ? new Date(
                        projectMetrics?.last_commit_date?.value,
                      ).getTime()
                    : undefined,
                }
              : {}
          ) as GrantProjectMetrics;

          return {
            ...app,
            project: {
              ...app.project,
              metrics: projectMetrics ? parsedMetrics : undefined,
            },
          };
        }),
      }));

      return grants;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getGrantsListResults ${err.message}`);
      return [];
    }
  }
}
