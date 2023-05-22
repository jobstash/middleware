import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  intConverter,
  orderBySelector,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import {
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
              WHERE (organization.name IN $organizations OR $organizations IS NULL)
              AND (organization.minHeadCount >= $minHeadCount OR $minHeadCount IS NULL)
              AND (organization.maxHeadCount <= $maxHeadCount OR $maxHeadCount IS NULL)
              
              // Filtering further by jobpost filters. Priority is to ensure that each step removes as much redundant data as possible
              MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
              MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
              WHERE (structured_jobpost.salaryRange >= $minSalaryRange OR $minSalaryRange IS NULL)
              AND (structured_jobpost.salaryRange <= $maxSalaryRange OR $maxSalaryRange IS NULL)
              AND (structured_jobpost.jobCreatedTimestamp >= $startDate OR $startDate IS NULL)
              AND (structured_jobpost.jobCreatedTimestamp <= $endDate OR $endDate IS NULL)
              AND (structured_jobpost.seniority IN $seniority OR $seniority IS NULL)
              AND (structured_jobpost.jobLocation IN $locations OR $locations IS NULL)
                        
              // Filter out technologies that are blocked
              OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
              WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
              
              // Apply project property based filters
              OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)
              WHERE (project.name IN $projects OR $projects IS NULL)
              AND (project.isMainnet = $mainNet OR $mainNet IS NULL)
              AND (project.teamSize >= $minTeamSize OR $minTeamSize IS NULL)
              AND (project.teamSize <= $maxTeamSize OR $maxTeamSize IS NULL)
              AND (project.tvl >= $minTvl OR $minTvl IS NULL)
              AND (project.tvl <= $maxTvl OR $maxTvl IS NULL)
              AND (project.monthlyVolume >= $minMonthlyVolume OR $minMonthlyVolume IS NULL)
              AND (project.monthlyVolume <= $maxMonthlyVolume OR $maxMonthlyVolume IS NULL)
              AND (project.monthlyFees >= $minMonthlyFees OR $minMonthlyFees IS NULL)
              AND (project.monthlyFees <= $maxMonthlyFees OR $maxMonthlyFees IS NULL)
              AND (project.monthlyRevenue >= $minMonthlyRevenue OR $minMonthlyRevenue IS NULL)
              AND (project.monthlyRevenue <= $maxMonthlyRevenue OR $maxMonthlyRevenue IS NULL)
              AND ((project.tokenAddress IS NOT NULL = $token) OR $token IS NULL)
              
              // Generate other data for the leanest result set possible at this point
              OPTIONAL MATCH (project)-[:HAS_CATEGORY]->(project_category:ProjectCategory)
              OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)-[:INVESTED_BY]->(investor:Investor)
              OPTIONAL MATCH (project)-[:HAS_AUDIT]-(audit:Audit)
              OPTIONAL MATCH (project)-[:HAS_HACK]-(hack:Hack)
              OPTIONAL MATCH (project)-[:IS_DEPLOYED_ON_CHAIN]->(chain:Chain)
              
              // NOTE: project category aggregation needs to be done at this step to prevent duplication of categories in the result set further down the line
              WITH structured_jobpost, organization, project, COLLECT(DISTINCT PROPERTIES(project_category)) AS categories, funding_round, investor, technology, audit, hack, chain, COUNT(hack) AS numHacks
              WHERE (
                ($hacks = true AND numHacks >= 1) 
                OR 
                ($hacks = false AND numHacks = 0) 
                OR $hacks IS NULL
              )
                        
              WITH structured_jobpost, organization, project, categories, funding_round, investor, technology, audit, hack, chain, COUNT(audit) AS numAudits, numHacks
              WHERE (numAudits >= $minAudits OR $minAudits IS NULL)
              AND (numAudits <= $maxAudits OR $maxAudits IS NULL)
              
              // Note that investor and funding round data is left in node form. this is to allow for matching down the line to relate and collect them
              WITH structured_jobpost, organization, project,
              categories, 
              COLLECT(DISTINCT investor) AS investors,
              COLLECT(DISTINCT funding_round) AS funding_rounds, MAX(funding_round.date) as most_recent_funding_round, 
              COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
              COLLECT(DISTINCT PROPERTIES(audit)) AS audits,
              COLLECT(DISTINCT PROPERTIES(hack)) AS hacks,
              COLLECT(DISTINCT PROPERTIES(chain)) AS chains, numAudits, numHacks, COUNT(chain) as numChains
              WHERE (any(x IN technologies WHERE x.name IN $tech) OR $tech IS NULL)
              AND (any(x IN funding_rounds WHERE x.roundName IN $fundingRounds) OR $fundingRounds IS NULL)
              AND (any(y IN categories WHERE y.name IN $categories) OR $categories IS NULL)
              AND (any(x IN investors WHERE x.name IN $investors) OR $investors IS NULL)
              AND (any(y IN chains WHERE y.name IN $chains) OR $chains IS NULL)

              AND ( (organization.name =~ $query OR structured_jobpost.jobTitle =~ $query OR any(x IN technologies WHERE x.name =~ $query) ) OR $query IS NULL)

              CALL {
                WITH funding_rounds
                UNWIND funding_rounds as funding_round
                MATCH (funding_round)-[:INVESTED_BY]->(investor: Investor)
                WITH PROPERTIES(funding_round) as fundingRound, COLLECT(DISTINCT PROPERTIES(investor)) as investors
                WITH fundingRound {.*, investors: investors} as funding_round
                RETURN COLLECT(DISTINCT funding_round) as fundingRounds
              }

              WITH structured_jobpost, organization, fundingRounds, technologies, most_recent_funding_round, numAudits, numHacks, numChains,
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
                      teamSize: organization.teamSize,
                      projects: [project in projects WHERE project.id IS NOT NULL],
                      fundingRounds: [fundingRound in fundingRounds WHERE fundingRound.id IS NOT NULL]
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

              // <--Sorter Embedding-->
              // The sorter has to be embedded in this manner due to its dynamic nature
              ORDER BY ${orderBySelector({
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
    console.log(generatedQuery);
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
      query: params.query ? `(?i).*${params.query}.*` : null,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    console.log(paramsPassed);
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
        this.logger.error(`JobsService::getAll ${err.message}`);
        return undefined;
      });
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    return this.neo4jService
      .read(
        `
        MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        OPTIONAL MATCH (o:Organization)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(f:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)-[:INVESTED_BY]->(i:Investor)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(c:Chain)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        WITH o, p, j, t, f, i, c, cat, COUNT(DISTINCT a) as audits
        RETURN {
            minSalaryRange: MIN(j.medianSalary),
            maxSalaryRange: MAX(j.medianSalary),
            minTvl: MIN(p.tvl),
            maxTvl: MAX(p.tvl),
            minMonthlyVolume: MIN(p.monthlyVolume),
            maxMonthlyVolume: MAX(p.monthlyVolume),
            minMonthlyFees: MIN(p.monthlyFees),
            maxMonthlyFees: MAX(p.monthlyFees),
            minMonthlyRevenue: MIN(p.monthlyRevenue),
            maxMonthlyRevenue: MAX(p.monthlyRevenue),
            minHeadCount: MIN(o.headCount),
            maxHeadCount: MAX(o.headCount),
            minTeamSize: MIN(p.teamSize),
            maxTeamSize: MAX(p.teamSize),
            minAudits: MIN(audits),
            maxAudits: MAX(audits),
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
        MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost {shortUUID: $uuid})
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)-[:INVESTED_BY]->(i:Investor)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(ch:Chain)
        WITH o, j, COLLECT(DISTINCT PROPERTIES(t)) AS tech
        CALL {
          WITH o, j, tech
          CALL {
            WITH o
            OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
            OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
            OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
            OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(ch:Chain)
            WITH p, COLLECT(DISTINCT PROPERTIES(c)) AS categories, COLLECT(DISTINCT PROPERTIES(a)) AS audits, COLLECT(DISTINCT PROPERTIES(h)) AS hacks, COLLECT(DISTINCT PROPERTIES(ch)) AS chains
            WITH p{.*, categories: categories, audits: audits, hacks: hacks, chains: chains} as prelims
            RETURN COLLECT(DISTINCT PROPERTIES(prelims)) as projects
          }
          OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
          OPTIONAL MATCH (fr)-[:INVESTED_BY]->(i:Investor)
          WITH o, j, tech, fr, COLLECT(DISTINCT PROPERTIES(i)) as investors, projects
          WITH fr{.*, investors: investors} as prelims, o, projects, j, tech
          ORDER BY fr.date DESC
          WITH o, COLLECT(DISTINCT PROPERTIES(prelims)) as rounds, projects, j, tech
          WITH o{.*, fundingRounds: rounds, projects: projects} AS org, PROPERTIES(j) as jobpost, tech
          RETURN jobpost{.*, organization: org, technologies: tech } as res
        }
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
        MATCH (o:Organization {id: $uuid})-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)-[:INVESTED_BY]->(i:Investor)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
        OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(ch:Chain)
        WITH o, j, COLLECT(DISTINCT PROPERTIES(t)) AS tech
        CALL {
          WITH o, j, tech
          CALL {
            WITH o
            OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
            OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
            OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
            OPTIONAL MATCH (p)-[:IS_DEPLOYED_ON_CHAIN]->(ch:Chain)
            WITH p, COLLECT(DISTINCT PROPERTIES(c)) AS categories, COLLECT(DISTINCT PROPERTIES(a)) AS audits, COLLECT(DISTINCT PROPERTIES(h)) AS hacks, COLLECT(DISTINCT PROPERTIES(ch)) AS chains
            WITH p{.*, categories: categories, audits: audits, hacks: hacks, chains: chains} as prelims
            RETURN COLLECT(DISTINCT PROPERTIES(prelims)) as projects
          }
          OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
          OPTIONAL MATCH (fr)-[:INVESTED_BY]->(i:Investor)
          WITH o, j, tech, fr, COLLECT(DISTINCT PROPERTIES(i)) as investors, projects
          WITH fr{.*, investors: investors} as prelims, o, projects, j, tech
          ORDER BY fr.date DESC
          WITH o, COLLECT(DISTINCT PROPERTIES(prelims)) as rounds, projects, j, tech
          WITH o{.*, fundingRounds: rounds, projects: projects} AS org, PROPERTIES(j) as jobpost, tech
          RETURN jobpost{.*, organization: org, technologies: tech } as res
        }
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
}
