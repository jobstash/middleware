import { Inject, Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  ShortOrgEntity,
  ShortOrg,
  Repository,
  PaginatedData,
  OrgFilterConfigs,
  OrgFilterConfigsEntity,
  OrgListResult,
  OrgListResultEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { OrgListParams } from "./dto/org-list.input";
import { intConverter, toShortOrg } from "src/shared/helpers";
import { RepositoryEntity } from "src/shared/entities/repository.entity";
import { createNewSortInstance, sort } from "fast-sort";
import { ModelService } from "src/model/model.service";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  ORGS_LIST_CACHE_KEY,
  ORGS_LIST_FILTER_CONFIGS_CACHE_KEY,
} from "src/shared/constants";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { IN_MEM_CACHE_EXPIRY } from "src/shared/presets/cache-control";

@Injectable()
export class OrganizationsService {
  logger = new CustomLogger(OrganizationsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private models: ModelService,
    private readonly neo4jService: Neo4jService,
  ) {}

  getCachedOrgs = async <K>(
    cacheKey: string = ORGS_LIST_CACHE_KEY,
  ): Promise<K[]> => {
    const cachedOrgsString =
      (await this.cacheManager.get<string>(cacheKey)) ?? "[]";
    const cachedOrgs = JSON.parse(cachedOrgsString) as K[];
    return cachedOrgs;
  };

  getCachedFilterConfigs = async <FC>(
    cacheKey: string = ORGS_LIST_FILTER_CONFIGS_CACHE_KEY,
  ): Promise<FC> => {
    const cachedFilterConfigsString =
      (await this.cacheManager.get<string>(cacheKey)) ?? "{}";
    const cachedFilterConfigs = JSON.parse(cachedFilterConfigsString) as FC;
    return cachedFilterConfigs;
  };

