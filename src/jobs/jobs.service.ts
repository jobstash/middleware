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
                (organization)-[:HAS_FUNDING_ROUND|INVESTED_BY*2]->(investor) | investor { .* }
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
                    (organization)-[:HAS_FUNDING_ROUND|INVESTED_BY*2]->(investor) | investor { .* }
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
      minTeamSize,
      maxTeamSize,
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
      audits: auditFilterList,
      hacks: hackFilterList,
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
        headCount,
      } = jlr.organization;
      const {
        title: jobTitle,
        tags,
        seniority,
        locationType,
        salary: salary,
        extractedTimestamp,
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
        (!minHeadCount || (headCount ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headCount ?? 0) < maxHeadCount) &&
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
        (!minTeamSize || (anchorProject?.teamSize ?? 0) >= minTeamSize) &&
        (!maxTeamSize || (anchorProject?.teamSize ?? 0) < maxTeamSize) &&
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
        (!auditFilterList ||
          projects.some(
            x =>
              x.audits.filter(x => auditFilterList.includes(x.name)).length > 0,
          )) &&
        (!hackFilterList ||
          (anchorProject?.hacks.length ?? 0) > 0 === hackFilterList) &&
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
        case "teamSize":
          return p1?.teamSize ?? 0;
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
        case "headCount":
          return jlr.organization?.headCount ?? 0;
        case "publicationDate":
          return jlr.extractedTimestamp;
        case "salary":
          return jlr.salary;
        default:
          return jlr.extractedTimestamp;
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
            MATCH (o:Organization)-[:HAS_JOBSITE|HAS_JOBPOST*2]->(jp:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
            MATCH (jp)-[:HAS_STATUS]->(:JobpostOnlineStatus)
            MATCH (j)-[:HAS_CLASSIFICATION]-(cat:JobpostClassification)
            MATCH (j)-[:HAS_LOCATION_TYPE]-(l:JobpostLocationType)
            OPTIONAL MATCH (j)-[:HAS_TAG]->(t:JobpostTag)
            OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)-[:INVESTED_BY]->(i:Investor)
            OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
            OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(c:Chain)
            OPTIONAL MATCH (p)-[:HAS_AUDIT]->(a:Audit)
            RETURN {
              minSalaryRange: MIN(CASE WHEN NOT j.salary IS NULL AND isNaN(j.salary) = false THEN toFloat(j.salary) END),
              maxSalaryRange: MAX(CASE WHEN NOT j.salary IS NULL AND isNaN(j.salary) = false THEN toFloat(j.salary) END),
              minTvl: MIN(CASE WHEN NOT p.tvl IS NULL AND isNaN(p.tvl) = false THEN toFloat(p.tvl) END),
              maxTvl: MAX(CASE WHEN NOT p.tvl IS NULL AND isNaN(p.tvl) = false THEN toFloat(p.tvl) END),
              minMonthlyVolume: MIN(CASE WHEN NOT p.monthlyVolume IS NULL AND isNaN(p.monthlyVolume) = false THEN toFloat(p.monthlyVolume) END),
              maxMonthlyVolume: MAX(CASE WHEN NOT p.monthlyVolume IS NULL AND isNaN(p.monthlyVolume) = false THEN toFloat(p.monthlyVolume) END),
              minMonthlyFees: MIN(CASE WHEN NOT p.monthlyFees IS NULL AND isNaN(p.monthlyFees) = false THEN toFloat(p.monthlyFees) END),
              maxMonthlyFees: MAX(CASE WHEN NOT p.monthlyFees IS NULL AND isNaN(p.monthlyFees) = false THEN toFloat(p.monthlyFees) END),
              minMonthlyRevenue: MIN(CASE WHEN NOT p.monthlyRevenue IS NULL AND isNaN(p.monthlyRevenue) = false THEN toFloat(p.monthlyRevenue) END),
              maxMonthlyRevenue: MAX(CASE WHEN NOT p.monthlyRevenue IS NULL AND isNaN(p.monthlyRevenue) = false THEN toFloat(p.monthlyRevenue) END),
              minHeadCount: MIN(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN toFloat(o.headCount) END),
              maxHeadCount: MAX(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN toFloat(o.headCount) END),
              minTeamSize: MIN(CASE WHEN NOT p.teamSize IS NULL AND isNaN(p.teamSize) = false THEN toFloat(p.teamSize) END),
              maxTeamSize: MAX(CASE WHEN NOT p.teamSize IS NULL AND isNaN(p.teamSize) = false THEN toFloat(p.teamSize) END),
              tags: COLLECT(DISTINCT t.name),
              fundingRounds: COLLECT(DISTINCT f.roundName),
              investors: COLLECT(DISTINCT i.name),
              projects: COLLECT(DISTINCT p.name),
              audits: COLLECT(DISTINCT a.name),
              classifications: COLLECT(DISTINCT cat.name),
              chains: COLLECT(DISTINCT c.name),
              location: COLLECT(DISTINCT l.name),
              organizations: COLLECT(DISTINCT o.name),
              seniority: COLLECT(DISTINCT j.seniority)
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
      job => job.extractedTimestamp,
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
            MATCH (o:Organization)-[:HAS_JOBSITE|HAS_JOBPOST*2]->(jp:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
            MATCH (jp)-[:HAS_STATUS]->(:JobpostOnlineStatus)
            MATCH (j)-[:HAS_CLASSIFICATION]-(cat:JobpostClassification)
            WITH o, cat
            RETURN {
                classifications: COLLECT(DISTINCT cat.name),
                organizations: COLLECT(DISTINCT o.name)
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
