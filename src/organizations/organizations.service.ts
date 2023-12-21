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
import { OrganizationEntity, RepositoryEntity } from "src/shared/entities";
import { createNewSortInstance, sort } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { CreateOrganizationInput } from "./dto/create-organization.input";
import { UpdateOrganizationInput } from "./dto/update-organization.input";

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
          alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
          twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
          fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
          investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
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
              twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
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
                workingHours: {
                  start: review.workingHoursStart,
                  end: review.workingHoursEnd
                },
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
      const { fundingRounds, investors } = org;
      return (
        (!query || name.match(query)) &&
        (!hasJobs || jobCount > 0) &&
        (!hasProjects || projectCount > 0) &&
        (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
        (!locationFilterList ||
          locationFilterList.includes(normalizeString(location))) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(normalizeString(investor.name)),
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
    });
    if (!order || order === "asc") {
      final = naturalSort<OrgDetailsResult>(filtered).asc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    } else {
      final = naturalSort<OrgDetailsResult>(filtered).desc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    }

    return paginate<ShortOrg>(
      page,
      limit,
      final.map(x => new ShortOrgEntity(toShortOrg(x)).getProperties()),
    );
  }

  async getFilterConfigs(): Promise<OrgFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
          RETURN {
              minHeadCount: apoc.coll.min([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              maxHeadCount: apoc.coll.max([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              fundingRounds: apoc.coll.toSet([(org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | round.roundName]),
              investors: apoc.coll.toSet([(org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | investor.name]),
              locations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.location])
          } AS res
      `,
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
  ): Promise<OrgDetailsResult | undefined> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (organization:Organization {orgId: $orgId})
          RETURN organization {
            .*,
            discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
            website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
            telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
            github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
            alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
            twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
            fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
            investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
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
                twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
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
                  workingHours: {
                    start: review.workingHoursStart,
                    end: review.workingHoursEnd
                  },
                  pros: review.pros,
                  cons: review.cons
                },
                reviewedTimestamp: review.reviewedTimestamp
              }
            ]
          } as res
        `,
        { orgId },
      );
      return new OrgDetailsResultEntity({
        ...result.records[0]?.get("res"),
        jobs: result.records[0]?.get("res")?.jobs ?? [],
        tags: result.records[0]?.get("res")?.tags ?? [],
      }).getProperties();
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
          alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
          twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
          fundingRounds: [(organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round { .* }],
          investors: [(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }],
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
              twitter: [(project)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
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
                workingHours: {
                  start: review.workingHoursStart,
                  end: review.workingHoursEnd
                },
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
    properties: UpdateOrganizationInput,
  ): Promise<OrganizationEntity> {
    this.logger.log(JSON.stringify(properties));
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (org: Organization {orgId: $id})
        MATCH (org)-[:HAS_DISCORD]->(discord) 
        MATCH (org)-[:HAS_WEBSITE]->(website) 
        MATCH (org)-[:HAS_DOCSITE]->(docsite) 
        MATCH (org)-[:HAS_TELEGRAM]->(telegram) 
        MATCH (org)-[:HAS_GITHUB]->(github) 
        MATCH (org)-[:HAS_ORGANIZATION_ALIAS]->(alias) 
        MATCH (org)-[:HAS_TWITTER]->(twitter) 
        SET org.logoUrl = $logoUrl
        SET org.name = $name
        SET org.altName = $altName
        SET org.description = $description
        SET org.summary = $summary
        SET org.location = $location
        SET org.headcountEstimate = $headcountEstimate        
        SET discord.invite = $discord
        SET website.url = $website
        SET docsite.url = $docs
        SET telegram.username = $telegram
        SET alias.name = $alias
        SET twitter.username = $twitter
        SET github.login = $github

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
    organizationId: string,
    projectId: string,
  ): Promise<boolean> {
    const res = await this.models.Organizations.findRelationships({
      alias: "projects",
      limit: 1,
      maxHops: 1,
      where: {
        source: {
          id: organizationId,
        },
        target: {
          id: projectId,
        },
      },
    });

    return res.length !== 0;
  }

  async relateToProject(
    organizationId: string,
    projectId: string,
  ): Promise<boolean> {
    try {
      (
        await this.models.Organizations.findOne({
          where: {
            id: organizationId,
          },
        })
      ).relateTo({
        alias: "projects",
        where: {
          id: projectId,
        },
        assertCreatedRelationships: 1,
      });
      return true;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", { organizationId, projectId });
        Sentry.captureException(err);
      });
      this.logger.error(`OrganizationsService::relateToProject ${err.message}`);
      return false;
    }
  }
}
