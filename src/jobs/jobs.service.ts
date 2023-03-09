import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { JobDetailsResultEntity } from "src/shared/entities/job-details-result.entity";
import {
  intConverter,
  optionalMinMaxFilter,
  orderBySelector,
} from "src/shared/helpers";
import {
  JobDetailsResult,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  JobListResultEntity,
  PaginatedData,
} from "src/shared/types";
import { JobListParams } from "./dto/job-list.dto";

@Injectable()
export class JobsService {
  constructor(private readonly neo4jService: Neo4jService) {}
  async getJobsList(
    params: JobListParams,
  ): Promise<PaginatedData<JobListResult>> {
    const generatedQuery = `
            MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
            MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
            OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
            OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
            OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
            OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
            OPTIONAL MATCH (p)-[:IS_CHAIN]->(ch:Chain)
            WITH o, p, j, COLLECT(DISTINCT t) AS tech, COLLECT(DISTINCT c) as cats, COLLECT(DISTINCT ch) as chains, COUNT(DISTINCT a) as auditCount, COUNT(DISTINCT h) as hackCount, COUNT(DISTINCT ch) as chainCount, COLLECT(DISTINCT a) as audits, COLLECT(DISTINCT h) as hacks, PROPERTIES(p) as pProps
            WHERE ${params.organizations ? "o.name IN $organizations AND " : ""}
            ${params.projects ? "p.name IN $projects AND " : ""}
            ${optionalMinMaxFilter(
              { min: params.minSalary, max: params.maxSalary },
              "j.minSalary >= $minSalary AND j.maxSalary <= $maxSalary AND j.minSalary IS NOT NULL AND j.maxSalary IS NOT NULL",
              "j.minSalary >= $minSalary AND j.minSalary IS NOT NULL",
              "j.maxSalary <= $maxSalary AND j.maxSalary IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minHeadCount,
                max: params.maxHeadCount,
              },
              "$minHeadCount >= o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
              "$minHeadCount >= o.headCount AND o.headCount IS NOT NULL",
              "o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minTeamSize,
                max: params.maxTeamSize,
              },
              "$minTeamSize >= p.teamSize <= $maxTeamSize AND p.teamSize IS NOT NULL",
              "$minTeamSize >= p.teamSize AND p.teamSize IS NOT NULL",
              "p.teamSize <= $maxTeamSize AND p.teamSize IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              { min: params.minTvl, max: params.maxTvl },
              "$minTvl >= p.tvl <= $maxTvl AND p.tvl IS NOT NULL",
              "$minTvl >= p.tvl AND p.tvl IS NOT NULL",
              "p.tvl <= $maxTvl AND p.tvl IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyVolume,
                max: params.maxMonthlyVolume,
              },
              "$minMonthlyVolume >= p.monthlyVolume <= $maxMonthlyVolume AND p.monthlyVolume IS NOT NULL",
              "$minMonthlyVolume >= p.monthlyVolume AND p.monthlyVolume IS NOT NULL",
              "p.monthlyVolume <= $maxMonthlyVolume AND p.monthlyVolume IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyFees,
                max: params.maxMonthlyFees,
              },
              "$minMonthlyFees >= p.monthlyFees <= $maxMonthlyFees AND p.monthlyFees IS NOT NULL",
              "$minMonthlyFees >= p.monthlyFees AND p.monthlyFees IS NOT NULL",
              "p.monthlyFees <= $maxMonthlyFees AND p.monthlyFees IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyRevenue,
                max: params.maxMonthlyRevenue,
              },
              "$minMonthlyRevenue >= p.monthlyRevenue <= $maxMonthlyRevenue AND p.monthlyRevenue IS NOT NULL",
              "$minMonthlyRevenue >= p.monthlyRevenue AND p.monthlyRevenue IS NOT NULL",
              "p.monthlyRevenue <= $maxMonthlyRevenue AND p.monthlyRevenue IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minAudits,
                max: params.maxAudits,
              },
              "$minAudits >= auditCount <= $maxAudits AND auditCount IS NOT NULL",
              "$minAudits >= auditCount AND auditCount IS NOT NULL",
              "auditCount <= $maxAudits AND auditCount IS NOT NULL",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minHacks,
                max: params.maxHacks,
              },
              "$minHacks >= hackCount <= $maxHacks AND hackCount IS NOT NULL",
              "$minHacks >= hackCount AND hackCount IS NOT NULL",
              "hackCount <= $maxHacks AND hackCount IS NOT NULL",
            )}
            ${
              params.token !== undefined
                ? params.token
                  ? "p.tokenAddress IS NOT NULL AND "
                  : "p.tokenAddress = null AND "
                : ""
            }
            ${
              params.mainNet !== undefined
                ? params.mainNet
                  ? "p.isMainnet IS NOT NULL AND "
                  : "p.isMainnet = true AND "
                : ""
            }
            ${params.seniority ? "j.seniority = $seniority AND " : ""}
            ${params.locations ? "j.jobLocation IN $locations AND " : ""}
            ${params.tech ? "any(x IN tech WHERE x.name IN $tech) AND " : ""}
            ${
              params.categories
                ? "any(y IN cats WHERE y.name IN $categories) AND "
                : ""
            }
            ${
              params.chains
                ? "any(y IN cats WHERE y.name IN $categories) AND "
                : ""
            }
            ${
              params.orderBy
                ? `${orderBySelector({
                    orderBy: params.orderBy,
                    jobVar: "j",
                    orgVar: "o",
                    projectVar: "p",
                  })} IS NOT NULL AND`
                : `${orderBySelector({
                    orderBy: "publicationDate",
                    jobVar: "j",
                    orgVar: "o",
                    projectVar: "p",
                  })} IS NOT NULL AND`
            }
            o.name IS NOT NULL AND o.name <> ""
            WITH o, p, j, tech, cats, auditCount, hackCount, chainCount, audits, hacks, chains, pProps
            CALL {
              MATCH (o:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
              MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
              OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
              OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
              OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
              OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
              OPTIONAL MATCH (p)-[:IS_CHAIN]->(ch:Chain)
              WITH o, p, j, COLLECT(DISTINCT t) AS tech, COLLECT(DISTINCT c) as cats, COLLECT(DISTINCT ch) as chains, COUNT(DISTINCT a) as auditCount, COUNT(DISTINCT h) as hackCount, COUNT(DISTINCT ch) as chainCount, COLLECT(DISTINCT a) as audits, COLLECT(DISTINCT h) as hacks, PROPERTIES(p) as pProps
              WHERE ${
                params.organizations ? "o.name IN $organizations AND " : ""
              }
              ${params.projects ? "p.name IN $projects AND " : ""}
              ${optionalMinMaxFilter(
                { min: params.minSalary, max: params.maxSalary },
                "j.minSalary >= $minSalary AND j.maxSalary <= $maxSalary AND j.minSalary IS NOT NULL AND j.maxSalary IS NOT NULL",
                "j.minSalary >= $minSalary AND j.minSalary IS NOT NULL",
                "j.maxSalary <= $maxSalary AND j.maxSalary IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minHeadCount,
                  max: params.maxHeadCount,
                },
                "$minHeadCount >= o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
                "$minHeadCount >= o.headCount AND o.headCount IS NOT NULL",
                "o.headCount <= $maxHeadCount AND o.headCount IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minTeamSize,
                  max: params.maxTeamSize,
                },
                "$minTeamSize >= p.teamSize <= $maxTeamSize AND p.teamSize IS NOT NULL",
                "$minTeamSize >= p.teamSize AND p.teamSize IS NOT NULL",
                "p.teamSize <= $maxTeamSize AND p.teamSize IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                { min: params.minTvl, max: params.maxTvl },
                "$minTvl >= p.tvl <= $maxTvl AND p.tvl IS NOT NULL",
                "$minTvl >= p.tvl AND p.tvl IS NOT NULL",
                "p.tvl <= $maxTvl AND p.tvl IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minMonthlyVolume,
                  max: params.maxMonthlyVolume,
                },
                "$minMonthlyVolume >= p.monthlyVolume <= $maxMonthlyVolume AND p.monthlyVolume IS NOT NULL",
                "$minMonthlyVolume >= p.monthlyVolume AND p.monthlyVolume IS NOT NULL",
                "p.monthlyVolume <= $maxMonthlyVolume AND p.monthlyVolume IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minMonthlyFees,
                  max: params.maxMonthlyFees,
                },
                "$minMonthlyFees >= p.monthlyFees <= $maxMonthlyFees AND p.monthlyFees IS NOT NULL",
                "$minMonthlyFees >= p.monthlyFees AND p.monthlyFees IS NOT NULL",
                "p.monthlyFees <= $maxMonthlyFees AND p.monthlyFees IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minMonthlyRevenue,
                  max: params.maxMonthlyRevenue,
                },
                "$minMonthlyRevenue >= p.monthlyRevenue <= $maxMonthlyRevenue AND p.monthlyRevenue IS NOT NULL",
                "$minMonthlyRevenue >= p.monthlyRevenue AND p.monthlyRevenue IS NOT NULL",
                "p.monthlyRevenue <= $maxMonthlyRevenue AND p.monthlyRevenue IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minAudits,
                  max: params.maxAudits,
                },
                "$minAudits >= auditCount <= $maxAudits AND auditCount IS NOT NULL",
                "$minAudits >= auditCount AND auditCount IS NOT NULL",
                "auditCount <= $maxAudits AND auditCount IS NOT NULL",
              )}
              ${optionalMinMaxFilter(
                {
                  min: params.minHacks,
                  max: params.maxHacks,
                },
                "$minHacks >= hackCount <= $maxHacks AND hackCount IS NOT NULL",
                "$minHacks >= hackCount AND hackCount IS NOT NULL",
                "hackCount <= $maxHacks AND hackCount IS NOT NULL",
              )}
              ${
                params.token !== undefined
                  ? params.token
                    ? "p.tokenAddress IS NOT NULL AND "
                    : "p.tokenAddress = null AND "
                  : ""
              }
              ${
                params.mainNet !== undefined
                  ? params.mainNet
                    ? "p.isMainnet IS NOT NULL AND "
                    : "p.isMainnet = true AND "
                  : ""
              }
              ${params.seniority ? "j.seniority = $seniority AND " : ""}
              ${params.locations ? "j.jobLocation IN $locations AND " : ""}
              ${params.tech ? "any(x IN tech WHERE x.name IN $tech) AND " : ""}
              ${
                params.categories
                  ? "any(y IN cats WHERE y.name IN $categories) AND "
                  : ""
              }
              ${
                params.chains
                  ? "any(y IN cats WHERE y.name IN $categories) AND "
                  : ""
              }
              ${
                params.orderBy
                  ? `${orderBySelector({
                      orderBy: params.orderBy,
                      jobVar: "j",
                      orgVar: "o",
                      projectVar: "p",
                    })} IS NOT NULL AND`
                  : `${orderBySelector({
                      orderBy: "publicationDate",
                      jobVar: "j",
                      orgVar: "o",
                      projectVar: "p",
                    })} IS NOT NULL AND`
              }
              o.name IS NOT NULL AND o.name <> ""
              RETURN { organization: PROPERTIES(o), project: pProps{.*, chains: chains, hacks: hacks, audits: audits}, jobpost: PROPERTIES(j), technologies: tech, categories: cats } as results
            } 
            WITH COUNT(results) as count, o, p, j, tech, cats, auditCount, hackCount, chainCount, audits, hacks, chains, pProps
            WITH { organization: PROPERTIES(o), project: pProps{.*, chains: chains, hacks: hacks, audits: audits}, jobpost: PROPERTIES(j), technologies: tech, categories: cats } as results, o, p, j, auditCount, hackCount, chainCount, count
            ${
              params.orderBy
                ? `ORDER BY ${orderBySelector({
                    orderBy: params.orderBy,
                    jobVar: "j",
                    orgVar: "o",
                    projectVar: "p",
                  })}`
                : `ORDER BY ${orderBySelector({
                    orderBy: "publicationDate",
                    jobVar: "j",
                    orgVar: "o",
                    projectVar: "p",
                  })}`
            } ${params.order ? params.order.toUpperCase() : "ASC"}
            ${
              params.page && params.page > 0
                ? params.limit && params.limit > 0
                  ? "SKIP toInteger(($page - 1) * $limit)"
                  : "SKIP toInteger(($page - 1) * 10)"
                : ""
            }
            ${
              params.limit && params.limit > 0
                ? "LIMIT toInteger($limit)"
                : "LIMIT 10"
            }
            WITH count, COLLECT(results) as data
            RETURN { total: count, data: data } as res
        `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    console.log(generatedQuery);
    return this.neo4jService
      .read(generatedQuery, {
        ...params,
      })
      .then(res => {
        const result = res.records[0]?.get("res");
        return {
          page: result?.data?.length > 0 ? params.page ?? 1 : -1 ?? -1,
          count: result?.data?.length ?? 0,
          total: result?.total ? intConverter(result?.total) : 0,
          data:
            result?.data?.map(record =>
              new JobListResultEntity(record).getProperties(),
            ) ?? [],
        };
      });
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory {name: "technical"})
        MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        OPTIONAL MATCH (p)-[:IS_CHAIN]->(c:Chain)
        OPTIONAL MATCH (p)-[:HAS_AUDIT]-(a:Audit)
        OPTIONAL MATCH (p)-[:HAS_HACK]-(h:Hack)
        WITH o, p, j, t, c, cat, COUNT(DISTINCT h) as hacks, COUNT(DISTINCT a) as audits
        RETURN {
            minSalary: MIN(j.medianSalary),
            maxSalary: MAX(j.medianSalary),
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
            minHacks: MIN(hacks),
            maxHacks: MAX(hacks),
            tech: COLLECT(DISTINCT t.name),
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
      );
  }

  async getJobDetailsByUuid(
    uuid: string,
  ): Promise<JobDetailsResult | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (:JobpostCategory {name: "technical"})-[:IS_CATEGORIZED_AS]-(jp:Jobpost)<-[:HAS_JOBPOST]-(:Jobsite)<-[:HAS_JOBSITE]-(o:Organization)
        MATCH (j:StructuredJobpost)<-[:HAS_STRUCTURED_JOBPOST]-(jp)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]-(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE j.id = $uuid
        RETURN { organization: PROPERTIES(o), project: PROPERTIES(p), jobpost: PROPERTIES(j), technologies: COLLECT(t) } as res`,
        { uuid },
      )
      .then(res =>
        res.records.length
          ? new JobDetailsResultEntity(
              res.records[0].get("res"),
            ).getProperties()
          : undefined,
      );
  }
}
