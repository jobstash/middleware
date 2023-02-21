import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { optionalMinMaxFilter, orderBySelector } from "src/shared/helpers";
import { PaginatedData } from "src/shared/interfaces/paginated-data.interface";
import { JobListResult, JobListResultEntity } from "src/shared/types";
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
                min: params.min_publication_date,
                max: params.max_publication_date,
              },
              "$min_publication_date < p.publicationDate <= $max_publication_date",
              "$max_publication_date < p.publicationDate",
              "p.publicationDate <= $max_publication_date",
            )}
            ${optionalMinMaxFilter(
              { min: params.min_salary, max: params.max_salary },
              "$min_salary >= j.minSalary AND $max_salary <= j.maxSalary",
              "$min_salary >= j.minSalary",
              "$max_salary <= j.maxSalary",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.min_head_count,
                max: params.max_head_count,
              },
              "$min_head_count < o.teamSize <= $max_head_count",
              "$min_head_count < p.tvl",
              "p.tvl <= $max_head_count",
            )}
            ${optionalMinMaxFilter(
              { min: params.min_tvl, max: params.max_tvl },
              "$min_tvl < p.tvl <= $max_tvl",
              "$min_tvl < p.tvl",
              "p.tvl <= $max_tvl",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.min_monthly_volume,
                max: params.max_monthly_volume,
              },
              "$min_monthly_volume < p.monthlyVolume <= $max_monthly_volume",
              "$min_monthly_volume < p.monthlyVolume",
              "p.monthlyVolume <= $max_monthly_volume",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.min_monthly_active_users,
                max: params.max_monthly_active_users,
              },
              "$min_monthly_active_users < p.monthlyActiveUsers <= $max_monthly_active_users",
              "$min_monthly_active_users < p.monthlyActiveUsers",
              "p.monthlyActiveUsers <= $max_monthly_active_users",
            )}
            ${optionalMinMaxFilter(
              {
                min: params.min_monthly_revenue,
                max: params.max_monthly_revenue,
              },
              "$min_monthly_revenue < p.monthlyRevenue <= $max_monthly_revenue",
              "$min_monthly_revenue < p.monthlyRevenue",
              "p.monthlyRevenue <= $max_monthly_revenue",
            )}
            ${
              params.token !== undefined
                ? params.token
                  ? "p.tokenAddress != null AND "
                  : "p.tokenAddress = null AND "
                : ""
            }
            ${params.level ? "j.level = $level AND " : ""}
            ${params.location ? "j.jobLocation CONTAINS $location AND " : ""}
            ${params.tech ? "any(x IN tech WHERE x.name IN $tech) AND " : ""}
            ${
              params.categories
                ? "any(y IN cats WHERE y.name IN $categories) AND "
                : ""
            }
            o.name <> ""
            RETURN { organization: PROPERTIES(o), project: PROPERTIES(p), jobpost: PROPERTIES(j), technologies: tech, categories: cats } as res
            ${
              params.order_by
                ? `ORDER BY ${orderBySelector({
                    order_by: params.order_by,
                    job_var: "j",
                    org_var: "o",
                    project_var: "p",
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
}
