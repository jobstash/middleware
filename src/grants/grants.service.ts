import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Client, createClient } from "./generated";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import {
  Grant,
  GrantMetadata,
  GrantProjectMetrics,
  KarmaGapGrantProgram,
  RawGrantProjectMetrics,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { uniq } from "lodash";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";

@Injectable()
export class GrantsService {
  private readonly logger = new CustomLogger(GrantsService.name);
  private readonly GRANT_ID =
    "bafkreihfl3dqpsmrnbrhuxufflbjwozrln3nbdxe7fidfwnyilg4y6kkzu";
  private client: Client;

  constructor(
    @InjectConnection()
    private readonly neogma: Neogma,
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

  getGrantsListResults = async (): Promise<KarmaGapGrantProgram[]> => {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (program:KarmaGapProgram)
        RETURN program {
          .*,
          status: [(program)-[:HAS_STATUS]->(status:KarmaGapStatus) | status.name][0],
          eligibility: [(program)-[:HAS_ELIGIBILITY]->(eligibility:KarmaGapEligibility) | eligibility {
            .*,
            requirements: apoc.coll.toSet([(eligibility)-[:HAS_REQUIREMENT]->(requirement:KarmaGapRequirement) | requirement.description])
          }][0],
          socialLinks: [
            (program)-[:HAS_SOCIAL_LINK]->(socialLink:KarmaGapSocials) | socialLink {
              .*
            }
          ][0],
          quadraticFundingConfig: [
            (program)-[:HAS_QUADRATIC_FUNDING_CONFIG]->(quadraticFundingConfig:KarmaGapQuadraticFundingConfig) | quadraticFundingConfig {
              .*
            }
          ][0],
          support: [
            (program)-[:HAS_SUPPORT]->(support:KarmaGapSupport) | support {
              .*
            }
          ][0],
          metadata: [
            (program)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata) | metadata {
              .*,
              categories: apoc.coll.toSet([(program)-[:HAS_CATEGORY]->(category) | category.name]),
              ecosystems: apoc.coll.toSet([(program)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
              organizations: apoc.coll.toSet([(program)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
              networks: apoc.coll.toSet([(program)-[:HAS_NETWORK]->(network) | network.name]),
              grantTypes: apoc.coll.toSet([(program)-[:HAS_GRANT_TYPE]->(grantType) | grantType.name]),
              tags: apoc.coll.toSet([(program)-[:HAS_TAG]->(tag) | tag.name]),
              platformsUsed: apoc.coll.toSet([(program)-[:HAS_PLATFORM_USED]->(platform) | platform.name])
            }
          ][0]
        } as program
      `,
    );

    const programs = result.records.map(
      record => record.get("program") as KarmaGapGrantProgram,
    );

    this.logger.log(`Found ${programs.length} programs`);

    return programs;
  };

  async getGrantsList(): Promise<Grant[]> {
    try {
      const programs = await this.getGrantsListResults();

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
          roundMetadata: true,
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

      const grants = programs.map(p => {
        const grantData = result.rounds.find(
          x => p.name === (x.roundMetadata as GrantMetadata).name,
        );

        return {
          ...p,
          tags: grantData?.tags ?? [],
          grantees: (grantData?.applications ?? []).map(app => {
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
        };
      });

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
