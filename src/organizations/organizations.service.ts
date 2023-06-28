import { Injectable } from "@nestjs/common";
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
import { intConverter, orgListOrderBySelector } from "src/shared/helpers";
import { RepositoryEntity } from "src/shared/entities/repository.entity";

@Injectable()
export class OrganizationsService {
  logger = new CustomLogger(OrganizationsService.name);
  constructor(private readonly neo4jService: Neo4jService) {}

  async getOrgsListWithSearch(
    params: OrgListParams,
  ): Promise<PaginatedData<ShortOrg>> {
    const generatedQuery = `
            CALL {
              MATCH (organization: Organization)
              
              OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
              OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)

              OPTIONAL MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
              OPTIONAL MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
              WHERE (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
              OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)

              OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)
              
              // Note that investor and funding round data is left in node form. this is to allow for matching down the line to relate and collect them
              WITH organization, 
              COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
              COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
              COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
              COUNT(DISTINCT project) AS projectCount,
              COUNT(DISTINCT structured_jobpost) AS jobCount,
              MAX(funding_round.date) as most_recent_funding_round, 
              MAX(structured_jobpost.jobCreatedTimestamp) as most_recent_jobpost

              WHERE ($hasJobs IS NULL OR EXISTS {
                MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
                MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
                MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
              } = $hasJobs)

              AND ($hasProjects IS NULL OR EXISTS {
                MATCH (organization)-[:HAS_PROJECT]->(project:Project)
              } = $hasProjects)
              
              AND ($minHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount >= $minHeadCount))
              AND ($maxHeadCount IS NULL OR (organization.headCount IS NOT NULL AND organization.headCount <= $maxHeadCount))
              AND ($locations IS NULL OR (organization.location IS NOT NULL AND organization.location IN $locations))
              AND ($fundingRounds IS NULL OR (funding_rounds IS NOT NULL AND any(x IN funding_rounds WHERE x.roundName IN $fundingRounds)))
              AND ($investors IS NULL OR (investors IS NOT NULL AND any(x IN investors WHERE x.name IN $investors)))
              AND ($query IS NULL OR organization.name =~ $query)

              CALL {
                WITH funding_rounds
                UNWIND funding_rounds as funding_round
                WITH funding_round
                ORDER BY funding_round.date DESC
                WITH COLLECT(DISTINCT funding_round)[0] AS mrfr
                RETURN mrfr.raisedAmount as lastFundingAmount, mrfr.date as lastFundingDate
              }

              WITH {
                  orgId: organization.orgId,
                  url: organization.url,
                  name: organization.name,
                  location: organization.location,
                  headCount: organization.headCount,
                  jobCount: jobCount,
                  projectCount: projectCount,
                  lastFundingDate: lastFundingDate,
                  lastFundingAmount: lastFundingAmount,
                  technologies: technologies
              } AS result, organization.headCount as head_count, most_recent_funding_round, most_recent_jobpost

              WITH result, head_count, most_recent_jobpost, most_recent_funding_round

              // <--Sorter Embedding-->
              // The sorter has to be embedded in this manner due to its dynamic nature
              ORDER BY ${orgListOrderBySelector({
                orderBy: params.orderBy ?? "recentJobDate",
                headCountVar: "head_count",
                roundVar: "most_recent_funding_round",
                recentJobVar: "most_recent_jobpost",
              })} ${params.order?.toUpperCase() ?? "DESC"}
              // <--!!!Sorter Embedding-->
              RETURN COLLECT(DISTINCT result) as results
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
              new ShortOrgEntity(record).getProperties(),
            ) ?? [],
        };
      })
      .catch(err => {
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
      });
  }

  async getFilterConfigs(): Promise<OrgFilterConfigs> {
    return this.neo4jService
      .read(
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
          `OrganizationsService::getFilterConfigs ${err.message}`,
        );
        return undefined;
      });
  }

  async getOrgDetailsById(id: string): Promise<OrgListResult | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (organization:Organization {orgId: $id})
        OPTIONAL MATCH (organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
        WHERE (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
        OPTIONAL MATCH (funding_round)-[:INVESTED_BY]->(investor:Investor)
        OPTIONAL MATCH (organization)-[:HAS_PROJECT]->(project:Project)
        OPTIONAL MATCH (structured_jobpost)-[:USES_TECHNOLOGY]->(technology:Technology)
        WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()
        OPTIONAL MATCH (technology)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        OPTIONAL MATCH (technology)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH organization, COLLECT(DISTINCT project) AS projectNodes, 
          COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
          COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
          COLLECT(DISTINCT PROPERTIES(technology)) AS technologies,
          COLLECT(DISTINCT {
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
          }) as jobs

        WITH organization, jobs, projectNodes, investors, funding_rounds, technologies
        
        CALL {
          WITH projectNodes
          UNWIND projectNodes as project
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
        }

        WITH organization, funding_rounds, investors, projects, technologies, jobs
        
        WITH {
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
          jobs: [job in jobs WHERE job.id IS NOT NULL],
          technologies: [technology in technologies WHERE technology.id IS NOT NULL]
        } as res
        RETURN res
        `,
        { id },
      )
      .then(res =>
        res.records.length
          ? new OrgListResultEntity(res.records[0].get("res")).getProperties()
          : undefined,
      )
      .catch(err => {
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
      });
  }

  async getAll(): Promise<ShortOrg[]> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        WHERE (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o.orgId as orgId, o.logoUrl as logo, o.name as name, o.location as location, o.headCount as headCount, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH orgId, name, logo, location, headCount, projectCount, jobCount, technologies, collect(fr)[0] as mrfr
        RETURN { orgId: orgId, name: name, logo: logo, location: location, headCount: headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date } as res
        `,
      )
      .then(res =>
        res.records.map(record => {
          const ent = new ShortOrgEntity(record.get("res")).getProperties();
          return ent;
        }),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`OrganizationsService::getAll ${err.message}`);
        return undefined;
      });
  }

  async searchOrganizations(query: string): Promise<ShortOrg[]> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        WHERE (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH o, projectCount, jobCount, technologies, COLLECT(fr)[0] as mrfr, COLLECT(fr) as fundingRounds
        WHERE o.name =~ $query
        RETURN { id: o.orgId, name: o.name, logo: o.logo, location: o.location, headCount: o.headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date, url: o.url, description: o.description, github: o.github, twitter: o.twitter, telegram: o.telegram, discord: o.discord, fundingRounds: fundingRounds } as res
        `,
        { query: `(?i).*${query}.*` },
      )
      .then(res =>
        res.records.map(record =>
          new ShortOrgEntity(record.get("res")).getProperties(),
        ),
      )
      .catch(err => {
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
      });
  }

  async getOrgById(id: string): Promise<ShortOrg | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization {orgId: $id})
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        WHERE (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH o, projectCount, jobCount, technologies, COLLECT(fr)[0] as mrfr, COLLECT(fr) as fundingRounds
        RETURN { id: o.orgId, name: o.name, logo: o.logo, location: o.location, headCount: o.headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date, url: o.url, description: o.description, github: o.github, twitter: o.twitter, telegram: o.telegram, discord: o.discord, fundingRounds: fundingRounds } as res
        `,
        { id },
      )
      .then(res =>
        res.records[0]
          ? new ShortOrgEntity(res.records[0].get("res")).getProperties()
          : undefined,
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
        this.logger.error(`OrganizationsService::getOrgById ${err.message}`);
        return undefined;
      });
  }

  async getRepositories(id: string): Promise<Repository[]> {
    return this.neo4jService
      .read(
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
