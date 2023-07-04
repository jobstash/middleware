import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { JobListResult, PaginatedData, Project } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Cache } from "cache-manager";
import { intConverter } from "src/shared/helpers";
import { JobListResultEntity } from "src/shared/entities";

@Injectable()
export class PublicService {
  logger = new CustomLogger(PublicService.name);
  constructor(
    private readonly neo4jService: Neo4jService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async validateCache(): Promise<void> {
    try {
      const res = await this.neo4jService.write(
        `
          MATCH (node: DirtyNode)
          WITH node.dirty as isDirty, node
          SET (CASE WHEN isDirty = true THEN node END).dirty = false 
          RETURN isDirty
      `.replace(/^\s*$(?:\r\n?|\n)/gm, ""),
      );
      const isDirty = (res.records[0]?.get("isDirty") as boolean) ?? false;
      if (isDirty) {
        await this.cacheManager.reset();
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`JobsService::shouldClearCache ${error.message}`);
    }
  }

  async getProjectsData(): Promise<Project[]> {
    const cachedProjectsString =
      (await this.cacheManager.get<string>("projects")) ?? "[]";
    const cachedProjects = JSON.parse(cachedProjectsString) as Project[];
    if (
      cachedProjects !== null &&
      cachedProjects !== undefined &&
      cachedProjects.length !== 0
    ) {
      this.logger.log("Found cached projects");
      return cachedProjects.map(x => x as Project);
    } else {
      this.logger.log("No cached projects found, retrieving from db.");
      const generatedQuery = `
        MATCH (project: Project)
        OPTIONAL MATCH (project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
        OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
        OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
        OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
        WITH COLLECT(DISTINCT PROPERTIES(project_category)) AS categories,
          COLLECT(DISTINCT PROPERTIES(hack)) as hacks, 
          COLLECT(DISTINCT PROPERTIES(audit)) as audits, 
          COLLECT(DISTINCT PROPERTIES(chain)) as chains, project
        RETURN COLLECT(DISTINCT {
          id: project.id,
          defiLlamaId: project.defiLlamaId,
          defiLlamaSlug: project.defiLlamaSlug,
          defiLlamaParent: project.defiLlamaParent,
          name: project.name,
          description: project.description,
          url: project.url,
          logo: project.logo,
          tokenAddress: project.tokenAddress,
          tokenSymbol: project.tokenSymbol,
          isInConstruction: project.isInConstruction,
          tvl: project.tvl,
          monthlyVolume: project.monthlyVolume,
          monthlyFees: project.monthlyFees,
          monthlyRevenue: project.monthlyRevenue,
          monthlyActiveUsers: project.monthlyActiveUsers,
          isMainnet: project.isMainnet,
          telegram: project.telegram,
          orgId: project.orgId,
          cmcId: project.cmcId,
          twitter: project.twitter,
          discord: project.discord,
          docs: project.docs,
          teamSize: project.teamSize,
          githubOrganization: project.githubOrganization,
          category: project.category,
          createdTimestamp: project.createdTimestamp,
          updatedTimestamp: project.updatedTimestamp,
          categories: [category in categories WHERE category.id IS NOT NULL],
          hacks: [hack in hacks WHERE hack.id IS NOT NULL],
          audits: [audit in audits WHERE audit.id IS NOT NULL],
          chains: [chain in chains WHERE chain.id IS NOT NULL]
        }) AS projects
    `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
      return this.neo4jService
        .read(generatedQuery)
        .then(async res => {
          const projects: Project[] = res?.records[0]
            .get("projects")
            .map(record => record as Project);
          await this.cacheManager.set(
            "projects",
            JSON.stringify(projects),
            18000000,
          );
          return projects;
        })
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "jobs.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`JobsService::getProjectsData ${err.message}`);
          return [];
        });
    }
  }
  async transformResultSetWithNoFilters(
    results: JobListResult[],
    params: { page: number; limit: number },
  ): Promise<PaginatedData<JobListResult>> {
    const page = Number(params.page),
      limit = Number(params.limit);
    const final = [];
    const allProjects = await this.getProjectsData();
    for (const result of results) {
      const projectList = allProjects.filter(
        x => x.orgId === result.organization.orgId,
      );

      const updatedResult: JobListResult = {
        ...result,
        organization: {
          ...result.organization,
          projects: projectList,
        },
      };
      final.push(updatedResult);
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
        .map(x => new JobListResultEntity(x).getProperties()),
    };
  }

  async getAllJobsList(params: {
    page: number;
    limit: number;
  }): Promise<PaginatedData<JobListResult>> {
    const generatedQuery = `
      MATCH (organization: Organization)
      MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)
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
      } AS result, structured_jobpost, organization

      // <--Sorter Embedding-->
      // The sorter has to be embedded in this manner due to its dynamic nature
      ORDER BY result.jobCreatedTimestamp DESC
      // <--!!!Sorter Embedding-->
      RETURN COLLECT(result) as results
    `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    // console.log(generatedQuery);
    const paramsPassed = {
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };

    await this.validateCache();
    const cachedJobsString =
      (await this.cacheManager.get<string>("jobs")) ?? "[]";
    const cachedJobs = JSON.parse(cachedJobsString) as JobListResult[];
    if (
      cachedJobs !== null &&
      cachedJobs !== undefined &&
      cachedJobs.length !== 0
    ) {
      this.logger.log("Found cached jobs");
      return this.transformResultSetWithNoFilters(cachedJobs, paramsPassed);
    } else {
      this.logger.log("No applicable cached jobs found, retrieving from db.");
      return this.neo4jService
        .read(generatedQuery, paramsPassed)
        .then(async res => {
          const results = res.records[0]?.get("results");
          await this.cacheManager.set(
            "jobs",
            JSON.stringify(results),
            18000000,
          );
          return this.transformResultSetWithNoFilters(results, paramsPassed);
        })
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "jobs.service",
            });
            scope.setExtra("input", params);
            Sentry.captureException(err);
          });
          this.logger.error(`PublicService::getAllJobsList ${err.message}`);
          return {
            page: -1,
            count: 0,
            total: 0,
            data: [],
          };
        });
    }
  }
}
