import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { Alchemy, Network } from "alchemy-sdk";
import axios from "axios";
import { randomUUID } from "crypto";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import { ProjectsService } from "src/projects/projects.service";
import { KARMAGAP_PROGRAM_MAPPINGS } from "src/shared/constants/daoip-karmagap-program-mappings";
import {
  getGoogleLogoUrl,
  nonZeroOrNull,
  notStringOrNull,
  paginate,
  slugify,
  uuidfy,
} from "src/shared/helpers";
import {
  DaoipFundingData,
  DaoipProject,
  data,
  Grantee,
  GranteeApplicationMetadata,
  GranteeDetails,
  GrantListResult,
  GrantMetadata,
  GrantProject,
  KarmaGapGrantProgram,
  PaginatedData,
  RawDaoipProject,
  RawGrantProjectCodeMetrics,
  RawGrantProjectContractMetrics,
  RawGrantProjectOnchainMetrics,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Client, createClient } from "./generated";

@Injectable()
export class GrantsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new CustomLogger(GrantsService.name);
  private readonly embeddings = new OpenAIEmbeddings();
  private vectorStore: Neo4jVectorStore;
  private client: Client;

  constructor(
    @InjectConnection()
    private readonly neogma: Neogma,
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly googleBigQueryService: GoogleBigQueryService,
  ) {
    this.client = createClient({
      url: configService.get("GRANTS_STACK_INDEXER_URL"),
      batch: false,
      cache: "reload",
      mode: "cors",
    });
  }

  async onModuleInit(): Promise<void> {
    this.vectorStore = await Neo4jVectorStore.fromExistingIndex(
      this.embeddings,
      {
        url: `${this.configService.getOrThrow(
          "NEO4J_SCHEME",
        )}://${this.configService.getOrThrow(
          "NEO4J_HOST",
        )}:${this.configService.getOrThrow("NEO4J_PORT")}`,
        username: this.configService.getOrThrow("NEO4J_USERNAME"),
        password: this.configService.getOrThrow("NEO4J_PASSWORD"),
        database: this.configService.getOrThrow("NEO4J_DATABASE"),
        indexName: "grants-vector",
        searchType: "vector",
        nodeLabel: "GrantSiteChunk",
        textNodeProperty: "text",
        embeddingNodeProperty: "embedding",
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.vectorStore.close();
  }

  getDaoipFundingData = async (): Promise<DaoipFundingData[]> => {
    try {
      const res = await axios.get(
        "https://raw.githubusercontent.com/opensource-observer/oss-funding/main/data/funding_data.json",
      );
      return (res.data as unknown as DaoipFundingData[]) ?? [];
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-api-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getDaoipFundingData ${err.message}`);
      return [];
    }
  };

  getDaoipFundingDataByProgramId = async (
    programId: string,
  ): Promise<DaoipFundingData[]> => {
    const fundingDataParams = KARMAGAP_PROGRAM_MAPPINGS[programId];

    const data = await this.getDaoipFundingData();
    const daiopFundingData = (data ?? []).filter(
      x =>
        x.from_funder_name === fundingDataParams?.from_funder_name &&
        x.grant_pool_name === fundingDataParams?.grant_pool_name,
    );
    return daiopFundingData;
  };

  getDaoipFundingDataBySlug = async (
    programId: string,
    granteeProjectSlug: string,
  ): Promise<DaoipFundingData[]> => {
    const daiopFundingData =
      await this.getDaoipFundingDataByProgramId(programId);

    return daiopFundingData.filter(
      x => x.to_project_name === granteeProjectSlug,
    );
  };

  getDaoipProjectBySlug = async (
    slug: string,
  ): Promise<DaoipProject | null> => {
    try {
      const result = await axios.get(
        `https://raw.githubusercontent.com/opensource-observer/oss-directory/refs/heads/main/data/projects/${slug.charAt(
          0,
        )}/${slug}.yaml`,
      );
      if (result.status === 200) {
        const yaml = await import("js-yaml");
        const yamlData = yaml.load(result.data) as RawDaoipProject;
        const project = {
          id: randomUUID(),
          name: yamlData.name,
          slug,
          description: yamlData.description ?? null,
          website: yamlData.websites?.[0]?.url ?? null,
          twitter: yamlData.social?.twitter?.[0]?.url ?? null,
          github: yamlData.github?.[0]?.url ?? null,
        };

        return project;
      } else {
        this.logger.warn(`Could not find project ${slug} on daoip`);
        return null;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`GrantsService::getDaoipProjectBySlug ${err.message}`);
      return null;
    }
  };

  query = async (
    query: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedData<GrantListResult>> => {
    try {
      const result = await this.vectorStore.similaritySearchWithScore(
        query,
        10,
      );
      const ids = result.map(x => x[0].metadata.programId);
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

  getGrantsListResults = async (
    status: "active" | "inactive" | null = null,
  ): Promise<KarmaGapGrantProgram[]> => {
    const result = await this.neogma.queryRunner.run(
      `
        CYPHER runtime = parallel
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

    const programs = result.records
      .map(record => record.get("program") as KarmaGapGrantProgram)
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
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
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

  getGranteesBySlug = async (slug: string): Promise<Grantee[]> => {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (program:KarmaGapProgram {slug: $slug})
        RETURN {
          programId: program.programId,
          name: program.name
        } as program
      `,
        { slug },
      );

      const programs = result.records.map(
        record =>
          record.get("program") as {
            programId: string;
            name: string;
          },
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

        const gitcoinGrantees =
          program.programId === "451"
            ? (result.rounds.find(
                x =>
                  (x.roundMetadata as GrantMetadata)?.name ===
                  "GG21: Thriving Arbitrum Summer",
              )?.applications ?? [])
            : (result.rounds.find(
                x => (x.roundMetadata as GrantMetadata)?.name === program.name,
              )?.applications ?? []);

        const gitcoinGranteesFinal = await Promise.all(
          gitcoinGrantees.map(async grantee => {
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
              slug: slugify(grantee.project.name),
              logoUrl: logoIpfs ? `https://${logoIpfs}.ipfs.dweb.link` : null,
              lastFundingDate: nonZeroOrNull(transaction.timestamp),
              lastFundingAmount: grantee.totalAmountDonatedInUsd,
              lastFundingUnit: "USD",
            });
          }),
        );

        const daoipGrantees = await this.getDaoipFundingDataByProgramId(
          program.programId,
        );

        const daoipGranteesFinal = await Promise.all(
          daoipGrantees.map(async x => {
            const project = await this.getDaoipProjectBySlug(
              x.to_project_name ?? slugify(x.metadata.application_name),
            );
            return new Grantee({
              id: randomUUID(),
              name: x.metadata.application_name,
              slug: x.to_project_name ?? slugify(x.metadata.application_name),
              logoUrl: project?.website
                ? getGoogleLogoUrl(project.website)
                : null,
              lastFundingDate: nonZeroOrNull(
                new Date(x.funding_date).getTime() / 1000,
              ),
              lastFundingAmount: x.amount,
              lastFundingUnit: x.metadata.token_unit,
            });
          }),
        );

        return [...gitcoinGranteesFinal, ...daoipGranteesFinal];
      } else {
        return [];
      }
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
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (program:KarmaGapProgram {slug: $programSlug})
        RETURN {
          programId: program.programId,
          name: program.name
        } as program
      `,
        { programSlug },
      );

      const programs = result.records.map(
        record =>
          record.get("program") as {
            programId: string;
            name: string;
          },
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

        const gitcoinDetails = (
          program.programId === "451"
            ? (result.rounds.find(
                x =>
                  (x.roundMetadata as GrantMetadata)?.name ===
                  "GG21: Thriving Arbitrum Summer",
              )?.applications ?? [])
            : (result.rounds.find(
                x => (x.roundMetadata as GrantMetadata)?.name === program.name,
              )?.applications ?? [])
        ).find(x => {
          return slugify(x.project.name) === granteeSlug;
        });

        const daoipDetails = await this.getDaoipFundingDataBySlug(
          program.programId,
          granteeSlug,
        );

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
            codeMetrics?.contributor_count
              ? {
                  label: "Contributor Count",
                  value: codeMetrics.contributor_count
                    ? codeMetrics.contributor_count.toString()
                    : "N/A",
                  stats: [
                    {
                      label: "Last 6 Months",
                      value: codeMetrics.contributor_count_6_months
                        ? codeMetrics.contributor_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "New Contributors",
                      value: codeMetrics.new_contributor_count_6_months
                        ? codeMetrics.new_contributor_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                  ],
                }
              : null,
            codeMetrics?.star_count
              ? {
                  label: "GitHub Stars",
                  value: codeMetrics.star_count.toString(),
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
                      value: codeMetrics.repository_count
                        ? codeMetrics.repository_count.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Stars",
                      value: codeMetrics.repository_count
                        ? codeMetrics.repository_count.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Forks",
                      value: codeMetrics.fork_count
                        ? codeMetrics.fork_count.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Contributor Count",
                      value: codeMetrics.contributor_count
                        ? codeMetrics.contributor_count.toString()
                        : "N/A",
                      stats: [
                        {
                          label: "Last 6 Months",
                          value: codeMetrics.contributor_count_6_months
                            ? codeMetrics.contributor_count_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "New Contributors",
                          value: codeMetrics.new_contributor_count_6_months
                            ? codeMetrics.new_contributor_count_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Fulltime Developer Average",
                          value: codeMetrics.fulltime_developer_average_6_months
                            ? codeMetrics.fulltime_developer_average_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                        {
                          label: "Active Developers",
                          value: codeMetrics.active_developer_count_6_months
                            ? codeMetrics.active_developer_count_6_months.toString()
                            : "N/A",
                          stats: [],
                        },
                      ],
                    },
                    {
                      label: "Commit Count (6 Months)",
                      value: codeMetrics.commit_count_6_months
                        ? codeMetrics.commit_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Pull Request Count (6 Months)",
                      value: codeMetrics.opened_issue_count_6_months
                        ? codeMetrics.opened_issue_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Merged Pull Request Count (6 Months)",
                      value: codeMetrics.merged_pull_request_count_6_months
                        ? codeMetrics.merged_pull_request_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Opened Issue Count (6 Months)",
                      value: codeMetrics.opened_issue_count_6_months
                        ? codeMetrics.opened_issue_count_6_months.toString()
                        : "N/A",
                      stats: [],
                    },
                    {
                      label: "Closed Issue Count (6 Months)",
                      value: codeMetrics.closed_issue_count_6_months
                        ? codeMetrics.closed_issue_count_6_months.toString()
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
            daoipDetails.length > 0
              ? {
                  label: "DAOIP Funding Data",
                  tab: "daoip-funding-data",
                  stats: daoipDetails.flatMap(x => [
                    {
                      label: "Funding Amount",
                      value: `${x.amount} ${x.metadata.token_unit}`,
                      stats: [],
                    },
                    {
                      label: "Funding Date",
                      value: new Date(x.funding_date).toDateString(),
                      stats: [],
                    },
                    {
                      label: "Funding Source",
                      value: x.from_funder_name,
                      stats: [],
                    },
                  ]),
                }
              : null,
          ].filter(Boolean);
        };

        let granteeDetails: GranteeDetails | null = null;

        if (gitcoinDetails) {
          const gitcoinGrantees = (
            program.programId === "451"
              ? (result.rounds.find(
                  x =>
                    (x.roundMetadata as GrantMetadata)?.name ===
                    "GG21: Thriving Arbitrum Summer",
                )?.applications ?? [])
              : (result.rounds.find(
                  x =>
                    (x.roundMetadata as GrantMetadata)?.name === program.name,
                )?.applications ?? [])
          ).map(async grantee => {
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
              (grantee?.metadata as GranteeApplicationMetadata)?.application
                .project.logoImg,
            );
            return new GranteeDetails({
              id: grantee.id,
              tags: grantee.tags,
              status: grantee.status,
              name: grantee.project.name,
              slug: slugify(grantee.project.name),
              description: (grantee?.metadata as GranteeApplicationMetadata)
                ?.application?.project?.description,
              website: notStringOrNull(
                (grantee?.metadata as GranteeApplicationMetadata)?.application
                  ?.project?.website,
              ),
              logoUrl: logoIpfs ? `https://${logoIpfs}.ipfs.dweb.link` : null,
              lastFundingDate: nonZeroOrNull(transaction.timestamp),
              lastFundingAmount: grantee.totalAmountDonatedInUsd,
              lastFundingUnit: "USD",
              projects: [
                gitcoinDetails
                  ? {
                      id: (
                        gitcoinDetails?.metadata as GranteeApplicationMetadata
                      )?.application?.project?.id,
                      name: `GG21: Thriving Arbitrum Summer - ${
                        gitcoinDetails?.project?.name ?? granteeSlug
                      }`,
                      tags: gitcoinDetails?.project?.tags ?? [],
                      tabs: projectCodeMetrics
                        ? projectMetricsConverter(
                            projectCodeMetrics,
                            projectOnchainMetrics,
                            projectContractMetrics,
                          )
                        : [],
                    }
                  : null,
              ].filter(Boolean),
            });
          });
          granteeDetails = (await Promise.all(gitcoinGrantees)).find(
            x => x.slug === granteeSlug,
          );
        } else {
          const project = await this.getDaoipProjectBySlug(granteeSlug);
          if (project) {
            let internalDescription = null;
            if (project.website) {
              const url = new URL(project.website);
              const internalId = data(
                await this.projectsService.findIdByWebsite(url.hostname),
              );
              if (internalId) {
                const details =
                  await this.projectsService.getProjectById(internalId);
                internalDescription = details?.description;
              }
            }

            const details = daoipDetails.find(
              x =>
                x.to_project_name === granteeSlug ||
                slugify(x.metadata.application_name) === granteeSlug,
            );
            granteeDetails = new GranteeDetails({
              id: uuidfy(granteeSlug),
              tags: [],
              status: "APPROVED",
              name: project?.name,
              slug: granteeSlug,
              description:
                internalDescription ??
                project?.description ??
                "Could not find a description for this project",
              website: project?.website ?? null,
              logoUrl: project?.website
                ? getGoogleLogoUrl(project.website)
                : null,
              lastFundingDate: details?.funding_date
                ? nonZeroOrNull(
                    new Date(details?.funding_date).getTime() / 1000,
                  )
                : null,
              lastFundingAmount: details?.amount,
              lastFundingUnit: notStringOrNull(details?.metadata.token_unit),
              projects: [
                {
                  id: uuidfy(granteeSlug),
                  name: project?.name ?? granteeSlug,
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
            });
          }
        }

        if (granteeDetails) {
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
                  projectTwitter: notStringOrNull(
                    grant.metadata.projectTwitter,
                  ),
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
                  projectTwitter: notStringOrNull(
                    grant.metadata.projectTwitter,
                  ),
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
