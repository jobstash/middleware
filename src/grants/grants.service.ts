import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Client, createClient } from "./generated";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import {
  Grantee,
  GranteeApplicationMetadata,
  GranteeDetails,
  GrantListResult,
  GrantMetadata,
  GrantProject,
  GrantProjectMetrics,
  KarmaGapGrantProgram,
  PaginatedData,
  RawGrantProjectMetrics,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";
import {
  nonZeroOrNull,
  normalizeString,
  notStringOrNull,
  paginate,
} from "src/shared/helpers";
import { Alchemy, Network } from "alchemy-sdk";
import { EIP155Chain, getChainById } from "eip155-chains";

@Injectable()
export class GrantsService {
  private readonly logger = new CustomLogger(GrantsService.name);
  private client: Client;

  constructor(
    @InjectConnection()
    private readonly neogma: Neogma,
    private readonly configService: ConfigService,
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

  getGrantBySlug = async (
    slug: string,
  ): Promise<GrantListResult | undefined> => {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (program:KarmaGapProgram {slug: $slug})
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
        { slug },
      );

      const programs = result.records.map(
        record => record.get("program") as KarmaGapGrantProgram,
      );

      if (programs.length > 0) {
        const all = programs.map(
          grant =>
            new GrantListResult({
              id: grant.programId,
              name: grant.name,
              slug: grant.slug,
              status: notStringOrNull(grant.status) ?? "Inactive",
              socialLinks: grant.socialLinks
                ? {
                    twitter: notStringOrNull(grant.socialLinks.twitter),
                    website: notStringOrNull(grant.socialLinks.website),
                    discord: notStringOrNull(grant.socialLinks.discord),
                    orgWebsite: notStringOrNull(grant.socialLinks.orgWebsite),
                    blog: notStringOrNull(grant.socialLinks.blog),
                    forum: notStringOrNull(grant.socialLinks.forum),
                    grantsSite: notStringOrNull(grant.socialLinks.grantsSite),
                  }
                : null,
              eligibility: grant.eligibility,
              metadata: {
                ...grant.metadata,
                description: notStringOrNull(grant.metadata.description),
                programBudget: nonZeroOrNull(grant.metadata.programBudget),
                amountDistributedToDate: nonZeroOrNull(
                  grant.metadata.amountDistributedToDate,
                ),
                minGrantSize: nonZeroOrNull(grant.metadata.minGrantSize),
                maxGrantSize: nonZeroOrNull(grant.metadata.maxGrantSize),
                grantsToDate: nonZeroOrNull(grant.metadata.grantsToDate),
                website: notStringOrNull(grant.metadata.website),
                projectTwitter: notStringOrNull(grant.metadata.projectTwitter),
                bugBounty: notStringOrNull(grant.metadata.bugBounty),
                logoImg: notStringOrNull(grant.metadata.logoImg),
                bannerImg: notStringOrNull(grant.metadata.bannerImg),
                createdAt: nonZeroOrNull(grant.metadata.createdAt),
                type: notStringOrNull(grant.metadata.type),
                amount: notStringOrNull(grant.metadata.amount),
              },
            }),
        );
        return all[0];
      } else {
        return undefined;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getGrantBySlug ${err.message}`);
      return undefined;
    }
  };

  getGranteesBySlug = async (
    slug: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<Grantee>> => {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (program:KarmaGapProgram {slug: $slug})
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
        { slug },
      );

      const programs = result.records.map(
        record => record.get("program") as KarmaGapGrantProgram,
      );
      const program = programs[0];
      if (program) {
        const result = await this.client.query({
          rounds: {
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
              id: true,
              distributionTransaction: true,
              chainId: true,
              uniqueDonorsCount: true,
              totalDonationsCount: true,
              totalAmountDonatedInUsd: true,
              tags: true,
              status: true,
              project: {
                name: true,
              },
              metadata: true,
            },
          },
        });

        const grantees =
          result.rounds.find(
            x => (x.roundMetadata as GrantMetadata)?.name === program.name,
          )?.applications ?? [];

        return paginate<Grantee>(
          page,
          limit,
          await Promise.all(
            grantees.map(async grantee => {
              const apiKey = this.configService.get<string>("ALCHEMY_API_KEY");
              const chainInfo: EIP155Chain = await getChainById(
                grantee.chainId,
                {
                  apiKeys: {
                    ALCHEMY_API_KEY: apiKey,
                  },
                  healthyCheckEnabled: true,
                  filters: {
                    features: ["privacy"],
                  },
                },
              );

              const alchemy = new Alchemy({
                apiKey,
                network: Network[chainInfo.network],
              });

              const transaction = await alchemy.core.getTransaction(
                grantee.distributionTransaction,
              );

              return new Grantee({
                id: grantee.id,
                name: grantee.project.name,
                slug: normalizeString(grantee.project.name),
                logoUrl: notStringOrNull(
                  (grantee.metadata as GranteeApplicationMetadata)?.application
                    .project.logoImg,
                ),
                lastFundingDate: transaction.timestamp,
                lastFundingAmount: grantee.totalAmountDonatedInUsd,
              });
            }),
          ),
        );
      } else {
        return paginate<Grantee>(page, limit, []);
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getGranteesByProgramId ${err.message}`);
      return paginate<Grantee>(page, limit, []);
    }
  };

  getGranteeDetailsBySlugs = async (
    programSlug: string,
    granteeSlug: string,
  ): Promise<ResponseWithOptionalData<GranteeDetails>> => {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (program:KarmaGapProgram {slug: $programSlug})
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
        { programSlug },
      );

      const programs = result.records.map(
        record => record.get("program") as KarmaGapGrantProgram,
      );

      if (programs.length > 0) {
        const result = await this.client.query({
          rounds: {
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
              id: true,
              uniqueDonorsCount: true,
              totalDonationsCount: true,
              totalAmountDonatedInUsd: true,
              tags: true,
              status: true,
              project: {
                name: true,
                tags: true,
              },
              metadata: true,
            },
          },
        });

        const program = programs[0];

        const project = result.rounds
          .find(x => (x.roundMetadata as GrantMetadata)?.name === program.name)
          ?.applications?.find(x => {
            return x.project.name === granteeSlug;
          });

        const metrics =
          await this.googleBigQueryService.getGrantProjectsMetrics([
            project.project.name,
          ]);

        const projectMetrics = (metrics.find(
          m => m.display_name === project.project.name,
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
                  ? new Date(projectMetrics?.first_commit_date?.value).getTime()
                  : undefined,
                lastCommitDate: projectMetrics?.last_commit_date?.value
                  ? new Date(projectMetrics?.last_commit_date?.value).getTime()
                  : undefined,
              }
            : {}
        ) as GrantProjectMetrics;

        const projectMetricsConverter = (
          metrics: GrantProjectMetrics,
        ): GrantProject["tabs"] => {
          return [
            {
              label: "Overall Summary",
              tab: "overall-summary",
              stats: [],
            },
            {
              label: "Impact Metrics",
              tab: "impact-metrics",
              stats: [],
            },
            {
              label: "Github Metrics",
              tab: "github-metrics",
              stats: [],
            },
            {
              label: "Code Metrics",
              tab: "code-metrics",
              stats: [
                {
                  label: "First Commit Date",
                  value: new Date(metrics.firstCommitDate).toDateString(),
                  stats: [],
                },
                {
                  label: "Last Commit Date",
                  value: new Date(metrics.lastCommitDate).toDateString(),
                  stats: [],
                },
                {
                  label: "Repositories",
                  value: metrics.repositoryCount.toString(),
                  stats: [],
                },
                {
                  label: "Repositories",
                  value: metrics.repositoryCount.toString(),
                  stats: [],
                },
                {
                  label: "Stars",
                  value: metrics.starCount.toString(),
                  stats: [],
                },
                {
                  label: "Forks",
                  value: metrics.forkCount.toString(),
                  stats: [],
                },
                {
                  label: "Contributor Count",
                  value: metrics.contributorCount.toString(),
                  stats: [
                    {
                      label: "Last 6 Months",
                      value: metrics.contributorCountSixMonths.toString(),
                      stats: [],
                    },
                    {
                      label: "New Contributors",
                      value: metrics.newContributorCountSixMonths.toString(),
                      stats: [],
                    },
                    {
                      label: "Fulltime Developer Average",
                      value:
                        metrics.fulltimeDeveloperAverageSixMonths.toString(),
                      stats: [],
                    },
                    {
                      label: "Active Developers",
                      value: metrics.activeDeveloperCountSixMonths.toString(),
                      stats: [],
                    },
                  ],
                },
                {
                  label: "Commit Count (6 Months)",
                  value: metrics.commitCountSixMonths.toString(),
                  stats: [],
                },
                {
                  label: "Opened Pull Request Count (6 Months)",
                  value: metrics.openedPullRequestCountSixMonths.toString(),
                  stats: [],
                },
                {
                  label: "Merged Pull Request Count (6 Months)",
                  value: metrics.mergedPullRequestCountSixMonths.toString(),
                  stats: [],
                },
                {
                  label: "Opened Issue Count (6 Months)",
                  value: metrics.openedIssueCountSixMonths.toString(),
                  stats: [],
                },
                {
                  label: "Closed Issue Count (6 Months)",
                  value: metrics.closedIssueCountSixMonths.toString(),
                  stats: [],
                },
              ],
            },
            {
              label: "Contract Address",
              tab: "contract-address",
              stats: [],
            },
          ];
        };

        const grantees = (
          result.rounds.find(
            x => (x.roundMetadata as GrantMetadata)?.name === program.name,
          )?.applications ?? []
        ).map(
          grantee =>
            new GranteeDetails({
              id: grantee.id,
              tags: grantee.tags,
              status: grantee.status,
              name: grantee.project.name,
              slug: normalizeString(grantee.project.name),
              description: (grantee.metadata as GranteeApplicationMetadata)
                ?.application.project.description,
              website: notStringOrNull(
                (grantee.metadata as GranteeApplicationMetadata)?.application
                  .project.website,
              ),
              logoUrl: notStringOrNull(
                (grantee.metadata as GranteeApplicationMetadata)?.application
                  .project.logoImg,
              ),
              lastFundingDate: 0,
              lastFundingAmount: grantee.totalAmountDonatedInUsd,
              projects: [
                {
                  id: (project.metadata as GranteeApplicationMetadata)
                    .application.project.id,
                  name: project.project.name,
                  tags: project.project.tags,
                  tabs: projectMetrics
                    ? projectMetricsConverter(parsedMetrics)
                    : [],
                },
              ],
            }),
        );

        const grantee = grantees.find(x => x.slug === granteeSlug);

        if (grantee) {
          return {
            success: true,
            message: "Grantee retrieved successfully",
            data: grantee,
          };
        } else {
          return {
            success: false,
            message: "Grantee not found",
          };
        }
      } else {
        return {
          success: false,
          message: "Grantee not found",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `GrantsService::getGranteeDetailsBySlugs ${err.message}`,
      );
      return {
        success: false,
        message: "Grantee not found",
      };
    }
  };

  async getGrantsList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<GrantListResult>> {
    try {
      const programs = await this.getGrantsListResults();
      const thankArb = programs.find(x => x.programId === "451");
      const others = programs.filter(x => x.programId !== "451");
      return paginate<GrantListResult>(
        page,
        limit,
        [thankArb, ...others].map(
          grant =>
            new GrantListResult({
              id: grant.programId,
              name: grant.name,
              slug: grant.slug ?? normalizeString(grant.name),
              status: notStringOrNull(grant.status) ?? "Inactive",
              socialLinks: grant.socialLinks
                ? {
                    twitter: notStringOrNull(grant.socialLinks.twitter),
                    website: notStringOrNull(grant.socialLinks.website),
                    discord: notStringOrNull(grant.socialLinks.discord),
                    orgWebsite: notStringOrNull(grant.socialLinks.orgWebsite),
                    blog: notStringOrNull(grant.socialLinks.blog),
                    forum: notStringOrNull(grant.socialLinks.forum),
                    grantsSite: notStringOrNull(grant.socialLinks.grantsSite),
                  }
                : null,
              eligibility: grant.eligibility,
              metadata: {
                ...grant.metadata,
                description: notStringOrNull(grant.metadata.description),
                programBudget: nonZeroOrNull(grant.metadata.programBudget),
                amountDistributedToDate: nonZeroOrNull(
                  grant.metadata.amountDistributedToDate,
                ),
                minGrantSize: nonZeroOrNull(grant.metadata.minGrantSize),
                maxGrantSize: nonZeroOrNull(grant.metadata.maxGrantSize),
                grantsToDate: nonZeroOrNull(grant.metadata.grantsToDate),
                website: notStringOrNull(grant.metadata.website),
                projectTwitter: notStringOrNull(grant.metadata.projectTwitter),
                bugBounty: notStringOrNull(grant.metadata.bugBounty),
                logoImg: notStringOrNull(grant.metadata.logoImg),
                bannerImg: notStringOrNull(grant.metadata.bannerImg),
                createdAt: nonZeroOrNull(grant.metadata.createdAt),
                type: notStringOrNull(grant.metadata.type),
                amount: notStringOrNull(grant.metadata.amount),
              },
            }),
        ),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getGrantsListResults ${err.message}`);
      return paginate<GrantListResult>(page, limit, []);
    }
  }
}
