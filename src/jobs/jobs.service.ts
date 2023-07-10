import { Inject, Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  intConverter,
  jobListOrderBySelector,
  notStringOrNull,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  DateRange,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  JobListResultEntity,
  PaginatedData,
  ProjectMoreInfo,
} from "src/shared/types";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "./dto/job-list.input";
import { AllJobsParams } from "./dto/all-jobs.input";
import { AllJobListResultEntity } from "src/shared/entities/all-jobs-list-result.entity";
import { AllJobsListResult } from "src/shared/interfaces/all-jobs-list-result.interface";
import { AllJobsFilterConfigsEntity } from "src/shared/entities/all-jobs-filter-configs.entity";
import { sort } from "fast-sort";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

@Injectable()
export class JobsService {
  logger = new CustomLogger(JobsService.name);
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

  async getProjectsData(): Promise<ProjectMoreInfo[]> {
    const cachedProjectsString =
      (await this.cacheManager.get<string>("projects")) ?? "[]";
    const cachedProjects = JSON.parse(
      cachedProjectsString,
    ) as ProjectMoreInfo[];
    if (
      cachedProjects !== null &&
      cachedProjects !== undefined &&
      cachedProjects.length !== 0
    ) {
      this.logger.log("Found cached projects");
      return cachedProjects.map(x => x as ProjectMoreInfo);
    } else {
      this.logger.log("No cached projects found, retrieving from db.");
      const generatedQuery = `
        MATCH (project: Project)
        OPTIONAL MATCH (project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
        OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
        OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
        OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
        WITH project_category,
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
          category: project_category.name,
          createdTimestamp: project.createdTimestamp,
          updatedTimestamp: project.updatedTimestamp,
          hacks: [hack in hacks WHERE hack.id IS NOT NULL],
          audits: [audit in audits WHERE audit.id IS NOT NULL],
          chains: [chain in chains WHERE chain.id IS NOT NULL]
        }) AS projects
    `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
      return this.neo4jService
        .read(generatedQuery)
        .then(async res => {
          const projects: ProjectMoreInfo[] = res?.records[0]
            .get("projects")
            .map(record => record as ProjectMoreInfo);
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

  async transformResultSet(
    results: JobListResult[],
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
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
      audits,
      hacks,
      chains,
      projects,
      categories,
      token,
      mainNet,
      order,
      orderBy,
      page,
      limit,
    } = params;
    const resultSet = [];
    const allProjects = await this.getProjectsData();
    for (const result of results) {
      const projectList = allProjects.filter(
        x => x.orgId === result.organization.orgId,
      );

      const anchorProject = projectList.sort(
        (a, b) => b.monthlyVolume - a.monthlyVolume,
      )[0];

      if (
        !projects ||
        projectList.filter(x => projects.includes(x.name)).length > 0
      ) {
        if (
          !categories ||
          projectList.filter(x => categories.includes(x.category)).length > 0
        ) {
          if (
            !token ||
            projectList.filter(x => notStringOrNull(x.tokenAddress) !== null)
              .length > 0
          ) {
            if (!mainNet || projectList.filter(x => x.isMainnet).length > 0) {
              if (
                (!minTeamSize ||
                  (anchorProject?.teamSize ?? 0) >= minTeamSize) &&
                (!maxTeamSize || (anchorProject?.teamSize ?? 0) < maxTeamSize)
              ) {
                if (
                  (!minTvl || (anchorProject?.tvl ?? 0) >= minTvl) &&
                  (!maxTvl || (anchorProject?.tvl ?? 0) < maxTvl)
                ) {
                  if (
                    (!minMonthlyVolume ||
                      (anchorProject?.monthlyVolume ?? 0) >=
                        minMonthlyVolume) &&
                    (!maxMonthlyVolume ||
                      (anchorProject?.monthlyVolume ?? 0) < maxMonthlyVolume)
                  ) {
                    if (
                      (!minMonthlyFees ||
                        (anchorProject?.monthlyFees ?? 0) >= minMonthlyFees) &&
                      (!maxMonthlyFees ||
                        (anchorProject?.monthlyFees ?? 0) < maxMonthlyFees)
                    ) {
                      if (
                        (!minMonthlyRevenue ||
                          (anchorProject?.monthlyRevenue ?? 0) >=
                            minMonthlyRevenue) &&
                        (!maxMonthlyRevenue ||
                          (anchorProject?.monthlyRevenue ?? 0) <
                            maxMonthlyRevenue)
                      ) {
                        if (
                          !audits ||
                          (anchorProject?.audits.length ?? 0) > 0 === audits
                        ) {
                          if (
                            !hacks ||
                            (anchorProject?.hacks.length ?? 0) > 0 === hacks
                          ) {
                            if (
                              !chains ||
                              (anchorProject?.chains
                                ?.map(x => x.name)
                                .filter(
                                  x => chains.filter(y => x === y).length > 0,
                                ) ??
                                false)
                            ) {
                              const updatedResult: JobListResult = {
                                ...result,
                                organization: {
                                  ...result.organization,
                                  projects: projectList,
                                },
                              };
                              resultSet.push(updatedResult);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

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
        case "monthlyVolume":
          return p1.monthlyVolume;
        case "monthlyFees":
          return p1.monthlyFees;
        case "monthlyRevenue":
          return p1.monthlyRevenue;
        default:
          return jlr.jobCreatedTimestamp;
      }
    };

    let final = [];
    if (!order || order === "desc") {
      final = sort<JobListResult>(resultSet).desc(getSortParam);
    } else {
      final = sort<JobListResult>(resultSet).asc(getSortParam);
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

  async getJobsListWithSearch(
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const generatedQuery = `
      // Starting the query with just organizations to enable whatever org filters are present to reduce the result set considerably for subsequent steps
      MATCH (organization: Organization)
      WHERE ($organizations IS NULL OR organization.name IN $organizations)
        AND ($minHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount >= $minHeadCount))
        AND ($maxHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount <= $maxHeadCount))
      
      // Filtering further by jobpost filters. Priority is to ensure that each step removes as much redundant data as possible
      MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
      MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
      MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
      WHERE ($minSalaryRange IS NULL OR (structured_jobpost.medianSalary IS NOT NULL AND structured_jobpost.medianSalary >= $minSalaryRange))
        AND ($maxSalaryRange IS NULL OR (structured_jobpost.medianSalary IS NOT NULL AND structured_jobpost.medianSalary <= $maxSalaryRange))
        AND ($startDate IS NULL OR structured_jobpost.jobCreatedTimestamp >= $startDate)
        AND ($endDate IS NULL OR structured_jobpost.jobCreatedTimestamp <= $endDate)
        AND ($seniority IS NULL OR (structured_jobpost.seniority IS NOT NULL AND structured_jobpost.seniority IN $seniority))
        AND ($locations IS NULL OR (structured_jobpost.jobLocation IS NOT NULL AND structured_jobpost.jobLocation IN $locations))
                
      // Filter out technologies that are blocked
      OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
      WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
      
      OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)
      
      // Generate other data for the leanest result set possible at this point
      OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
      OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
      
      // NOTE: project category aggregation needs to be done at this step to prevent duplication of categories in the result set further down the line
      WITH structured_jobpost, organization, 
      COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
      COLLECT(DISTINCT PROPERTIES(project)) AS projects,
      COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
      MAX(funding_round.date) as most_recent_funding_round, 
      COLLECT(DISTINCT PROPERTIES(technology)) AS technologies
      
      // Note that investor and funding round data is left in node form. this is to allow for matching down the line to relate and collect them
      WITH structured_jobpost, organization, investors, funding_rounds, 
      most_recent_funding_round, technologies
      
      WHERE ($tech IS NULL OR (technologies IS NOT NULL AND any(x IN technologies WHERE x.name IN $tech)))
      AND ($fundingRounds IS NULL OR (funding_rounds IS NOT NULL AND any(x IN funding_rounds WHERE x.roundName IN $fundingRounds)))
      AND ($investors IS NULL OR (investors IS NOT NULL AND any(x IN investors WHERE x.name IN $investors)))
      AND ($query IS NULL OR (technologies IS NOT NULL AND (organization.name =~ $query OR structured_jobpost.jobTitle =~ $query OR any(x IN technologies WHERE x.name =~ $query) OR any(x IN projects WHERE x.name =~ $query))))

      WITH structured_jobpost, organization, funding_rounds, investors, technologies, most_recent_funding_round

      // VERY IMPORTANT!!! Variables with multiple values must not be allowed unaggregated past this point, to prevent duplication of jobposts by each value
      // Observe that this is done. It is very crucial!

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
      } AS result, structured_jobpost, organization, most_recent_funding_round

      // Drop results that don't have the sort param
      WHERE ${jobListOrderBySelector({
        orderBy: params.orderBy ?? "publicationDate",
        jobVar: "structured_jobpost",
        orgVar: "organization",
        projectVar: "anchor_project",
        roundVar: "most_recent_funding_round",
        auditsVar: "numAudits",
        hacksVar: "numHacks",
        chainsVar: "numChains",
      })} IS NOT NULL

      WITH result, structured_jobpost, organization, most_recent_funding_round

      // <--Sorter Embedding-->
      // The sorter has to be embedded in this manner due to its dynamic nature
      ORDER BY ${jobListOrderBySelector({
        orderBy: params.orderBy ?? "publicationDate",
        jobVar: "structured_jobpost",
        orgVar: "organization",
        projectVar: "anchor_project",
        roundVar: "most_recent_funding_round",
        auditsVar: "numAudits",
        hacksVar: "numHacks",
        chainsVar: "numChains",
      })} ${params.order?.toUpperCase() ?? "DESC"}
      // <--!!!Sorter Embedding-->
      RETURN COLLECT(result) as results
    `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    // console.log(generatedQuery);
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
      query: params.query ? `(?i).*${params.query}.*` : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    // console.log(paramsPassed);
    const paramsSet = Object.values({
      ...params,
      limit: null,
      page: null,
    }).filter(x => x !== null);
    await this.validateCache();
    const cachedJobsString =
      (await this.cacheManager.get<string>("jobs")) ?? "[]";
    const cachedJobs = JSON.parse(cachedJobsString) as JobListResult[];
    if (
      cachedJobs !== null &&
      cachedJobs !== undefined &&
      cachedJobs.length !== 0 &&
      paramsSet.length === 0
    ) {
      this.logger.log("Found cached jobs");
      return this.transformResultSet(cachedJobs, paramsPassed);
    } else {
      this.logger.log("No applicable cached jobs found, retrieving from db.");
      return this.neo4jService
        .read(generatedQuery, paramsPassed)
        .then(async res => {
          const results = res.records[0]?.get("results");
          if (paramsSet.length === 0) {
            await this.cacheManager.set(
              "jobs",
              JSON.stringify(results),
              18000000,
            );
          }
          return this.transformResultSet(results, paramsPassed);
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
          this.logger.error(
            `JobsService::getJobsListWithSearch ${err.message}`,
          );
          return {
            page: -1,
            count: 0,
            total: 0,
            data: [],
          };
        });
    }
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    return this.neo4jService
      .read(
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
        WITH o, p, j, t, f, i, c, cat
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
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "jobs.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`JobsService::getFilterConfigs ${err.message}`);
        return undefined;
      });
  }

  async getJobDetailsByUuid(uuid: string): Promise<JobListResult | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (organization:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost {shortUUID: $uuid})
        OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
        OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
        OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
        OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
        WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (technology)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (technology)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
        OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
        OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
        WITH structured_jobpost, organization, project, project_category, COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, funding_round, investor, technology, audit, hack, chain
        WITH structured_jobpost, organization, project,
          project_category, 
          COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
          COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
          COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
          COLLECT(DISTINCT PROPERTIES(audit)) AS audits,
          COLLECT(DISTINCT PROPERTIES(hack)) AS hacks,
          COLLECT(DISTINCT PROPERTIES(chain)) AS chains

        WITH structured_jobpost, organization, funding_rounds, investors, technologies,
          COLLECT({
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
            category: project_category.name,
            createdTimestamp: project.createdTimestamp,
            updatedTimestamp: project.updatedTimestamp,
            hacks: [hack in hacks WHERE hack.id IS NOT NULL],
            audits: [audit in audits WHERE audit.id IS NOT NULL],
            chains: [chain in chains WHERE chain.id IS NOT NULL]
          }) AS projects
        
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
              twitter: organization.twitter,
              discord: organization.discord,
              github: organization.github,
              telegram: organization.telegram,
              headCount: organization.headCount,
              docs: organization.docs,
              logo: organization.logo,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              projects: [project in projects WHERE project.id IS NOT NULL],
              fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
              investors: [investor in investors WHERE investor.id IS NOT NULL]
          },
          technologies: [technology in technologies WHERE technology.id IS NOT NULL]
        } as res
        RETURN res
        `,
        { uuid },
      )
      .then(res =>
        res.records.length
          ? new JobListResultEntity(res.records[0].get("res")).getProperties()
          : undefined,
      )
      .catch(err => {
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
      });
  }

  async getJobsByOrgUuid(uuid: string): Promise<JobListResult[] | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (organization:Organization {id: $uuid})-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
        OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
        OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
        OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
        OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
        WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (technology)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (technology)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
        OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
        OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
        WITH structured_jobpost, organization, project, project_category, funding_round, investor, technology, audit, hack, chain
        WITH structured_jobpost, organization, project,
          project_category, 
          COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
          COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
          COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
          COLLECT(DISTINCT PROPERTIES(audit)) AS audits,
          COLLECT(DISTINCT PROPERTIES(hack)) AS hacks,
          COLLECT(DISTINCT PROPERTIES(chain)) AS chains

        WITH structured_jobpost, organization, funding_rounds, technologies,
          COLLECT({
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
            category: project_category.name,
            createdTimestamp: project.createdTimestamp,
            updatedTimestamp: project.updatedTimestamp,
            hacks: [hack in hacks WHERE hack.id IS NOT NULL],
            audits: [audit in audits WHERE audit.id IS NOT NULL],
            chains: [chain in chains WHERE chain.id IS NOT NULL]
          }) AS projects
        
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
              headcount: organization.headcount,
              twitter: organization.twitter,
              discord: organization.discord,
              github: organization.github,
              telegram: organization.telegram,
              docs: organization.docs,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              teamSize: organization.teamSize,
              projects: [project in projects WHERE project.id IS NOT NULL],
              fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
              investors: [investor in investors WHERE investor.id IS NOT NULL],
          },
          technologies: [technology in technologies WHERE technology.id IS NOT NULL]
        } as res
        RETURN res
        `,
        { uuid },
      )
      .then(res =>
        res.records.length
          ? res.records.map(record =>
              new JobListResultEntity(record.get("res")).getProperties(),
            )
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "jobs.service",
          });
          scope.setExtra("input", uuid);
          Sentry.captureException(err);
        });
        this.logger.error(`JobsService::getJobsByOrgUuid ${err.message}`);
        return undefined;
      });
  }

  async getAllJobsWithSearch(
    params: AllJobsParams,
  ): Promise<PaginatedData<AllJobsListResult>> {
    const generatedQuery = `
            CALL {
              // Starting the query with just organizations to enable whatever org filters are present to reduce the result set considerably for subsequent steps
              MATCH (organization: Organization)
              WHERE ($organizations IS NULL OR organization.name IN $organizations)
              
              // Filtering further by jobpost filters. Priority is to ensure that each step removes as much redundant data as possible
              MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(jobpost_category:JobpostCategory)
              MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
              MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
              WHERE ($categories IS NULL OR jobpost_category.name IN $categories)
              AND ($query IS NULL OR structured_jobpost.title =~ $query)
              // Filter out technologies that are blocked
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

              // <--Sorter Embedding-->
              // The sorter has to be embedded in this manner due to its dynamic nature
              ORDER BY result.jobCreatedTimestamp DESC
              // <--!!!Sorter Embedding-->
              RETURN COLLECT(result) as results
            }

            // It's important to have the main query exist within the CALL subquery to enable generation of the total count
            WITH SIZE(results) as total, results

            // Result set has to be unwound for pagination
            UNWIND results as result
            WITH result, total
            SKIP toInteger(($page - 1) * $limit)
            LIMIT toInteger($limit)
            WITH total, COLLECT(result) as data
            RETURN { total: total, data: data } as res
        `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    // console.log(generatedQuery);
    const paramsPassed = {
      ...params,
      query: params.query ? `(?i).*${params.query}.*` : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    // console.log(paramsPassed);
    return this.neo4jService
      .read(generatedQuery, paramsPassed)
      .then(res => {
        const result = res.records[0]?.get("res");
        return {
          page: (result?.data?.length > 0 ? params.page ?? 1 : -1) ?? -1,
          count: result?.data?.length ?? 0,
          total: result?.total ? intConverter(result?.total) : 0,
          data:
            result?.data?.map(record =>
              new AllJobListResultEntity(record).getProperties(),
            ) ?? [],
        };
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
        this.logger.error(`JobsService::getAllJobsWithSearch ${err.message}`);
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      });
  }

  async getAllJobsFilterConfigs(): Promise<AllJobsFilterConfigs> {
    return this.neo4jService
      .read(
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
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "jobs.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(
          `JobsService::getAllJobsFilterConfigs ${err.message}`,
        );
        return undefined;
      });
  }
}
