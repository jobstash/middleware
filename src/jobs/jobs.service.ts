import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { optionalMinMaxFilter, orderBySelector } from "src/shared/helpers";
import {
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
  async findAll(params: JobListParams): Promise<PaginatedData<JobListResult>> {
    const generatedQuery = `
            MATCH (o:Organization)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(c:ProjectCategory)
            MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
            OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
            WITH o, p, j, COLLECT(DISTINCT t) AS tech, COLLECT(DISTINCT c) as cats
            WHERE ${params.organizations ? "o.name IN $organizations AND " : ""}
            ${params.projects ? "p.name IN $projects AND " : ""}
            ${optionalMinMaxFilter(
              {
                min: params.minPublicationDate,
                max: params.maxPublicationDate,
              },
              "$minPublicationDate < j.jobCreatedTimestamp <= $maxPublicationDate",
              "$maxPublicationDate < j.jobCreatedTimestamp",
              "j.jobCreatedTimestamp <= $maxPublicationDate",
            )}
            ${optionalMinMaxFilter(
              { min: params.minSalary, max: params.maxSalary },
              "$minSalary >= j.minSalary AND $max_salary <= j.maxSalary",
              "$minSalary >= j.minSalary",
              "$maxSalary <= j.maxSalary",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minHeadCount,
                max: params.maxHeadCount,
              },
              "$minHeadCount < o.headCount <= $maxHeadCount",
              "$minHeadCount < o.headCount",
              "o.headCount <= $maxHeadCount",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minTeamSize,
                max: params.maxTeamSize,
              },
              "$minTeamSize < p.teamSize <= $maxTeamSize",
              "$minTeamSize < p.teamSize",
              "p.teamSize <= $maxTeamSize",
            )}
            ${optionalMinMaxFilter(
              { min: params.minTvl, max: params.maxTvl },
              "$minTvl < p.tvl <= $maxTvl",
              "$minTvl < p.tvl",
              "p.tvl <= $maxTvl",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyVolume,
                max: params.maxMonthlyVolume,
              },
              "$minMonthlyVolume < p.monthlyVolume <= $maxMonthlyVolume",
              "$minMonthlyVolume < p.monthlyVolume",
              "p.monthlyVolume <= $maxMonthlyVolume",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyFees,
                max: params.maxMonthlyFees,
              },
              "$minMonthlyFees < p.monthlyFees <= $maxMonthlyFees",
              "$minMonthlyFees < p.monthlyFees",
              "p.monthlyFees <= $maxMonthlyFees",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.minMonthlyRevenue,
                max: params.maxMonthlyRevenue,
              },
              "$minMonthlyRevenue < p.monthlyRevenue <= $maxMonthlyRevenue",
              "$minMonthlyRevenue < p.monthlyRevenue",
              "p.monthlyRevenue <= $maxMonthlyRevenue",
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
            o.name IS NOT NULL AND o.name <> ""
            RETURN { organization: PROPERTIES(o), project: PROPERTIES(p), jobpost: PROPERTIES(j), technologies: tech, categories: cats } as res
            ${
              params.orderBy
                ? `ORDER BY ${orderBySelector({
                    orderBy: params.orderBy,
                    jobVar: "j",
                    orgVar: "o",
                    projectVar: "p",
                  })}`
                : ""
            } ${params.order ? params.order.toUpperCase() : ""}
            ${params.page ? "SKIP toInteger(($page - 1) * $limit)" : ""}
            ${params.limit ? "LIMIT toInteger($limit)" : ""}
        `.replace(/^\s*$(?:\r\n?|\n)/gm, "");
    return this.neo4jService
      .read(generatedQuery, {
        ...params,
      })
      .then(res => ({
        page: params.page ?? 1,
        count: res.records.length,
        data: res.records.map(record =>
          new JobListResultEntity(record.get("res")).getProperties(),
        ),
      }));
  }

  async getFilterConfigs(): Promise<JobFilterConfigs> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)-[:HAS_PROJECT]->(p:Project)-[:HAS_CATEGORY]->(cat:ProjectCategory)
        MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        OPTIONAL MATCH (p)-[:IS_CHAIN]->(c:Chain)
        WITH o, p, j, t, c, cat
        RETURN {
            minPublicationDate: MIN(j.jobCreatedTimestamp),
            maxPublicationDate: MAX(j.jobCreatedTimestamp),
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
}
