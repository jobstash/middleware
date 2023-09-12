import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Cache } from "cache-manager";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import {
  ALL_JOBS_CACHE_KEY,
  ALL_JOBS_FILTER_CONFIGS_CACHE_KEY,
  JOBS_LIST_CACHE_KEY,
  JOBS_LIST_FILTER_CONFIGS_CACHE_KEY,
} from "src/shared/constants";
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
import { IN_MEM_CACHE_EXPIRY } from "src/shared/presets/cache-control";

@Injectable()
export class JobsService {
  logger = new CustomLogger(JobsService.name);
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getCachedJobs = async <K>(
    cacheKey: string = JOBS_LIST_CACHE_KEY,
  ): Promise<K[]> => {
    const cachedJobsString =
      (await this.cacheManager.get<string>(cacheKey)) ?? "[]";
    const cachedJobs = JSON.parse(cachedJobsString) as K[];
    return cachedJobs;
  };

  getCachedFilterConfigs = async <FC>(
    cacheKey: string = JOBS_LIST_FILTER_CONFIGS_CACHE_KEY,
  ): Promise<FC> => {
    const cachedFilterConfigsString =
      (await this.cacheManager.get<string>(cacheKey)) ?? "{}";
    const cachedFilterConfigs = JSON.parse(cachedFilterConfigsString) as FC;
    return cachedFilterConfigs;
  };

  getJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      MATCH (organization: Organization)

      MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
      MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
      MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
                
      OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
      WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
      
      OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
      OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
      
      WITH structured_jobpost, organization, 
      COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
      COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
      COLLECT(DISTINCT PROPERTIES(technology)) AS technologies

      WITH {
          id: structured_jobpost.id,
          jobTitle: structured_jobpost.jobTitle,
          role: structured_jobpost.role,
          jobLocation: structured_jobpost.jobLocation,
          jobApplyPageUrl: structured_jobpost.jobApplyPageUrl,
          jobPageUrl: structured_jobpost.jobPageUrl,
          shortUUID: structured_jobpost.shortUUID,
          seniority: structured_jobpost.seniority,
          jobCreatedTimestamp: structured_jobpost.jobCreatedTimestamp,
          jobFoundTimestamp: structured_jobpost.jobFoundTimestamp,
          minSalaryRange: structured_jobpost.minSalaryRange,
          maxSalaryRange: structured_jobpost.maxSalaryRange,
          medianSalary: structured_jobpost.medianSalary,
          salaryCurrency: structured_jobpost.salaryCurrency,
          aiDetectedTechnologies: structured_jobpost.aiDetectedTechnologies,
          extractedTimestamp: structured_jobpost.extractedTimestamp,
          team: structured_jobpost.team,
          benefits: structured_jobpost.benefits,
          culture: structured_jobpost.culture,
          paysInCrypto: structured_jobpost.paysInCrypto,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          jobCommitment: structured_jobpost.jobCommitment,
          organization: {
              id: organization.id,
              orgId: organization.orgId,
              name: organization.name,
              description: organization.description,
              summary: organization.summary,
              location: organization.location,
              url: organization.url,
              logo: organization.logo,
              headCount: organization.headCount,
              twitter: organization.twitter,
              discord: organization.discord,
              github: organization.github,
              telegram: organization.telegram,
              docs: organization.docs,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              teamSize: organization.teamSize,
              fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
              investors: [investor in investors WHERE investor.id IS NOT NULL]
          },
          technologies: [technology in technologies WHERE technology.id IS NOT NULL]
      } AS result

