import { Injectable } from "@nestjs/common";
import {
  ShortOrgEntity,
  ShortOrg,
  Repository,
  PaginatedData,
  OrgFilterConfigs,
  OrgFilterConfigsEntity,
  OrgDetailsResult,
  OrgDetailsResultEntity,
  ResponseWithNoData,
  ResponseWithOptionalData,
  OrganizationWithLinks,
  Jobsite,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { OrgListParams } from "./dto/org-list.input";
import {
  instanceToNode,
  normalizeString,
  paginate,
  toShortOrg,
} from "src/shared/helpers";
import {
  OrganizationEntity,
  OrganizationWithLinksEntity,
  RepositoryEntity,
} from "src/shared/entities";
import { createNewSortInstance, sort } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { Neogma, Op } from "neogma";
import { InjectConnection } from "nest-neogma";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";
import { UpdateOrgAliasesInput } from "./dto/update-organization-aliases.input";
import { UpdateOrgCommunitiesInput } from "./dto/update-organization-communities.input";
import { UpdateOrgWebsitesInput } from "./dto/update-organization-websites.input";
import { UpdateOrgTwittersInput } from "./dto/update-organization-twitters.input";
import { UpdateOrgGithubsInput } from "./dto/update-organization-githubs.input";
import { UpdateOrgDiscordsInput } from "./dto/update-organization-discords.input";
import { UpdateOrgDocsInput } from "./dto/update-organization-docs.input";
import { UpdateOrgTelegramsInput } from "./dto/update-organization-telegrams.input";
import { UpdateOrgGrantsInput } from "./dto/update-organization-grants.input";
import { ActivateOrgJobsiteInput } from "./dto/activate-organization-jobsites.input";

@Injectable()
export class OrganizationsService {
  private readonly logger = new CustomLogger(OrganizationsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getOrgListResults = async (): Promise<OrgDetailsResult[]> => {
    const results: OrgDetailsResult[] = [];
    const generatedQuery = `
        MATCH (organization:Organization)
        RETURN organization {
          .*,
          discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
          website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
          docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
          telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
          github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
          aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
          twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
          fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
          investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
          community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
          grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
          jobs: [
            (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | structured_jobpost {
              id: structured_jobpost.id,
              title: structured_jobpost.title,
              salary: structured_jobpost.salary,
              location: structured_jobpost.location,
              summary: structured_jobpost.summary,
              shortUUID: structured_jobpost.shortUUID,
              seniority: structured_jobpost.seniority,
              paysInCrypto: structured_jobpost.paysInCrypto,
              minimumSalary: structured_jobpost.minimumSalary,
              maximumSalary: structured_jobpost.maximumSalary,
              salaryCurrency: structured_jobpost.salaryCurrency,
              featured: structured_jobpost.featured,
              featureStartDate: structured_jobpost.featureStartDate,
              featureEndDate: structured_jobpost.featureEndDate,
              offersTokenAllocation: structured_jobpost.offersTokenAllocation,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END
            }
          ],
          projects: [
            (organization)-[:HAS_PROJECT]->(project) | project {
              .*,
              orgId: organization.orgId,
              discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
              category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
              twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              hacks: [
                (project)-[:HAS_HACK]->(hack) | hack { .* }
              ],
              audits: [
                (project)-[:HAS_AUDIT]->(audit) | audit { .* }
              ],
              chains: [
                (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
              ]
            }
          ],
          tags: [(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation) | tag { .* }],
          reviews: [
            (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
              compensation: {
                salary: review.salary,
                currency: review.currency,
                offersTokenAllocation: review.offersTokenAllocation
              },
              rating: {
                onboarding: review.onboarding,
                careerGrowth: review.careerGrowth,
                benefits: review.benefits,
                workLifeBalance: review.workLifeBalance,
                diversityInclusion: review.diversityInclusion,
                management: review.management,
                product: review.product,
                compensation: review.compensation
              },
              review: {
                title: review.title,
                location: review.location,
                timezone: review.timezone,
                pros: review.pros,
                cons: review.cons
              },
              reviewedTimestamp: review.reviewedTimestamp
            }
          ]
        } as res
        `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records?.map(record => record?.get("res") as OrgDetailsResult);
      for (const result of resultSet) {
        results.push(new OrgDetailsResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgsListResults ${err.message}`,
      );
    }

    return results;
  };

  async getOrgsListWithSearch(
    params: OrgListParams,
  ): Promise<PaginatedData<ShortOrg>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const {
      minHeadCount,
      maxHeadCount,
      locations: locationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      communities: communityFilterList,
      hasJobs,
      hasProjects,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: OrgDetailsResult[] = [];

    try {
      const result = await this.getOrgListResults();
      results.push(...result);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const orgFilters = (org: OrgDetailsResult): boolean => {
      const { headcountEstimate, jobCount, projectCount, location, name } =
        toShortOrg(org);
      const { fundingRounds, investors, community } = org;
      return (
        (!query || name.match(query)) &&
        (hasJobs === null || jobCount > 0 === hasJobs) &&
        (hasProjects === null || projectCount > 0 === hasProjects) &&
        (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
        (!locationFilterList ||
          locationFilterList.includes(normalizeString(location))) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(normalizeString(investor.name)),
          ).length > 0) &&
        (!communityFilterList ||
          community.filter(community =>
            communityFilterList.includes(normalizeString(community)),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRounds.filter(fundingRound =>
            fundingRoundFilterList.includes(
              normalizeString(fundingRound.roundName),
            ),
          ).length > 0)
      );
    };

    const filtered = results.filter(orgFilters);

    const getSortParam = (org: OrgDetailsResult): number | null => {
      const shortOrg = toShortOrg(org);
      const lastJob = sort(org.jobs).desc(x => x.timestamp)[0];
      switch (orderBy) {
        case "recentFundingDate":
          return shortOrg?.lastFundingDate ?? 0;
        case "recentJobDate":
          return lastJob?.timestamp ?? 0;
        case "headcountEstimate":
          return org?.headcountEstimate ?? 0;
        case "rating":
          return org?.aggregateRating ?? 0;
        default:
          return null;
      }
    };

    let final: OrgDetailsResult[] = [];
    const naturalSort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      }).compare,
      inPlaceSorting: true,
    });
    if (!order || order === "desc") {
      final = naturalSort<OrgDetailsResult>(filtered).by([
        {
          desc: x =>
            params.orderBy ? getSortParam(x) : toShortOrg(x).lastFundingDate,
        },
        { asc: x => x.name },
      ]);
    } else {
      final = naturalSort<OrgDetailsResult>(filtered).by([
        {
          asc: x =>
            params.orderBy ? getSortParam(x) : toShortOrg(x).lastFundingDate,
        },
        { asc: x => x.name },
      ]);
    }

    return paginate<ShortOrg>(
      page,
      limit,
      final.map(x => new ShortOrgEntity(toShortOrg(x)).getProperties()),
    );
  }

  async getFeaturedOrgs(
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<ShortOrg[]>> {
    try {
      const orgs = await this.getOrgListResults();
      const now = new Date().getTime();
      return {
        success: true,
        message: "Featured orgs retrieved successfully",
        data: orgs
          .filter(
            org =>
              (ecosystem ? org.community.includes(ecosystem) : true) &&
              org.jobs.some(
                job =>
                  job.featured === true &&
                  job.featureStartDate <= now &&
                  now <= job.featureEndDate,
              ),
          )
          .map(x => new ShortOrgEntity(toShortOrg(x)).getProperties()),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getFeaturedJobs ${err.message}`);
      return { success: false, message: "Failed to retrieve featured jobs" };
    }
  }

  async getFilterConfigs(
    ecosystem: string | undefined,
  ): Promise<OrgFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
          RETURN {
              minHeadCount: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END | org.headcountEstimate
              ]),
              maxHeadCount: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END | org.headcountEstimate
              ]),
              fundingRounds: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | round.roundName
              ]),
              investors: apoc.coll.toSet([
                (org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | investor.name
              ]),
              communities: apoc.coll.toSet([
                (org: Organization)-[:IS_MEMBER_OF_COMMUNITY]->(community: OrganizationCommunity)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | community.name
              ]),
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType)
                WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $ecosystem})) END
                AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name
              ])
          } AS res
      `,
          { ecosystem: ecosystem ?? null },
        )
        .then(res =>
          res.records.length
            ? new OrgFilterConfigsEntity(
                res.records[0].get("res"),
              ).getProperties()
            : undefined,
        );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getFilterConfigs ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgDetailsById(
    orgId: string,
    ecosystem: string | undefined,
  ): Promise<OrgDetailsResult | undefined> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (organization:Organization {orgId: $orgId})
        WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((organization)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {name: $ecosystem})) END
        RETURN organization {
            .*,
            discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
            website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
            telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
            github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
            aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
            twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
            fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
            investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
            community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
            grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
            jobs: [
              (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | structured_jobpost {
                id: structured_jobpost.id,
                title: structured_jobpost.title,
                salary: structured_jobpost.salary,
                location: structured_jobpost.location,
                summary: structured_jobpost.summary,
                shortUUID: structured_jobpost.shortUUID,
                seniority: structured_jobpost.seniority,
                paysInCrypto: structured_jobpost.paysInCrypto,
                minimumSalary: structured_jobpost.minimumSalary,
                maximumSalary: structured_jobpost.maximumSalary,
                salaryCurrency: structured_jobpost.salaryCurrency,
                featured: structured_jobpost.featured,
                featureStartDate: structured_jobpost.featureStartDate,
                featureEndDate: structured_jobpost.featureEndDate,
                offersTokenAllocation: structured_jobpost.offersTokenAllocation,
                classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
                commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
                locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
                timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END
              }
            ],
            projects: [
              (organization)-[:HAS_PROJECT]->(project) | project {
                .*,
                orgId: organization.orgId,
                discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
                category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                hacks: [
                  (project)-[:HAS_HACK]->(hack) | hack { .* }
                ],
                audits: [
                  (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                ],
                chains: [
                  (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                ]
              }
            ],
            tags: [(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation) | tag { .* }],
            reviews: [
              (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
                compensation: {
                  salary: review.salary,
                  currency: review.currency,
                  offersTokenAllocation: review.offersTokenAllocation
                },
                rating: {
                  onboarding: review.onboarding,
                  careerGrowth: review.careerGrowth,
                  benefits: review.benefits,
                  workLifeBalance: review.workLifeBalance,
                  diversityInclusion: review.diversityInclusion,
                  management: review.management,
                  product: review.product,
                  compensation: review.compensation
                },
                review: {
                  title: review.title,
                  location: review.location,
                  timezone: review.timezone,
                  pros: review.pros,
                  cons: review.cons
                },
                reviewedTimestamp: review.reviewedTimestamp
              }
            ]
          } as res
        `,
        { orgId, ecosystem: ecosystem ?? null },
      );
      return result.records[0]?.get("res")
        ? new OrgDetailsResultEntity({
            ...result.records[0]?.get("res"),
            jobs: result.records[0]?.get("res")?.jobs ?? [],
            tags: result.records[0]?.get("res")?.tags ?? [],
          }).getProperties()
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::getOrgDetailsById ${err.message}`,
      );
      return undefined;
    }
  }
  async getAllWithLinks(): Promise<OrganizationWithLinks[]> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (organization:Organization)
        RETURN organization {
          .*,
          discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite],
          website: [(organization)-[:HAS_WEBSITE]->(website) | website.url],
          rawWebsite: [(organization)-[:HAS_RAW_WEBSITE]->(website) | website.url],
          docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url],
          telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username],
          github: [(organization)-[:HAS_GITHUB]->(github) | github.login],
          aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
          grant: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url],
          twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username],
          fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
          investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
          community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
          grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
          jobCount: apoc.coll.sum([
            (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | 1
          ]),
          jobsite: [
            (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite) | jobsite {
              url: jobsite.url,
              type: jobsite.type
            }
          ],
          detectedJobsite: [
            (organization)-[:HAS_JOBSITE]->(jobsite:DetectedJobsite) | jobsite {
              url: jobsite.url,
              type: jobsite.type
            }
          ],
          projects: [
            (organization)-[:HAS_PROJECT]->(project) | project {
              .*,
              orgId: organization.orgId,
              discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
              category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
              twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              hacks: [
                (project)-[:HAS_HACK]->(hack) | hack { .* }
              ],
              audits: [
                (project)-[:HAS_AUDIT]->(audit) | audit { .* }
              ],
              chains: [
                (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
              ]
            }
          ]
        } as org
        `,
      );
      return result.records.map(org =>
        new OrganizationWithLinksEntity(org.get("org")).getProperties(),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getAllWithLinks ${err.message}`);
      return undefined;
    }
  }

  async getAll(): Promise<ShortOrg[]> {
    try {
      return (await this.getOrgListResults()).map(org =>
        new ShortOrgEntity(toShortOrg(org)).getProperties(),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getAll ${err.message}`);
      return undefined;
    }
  }

  async searchOrganizations(query: string): Promise<ShortOrg[]> {
    const parsedQuery = new RegExp(query, "gi");
    try {
      const all = await this.getAll();
      return all.filter(x => x.name.match(parsedQuery));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", query);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::searchOrganizations ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgById(id: string): Promise<ShortOrg | undefined> {
    try {
      const generatedQuery = `
        MATCH (organization:Organization {id: $id})
        RETURN organization {
          .*,
          discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
          website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
          docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
          telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
          github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
          aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
          twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
          fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
          investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
          community: [(organization)-[:IS_MEMBER_OF_COMMUNITY]->(community) | community.name ],
          grants: [(organization)-[:HAS_GRANTSITE]->(grant) | grant.url ],
          jobs: [
            (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | structured_jobpost {
              id: structured_jobpost.id,
              title: structured_jobpost.title,
              salary: structured_jobpost.salary,
              location: structured_jobpost.location,
              summary: structured_jobpost.summary,
              shortUUID: structured_jobpost.shortUUID,
              seniority: structured_jobpost.seniority,
              paysInCrypto: structured_jobpost.paysInCrypto,
              minimumSalary: structured_jobpost.minimumSalary,
              maximumSalary: structured_jobpost.maximumSalary,
              salaryCurrency: structured_jobpost.salaryCurrency,
              offersTokenAllocation: structured_jobpost.offersTokenAllocation,
              featured: structured_jobpost.featured,
              featureStartDate: structured_jobpost.featureStartDate,
              featureEndDate: structured_jobpost.featureEndDate,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END
            }
          ],
          projects: [
            (organization)-[:HAS_PROJECT]->(project) | project {
              .*,
              orgId: organization.orgId,
              discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(project)-[:HAS_GITHUB]->(github) | github.login][0],
              category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
              twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
              hacks: [
                (project)-[:HAS_HACK]->(hack) | hack { .* }
              ],
              audits: [
                (project)-[:HAS_AUDIT]->(audit) | audit { .* }
              ],
              chains: [
                (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
              ]
            }
          ],
          tags: [(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation) | tag { .* }],
          reviews: [
            (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
              compensation: {
                salary: review.salary,
                currency: review.currency,
                offersTokenAllocation: review.offersTokenAllocation
              },
              rating: {
                onboarding: review.onboarding,
                careerGrowth: review.careerGrowth,
                benefits: review.benefits,
                workLifeBalance: review.workLifeBalance,
                diversityInclusion: review.diversityInclusion,
                management: review.management,
                product: review.product,
                compensation: review.compensation
              },
              review: {
                title: review.title,
                location: review.location,
                timezone: review.timezone,
                pros: review.pros,
                cons: review.cons
              },
              reviewedTimestamp: review.reviewedTimestamp
            }
          ]
        } as res
        `;

      const res = await this.neogma.queryRunner.run(generatedQuery, { id });

      return new ShortOrgEntity(
        toShortOrg(res.records[0]?.get("res") as OrgDetailsResult),
      ).getProperties();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::getOrgById ${err.message}`);
      return undefined;
    }
  }

  async getRepositories(id: string): Promise<Repository[]> {
    return this.models.Organizations.findRelationships({
      alias: "repositories",
      limit: 1,
      maxHops: 1,
      where: {
        source: {
          id,
        },
      },
    })
      .then(res =>
        res.map(repo =>
          new RepositoryEntity(instanceToNode(repo.target)).getProperties(),
        ),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `OrganizationsService::getRepositories ${err.message}`,
        );
        return undefined;
      });
  }

  async find(name: string): Promise<OrganizationEntity | undefined> {
    return this.models.Organizations.findOne({
      where: { name: name },
    }).then(res =>
      res ? new OrganizationEntity(instanceToNode(res)) : undefined,
    );
  }

  async findById(id: string): Promise<OrganizationEntity | undefined> {
    return this.models.Organizations.findOne({
      where: { id: id },
    }).then(res =>
      res ? new OrganizationEntity(instanceToNode(res)) : undefined,
    );
  }

  async findAll(): Promise<OrganizationEntity[] | undefined> {
    return this.models.Organizations.findMany().then(res =>
      res.map(org => new OrganizationEntity(instanceToNode(org))),
    );
  }

  async findByOrgId(orgId: string): Promise<OrganizationEntity | undefined> {
    return this.models.Organizations.findOne({
      where: { orgId: orgId },
    }).then(res =>
      res ? new OrganizationEntity(instanceToNode(res)) : undefined,
    );
  }

  async create(
    organization: CreateOrganizationInput,
  ): Promise<OrganizationEntity> {
    const res = await this.neogma.queryRunner.run(
      `
        CREATE (org: Organization {
          id: randomUUID(),
          orgId: $orgId, 
          logoUrl: $logoUrl, 
          name: $name, 
          altName: $altName, 
          description: $description, 
          summary: $summary, 
          location: $location, 
          headcountEstimate: $headcountEstimate
        })
        CREATE (org)-[:HAS_DISCORD]->(discord:Discord {id: randomUUID(), invite: $discord}) 
        CREATE (org)-[:HAS_WEBSITE]->(website:Website {id: randomUUID(), url: $website}) 
        CREATE (org)-[:HAS_DOCSITE]->(docsite:DocSite {id: randomUUID(), url: $docs}) 
        CREATE (org)-[:HAS_TELEGRAM]->(telegram:Telegram {id: randomUUID(), username: $telegram}) 
        CREATE (org)-[:HAS_ORGANIZATION_ALIAS]->(alias:OrganizationAlias {id: randomUUID(), name: $alias}) 
        CREATE (org)-[:HAS_TWITTER]->(twitter: Twitter {id: randomUUID(), username: $twitter}) 
        CREATE (org)-[:HAS_GITHUB]->(github: Github {id: randomUUID(), login: $github}) 

        RETURN org
      `,
      { ...organization },
    );

    return new OrganizationEntity(res.records[0]?.get("org"));
  }

  async update(
    id: string,
    properties: Omit<
      UpdateOrganizationInput,
      | "grants"
      | "projects"
      | "communities"
      | "aliases"
      | "website"
      | "twitter"
      | "github"
      | "discord"
      | "docs"
      | "telegram"
    >,
  ): Promise<OrganizationEntity> {
    this.logger.log(JSON.stringify(properties));
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (org: Organization {orgId: $id})
        SET org.logoUrl = $logoUrl
        SET org.name = $name
        SET org.altName = $altName
        SET org.description = $description
        SET org.summary = $summary
        SET org.location = $location
        SET org.headcountEstimate = $headcountEstimate     

        RETURN org
      `,
      { ...properties, id },
    );

    return new OrganizationEntity(res.records[0]?.get("org"));
  }

  async delete(id: string): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (organization:Organization { orgId: $id })
            OPTIONAL MATCH (organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag)
            OPTIONAL MATCH (organization)-[:HAS_JOBSITE]->(jobsite)-[:HAS_JOBPOST]->(jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost)
            OPTIONAL MATCH (organization)-[:HAS_DISCORD]->(discord)
            OPTIONAL MATCH (organization)-[:HAS_WEBSITE]->(website)
            OPTIONAL MATCH (organization)-[:HAS_DOCSITE]->(docsite)
            OPTIONAL MATCH (organization)-[:HAS_TELEGRAM]->(telegram)
            OPTIONAL MATCH (organization)-[:HAS_GITHUB]->(github)
            OPTIONAL MATCH (organization)-[:HAS_ORGANIZATION_ALIAS]->(alias)
            OPTIONAL MATCH (organization)-[:HAS_TWITTER]->(twitter)
            DETACH DELETE jobsite, jobpost, structured_jobpost,
              discord, website, docsite, telegram, github, alias, twitter, tag

            WITH organization
            OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project)
            OPTIONAL MATCH (project)-[:HAS_AUDIT]->(audit)
            OPTIONAL MATCH (project)-[:HAS_HACK]->(hack)
            OPTIONAL MATCH (project)-[:HAS_DISCORD]->(discord2)
            OPTIONAL MATCH (project)-[:HAS_DOCSITE]->(docsite2)
            OPTIONAL MATCH (project)-[:HAS_GITHUB]->(github2)
            OPTIONAL MATCH (project)-[:HAS_TELEGRAM]->(telegram2)
            OPTIONAL MATCH (project)-[:HAS_TWITTER]->(twitter2)
            OPTIONAL MATCH (project)-[:HAS_WEBSITE]->(website2)
            DETACH DELETE audit, hack, discord2, docsite2,
              github2, telegram2, twitter2, website2, organization, project
        `,
        {
          id,
        },
      );
      return {
        success: true,
        message: "Organization deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::delete ${err.message}`);
      return {
        success: false,
        message: "Failed to delete organization",
      };
    }
  }

  async hasProjectRelationship(
    orgId: string,
    projectId: string,
  ): Promise<boolean> {
    const res = await this.models.Organizations.findRelationships({
      alias: "projects",
      limit: 1,
      maxHops: 1,
      where: {
        source: {
          id: orgId,
        },
        target: {
          id: projectId,
        },
      },
    });

    return res.length !== 0;
  }

  async relateToProjects(
    orgId: string,
    projectIds: string[],
  ): Promise<boolean> {
    try {
      (
        await this.models.Organizations.findOne({
          where: {
            id: orgId,
          },
        })
      ).relateTo({
        alias: "projects",
        where: {
          id: {
            [Op.in]: projectIds,
          },
        },
      });
      return true;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", { orgId, projectIds });
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::relateToProjects ${err.message}`,
      );
      return false;
    }
  }

  async updateOrgAliases(
    dto: UpdateOrgAliasesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_ORGANIZATION_ALIAS]->(alias:OrganizationAlias)
            DETACH DELETE alias
          }
          
          CALL {
            UNWIND $aliases as name
            OPTIONAL MATCH (alias:OrganizationAlias WHERE alias.name = name)
            WITH alias IS NOT NULL AS aliasFound, name
            WHERE NOT aliasFound
            CREATE (alias:OrganizationAlias {id: randomUUID(), name: name})
          }

          MATCH (alias:OrganizationAlias WHERE alias.name IN $aliases), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_ORGANIZATION_ALIAS]->(alias)
          
          RETURN alias.name as name
        `,
        { ...dto },
      );
      const aliases = result.records.map(
        record => record.get("name") as string,
      );
      return {
        success: true,
        message: "Updated organization aliases successfully",
        data: aliases,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgAliases ${err.message}`,
      );
      return { success: false, message: "Failed to update org aliases" };
    }
  }

  async activateOrgJobsites(
    dto: ActivateOrgJobsiteInput,
  ): Promise<ResponseWithOptionalData<Jobsite[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (:Organization {orgId: $orgId})-[:HAS_JOBSITE]->(jobsite:DetectedJobsite)
          REMOVE jobsite:DetectedJobsite
          SET jobsite:Jobsite
          RETURN jobsite
        `,
        {
          ...dto,
        },
      );
      const jobsites = result.records.map(
        record => record.get("jobsite") as Jobsite,
      );
      return {
        success: true,
        message: "Activated organization jobsites successfully",
        data: jobsites,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::activateOrgJobsites ${err.message}`,
      );
      return { success: false, message: "Failed to activate org jobsites" };
    }
  }

  async updateOrgCommunities(
    dto: UpdateOrgCommunitiesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:IS_MEMBER_OF_COMMUNITY]->(community:OrganizationCommunity)
            DETACH DELETE community
          }
          
          CALL {
            UNWIND $communities as newCommunity
            OPTIONAL MATCH (community:OrganizationCommunity WHERE community.name = newCommunity.name)
            WITH community IS NOT NULL AS communityFound, newCommunity
            WHERE NOT communityFound
            CREATE (community:OrganizationCommunity {id: randomUUID(), name: newCommunity.name, normalizedName: newCommunity.normalizedName})
          }

          MATCH (community:OrganizationCommunity WHERE community.name IN $names), (org:Organization {orgId: $orgId})
          MERGE (org)-[:IS_MEMBER_OF_COMMUNITY]->(community)
          
          RETURN community.name as name
        `,
        {
          orgId: dto.orgId,
          communities: dto.communities.map(c => ({
            name: c,
            normalizedName: normalizeString(c),
          })),
          names: dto.communities,
        },
      );
      const communities = result.records.map(
        record => record.get("name") as string,
      );
      return {
        success: true,
        message: "Updated organization communities successfully",
        data: communities,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgCommunities ${err.message}`,
      );
      return { success: false, message: "Failed to update org communities" };
    }
  }

  async updateOrgWebsites(
    dto: UpdateOrgWebsitesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_WEBSITE]->(website:Website)
            DETACH DELETE website
          }
          
          CALL {
            UNWIND $websites as url
            OPTIONAL MATCH (website:Website WHERE website.url = url)
            WITH website IS NOT NULL AS siteFound, url
            WHERE NOT siteFound
            CREATE (website:Website {id: randomUUID(), url: url})
          }

          MATCH (website:Website WHERE website.url IN $websites), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_WEBSITE]->(website)
          
          RETURN website.url as url
        `,
        { ...dto },
      );
      const websites = result.records.map(
        record => record.get("url") as string,
      );
      return {
        success: true,
        message: "Updated organization websites successfully",
        data: websites,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgWebsites ${err.message}`,
      );
      return { success: false, message: "Failed to update org websites" };
    }
  }

  async updateOrgTwitters(
    dto: UpdateOrgTwittersInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_TWITTER]->(twitter:Twitter)
            DETACH DELETE twitter
          }
          
          CALL {
            UNWIND $twitters as username
            OPTIONAL MATCH (twitter:Twitter WHERE twitter.username = username)
            WITH twitter IS NOT NULL AS found, username
            WHERE NOT found
            CREATE (twitter:Twitter {id: randomUUID(), username: username})
          }

          MATCH (twitter:Twitter WHERE twitter.username IN $twitters), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_TWITTER]->(twitter)
          
          RETURN twitter.username as username
        `,
        { ...dto },
      );
      const twitters = result.records.map(
        record => record.get("username") as string,
      );
      return {
        success: true,
        message: "Updated organization twitters successfully",
        data: twitters,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgTwitters ${err.message}`,
      );
      return { success: false, message: "Failed to update org twitters" };
    }
  }

  async updateOrgGithubs(
    dto: UpdateOrgGithubsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_GITHUB]->(github:Github)
            DETACH DELETE github
          }
          
          CALL {
            UNWIND $githubs as login
            OPTIONAL MATCH (github:Github WHERE github.login = login)
            WITH github IS NOT NULL AS found, login
            WHERE NOT found
            CREATE (github:Github {id: randomUUID(), login: login})
          }

          MATCH (github:Github WHERE github.login IN $githubs), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_GITHUB]->(github)
          
          RETURN github.login as login
        `,
        { ...dto },
      );
      const githubs = result.records.map(
        record => record.get("login") as string,
      );
      return {
        success: true,
        message: "Updated organization githubs successfully",
        data: githubs,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgGithubs ${err.message}`,
      );
      return { success: false, message: "Failed to update org githubs" };
    }
  }

  async updateOrgDiscords(
    dto: UpdateOrgDiscordsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_DISCORD]->(discord:Discord)
            DETACH DELETE discord
          }
          
          CALL {
            UNWIND $discords as invite
            OPTIONAL MATCH (discord:Discord WHERE discord.invite = invite)
            WITH discord IS NOT NULL AS found, invite
            WHERE NOT found
            CREATE (discord:Discord {id: randomUUID(), invite: invite})
          }

          MATCH (discord:Discord WHERE discord.invite IN $discords), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_DISCORD]->(discord)
          
          RETURN discord.invite as invite
        `,
        { ...dto },
      );
      const discords = result.records.map(
        record => record.get("invite") as string,
      );
      return {
        success: true,
        message: "Updated organization discords successfully",
        data: discords,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgDiscords ${err.message}`,
      );
      return { success: false, message: "Failed to update org discords" };
    }
  }

  async updateOrgDocs(
    dto: UpdateOrgDocsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_DOCSITE]->(docsite:DocSite)
            DETACH DELETE docsite
          }
          
          CALL {
            UNWIND $docsites as url
            OPTIONAL MATCH (docsite:DocSite WHERE docsite.url = url)
            WITH docsite IS NOT NULL AS siteFound, url
            WHERE NOT siteFound
            CREATE (docsite:DocSite {id: randomUUID(), url: url})
          }

          MATCH (docsite:DocSite WHERE docsite.url IN $docsites), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_DOCSITE]->(docsite)
          
          RETURN docsite.url as url
        `,
        { ...dto },
      );
      const docsites = result.records.map(
        record => record.get("url") as string,
      );
      return {
        success: true,
        message: "Updated organization docsites successfully",
        data: docsites,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::updateOrgDocs ${err.message}`);
      return { success: false, message: "Failed to update org docsites" };
    }
  }

  async updateOrgTelegrams(
    dto: UpdateOrgTelegramsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_TELEGRAM]->(telegram:Telegram)
            DETACH DELETE telegram
          }
          
          CALL {
            UNWIND $telegrams as username
            OPTIONAL MATCH (telegram:Telegram WHERE telegram.username = username)
            WITH telegram IS NOT NULL AS found, username
            WHERE NOT found
            CREATE (telegram:Telegram {id: randomUUID(), username: username})
          }

          MATCH (telegram:Telegram WHERE telegram.username IN $telegrams), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_TELEGRAM]->(telegram)
          
          RETURN telegram.username as username
        `,
        { ...dto },
      );
      const telegrams = result.records.map(
        record => record.get("username") as string,
      );
      return {
        success: true,
        message: "Updated organization telegrams successfully",
        data: telegrams,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `OrganizationsService::updateOrgTelegrams ${err.message}`,
      );
      return { success: false, message: "Failed to update org telegrams" };
    }
  }

  async updateOrgGrants(
    dto: UpdateOrgGrantsInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          CALL {
            MATCH (org:Organization {orgId: $orgId})-[:HAS_GRANTSITE]->(grantsite:GrantSite)
            DETACH DELETE grantsite
          }
          
          CALL {
            UNWIND $grantsites as url
            OPTIONAL MATCH (grantsite:GrantSite WHERE grantsite.url = url)
            WITH grantsite IS NOT NULL AS siteFound, url
            WHERE NOT siteFound
            CREATE (grantsite:GrantSite {id: randomUUID(), url: url})
          }

          MATCH (grantsite:GrantSite WHERE grantsite.url IN $grantsites), (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_GRANTSITE]->(grantsite)
          
          RETURN grantsite.url as url
        `,
        { ...dto },
      );
      const grantsites = result.records.map(
        record => record.get("url") as string,
      );
      return {
        success: true,
        message: "Updated organization grantsites successfully",
        data: grantsites,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "organizations.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::updateOrgDocs ${err.message}`);
      return { success: false, message: "Failed to update org grantsites" };
    }
  }
}