  getOrgListResults = async (): Promise<OrgListResult[]> => {
    const results: OrgListResult[] = [];
    const generatedQuery = `
        MATCH (organization:Organization)
        
        OPTIONAL MATCH (organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
        WHERE (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
        WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()

        OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
        OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)

        WITH organization, COLLECT(DISTINCT {
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
            jobCommitment: structured_jobpost.jobCommitment
          }) as jobs,
          COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
          COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
          COLLECT(DISTINCT PROPERTIES(technology)) AS technologies

        WITH {
          id: organization.id,
          orgId: organization.orgId,
          name: organization.name,
          description: organization.description,
          summary: organization.summary,
          location: organization.location,
          url: organization.url,
          logo: organization.logo,
          twitter: organization.twitter,
          discord: organization.discord,
          github: organization.github,
          telegram: organization.telegram,
          docs: organization.docs,
          headcount: organization.headcount,
          jobsiteLink: organization.jobsiteLink,
          createdTimestamp: organization.createdTimestamp,
          updatedTimestamp: organization.updatedTimestamp,
          teamSize: organization.teamSize,
          fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
          investors: [investor in investors WHERE investor.id IS NOT NULL],
          jobs: [job in jobs WHERE job.id IS NOT NULL],
          technologies: [technology in technologies WHERE technology.id IS NOT NULL]
        } as res
        RETURN res
        `;

    try {
      const projects = await this.models.Projects.getProjectsMoreInfoData();
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records?.map(record => record?.get("res") as OrgListResult);
      for (const result of resultSet) {
        const projectList = projects.filter(x => x.orgId === result.orgId);
        const updatedResult: OrgListResult = {
          ...result,
          projects: projectList,
        };
        results.push(new OrgListResultEntity(updatedResult).getProperties());
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
      query: params.query ? `/${params.query}/g` : null,
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

    await this.models.validateCache();

    const cachedOrgs = await this.getCachedOrgs<OrgListResult>();

    const results: OrgListResult[] = cachedOrgs;

    if (cachedOrgs.length !== 0) {
      this.logger.log("Found cached orgs");
    } else {
      this.logger.log("No cached orgs found, retrieving from db.");
      try {
        const result = await this.getOrgListResults();
        results.push(...result);
        await this.cacheManager.set(
          ORGS_LIST_CACHE_KEY,
          JSON.stringify(results),
          IN_MEM_CACHE_EXPIRY,
        );
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
    }

    const orgFilters = (org: OrgListResult): boolean => {
      const { headCount, jobCount, projectCount, location, name } =
        toShortOrg(org);
      const { fundingRounds, investors } = org;
      return (
        (!query || name.match(query)) &&
        (!hasJobs || jobCount > 0) &&
        (!hasProjects || projectCount > 0) &&
        (!minHeadCount || (headCount ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headCount ?? 0) < maxHeadCount) &&
        (!locationFilterList || locationFilterList.includes(location)) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(investor.name),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRounds.filter(fundingRound =>
            fundingRoundFilterList.includes(fundingRound.roundName),
          ).length > 0)
      );
    };

    const filtered = results.filter(orgFilters);

    const getSortParam = (org: OrgListResult): number | null => {
      const shortOrg = toShortOrg(org);
      const lastJob = sort(org.jobs).desc(x => x.jobCreatedTimestamp)[0];
      switch (orderBy) {
        case "recentFundingDate":
          return shortOrg?.lastFundingDate ?? 0;
        case "recentJobDate":
          return lastJob?.jobCreatedTimestamp ?? 0;
        case "headCount":
          return org?.headCount ?? 0;
        default:
          return null;
      }
    };

    let final: OrgListResult[] = [];
    const naturalSort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      }).compare,
    });
    if (!order || order === "asc") {
      final = naturalSort<OrgListResult>(filtered).asc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    } else {
      final = naturalSort<OrgListResult>(filtered).desc(x =>
        params.orderBy ? getSortParam(x) : x.name,
      );
    }

    return {
      page: (final.length > 0 ? page ?? 1 : -1) ?? -1,
      count: limit > final.length ? final.length : limit,
      total: final.length ? intConverter(final.length) : 0,
      data: final
        .slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        )
        .map(x => new ShortOrgEntity(toShortOrg(x)).getProperties()),
    };
  }

  async getFilterConfigs(): Promise<OrgFilterConfigs> {
    try {
      const result = await this.getCachedFilterConfigs<OrgFilterConfigs>();
      if (result?.fundingRounds) {
        return result;
      } else {
        const freshResult = await this.neogma.queryRunner
          .run(
            `
              MATCH (o:Organization)
              OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)
              OPTIONAL MATCH (f)-[:INVESTED_BY]->(i:Investor)
              WITH o, f, i
              RETURN {
                  minHeadCount: MIN(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN o.headCount END),
                  maxHeadCount: MAX(CASE WHEN NOT o.headCount IS NULL AND isNaN(o.headCount) = false THEN o.headCount END),
                  fundingRounds: COLLECT(DISTINCT f.roundName),
                  investors: COLLECT(DISTINCT i.name),
                  locations: COLLECT(DISTINCT o.location)
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
        await this.cacheManager.set(
          ORGS_LIST_FILTER_CONFIGS_CACHE_KEY,
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
      this.logger.error(
        `OrganizationsService::getFilterConfigs ${err.message}`,
      );
      return undefined;
    }
  }

  async getOrgDetailsById(id: string): Promise<OrgListResult | undefined> {
    try {
      await this.models.validateCache();

      const cachedOrgs = await this.getCachedOrgs<OrgListResult>();

      if (cachedOrgs.length === 0) {
        return (await this.getOrgListResults()).find(org => org.orgId === id);
      } else {
        return cachedOrgs.find(org => org.orgId === id);
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
      this.logger.error(
        `OrganizationsService::getOrgDetailsById ${err.message}`,
      );
      return undefined;
    }
  }

  async getAll(): Promise<ShortOrg[]> {
    try {
      await this.models.validateCache();

      const cachedOrgs = await this.getCachedOrgs<OrgListResult>();

      const results: ShortOrg[] = cachedOrgs.map(org =>
        new ShortOrgEntity(toShortOrg(org)).getProperties(),
      );

      if (
        cachedOrgs === null ||
        cachedOrgs === undefined ||
        cachedOrgs.length === 0
      ) {
        results.push(
          ...(await this.getOrgListResults()).map(org =>
            new ShortOrgEntity(toShortOrg(org)).getProperties(),
          ),
        );
        return results;
      } else {
        return results;
      }
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
    const parsedQuery = `/${query}/g`;
    try {
      const all = await this.getAll();
      return all.filter(x => parsedQuery.match(x.name));
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
      const all = await this.getAll();
      return all.find(x => x.orgId === id);
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
    return this.neogma.queryRunner
      .run(
        `
        MATCH (:Organization {orgId: $id})-[:HAS_REPOSITORY]->(r:Repository)
        RETURN r as res
        `,
        { id },
      )
      .then(res =>
        res.records.map(record => {
          const ent = new RepositoryEntity(record.get("res")).getProperties();
          return ent;
        }),
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
}