      RETURN COLLECT(result) as results
    `;

    try {
      const projects = await this.models.Projects.getProjectsMoreInfoData();
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records[0]?.get("results") as JobListResult[];
      for (const result of resultSet) {
        const projectList = projects.filter(
          x => x.orgId === result.organization.orgId,
        );
        const updatedResult: JobListResult = {
          ...result,
          organization: {
            ...result.organization,
            projects: projectList,
          },
        };
        results.push(new JobListResultEntity(updatedResult).getProperties());
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
          MATCH (organization: Organization)

          MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(jobpost_category:JobpostCategory)
          MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
          MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)

          OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
          WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()

          WITH structured_jobpost, organization, jobpost_category, COLLECT(DISTINCT PROPERTIES(technology)) as technologies

          WITH {
              id: structured_jobpost.id,
              jobTitle: structured_jobpost.jobTitle,
              role: structured_jobpost.role,
              jobLocation: structured_jobpost.jobLocation,
              jobApplyPageUrl: structured_jobpost.jobApplyPageUrl,
              jobPageUrl: structured_jobpost.jobPageUrl,
              shortUUID: structured_jobpost.shortUUID,
              seniority: structured_jobpost.seniority,
              jobCreatedTimestamp: structured_jobpost.jobCreatedTimestamp,
              jobFoundTimestamp: structured_jobpost.jobFoundTimestamp,
              minSalaryRange: structured_jobpost.minSalaryRange,
              maxSalaryRange: structured_jobpost.maxSalaryRange,
              medianSalary: structured_jobpost.medianSalary,
              salaryCurrency: structured_jobpost.salaryCurrency,
              aiDetectedTechnologies: structured_jobpost.aiDetectedTechnologies,
              extractedTimestamp: structured_jobpost.extractedTimestamp,
              team: structured_jobpost.team,
              benefits: structured_jobpost.benefits,
              culture: structured_jobpost.culture,
              paysInCrypto: structured_jobpost.paysInCrypto,
              offersTokenAllocation: structured_jobpost.offersTokenAllocation,
              jobCommitment: structured_jobpost.jobCommitment,
              category: {
                id: jobpost_category.id,
                name: jobpost_category.name
              },
              organization: {
                  id: organization.id,
                  orgId: organization.orgId,
                  name: organization.name,
                  description: organization.description,
                  summary: organization.summary,
                  location: organization.location,
                  url: organization.url,
                  logo: organization.logo,
                  headcount: organization.headcount,
                  twitter: organization.twitter,
                  discord: organization.discord,
                  github: organization.github,
                  telegram: organization.telegram,
                  docs: organization.docs,
                  jobsiteLink: organization.jobsiteLink,
                  createdTimestamp: organization.createdTimestamp,
                  updatedTimestamp: organization.updatedTimestamp,
                  teamSize: organization.teamSize
              },
              technologies: [technology in technologies WHERE technology.id IS NOT NULL]
          } AS result
          
          RETURN COLLECT(result) as results
        `;

    try {
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records[0]?.get("results") as AllJobsListResult[];
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
      query: params.query ? `/${params.query}/g` : null,
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
      tech: technologyFilterList,
      audits: auditFilterList,
      hacks: hackFilterList,
      chains: chainFilterList,
      projects: projectFilterList,
      organizations: organizationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      categories: categoryFilterList,
      token,
      mainNet,
      query,
      order,
      orderBy,
      page,
      limit,
    } = paramsPassed;

    await this.models.validateCache();

    const cachedJobs = await this.getCachedJobs<JobListResult>();

    const results: JobListResult[] = cachedJobs;

