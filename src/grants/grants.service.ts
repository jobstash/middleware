import { OpenAIEmbeddings } from "@langchain/openai";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import { GrantRepository } from "src/postgres/grant.repository";
import { KARMAGAP_PROGRAM_MAPPINGS } from "src/shared/constants/daoip-karmagap-program-mappings";
import {
  nonZeroOrNull,
  notStringOrNull,
  paginate,
  slugify,
  uuidfy,
} from "src/shared/helpers";
import {
  FundingRound,
  fundingRoundToFundingEvent,
  Grantee,
  GranteeDetails,
  GrantFunding,
  grantFundingToFundingEvent,
  GrantListResult,
  GrantProject,
  KarmaGapGrantProgram,
  PaginatedData,
  RawGrantProjectCodeMetrics,
  RawGrantProjectContractMetrics,
  RawGrantProjectOnchainMetrics,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { enumApplicationStatus } from "./generated";

@Injectable()
export class GrantsService {
  private readonly logger = new CustomLogger(GrantsService.name);
  private embeddings?: OpenAIEmbeddings;

  constructor(
    private readonly grants: GrantRepository,
    private readonly googleBigQueryService: GoogleBigQueryService,
  ) {}

  query = async (
    query: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedData<GrantListResult>> => {
    try {
      const embedding = await this.getEmbeddings().embedQuery(query);
      const ids = await this.grants.searchProgramIds(embedding, 10);
      const programs = await this.getGrantsListResults();
      const results = programs.filter(x => ids.includes(x.programId));
      return paginate<GrantListResult>(
        page,
        limit,
        results.map(
          grant =>
            new GrantListResult({
              id: grant.programId,
              name: grant.name,
              slug: grant.slug ?? slugify(grant.name),
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
  };

  private getEmbeddings(): OpenAIEmbeddings {
    this.embeddings ??= new OpenAIEmbeddings();
    return this.embeddings;
  }

  getGrantsListResults = async (
    status: "active" | "inactive" | null = null,
  ): Promise<KarmaGapGrantProgram[]> => {
    const programs = (await this.grants.getPrograms())
      .map(program => program as unknown as KarmaGapGrantProgram)
      .filter(x => {
        if (status === "active") {
          return (x.status ?? "Inactive") === "Active";
        } else if (status === "inactive") {
          return [...Object.keys(KARMAGAP_PROGRAM_MAPPINGS), "451"].includes(
            `${x.programId}`,
          );
        } else {
          return true;
        }
      });

    this.logger.log(`Found ${programs.length} programs`);

    return programs;
  };

  getGrantBySlug = async (
    slug: string,
  ): Promise<GrantListResult | undefined> => {
    try {
      const programs = (await this.grants.getPrograms(slug)).map(
        program => program as unknown as KarmaGapGrantProgram,
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
                startsAt: nonZeroOrNull(grant.metadata.startsAt),
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

  getGranteesBySlug = async (slug: string): Promise<Grantee[]> => {
    try {
      const grantees = (await this.grants.getGrantees(slug)).map(
        project =>
          project as unknown as {
            id: string;
            name: string;
            slug: string;
            logoUrl: string;
            website: string;
            grantFundingData: GrantFunding[];
            vcFundingData: FundingRound[];
          },
      );

      return grantees.map(x => {
        return {
          id: x.id,
          name: x.name,
          slug: x.slug,
          logoUrl: notStringOrNull(x.logoUrl) ?? notStringOrNull(x.website),
          website: notStringOrNull(x.website),
          fundingEvents: [
            ...x.grantFundingData.map(x => grantFundingToFundingEvent(x)),
            ...x.vcFundingData.map(x => fundingRoundToFundingEvent(x)),
          ],
        };
      });
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getGranteesBySlug ${err.message}`);
      return [];
    }
  };

  getGranteeDetailsBySlugs = async (
    programSlug: string,
    granteeSlug: string,
  ): Promise<ResponseWithOptionalData<GranteeDetails>> => {
    try {
      const grantee = (
        await this.grants.getGrantees(programSlug, granteeSlug)
      )[0] as unknown as {
        id: string;
        name: string;
        slug: string;
        description: string;
        programName: string;
        website: string;
        logoUrl: string;
        grantFundingData: GrantFunding[];
        vcFundingData: FundingRound[];
      };

      if (grantee) {
        const [codeMetrics, onChainMetrics, contractMetrics] =
          await Promise.all([
            this.googleBigQueryService.getGrantProjectsCodeMetrics([
              granteeSlug,
            ]),
            this.googleBigQueryService.getGrantProjectsOnchainMetrics([
              granteeSlug,
            ]),
            this.googleBigQueryService.getGrantProjectsContractMetrics([
              granteeSlug,
            ]),
          ]);

        const projectCodeMetrics = (codeMetrics.find(
          m => m.project_name === granteeSlug,
        ) ?? {}) as RawGrantProjectCodeMetrics;

        const projectOnchainMetrics = (onChainMetrics.find(
          m => m.project_name === granteeSlug,
        ) ?? {}) as RawGrantProjectOnchainMetrics;

        const projectContractMetrics = (contractMetrics.find(
          m => m.project_name === granteeSlug,
        ) ?? {}) as RawGrantProjectContractMetrics;

        const projectMetricsConverter = (
          codeMetrics: RawGrantProjectCodeMetrics,
          onChainMetrics: RawGrantProjectOnchainMetrics,
          contractMetrics: RawGrantProjectContractMetrics,
        ): GrantProject["tabs"] => {
          const overviewStats = [
            onChainMetrics?.transaction_count
              ? {
                  label: "Total Transactions",
                  value: onChainMetrics.transaction_count.toString(),
                  stats: [],
                }
              : null,
            onChainMetrics?.address_count
              ? {
                  label: "Total Addresses",
                  value: onChainMetrics.address_count.toString(),
                  stats: [],
                }
              : null,
            codeMetrics?.contributors
              ? {
                  label: "Contributor Count",
                  value: codeMetrics.contributors
                    ? codeMetrics.contributors.toString()
                    : "N/A",
                  stats: [
                    {
                      label: "Contributors Last 6 Months",
                      value: codeMetrics.contributors_6_months
                        ? codeMetrics.contributors_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "New Contributors 6 Months",
                      value: codeMetrics.new_contributors_6_months
                        ? codeMetrics.new_contributors_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                  ],
                }
              : null,
            codeMetrics?.stars
              ? {
                  label: "GitHub Stars",
                  value: codeMetrics.stars.toString(),
                  stats: [],
                }
              : null,
            codeMetrics?.last_commit_date?.value
              ? {
                  label: "Last Commit Date",
                  value: new Date(
                    codeMetrics.last_commit_date.value,
                  ).toDateString(),
                  stats: [],
                }
              : null,
          ].filter(Boolean);

          return [
            overviewStats.length > 0
              ? {
                  label: "Overview",
                  tab: "overview",
                  stats: overviewStats,
                }
              : null,
            Object.values(onChainMetrics).filter(Boolean).length > 0
              ? {
                  label: "Onchain Metrics",
                  tab: "onchain-metrics",
                  stats: [
                    {
                      label: "Active Contract Count (90 Days)",
                      value: onChainMetrics.active_contract_count_90_days
                        ? onChainMetrics.active_contract_count_90_days.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Transaction Count",
                      value: onChainMetrics.transaction_count
                        ? onChainMetrics.transaction_count.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Transaction Count (6 Months)",
                          value: onChainMetrics.transaction_count_6_months
                            ? onChainMetrics.transaction_count_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                      ],
                    },
                    {
                      label: "Gas Fees Sum",
                      value: onChainMetrics.gas_fees_sum
                        ? onChainMetrics.gas_fees_sum.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Gas Fees Sum (6 Months)",
                          value: onChainMetrics.gas_fees_sum_6_months
                            ? onChainMetrics.gas_fees_sum_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                      ],
                    },
                    {
                      label: "Address Count",
                      value: onChainMetrics.address_count
                        ? onChainMetrics.address_count.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Address Count (90 Days)",
                          value: onChainMetrics.address_count_90_days
                            ? onChainMetrics.address_count_90_days.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "New Address Count (90 Days)",
                          value: onChainMetrics.new_address_count_90_days
                            ? onChainMetrics.new_address_count_90_days.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Returning Address Count (90 Days)",
                          value: onChainMetrics.returning_address_count_90_days
                            ? onChainMetrics.returning_address_count_90_days.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "High Activity Address Count (90 Days)",
                          value:
                            onChainMetrics.high_activity_address_count_90_days
                              ? onChainMetrics.high_activity_address_count_90_days.toString()
                              : "N/A",
                          stats: [],
                        },
                        {
                          label: "Medium Activity Address Count (90 Days)",
                          value:
                            onChainMetrics.medium_activity_address_count_90_days
                              ? onChainMetrics.medium_activity_address_count_90_days.toString()
                              : "N/A",
                          stats: [],
                        },
                        {
                          label: "Low Activity Address Count (90 Days)",
                          value:
                            onChainMetrics.low_activity_address_count_90_days
                              ? onChainMetrics.low_activity_address_count_90_days.toString()
                              : "N/A",
                          stats: [],
                        },
                        {
                          label: "Multi-Project Address Count (90 Days)",
                          value:
                            onChainMetrics.multi_project_address_count_90_days
                              ? onChainMetrics.multi_project_address_count_90_days.toString()
                              : "N/A",
                          stats: [],
                        },
                      ],
                    },
                  ],
                }
              : null,
            Object.values(codeMetrics).filter(Boolean).length > 0
              ? {
                  label: "Code Metrics",
                  tab: "code-metrics",
                  stats: [
                    {
                      label: "First Commit Date",
                      value: codeMetrics.first_commit_date
                        ? new Date(
                            codeMetrics.first_commit_date.value,
                          ).toDateString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Last Commit Date",
                      value: codeMetrics.last_commit_date
                        ? new Date(
                            codeMetrics.last_commit_date.value,
                          ).toDateString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Repositories",
                      value: codeMetrics.repositories
                        ? codeMetrics.repositories.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Stars",
                      value: codeMetrics.stars
                        ? codeMetrics.stars.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Forks",
                      value: codeMetrics.forks
                        ? codeMetrics.forks.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Contributor Count",
                      value: codeMetrics.contributors
                        ? codeMetrics.contributors.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Last 6 Months",
                          value: codeMetrics.contributors_6_months
                            ? codeMetrics.contributors_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "New Contributors",
                          value: codeMetrics.new_contributors_6_months
                            ? codeMetrics.new_contributors_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Fulltime Developer Average",
                          value: codeMetrics.avg_fulltime_devs_6_months
                            ? codeMetrics.avg_fulltime_devs_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Active Developers",
                          value: codeMetrics.avg_active_devs_6_months
                            ? codeMetrics.avg_active_devs_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                      ],
                    },
                    {
                      label: "Commit Count (6 Months)",
                      value: codeMetrics.commits_6_months
                        ? codeMetrics.commits_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Pull Request Count (6 Months)",
                      value: codeMetrics.pull_requests_opened_6_months
                        ? codeMetrics.pull_requests_opened_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Merged Pull Request Count (6 Months)",
                      value: codeMetrics.pull_requests_merged_6_months
                        ? codeMetrics.pull_requests_merged_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Issue Count (6 Months)",
                      value: codeMetrics.issues_opened_6_months
                        ? codeMetrics.issues_opened_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Closed Issue Count (6 Months)",
                      value: codeMetrics.issues_closed_6_months
                        ? codeMetrics.issues_closed_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                  ],
                }
              : null,
            Object.values(contractMetrics).filter(Boolean).length > 0
              ? {
                  label: "Contract Address",
                  tab: "contract-address",
                  stats: contractMetrics.blockchain.map(x => ({
                    label: x.name ?? "",
                    value: x.address,
                    stats: [],
                  })),
                }
              : null,
          ].filter(Boolean);
        };

        const granteeDetails = {
          id: grantee?.id,
          name: grantee?.name,
          slug: grantee?.slug,
          logoUrl:
            notStringOrNull(grantee.logoUrl) ??
            notStringOrNull(grantee.website),
          website: notStringOrNull(grantee.website),
          status: enumApplicationStatus.APPROVED,
          description: grantee.description,
          projects: [
            {
              id: uuidfy(granteeSlug),
              name: grantee?.name,
              tags: [],
              tabs: projectCodeMetrics
                ? projectMetricsConverter(
                    projectCodeMetrics,
                    projectOnchainMetrics,
                    projectContractMetrics,
                  )
                : [],
            },
          ],
          fundingEvents: [
            ...grantee.grantFundingData.map(x => grantFundingToFundingEvent(x)),
            ...grantee.vcFundingData.map(x => fundingRoundToFundingEvent(x)),
          ],
        };

        return {
          success: true,
          message: "Grantee retrieved successfully",
          data: granteeDetails,
        };
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
    status: "active" | "inactive" | null = null,
  ): Promise<PaginatedData<GrantListResult>> {
    try {
      const programs = await this.getGrantsListResults(status);
      const thankArb = programs.find(x => x.programId === "451");
      const others = programs.filter(x => x.programId !== "451");
      if (thankArb) {
        return paginate<GrantListResult>(
          page,
          limit,
          [thankArb, ...others].map(
            grant =>
              new GrantListResult({
                id: grant.programId,
                name: grant.name,
                slug: grant.slug ?? slugify(grant.name),
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
                metadata: grant.metadata
                  ? {
                      ...grant.metadata,
                      description: notStringOrNull(grant.metadata.description),
                      programBudget: nonZeroOrNull(
                        grant.metadata.programBudget,
                      ),
                      amountDistributedToDate: nonZeroOrNull(
                        grant.metadata.amountDistributedToDate,
                      ),
                      minGrantSize: nonZeroOrNull(grant.metadata.minGrantSize),
                      maxGrantSize: nonZeroOrNull(grant.metadata.maxGrantSize),
                      grantsToDate: nonZeroOrNull(grant.metadata.grantsToDate),
                      website: notStringOrNull(grant.metadata.website),
                      projectTwitter: notStringOrNull(
                        grant.metadata.projectTwitter,
                      ),
                      bugBounty: notStringOrNull(grant.metadata.bugBounty),
                      logoImg: notStringOrNull(grant.metadata.logoImg),
                      bannerImg: notStringOrNull(grant.metadata.bannerImg),
                      createdAt: nonZeroOrNull(grant.metadata.createdAt),
                      startsAt: nonZeroOrNull(grant.metadata.startsAt),
                      type: notStringOrNull(grant.metadata.type),
                      amount: notStringOrNull(grant.metadata.amount),
                    }
                  : null,
              }),
          ),
        );
      } else {
        return paginate<GrantListResult>(
          page,
          limit,
          others.map(
            grant =>
              new GrantListResult({
                id: grant.programId,
                name: grant.name,
                slug: grant.slug ?? slugify(grant.name),
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
                metadata: grant.metadata
                  ? {
                      ...grant.metadata,
                      description: notStringOrNull(grant.metadata.description),
                      programBudget: nonZeroOrNull(
                        grant.metadata.programBudget,
                      ),
                      amountDistributedToDate: nonZeroOrNull(
                        grant.metadata.amountDistributedToDate,
                      ),
                      minGrantSize: nonZeroOrNull(grant.metadata.minGrantSize),
                      maxGrantSize: nonZeroOrNull(grant.metadata.maxGrantSize),
                      grantsToDate: nonZeroOrNull(grant.metadata.grantsToDate),
                      website: notStringOrNull(grant.metadata.website),
                      projectTwitter: notStringOrNull(
                        grant.metadata.projectTwitter,
                      ),
                      bugBounty: notStringOrNull(grant.metadata.bugBounty),
                      logoImg: notStringOrNull(grant.metadata.logoImg),
                      bannerImg: notStringOrNull(grant.metadata.bannerImg),
                      createdAt: nonZeroOrNull(grant.metadata.createdAt),
                      startsAt: nonZeroOrNull(grant.metadata.startsAt),
                      type: notStringOrNull(grant.metadata.type),
                      amount: notStringOrNull(grant.metadata.amount),
                    }
                  : null,
              }),
          ),
        );
      }
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
