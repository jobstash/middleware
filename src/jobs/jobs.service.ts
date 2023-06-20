import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  intConverter,
  jobListOrderBySelector,
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
} from "src/shared/types";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "./dto/job-list.input";
import { AllJobsParams } from "./dto/all-jobs.input";
import { AllJobListResultEntity } from "src/shared/entities/all-jobs-list-result.entity";
import { AllJobsListResult } from "src/shared/interfaces/all-jobs-list-result.interface";
import { AllJobsFilterConfigsEntity } from "src/shared/entities/all-jobs-filter-configs.entity";

@Injectable()
export class JobsService {
  logger = new CustomLogger(JobsService.name);
  constructor(private readonly neo4jService: Neo4jService) {}

  async getJobsListWithSearch(
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const generatedQuery = `
            CALL {
              // Starting the query with just organizations to enable whatever org filters are present to reduce the result set considerably for subsequent steps
              MATCH (organization: Organization)
              WHERE ($organizations IS NULL OR organization.name IN $organizations)
                AND ($minHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount >= $minHeadCount))
                AND ($maxHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount <= $maxHeadCount))
              
              // Filtering further by jobpost filters. Priority is to ensure that each step removes as much redundant data as possible
              MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
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
              OPTIONAL MATCH (project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
              OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
              OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
              OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
              OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
              OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
              
              // NOTE: project category aggregation needs to be done at this step to prevent duplication of categories in the result set further down the line
              WITH structured_jobpost, organization, project, COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, funding_round, investor, technology, audit, hack, chain, COUNT(audit) AS numAudits, COUNT(hack) AS numHacks, COUNT(chain) as numChains
              
              // Note that investor and funding round data is left in node form. this is to allow for matching down the line to relate and collect them
              WITH structured_jobpost, organization, project,
              categories, 
              COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
              COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, MAX(funding_round.date) as most_recent_funding_round, 
              COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
              COLLECT(DISTINCT PROPERTIES(audit)) AS audits,
              COLLECT(DISTINCT PROPERTIES(hack)) AS hacks,
              COLLECT(DISTINCT PROPERTIES(chain)) AS chains, numAudits, numHacks, numChains
              
              WHERE ($hacks IS NULL OR (
                ($hacks = true AND numHacks >= 1) 
                OR 
                ($hacks = false AND numHacks = 0) 
              ))
              AND ($minAudits IS NULL OR (numAudits IS NOT NULL AND numAudits >= $minAudits))
              AND ($maxAudits IS NULL OR (numAudits IS NOT NULL AND numAudits <= $maxAudits))
              AND ($tech IS NULL OR (technologies IS NOT NULL AND any(x IN technologies WHERE x.name IN $tech)))
              AND ($fundingRounds IS NULL OR (funding_rounds IS NOT NULL AND any(x IN funding_rounds WHERE x.roundName IN $fundingRounds)))
              AND ($categories IS NULL OR (categories IS NOT NULL AND any(y IN categories WHERE y.name IN $categories)))
              AND ($investors IS NULL OR (investors IS NOT NULL AND any(x IN investors WHERE x.name IN $investors)))
              AND ($chains IS NULL OR (chains IS NOT NULL AND any(y IN chains WHERE y.name IN $chains)))
              AND ($query IS NULL OR (technologies IS NOT NULL AND (organization.name =~ $query OR structured_jobpost.jobTitle =~ $query OR any(x IN technologies WHERE x.name =~ $query))))

              WITH structured_jobpost, organization, funding_rounds, investors, technologies, most_recent_funding_round, numAudits, numHacks, numChains,
                COLLECT(DISTINCT {
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

              WHERE ($projects IS NULL OR any(x IN projects WHERE x.name IN $projects))

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
                      investors: [investor in investors WHERE investor.id IS NOT NULL]
                  },
                  technologies: [technology in technologies WHERE technology.id IS NOT NULL]
              } AS result, structured_jobpost, projects, organization, most_recent_funding_round, numAudits, numHacks, numChains

              CALL {
                WITH projects
                UNWIND projects as project
                WITH project
                ORDER BY project.monthlyVolume DESC
                RETURN COLLECT(DISTINCT project)[0] as anchor_project
              }

              WITH result, structured_jobpost, organization, most_recent_funding_round, anchor_project, numAudits, numHacks, numChains

              WHERE ($mainNet IS NULL OR (anchor_project IS NOT NULL AND anchor_project.isMainnet = $mainNet))
                AND ($minTeamSize IS NULL OR (anchor_project IS NOT NULL AND anchor_project.teamSize >= $minTeamSize))
                AND ($maxTeamSize IS NULL OR (anchor_project IS NOT NULL AND anchor_project.teamSize <= $maxTeamSize))
                AND ($minTvl IS NULL OR (anchor_project IS NOT NULL AND anchor_project.tvl >= $minTvl))
                AND ($maxTvl IS NULL OR (anchor_project IS NOT NULL AND anchor_project.tvl <= $maxTvl))
                AND ($minMonthlyVolume IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyVolume >= $minMonthlyVolume))
                AND ($maxMonthlyVolume IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyVolume <= $maxMonthlyVolume))
                AND ($minMonthlyFees IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyFees >= $minMonthlyFees))
                AND ($maxMonthlyFees IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyFees <= $maxMonthlyFees))
                AND ($minMonthlyRevenue IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyRevenue >= $minMonthlyRevenue))
                AND ($maxMonthlyRevenue IS NULL OR (anchor_project IS NOT NULL AND anchor_project.monthlyRevenue <= $maxMonthlyRevenue))
                AND ($token IS NULL OR (anchor_project IS NOT NULL AND anchor_project.tokenAddress IS NOT NULL = $token))

              // Drop results that don't have the sort param
              AND ${jobListOrderBySelector({
                orderBy: params.orderBy ?? "publicationDate",
                jobVar: "structured_jobpost",
                orgVar: "organization",
                projectVar: "anchor_project",
                roundVar: "most_recent_funding_round",
                auditsVar: "numAudits",
                hacksVar: "numHacks",
                chainsVar: "numChains",
              })} IS NOT NULL

              WITH result, structured_jobpost, organization, most_recent_funding_round, anchor_project, numAudits, numHacks, numChains

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
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
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
              new JobListResultEntity(record).getProperties(),
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
        this.logger.error(`JobsService::getJobsListWithSearch ${err.message}`);
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      });
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        MATCH (jp)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)
        OPTIONAL MATCH (f)-[:INVESTED_BY]->(i:Investor)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(c:Chain)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        WITH o, p, j, t, f, i, c, cat, COUNT(DISTINCT a) as audits
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
            minAudits: MIN(CASE WHEN NOT audits IS NULL AND isNaN(audits) = false THEN toFloat(audits) END),
            maxAudits: MAX(CASE WHEN NOT audits IS NULL AND isNaN(audits) = false THEN toFloat(audits) END),
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
        WITH structured_jobpost, organization, project, COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, funding_round, investor, technology, audit, hack, chain
        WITH structured_jobpost, organization, project,
          categories, 
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
            category: project.category,
            createdTimestamp: project.createdTimestamp,
            updatedTimestamp: project.updatedTimestamp,
            categories: [category in categories WHERE category.id IS NOT NULL],
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
              docs: organization.docs,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              teamSize: organization.teamSize,
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
        WITH structured_jobpost, organization, project, COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, funding_round, investor, technology, audit, hack, chain
        WITH structured_jobpost, organization, project,
          categories, 
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
            category: project.category,
            createdTimestamp: project.createdTimestamp,
            updatedTimestamp: project.updatedTimestamp,
            categories: [category in categories WHERE category.id IS NOT NULL],
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
