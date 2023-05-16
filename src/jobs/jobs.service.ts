import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  intConverter,
  optionalMinMaxFilter,
  orderBySelector,
  publicationDateRangeParser,
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
    const generatedFilters = `
    WHERE ${params.organizations ? "o.name IN $organizations AND " : ""}
    ${
      params.projects ? "any(x IN projects WHERE x.name IN $projects) AND " : ""
    }
    ${
      params.publicationDate
        ? publicationDateRangeParser(params.publicationDate as DateRange, "j")
        : ""
    }
    ${optionalMinMaxFilter(
      { min: params.minSalaryRange, max: params.maxSalaryRange },
      "j.minSalaryRange <= $minSalaryRange AND j.maxSalaryRange <= $maxSalaryRange AND j.minSalaryRange IS NOT NULL AND j.maxSalaryRange IS NOT NULL",
      "j.minSalaryRange <= $minSalaryRange AND j.minSalaryRange IS NOT NULL",
      "j.maxSalaryRange <= $maxSalaryRange AND j.maxSalaryRange IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minHeadCount,
        max: params.maxHeadCount,
      },
      "$minHeadCount <= o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
      "$minHeadCount <= o.headCount AND o.headCount IS NOT NULL",
      "o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minTeamSize,
        max: params.maxTeamSize,
      },
      "$minTeamSize <= pf.teamSize <= $maxTeamSize AND pf.teamSize IS NOT NULL",
      "$minTeamSize <= pf.teamSize AND pf.teamSize IS NOT NULL",
      "pf.teamSize <= $maxTeamSize AND pf.teamSize IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      { min: params.minTvl, max: params.maxTvl },
      "$minTvl <= pf.tvl <= $maxTvl AND pf.tvl IS NOT NULL",
      "$minTvl <= pf.tvl AND pf.tvl IS NOT NULL",
      "pf.tvl <= $maxTvl AND pf.tvl IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minMonthlyVolume,
        max: params.maxMonthlyVolume,
      },
      "$minMonthlyVolume <= pf.monthlyVolume <= $maxMonthlyVolume AND pf.monthlyVolume IS NOT NULL",
      "$minMonthlyVolume <= pf.monthlyVolume AND pf.monthlyVolume IS NOT NULL",
      "pf.monthlyVolume <= $maxMonthlyVolume AND pf.monthlyVolume IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minMonthlyFees,
        max: params.maxMonthlyFees,
      },
      "$minMonthlyFees <= pf.monthlyFees <= $maxMonthlyFees AND pf.monthlyFees IS NOT NULL",
      "$minMonthlyFees <= pf.monthlyFees AND pf.monthlyFees IS NOT NULL",
      "pf.monthlyFees <= $maxMonthlyFees AND pf.monthlyFees IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minMonthlyRevenue,
        max: params.maxMonthlyRevenue,
      },
      "$minMonthlyRevenue <= pf.monthlyRevenue <= $maxMonthlyRevenue AND pf.monthlyRevenue IS NOT NULL",
      "$minMonthlyRevenue <= pf.monthlyRevenue AND pf.monthlyRevenue IS NOT NULL",
      "pf.monthlyRevenue <= $maxMonthlyRevenue AND pf.monthlyRevenue IS NOT NULL",
    )}
    ${optionalMinMaxFilter(
      {
        min: params.minAudits,
        max: params.maxAudits,
      },
      "$minAudits <= auditCount <= $maxAudits AND auditCount IS NOT NULL",
      "$minAudits <= auditCount AND auditCount IS NOT NULL",
      "auditCount <= $maxAudits AND auditCount IS NOT NULL",
    )}
    ${
      params.hacks !== undefined
        ? params.hacks
          ? "hackCount IS NOT NULL AND hackCount >= 1 AND "
          : "hackCount IS NOT NULL AND hackCount = 0 AND "
        : ""
    }
    ${
      params.token !== undefined
        ? params.token
          ? "pf.tokenAddress IS NOT NULL AND "
          : "pf.tokenAddress = null AND "
        : ""
    }
    ${
      params.mainNet !== undefined
        ? params.mainNet
          ? "pf.isMainnet IS NOT NULL AND "
          : "pf.isMainnet = true AND "
        : ""
    }
    ${params.seniority ? "j.seniority IN $seniority AND " : ""}
    ${params.locations ? "j.jobLocation IN $locations AND " : ""}
    ${params.tech ? "any(x IN tech WHERE x.name IN $tech) AND " : ""}
    ${
      params.fundingRounds
        ? "any(x IN rounds WHERE x.roundName IN $fundingRounds) AND "
        : ""
    }
    ${
      params.investors
        ? "any(x IN investors WHERE x.name IN $investors) AND "
        : ""
    }
    ${
      params.categories ? "any(y IN cats WHERE y.name IN $categories) AND " : ""
    }
    ${params.chains ? "any(y IN chains WHERE y.name IN $chains) AND " : ""}
    ${
      params.query
        ? "(j.jobTitle =~ $query OR any(x IN tech WHERE x.name =~ $query) OR o.name =~ $query) AND "
        : ""
    }
    o.name IS NOT NULL AND o.name <> ""
    `;

    const generatedSorters = `
    ${
      params.orderBy
        ? `ORDER BY ${orderBySelector({
            orderBy: params.orderBy,
            jobVar: "j",
            orgVar: "org",
            projectVar: "pf",
            roundVar: "mrfr",
          })}`
        : `ORDER BY ${orderBySelector({
            orderBy: "publicationDate",
            jobVar: "j",
            orgVar: "org",
            projectVar: "pf",
            roundVar: "mrfr",
          })}`
    } ${params.order ? params.order.toUpperCase() : "DESC"}
    ${
      params.page && params.page > 0
        ? params.limit && params.limit > 0
          ? "SKIP toInteger(($page - 1) * $limit)"
          : "SKIP toInteger(($page - 1) * 10)"
        : ""
    }
    ${params.limit && params.limit > 0 ? "LIMIT toInteger($limit)" : "LIMIT 10"}
    `;

    const generatedQuery = `
            MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
            MATCH (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
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
            CALL {
              WITH p
              WITH p ORDER BY p.monthlyVolume DESC
              RETURN COLLECT(DISTINCT p)[0] as pf
            }
            WITH o, j, pf, COLLECT(DISTINCT p) as projects, COLLECT(DISTINCT fr) as rounds, MAX(fr.date) as mrfr, COLLECT(DISTINCT i) as investors, COLLECT(DISTINCT t) AS tech, COLLECT(DISTINCT c) as cats, COUNT(DISTINCT a) as auditCount, COUNT(DISTINCT h) as hackCount, COUNT(DISTINCT ch) as chainCount
            ${generatedFilters}
            WITH o, pf, j, tech, cats, auditCount, hackCount, chainCount, mrfr
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
              RETURN jobpost{.*, organization: org, technologies: tech } as results
            }
            CALL {
              MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
              MATCH (jp)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
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
              CALL {
                WITH p
                WITH p ORDER BY p.monthlyVolume DESC
                RETURN COLLECT(DISTINCT p)[0] as pf
              }
              WITH o, pf, COLLECT(p) as projects, j, COLLECT(DISTINCT fr) as rounds, MAX(fr.date) as mrfr, COLLECT(DISTINCT i) as investors, COLLECT(DISTINCT t) AS tech, COLLECT(DISTINCT c) as cats, COLLECT(DISTINCT ch) as chains, COUNT(DISTINCT a) as auditCount, COUNT(DISTINCT h) as hackCount, COUNT(DISTINCT ch) as chainCount
              ${generatedFilters}
              RETURN COUNT(DISTINCT j) as count
            }
            WITH count, results, pf, j, tech, auditCount, hackCount, chainCount, mrfr
            ${generatedSorters}
            WITH count, COLLECT(DISTINCT results) as data
            RETURN { total: count, data: data } as res
        `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    console.log(generatedQuery);
    return this.neo4jService
      .read(generatedQuery, {
        ...params,
        query: `(?i).*${params.query}.*`,
      })
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
        WITH o, j, COLLECT(DISTINCT t) AS tech
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
        WITH o, j, COLLECT(DISTINCT t) AS tech
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
