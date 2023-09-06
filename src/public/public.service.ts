import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Cache } from "cache-manager";
import { sort } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { PUBLIC_JOBS_LIST_CACHE_KEY } from "src/shared/constants";
import { JobListResultEntity } from "src/shared/entities";
import { intConverter } from "src/shared/helpers";
import { JobListResult, PaginatedData } from "src/shared/interfaces";
import { OrganizationInstance } from "src/shared/models";
import { IN_MEM_CACHE_EXPIRY } from "src/shared/presets/cache-control";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class PublicService {
  logger = new CustomLogger(PublicService.name);
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private models: ModelService,
  ) {}

  getAllOrgJobsListResults = async (
    organization: OrganizationInstance,
  ): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const fundingRounds = await organization.getFundingRoundsData();
    const investors = await organization.getInvestorsData();
    const projects = await organization.getProjectsMoreInfoData();
    const jobsites = await organization.getJobsites();
    for (const jobsite of jobsites) {
      const structuredJobposts = await jobsite.getAllStructuredJobposts();
      for (const structuredJobpost of structuredJobposts) {
        const technologies =
          await structuredJobpost.getUnblockedTechnologiesData();
        results.push(
          new JobListResultEntity({
            ...structuredJobpost.getDataValues(),
            organization: {
              ...organization.getDataValues(),
              fundingRounds: fundingRounds,
              investors: investors,
              projects: projects,
            },
            technologies: technologies,
          }).getProperties(),
        );
      }
    }
    return results;
  };

  getCachedJobs = async <K>(
    cacheKey: string = PUBLIC_JOBS_LIST_CACHE_KEY,
  ): Promise<K[]> => {
    const cachedJobsString =
      (await this.cacheManager.get<string>(cacheKey)) ?? "[]";
    const cachedJobs = JSON.parse(cachedJobsString) as K[];
    return cachedJobs;
  };

  async getAllJobsList(params: {
    page: number;
    limit: number;
  }): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const { page, limit } = paramsPassed;

    await this.models.validateCache();

    const cachedJobs = await this.getCachedJobs<JobListResult>();

    const results: JobListResult[] = cachedJobs;

    if (cachedJobs.length !== 0) {
      this.logger.log("Found cached jobs");
    } else {
      this.logger.log("No cached jobs found, retrieving from db.");
      try {
        const organizations = await this.models.Organizations.findMany();

        for (const organization of organizations) {
          const orgJobs = await this.getAllOrgJobsListResults(organization);
          results.push(...orgJobs);
        }
        await this.cacheManager.set(
          PUBLIC_JOBS_LIST_CACHE_KEY,
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
        this.logger.error(
          `PublicService::getAllJobsListWithSearch ${err.message}`,
        );
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      }
    }

    const final = sort<JobListResult>(results).desc(
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
        .map(x => new JobListResultEntity(x).getProperties()),
    };
  }
}
