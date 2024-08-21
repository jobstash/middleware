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
  GrantProjectCodeMetrics,
  KarmaGapGrantProgram,
  PaginatedData,
  RawGrantProjectCodeMetrics,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";
import {
  nonZeroOrNull,
  sluggify,
  notStringOrNull,
  paginate,
} from "src/shared/helpers";
import { Alchemy, Network } from "alchemy-sdk";
// import { EIP155Chain, getChainById } from "eip155-chains";

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
            (program)-[:HAS_SOCIAL_LINKS]->(socialLink:KarmaGapSocials) | socialLink {
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
              categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
              ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
              organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
              networks: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
              grantTypes: apoc.coll.toSet([(metadata)-[:HAS_GRANT_TYPE]->(grantType) | grantType.name]),
              tags: apoc.coll.toSet([(metadata)-[:HAS_TAG]->(tag) | tag.name]),
              platformsUsed: apoc.coll.toSet([(metadata)-[:HAS_PLATFORM_USED]->(platform) | platform.name])
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
            (program)-[:HAS_SOCIAL_LINKS]->(socialLink:KarmaGapSocials) | socialLink {
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
              categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
              ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
              organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
              networks: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
              grantTypes: apoc.coll.toSet([(metadata)-[:HAS_GRANT_TYPE]->(grantType) | grantType.name]),
              tags: apoc.coll.toSet([(metadata)-[:HAS_TAG]->(tag) | tag.name]),
              platformsUsed: apoc.coll.toSet([(metadata)-[:HAS_PLATFORM_USED]->(platform) | platform.name])
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
            (program)-[:HAS_SOCIAL_LINKS]->(socialLink:KarmaGapSocials) | socialLink {
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
              categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
              ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
              organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
              networks: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
              grantTypes: apoc.coll.toSet([(metadata)-[:HAS_GRANT_TYPE]->(grantType) | grantType.name]),
              tags: apoc.coll.toSet([(metadata)-[:HAS_TAG]->(tag) | tag.name]),
              platformsUsed: apoc.coll.toSet([(metadata)-[:HAS_PLATFORM_USED]->(platform) | platform.name])
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
          program.programId === "451"
            ? result.rounds.find(
                x =>
                  (x.roundMetadata as GrantMetadata)?.name ===
                  "GG21: Thriving Arbitrum Summer",
              )?.applications ?? []
            : result.rounds.find(
                x => (x.roundMetadata as GrantMetadata)?.name === program.name,
              )?.applications ?? [];

        return paginate<Grantee>(
          page,
          limit,
          await Promise.all(
            grantees.map(async grantee => {
              const apiKey = this.configService.get<string>("ALCHEMY_API_KEY");

              const alchemy = new Alchemy({
                apiKey,
                network: Network.ARB_MAINNET,
              });

              const transaction = grantee.distributionTransaction
                ? await alchemy.core.getTransaction(
                    grantee.distributionTransaction,
                  )
                : {
                    timestamp: 0,
                  };

              const logoIpfs = notStringOrNull(
                (grantee.metadata as GranteeApplicationMetadata)?.application
                  .project.logoImg,
              );

              return new Grantee({
                id: grantee.id,
                name: grantee.project.name,
                slug: sluggify(grantee.project.name),
                logoUrl: logoIpfs ? `https://${logoIpfs}.ipfs.dweb.link` : null,
                lastFundingDate: nonZeroOrNull(transaction.timestamp),
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
            (program)-[:HAS_SOCIAL_LINKS]->(socialLink:KarmaGapSocials) | socialLink {
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
              categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
              ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
              organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
              networks: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
              grantTypes: apoc.coll.toSet([(metadata)-[:HAS_GRANT_TYPE]->(grantType) | grantType.name]),
              tags: apoc.coll.toSet([(metadata)-[:HAS_TAG]->(tag) | tag.name]),
              platformsUsed: apoc.coll.toSet([(metadata)-[:HAS_PLATFORM_USED]->(platform) | platform.name])
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
              distributionTransaction: true,
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

        const project = (
          program.programId === "451"
            ? result.rounds.find(
                x =>
                  (x.roundMetadata as GrantMetadata)?.name ===
                  "GG21: Thriving Arbitrum Summer",
              )?.applications ?? []
            : result.rounds.find(
                x => (x.roundMetadata as GrantMetadata)?.name === program.name,
              )?.applications ?? []
        ).find(x => {
          return sluggify(x.project.name) === granteeSlug;
        });

        const metrics =
          await this.googleBigQueryService.getGrantProjectsCodeMetrics([
            granteeSlug,
          ]);

        const projectMetrics = (metrics.find(
          m => m.project_name === granteeSlug,
        ) ?? {}) as RawGrantProjectCodeMetrics;

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
        ) as GrantProjectCodeMetrics;

        const projectMetricsConverter = (
          metrics: GrantProjectCodeMetrics,
        ): GrantProject["tabs"] => {
          return [
            // {
            //   label: "Overall Summary",
            //   tab: "overall-summary",
            //   stats: [],
            // },
            // {
            //   label: "Impact Metrics",
            //   tab: "impact-metrics",
            //   stats: [],
            // },
            // {
            //   label: "Github Metrics",
            //   tab: "github-metrics",
            //   stats: [],
            // },
            Object.values(metrics).filter(Boolean).length > 0
              ? {
                  label: "Code Metrics",
                  tab: "code-metrics",
                  stats: [
                    {
                      label: "First Commit Date",
                      value: metrics.firstCommitDate
                        ? new Date(metrics.firstCommitDate).toDateString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Last Commit Date",
                      value: metrics.lastCommitDate
                        ? new Date(metrics.lastCommitDate).toDateString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Repositories",
                      value: metrics.repositoryCount
                        ? metrics.repositoryCount.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Stars",
                      value: metrics.starCount
                        ? metrics.starCount.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Forks",
                      value: metrics.forkCount
                        ? metrics.forkCount.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Contributor Count",
                      value: metrics.contributorCount
                        ? metrics.contributorCount.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Last 6 Months",
                          value: metrics.contributorCountSixMonths
                            ? metrics.contributorCountSixMonths.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "New Contributors",
                          value: metrics.newContributorCountSixMonths
                            ? metrics.newContributorCountSixMonths.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Fulltime Developer Average",
                          value: metrics.fulltimeDeveloperAverageSixMonths
                            ? metrics.fulltimeDeveloperAverageSixMonths.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Active Developers",
                          value: metrics.activeDeveloperCountSixMonths
                            ? metrics.activeDeveloperCountSixMonths.toString()
                            : "N/A",
                          stats: [],
                        },
                      ],
                    },
                    {
                      label: "Commit Count (6 Months)",
                      value: metrics.commitCountSixMonths
                        ? metrics.commitCountSixMonths.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Pull Request Count (6 Months)",
                      value: metrics.openedPullRequestCountSixMonths
                        ? metrics.openedPullRequestCountSixMonths.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Merged Pull Request Count (6 Months)",
                      value: metrics.mergedPullRequestCountSixMonths
                        ? metrics.mergedPullRequestCountSixMonths.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Issue Count (6 Months)",
                      value: metrics.openedIssueCountSixMonths
                        ? metrics.openedIssueCountSixMonths.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Closed Issue Count (6 Months)",
                      value: metrics.closedIssueCountSixMonths
                        ? metrics.closedIssueCountSixMonths.toString()
                        : "N/A",
                      stats: [],
                    },
                  ],
                }
              : null,
            // {
            //   label: "Contract Address",
            //   tab: "contract-address",
            //   stats: [],
            // },
          ].filter(Boolean);
        };

        const grantees = (
          program.programId === "451"
            ? result.rounds.find(
                x =>
                  (x.roundMetadata as GrantMetadata)?.name ===
                  "GG21: Thriving Arbitrum Summer",
              )?.applications ?? []
            : result.rounds.find(
                x => (x.roundMetadata as GrantMetadata)?.name === program.name,
              )?.applications ?? []
        ).map(async grantee => {
          const apiKey = this.configService.get<string>("ALCHEMY_API_KEY");

          const alchemy = new Alchemy({
            apiKey,
            network: Network.ARB_MAINNET,
          });

          const transaction = grantee.distributionTransaction
            ? await alchemy.core.getTransaction(grantee.distributionTransaction)
            : {
                timestamp: 0,
              };

          const logoIpfs = notStringOrNull(
            (grantee.metadata as GranteeApplicationMetadata)?.application
              .project.logoImg,
          );
          return new GranteeDetails({
            id: grantee.id,
            tags: grantee.tags,
            status: grantee.status,
            name: grantee.project.name,
            slug: sluggify(grantee.project.name),
            description: (grantee.metadata as GranteeApplicationMetadata)
              ?.application.project.description,
            website: notStringOrNull(
              (grantee.metadata as GranteeApplicationMetadata)?.application
                .project.website,
            ),
            logoUrl: logoIpfs ? `https://${logoIpfs}.ipfs.dweb.link` : null,
            lastFundingDate: nonZeroOrNull(transaction.timestamp),
            lastFundingAmount: grantee.totalAmountDonatedInUsd,
            projects: [
              {
                id: (project.metadata as GranteeApplicationMetadata).application
                  .project.id,
                name: project.project.name,
                tags: project.project.tags,
                tabs: projectMetrics
                  ? projectMetricsConverter(parsedMetrics)
                  : [],
              },
            ],
          });
        });

        const grantee = (await Promise.all(grantees)).find(
          x => x.slug === granteeSlug,
        );

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
              slug: grant.slug ?? sluggify(grant.name),
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
