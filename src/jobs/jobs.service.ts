import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import {
  AllJobListResultEntity,
  AllJobsFilterConfigsEntity,
} from "src/shared/entities";
import {
  intConverter,
  notStringOrNull,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  DateRange,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  AllJobsListResult,
  JobListResultEntity,
  PaginatedData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AllJobsParams } from "./dto/all-jobs.input";
import { JobListParams } from "./dto/job-list.input";

@Injectable()
export class JobsService {
  private readonly logger = new CustomLogger(JobsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      RETURN structured_jobpost {
          .*,
          classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
          commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
          locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
          organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
              .*,
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
              alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
              twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
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
                    (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain) | chain { .* }
                  ]
                }
              ],
              fundingRounds: [
                (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
              ],
              investors: [
                (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
              ]
          }][0],
          tags: [
            (structured_jobpost)-[:HAS_TAG]->(tag) | tag { .* }
          ]
      } AS result
    `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records.map(record => record.get("result") as JobListResult);
      for (const result of resultSet) {
        results.push(new JobListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsListResults ${err.message}`);
    }

    return results;
  };

  getAllJobsListResults = async (): Promise<AllJobsListResult[]> => {
    const results: AllJobsListResult[] = [];
    const generatedQuery = `
          MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
          RETURN structured_jobpost {
              .*,
              classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
              commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
              locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
              organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization) | organization {
                  .*,
                  discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                  docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                  telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
                  alias: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name][0],
                  twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0],
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
                        (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain) | chain { .* }
                      ]
                    }
                  ],
                  fundingRounds: [
                    (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round {.*}
                  ],
                  investors: [
                    (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
                  ]
              }][0]
          } AS result
        `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records.map(record => record.get("results") as AllJobsListResult);
      for (const result of resultSet) {
        results.push(new AllJobListResultEntity(result).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsListResults ${err.message}`);
    }
    return results;
  };

  async getJobsListWithSearch(
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const {
      minTvl,
      maxTvl,
      minMonthlyVolume,
      maxMonthlyVolume,
      minMonthlyFees,
      maxMonthlyFees,
      minMonthlyRevenue,
      maxMonthlyRevenue,
      minSalaryRange,
      maxSalaryRange,
      minHeadCount,
      maxHeadCount,
      startDate,
      endDate,
      seniority: seniorityFilterList,
      locations: locationFilterList,
      tags: tagFilterList,
      audits: auditFilter,
      hacks: hackFilter,
      chains: chainFilterList,
      projects: projectFilterList,
      organizations: organizationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      classifications: classificationFilterList,
      token,
      mainNet,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const orgJobs = await this.getJobsListResults();
      results.push(...orgJobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsListWithSearch ${err.message}`);
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const jobFilters = (jlr: JobListResult): boolean => {
      const {
        projects,
        investors,
        fundingRounds,
        name: orgName,
        headcountEstimate,
      } = jlr.organization;
      const {
        title: jobTitle,
        tags,
        seniority,
        locationType,
        salary: salary,
        lastSeenTimestamp: extractedTimestamp,
      } = jlr;
      const anchorProject = projects.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];
      const matchesQuery =
        orgName.match(query) ||
        jobTitle.match(query) ||
        tags.filter(tag => tag.name.match(query)).length > 0 ||
        projects.filter(project => project.name.match(query)).length > 0;
      return (
        (!organizationFilterList || organizationFilterList.includes(orgName)) &&
        (!seniorityFilterList || seniorityFilterList.includes(seniority)) &&
        (!locationFilterList || locationFilterList.includes(locationType)) &&
        (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
        (!minSalaryRange || (salary ?? 0) >= minSalaryRange) &&
        (!maxSalaryRange || (salary ?? 0) < maxSalaryRange) &&
        (!startDate || extractedTimestamp >= startDate) &&
        (!endDate || extractedTimestamp < endDate) &&
        (!projectFilterList ||
          projects.filter(x => projectFilterList.includes(x.name)).length >
            0) &&
        (!classificationFilterList ||
          projects.filter(x => classificationFilterList.includes(x.category))
            .length > 0) &&
        (!token ||
          projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
            .length > 0) &&
        (!mainNet || projects.filter(x => x.isMainnet).length > 0) &&
        (!minTvl || (anchorProject?.tvl ?? 0) >= minTvl) &&
        (!maxTvl || (anchorProject?.tvl ?? 0) < maxTvl) &&
        (!minMonthlyVolume ||
          (anchorProject?.monthlyVolume ?? 0) >= minMonthlyVolume) &&
        (!maxMonthlyVolume ||
          (anchorProject?.monthlyVolume ?? 0) < maxMonthlyVolume) &&
        (!minMonthlyFees ||
          (anchorProject?.monthlyFees ?? 0) >= minMonthlyFees) &&
        (!maxMonthlyFees ||
          (anchorProject?.monthlyFees ?? 0) < maxMonthlyFees) &&
        (!minMonthlyRevenue ||
          (anchorProject?.monthlyRevenue ?? 0) >= minMonthlyRevenue) &&
        (!maxMonthlyRevenue ||
          (anchorProject?.monthlyRevenue ?? 0) < maxMonthlyRevenue) &&
        (!auditFilter ||
          (anchorProject?.audits.length ?? 0) > 0 === auditFilter) &&
        (!hackFilter ||
          (anchorProject?.hacks.length ?? 0) > 0 === hackFilter) &&
        (!chainFilterList ||
          (anchorProject?.chains
            ?.map(x => x.name)
            .filter(x => chainFilterList.filter(y => x === y).length > 0) ??
            false)) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(investor.name),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRounds.filter(fundingRound =>
            fundingRoundFilterList.includes(fundingRound.roundName),
          ).length > 0) &&
        (!query || matchesQuery) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(tag.name)).length > 0)
      );
    };

    const filtered = results.filter(jobFilters);

    const getSortParam = (jlr: JobListResult): number => {
      const p1 = jlr.organization.projects.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];
      switch (orderBy) {
        case "audits":
          return p1?.audits.length ?? 0;
        case "hacks":
          return p1?.hacks.length ?? 0;
        case "chains":
          return p1?.chains.length ?? 0;
        case "tvl":
          return p1?.tvl ?? 0;
        case "monthlyVolume":
          return p1?.monthlyVolume ?? 0;
        case "monthlyFees":
          return p1?.monthlyFees ?? 0;
        case "monthlyRevenue":
          return p1?.monthlyRevenue ?? 0;
        case "fundingDate":
          return (
            jlr.organization.fundingRounds.sort((a, b) => b.date - a.date)[0]
              ?.date ?? 0
          );
        case "headcountEstimate":
          return jlr.organization?.headcountEstimate ?? 0;
        case "publicationDate":
          return jlr.lastSeenTimestamp;
        case "salary":
          return jlr.salary;
        default:
          return jlr.lastSeenTimestamp;
      }
    };

    let final = [];
    if (!order || order === "desc") {
      final = sort<JobListResult>(filtered).desc(getSortParam);
    } else {
      final = sort<JobListResult>(filtered).asc(getSortParam);
    }

    return {
      page: (final.length > 0 ? params.page ?? 1 : -1) ?? -1,
      count: limit > final.length ? final.length : limit,
      total: final.length ? intConverter(final.length) : 0,
      data: final
        .slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        )
        .map(x => new JobListResultEntity(x).getProperties()),
    };
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            RETURN {
              maxTvl: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.tvl]),
              minTvl: apoc.coll.min([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.tvl]),
              minMonthlyVolume: apoc.coll.min([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyVolume]),
              maxMonthlyVolume: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyVolume]),
              minMonthlyFees: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyFees]),
              maxMonthlyFees: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyFees]),
              minMonthlyRevenue: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyRevenue]),
              maxMonthlyRevenue: apoc.coll.max([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.monthlyRevenue]),
              minSalaryRange: apoc.coll.min([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | j.salary]),
              maxSalaryRange: apoc.coll.max([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | j.salary]),
              minHeadCount: apoc.coll.min([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              maxHeadCount: apoc.coll.max([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.headcountEstimate]),
              tags: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_TAG]->(tag:Tag) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name ]),
              fundingRounds: apoc.coll.toSet([(org: Organization)-[:HAS_FUNDING_ROUND]->(round: FundingRound) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | round.roundName]),
              investors: apoc.coll.toSet([(org: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | investor.name]),
              projects: apoc.coll.toSet([(org)-[:HAS_PROJECT]->(project:Project) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | project.name]),
              classifications: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name]),
              chains: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON_CHAIN*2]->(chain: Chain) WHERE EXISTS((org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)) | chain.name]),
              location: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location: JobpostLocationType) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | location.name]),
              organizations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.name]),
              seniority: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | j.seniority])
            } as res
          `,
        )
        .then(res =>
          res.records.length
            ? new JobFilterConfigsEntity(
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
      this.logger.error(`JobsService::getFilterConfigs ${err.message}`);
      return undefined;
    }
  }

  async getJobDetailsByUuid(uuid: string): Promise<JobListResult | undefined> {
    try {
      return (await this.getJobsListResults()).find(
        job => job.shortUUID === uuid,
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", uuid);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobDetailsByUuid ${err.message}`);
      return undefined;
    }
  }

  async getJobsByOrgId(id: string): Promise<JobListResult[] | undefined> {
    try {
      return (await this.getJobsListResults())
        .filter(x => x.organization.orgId === id)
        .map(orgJob => new JobListResultEntity(orgJob).getProperties());
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getAllJobsWithSearch(
    params: AllJobsParams,
  ): Promise<PaginatedData<AllJobsListResult>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };

    const {
      organizations: organizationFilterList,
      classifications: classificationFilterList,
      query,
      page,
      limit,
    } = paramsPassed;

    const results: AllJobsListResult[] = [];

    try {
      this.logger.log("No cached jobs found, retrieving from db.");
      const orgJobs = await this.getAllJobsListResults();
      results.push(...orgJobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsWithSearch ${err.message}`);
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const jobFilters = (jlr: AllJobsListResult): boolean => {
      const { name: orgName } = jlr.organization;
      const { title: jobTitle, tags } = jlr;

      const matchesQuery =
        orgName.match(query) ||
        jobTitle.match(query) ||
        tags.filter(tag => tag.name.match(query)).length > 0;

      return (
        (!classificationFilterList ||
          classificationFilterList.includes(jlr.classification)) &&
        (!query || matchesQuery) &&
        (!organizationFilterList || organizationFilterList.includes(orgName))
      );
    };

    const filtered = results.filter(jobFilters);

    const final = sort<AllJobsListResult>(filtered).desc(
      job => job.lastSeenTimestamp,
    );

    return {
      page: (final.length > 0 ? params.page ?? 1 : -1) ?? -1,
      count: limit > final.length ? final.length : limit,
      total: final.length ? intConverter(final.length) : 0,
      data: final
        .slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        )
        .map(x => new AllJobListResultEntity(x).getProperties()),
    };
  }

  async getAllJobsFilterConfigs(): Promise<AllJobsFilterConfigs> {
    try {
      return await this.neogma.queryRunner
        .run(
          `
            RETURN {
                classifications: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) WHERE (j)-[:HAS_STATUS]->(:JobpostOnlineStatus) | classification.name]),
                organizations: apoc.coll.toSet([(org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | org.name]),
            } as res
          `,
        )
        .then(res =>
          res.records.length
            ? new AllJobsFilterConfigsEntity(
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
      this.logger.error(`JobsService::getAllJobsFilterConfigs ${err.message}`);
      return undefined;
    }
  }
}