    if (cachedJobs.length !== 0) {
      this.logger.log("Found cached jobs");
    } else {
      this.logger.log("No cached jobs found, retrieving from db.");
      try {
        const orgJobs = await this.getJobsListResults();
        results.push(...orgJobs);
        await this.cacheManager.set(
          JOBS_LIST_CACHE_KEY,
          JSON.stringify(results),
          IN_MEM_CACHE_EXPIRY,
        );
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
        jobTitle,
        technologies,
        seniority,
        jobLocation,
        medianSalary,
        jobCreatedTimestamp,
      } = jlr;
      const anchorProject = projects.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];
      return (
        (!organizationFilterList || organizationFilterList.includes(orgName)) &&
        (!seniorityFilterList || seniorityFilterList.includes(seniority)) &&
        (!locationFilterList || locationFilterList.includes(jobLocation)) &&
        (!minHeadCount || (headCount ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headCount ?? 0) < maxHeadCount) &&
        (!minSalaryRange || (medianSalary ?? 0) >= minSalaryRange) &&
        (!maxSalaryRange || (medianSalary ?? 0) < maxSalaryRange) &&
        (!startDate || jobCreatedTimestamp >= endDate) &&
        (!endDate || jobCreatedTimestamp < endDate) &&
        (!projectFilterList ||
          projects.filter(x => projectFilterList.includes(x.name)).length >
            0) &&
        (!categoryFilterList ||
          projects.filter(x => categoryFilterList.includes(x.category)).length >
            0) &&
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
        (!query ||
          (technologies.length > 0 &&
            (orgName.match(query) ||
              jobTitle.match(query) ||
              technologies.filter(technology => technology.name.match(query))
                .length > 0 ||
              projects.filter(project => project.name.match(query)).length >
                0))) &&
        (!technologyFilterList ||
          technologies.filter(technology =>
            technologyFilterList.includes(technology.name),
          ).length > 0)
      );
    };

    const filtered = results.filter(jobFilters);

    const getSortParam = (jlr: JobListResult): number => {
      const p1 = jlr.organization.projects.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];
      switch (orderBy) {
        case "audits":
          return p1.audits.length;
        case "hacks":
          return p1.hacks.length;
        case "chains":
          return p1.chains.length;
        case "teamSize":
          return p1.teamSize;
        case "tvl":
          return p1.tvl;
        case "monthlyVolume":
          return p1.monthlyVolume;
        case "monthlyFees":
          return p1.monthlyFees;
        case "monthlyRevenue":
          return p1.monthlyRevenue;
        case "fundingDate":
          return jlr.organization.fundingRounds.sort(
            (a, b) => b.date - a.date,
          )[0].date;
        case "headCount":
          return jlr.organization.headCount;
        case "publicationDate":
          return jlr.jobCreatedTimestamp;
        case "salary":
          return jlr.medianSalary;
        default:
          return jlr.jobCreatedTimestamp;
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
      await this.models.validateCache();

      const result = await this.getCachedFilterConfigs<JobFilterConfigs>();

      if (result?.audits) {
        return result;
      } else {
        const freshResult = await this.neogma.queryRunner
          .run(
            `
        MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        MATCH (jp)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        MATCH (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)
        OPTIONAL MATCH (f)-[:INVESTED_BY]->(i:Investor)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(c:Chain)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]->(a:Audit)
        WITH o, p, j, t, f, a, i, c, cat
        RETURN {
            minSalaryRange: MIN(CASE WHEN NOT j.medianSalary IS NULL AND isNaN(j.medianSalary) = false THEN toFloat(j.medianSalary) END),
            maxSalaryRange: MAX(CASE WHEN NOT j.medianSalary IS NULL AND isNaN(j.medianSalary) = false THEN toFloat(j.medianSalary) END),
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
            tech: COLLECT(DISTINCT t.name),
            fundingRounds: COLLECT(DISTINCT f.roundName),
            investors: COLLECT(DISTINCT i.name),
            projects: COLLECT(DISTINCT p.name),
            audits: COLLECT(DISTINCT a.name),
            categories: COLLECT(DISTINCT cat.name),
            chains: COLLECT(DISTINCT c.name),
            locations: COLLECT(DISTINCT j.jobLocation),
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
        await this.cacheManager.set(
          JOBS_LIST_FILTER_CONFIGS_CACHE_KEY,
          JSON.stringify(freshResult),
          IN_MEM_CACHE_EXPIRY,
        );
        return freshResult;
      }
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
      await this.models.validateCache();

      const cachedJobs = await this.getCachedJobs<JobListResult>();

      if (cachedJobs.length === 0) {
        return (await this.getJobsListResults()).find(
          job => job.shortUUID === uuid,
        );
      } else {
        return cachedJobs.find(job => job.shortUUID === uuid);
      }
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
      await this.models.validateCache();

      const cachedJobs = await this.getCachedJobs<JobListResult>();

      const results: JobListResult[] = cachedJobs.filter(
        job => job.organization.orgId === id,
      );

      if (
        cachedJobs === null ||
        cachedJobs === undefined ||
        cachedJobs.length === 0
      ) {
        results.push(
          ...(await this.getJobsListResults())
            .filter(x => x.organization.orgId === id)
            .map(orgJob => new JobListResultEntity(orgJob).getProperties()),
        );
        return results;
      } else {
        return results;
      }
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
      query: params.query ? `/${params.query}/g` : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };

    const {
      organizations: organizationFilterList,
      categories: categoryFilterList,
      query,
      page,
      limit,
    } = paramsPassed;

    await this.models.validateCache();

    const cachedJobs = await this.getCachedJobs<AllJobsListResult>(
      ALL_JOBS_CACHE_KEY,
    );

    const results: AllJobsListResult[] = cachedJobs;

    if (cachedJobs.length !== 0) {
      this.logger.log("Found cached jobs");
    } else {
      try {
        this.logger.log("No cached jobs found, retrieving from db.");
        const orgJobs = await this.getAllJobsListResults();
        results.push(...orgJobs);
        await this.cacheManager.set(
          ALL_JOBS_CACHE_KEY,
          JSON.stringify(results),
          IN_MEM_CACHE_EXPIRY,
        );
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
    }

    const jobFilters = (jlr: AllJobsListResult): boolean => {
      const { name: orgName } = jlr.organization;
      const { jobTitle, technologies } = jlr;

      return (
        (!categoryFilterList ||
          categoryFilterList.includes(jlr.category.name)) &&
        (!query ||
          (technologies.length > 0 &&
            (orgName.match(query) ||
              jobTitle.match(query) ||
              technologies.filter(technology => technology.name.match(query))
                .length > 0))) &&
        (!organizationFilterList || organizationFilterList.includes(orgName))
      );
    };

    const filtered = results.filter(jobFilters);

    const final = sort<AllJobsListResult>(filtered).desc(
      job => job.jobCreatedTimestamp,
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
      await this.models.validateCache();

      const result = await this.getCachedFilterConfigs<AllJobsFilterConfigs>(
        ALL_JOBS_FILTER_CONFIGS_CACHE_KEY,
      );

      if (result?.categories) {
        return result;
      } else {
        const freshResult = await this.neogma.queryRunner
          .run(
            `
        MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        MATCH (jp)-[:IS_CATEGORIZED_AS]-(cat:JobpostCategory)
        WITH o, cat
        RETURN {
            categories: COLLECT(DISTINCT cat.name),
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
        await this.cacheManager.set(
          ALL_JOBS_FILTER_CONFIGS_CACHE_KEY,
          JSON.stringify(freshResult),
          IN_MEM_CACHE_EXPIRY,
        );
        return freshResult;
      }
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
