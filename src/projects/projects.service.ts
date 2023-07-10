import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  PaginatedData,
  ProjectFilterConfigs,
  ProjectFilterConfigsEntity,
  ProjectDetails,
  ProjectDetailsEntity,
  ProjectProperties,
  Project,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ProjectListParams } from "./dto/project-list.input";
import { intConverter, projectListOrderBySelector } from "src/shared/helpers";

@Injectable()
export class ProjectsService {
  logger = new CustomLogger(ProjectsService.name);
  constructor(private readonly neo4jService: Neo4jService) {}

  async getProjectsListWithSearch(
    params: ProjectListParams,
  ): Promise<PaginatedData<Project>> {
    const generatedQuery = `
            CALL {
              MATCH (project: Project)
              MATCH (project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
              OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
              OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
              OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]-(chain:Chain)
              MATCH (organization: Organization)-[:HAS_PROJECT]->(project)
              
              WITH project, organization, COUNT(DISTINCT audit) as numAudits,
                COUNT(DISTINCT hack) as numHacks,
                COUNT(DISTINCT chain) as numChains,
              COLLECT(DISTINCT PROPERTIES(project_category)) as categories,
              COLLECT(DISTINCT PROPERTIES(chain)) as chains,
              COLLECT(DISTINCT PROPERTIES(audit)) as audits,
              COLLECT(DISTINCT PROPERTIES(hack)) as hacks

              WHERE ($query IS NULL OR $query =~ project.name)
              AND ($organizations IS NULL OR organization.name IN $organizations)
              AND ($hacks IS NULL OR numHacks > 1 = $hacks)
              AND ($audits IS NULL OR numAudits > 1 = $audits)
              AND ($chains IS NULL OR (chains IS NOT NULL AND any(x IN chains WHERE x.name IN $chains)))
              AND ($categories IS NULL OR (categories IS NOT NULL AND any(x IN categories WHERE x.name IN $categories)))

              WITH project, hacks, chains, audits, categories, numAudits, numHacks, numChains

              WITH {
                    id: project.id,
                    name: project.name,
                    url: project.url,
                    logo: project.logo,
                    tokenSymbol: project.tokenSymbol,
                    tvl: project.tvl,
                    monthlyVolume: project.monthlyVolume,
                    monthlyFees: project.monthlyFees,
                    monthlyRevenue: project.monthlyRevenue,
                    monthlyActiveUsers: project.monthlyActiveUsers,
                    isMainnet: project.isMainnet,
                    orgId: project.orgId,
                    teamSize: project.teamSize,
                    category: project.category,
                    hacks: hacks,
                    chains: chains,
                    audits: audits,
                    categories: categories
                } AS project, numAudits, numHacks, numChains

              WHERE ($mainNet IS NULL OR (project IS NOT NULL AND project.isMainnet = $mainNet))
                AND ($minTeamSize IS NULL OR (project IS NOT NULL AND project.teamSize >= $minTeamSize))
                AND ($maxTeamSize IS NULL OR (project IS NOT NULL AND project.teamSize <= $maxTeamSize))
                AND ($minTvl IS NULL OR (project IS NOT NULL AND project.tvl >= $minTvl))
                AND ($maxTvl IS NULL OR (project IS NOT NULL AND project.tvl <= $maxTvl))
                AND ($minMonthlyVolume IS NULL OR (project IS NOT NULL AND project.monthlyVolume >= $minMonthlyVolume))
                AND ($maxMonthlyVolume IS NULL OR (project IS NOT NULL AND project.monthlyVolume <= $maxMonthlyVolume))
                AND ($minMonthlyFees IS NULL OR (project IS NOT NULL AND project.monthlyFees >= $minMonthlyFees))
                AND ($maxMonthlyFees IS NULL OR (project IS NOT NULL AND project.monthlyFees <= $maxMonthlyFees))
                AND ($minMonthlyRevenue IS NULL OR (project IS NOT NULL AND project.monthlyRevenue >= $minMonthlyRevenue))
                AND ($maxMonthlyRevenue IS NULL OR (project IS NOT NULL AND project.monthlyRevenue <= $maxMonthlyRevenue))
                AND ($token IS NULL OR (project IS NOT NULL AND project.tokenAddress IS NOT NULL = $token))

              WITH project, numAudits, numHacks, numChains

              // <--Sorter Embedding-->
              // The sorter has to be embedded in this manner due to its dynamic nature
              ORDER BY ${projectListOrderBySelector({
                projectVar: "project",
                auditsVar: "numAudits",
                hacksVar: "numHacks",
                chainsVar: "numChains",
                orderBy: params?.orderBy ?? "monthlyVolume",
              })} ${params.order?.toUpperCase() ?? "DESC"}
              // <--!!!Sorter Embedding-->
              RETURN COLLECT(project) as results
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
          data: result?.data?.map(record => record as Project) ?? [],
        };
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", params);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectsListWithSearch ${err.message}`,
        );
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      });
  }

  async getFilterConfigs(): Promise<ProjectFilterConfigs> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        MATCH (o:Organization)-[:HAS_PROJECT]->(project)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(c:Chain)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        WITH o, p, c, a, cat
        RETURN {
            minTvl: MIN(CASE WHEN NOT p.tvl IS NULL AND isNaN(p.tvl) = false THEN toFloat(p.tvl) END),
            maxTvl: MAX(CASE WHEN NOT p.tvl IS NULL AND isNaN(p.tvl) = false THEN toFloat(p.tvl) END),
            minMonthlyVolume: MIN(CASE WHEN NOT p.monthlyVolume IS NULL AND isNaN(p.monthlyVolume) = false THEN toFloat(p.monthlyVolume) END),
            maxMonthlyVolume: MAX(CASE WHEN NOT p.monthlyVolume IS NULL AND isNaN(p.monthlyVolume) = false THEN toFloat(p.monthlyVolume) END),
            minMonthlyFees: MIN(CASE WHEN NOT p.monthlyFees IS NULL AND isNaN(p.monthlyFees) = false THEN toFloat(p.monthlyFees) END),
            maxMonthlyFees: MAX(CASE WHEN NOT p.monthlyFees IS NULL AND isNaN(p.monthlyFees) = false THEN toFloat(p.monthlyFees) END),
            minMonthlyRevenue: MIN(CASE WHEN NOT p.monthlyRevenue IS NULL AND isNaN(p.monthlyRevenue) = false THEN toFloat(p.monthlyRevenue) END),
            maxMonthlyRevenue: MAX(CASE WHEN NOT p.monthlyRevenue IS NULL AND isNaN(p.monthlyRevenue) = false THEN toFloat(p.monthlyRevenue) END),
            minTeamSize: MIN(CASE WHEN NOT p.teamSize IS NULL AND isNaN(p.teamSize) = false THEN toFloat(p.teamSize) END),
            maxTeamSize: MAX(CASE WHEN NOT p.teamSize IS NULL AND isNaN(p.teamSize) = false THEN toFloat(p.teamSize) END),
            categories: COLLECT(DISTINCT cat.name),
            chains: COLLECT(DISTINCT c.name),
            audits: COLLECT(DISTINCT a.name),
            organizations: COLLECT(DISTINCT o.name)
        } as res
      `,
      )
      .then(res =>
        res.records.length
          ? new ProjectFilterConfigsEntity(
              res.records[0].get("res"),
            ).getProperties()
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getFilterConfigs ${err.message}`);
        return undefined;
      });
  }

  async getProjectDetailsById(id: string): Promise<ProjectDetails | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (project: Project {id: $id})
        OPTIONAL MATCH (organization: Organization)-[:HAS_PROJECT]->(project:Project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
        OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
        OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
        OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
        OPTIONAL MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        OPTIONAL MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
        OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
        WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
        OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
        WITH organization, project, 
          COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
          COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
          COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds,
          COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, 
          COLLECT(DISTINCT PROPERTIES(audit)) AS audits,
          COLLECT(DISTINCT PROPERTIES(hack)) AS hacks,
          COLLECT(DISTINCT PROPERTIES(chain)) AS chains
        
        WITH organization, project, investors, technologies, 
          funding_rounds, categories, audits, hacks, chains

        WITH {
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
              docs: organization.docs,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
              investors: [investor in investors WHERE investor.id IS NOT NULL],
              technologies: [technology in technologies WHERE technology.id IS NOT NULL]
            },
            categories: [category in categories WHERE category.id IS NOT NULL],
            hacks: [hack in hacks WHERE hack.id IS NOT NULL],
            audits: [audit in audits WHERE audit.id IS NOT NULL],
            chains: [chain in chains WHERE chain.id IS NOT NULL]
          } as res
        RETURN res
        `,
        { id },
      )
      .then(res =>
        res.records.length
          ? new ProjectDetailsEntity(res.records[0].get("res")).getProperties()
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectDetailsById ${err.message}`,
        );
        return undefined;
      });
  }

  async getProjectsByOrgId(
    id: string,
  ): Promise<ProjectProperties[] | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (:Organization {orgId: $id})-[:HAS_PROJECT]->(p:Project)
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res =>
        res.records.map(record => record.get("res") as ProjectProperties),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjectByOrgId ${err.message}`);
        return undefined;
      });
  }

  async getProjects(): Promise<ProjectProperties[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        RETURN PROPERTIES(p) as res
        `,
      )
      .then(res =>
        res.records.map(record => record.get("res") as ProjectProperties),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjects ${err.message}`);
        return undefined;
      });
  }

  async getProjectsByCategory(category: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)-[:HAS_CATEGORY]->(:ProjectCategory { name: $category })
        RETURN PROPERTIES(p) as res
        `,
        { category },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", category);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectsByCategory ${err.message}`,
        );
        return undefined;
      });
  }

  async getProjectCompetitors(id: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (c:ProjectCategory)<-[:HAS_CATEGORY]-(:Project {id: $id})
        MATCH (c)<-[:HAS_CATEGORY]-(p:Project)
        WHERE p.id <> $id
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectCompetitors ${err.message}`,
        );
        return undefined;
      });
  }

  async searchProjects(query: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        WHERE p.name =~ $query
        RETURN PROPERTIES(p) as res
        `,
        { query: `(?i).*${query}.*` },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", query);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::searchProjects ${err.message}`);
        return undefined;
      });
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        WHERE p.id = $id
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res =>
        res.records[0] ? (res.records[0].get("res") as Project) : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjectById ${err.message}`);
        return undefined;
      });
  }
}
