import { Injectable } from "@nestjs/common";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { OrgListParams } from "src/organizations/dto/org-list.input";
import { ProjectListParams } from "src/projects/dto/project-list.input";
import { slugify } from "src/shared/helpers";
import {
  JobListResult,
  OrgListResult,
  ProjectListResult,
} from "src/shared/types";
import { PostgresService } from "./postgres.service";

type SearchRow<T> = {
  payload: T;
  total_count: string;
};

export type SearchPage<T> = {
  page: number;
  count: number;
  total: number;
  data: T[];
};

type JobSearchParams = Partial<JobListParams> & {
  ecosystemHeader?: string;
  startDate?: number | null;
  endDate?: number | null;
  publicAccessOnly?: boolean;
  publishedBeforeOrAt?: number;
  online?: boolean | null;
  blocked?: boolean | null;
  includeOffline?: boolean;
  includeBlocked?: boolean;
  suppressPublicForExpertOrganizations?: boolean;
};

class SqlPredicateBuilder {
  readonly predicates: string[] = [];
  readonly parameters: unknown[] = [];

  bind(value: unknown): string {
    this.parameters.push(value);
    return `$${this.parameters.length}`;
  }

  add(sql: string): void {
    this.predicates.push(sql);
  }

  addEqual(column: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.add(`${column} = ${this.bind(value)}`);
  }

  addRange(
    column: string,
    minimum?: number | null,
    maximum?: number | null,
  ): void {
    if (minimum !== null && minimum !== undefined && minimum !== 0) {
      this.add(`COALESCE(${column}, 0) >= ${this.bind(minimum)}`);
    }
    if (maximum !== null && maximum !== undefined && maximum !== 0) {
      this.add(`COALESCE(${column}, 0) < ${this.bind(maximum)}`);
    }
  }

  addArrayOverlap(column: string, values?: string[] | null): void {
    const normalized = normalizeList(values);
    if (!normalized?.length) return;
    this.add(`${column} && ${this.bind(normalized)}::text[]`);
  }

  toSql(): string {
    return this.predicates.length
      ? `WHERE ${this.predicates.join("\n AND ")}`
      : "";
  }
}

const normalizeList = (values?: string[] | null): string[] | null =>
  values?.map(value => slugify(value)).filter(Boolean) ?? null;

const pageValues = (
  page: number | null | undefined,
  limit: number | null | undefined,
): { page: number; limit: number; offset: number } => {
  const validPage = Math.max(1, Number(page ?? 1));
  const validLimit = Math.min(100, Math.max(1, Number(limit ?? 10)));
  return {
    page: validPage,
    limit: validLimit,
    offset: (validPage - 1) * validLimit,
  };
};

@Injectable()
export class SearchDocumentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async refreshProjectDocuments(projectNodeIds: string[]): Promise<number> {
    if (!projectNodeIds.length) return 0;
    const [row] = await this.postgres.query<{ refreshed: string }>(
      `
        SELECT refresh_project_search_document_ids($1::bigint[])::text AS refreshed
      `,
      [[...new Set(projectNodeIds)]],
    );
    return Number(row?.refreshed ?? 0);
  }

  async getJobPayloads(ecosystem?: string): Promise<JobListResult[]> {
    const params: unknown[] = [];
    const ecosystemPredicate = ecosystem
      ? `AND $1 = ANY(job.managed_ecosystems)`
      : "";
    if (ecosystem) params.push(slugify(ecosystem));

    const rows = await this.postgres.query<{ payload: JobListResult }>(
      `
        SELECT CASE
          WHEN organization.payload IS NULL THEN job.payload
          ELSE job.payload || jsonb_build_object(
            'organization', organization.payload - 'tags' - 'jobs',
            'project', NULL
          )
        END AS payload
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE job.online
          AND NOT job.blocked
          AND cardinality(job.tags) > 0
          AND (job.organization_id IS NOT NULL OR job.project_id IS NOT NULL)
          AND NOT (
            job.access = 'public'
            AND job.organization_has_expert_jobs
          )
          ${ecosystemPredicate}
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
      `,
      params,
    );
    return rows.map(row => row.payload);
  }

  async getEcosystemJobPayloads(
    ecosystems: string[],
  ): Promise<JobListResult[]> {
    const normalized = normalizeList(ecosystems) ?? [];
    if (!normalized.length) return [];
    const rows = await this.postgres.query<{ payload: JobListResult }>(
      `
        SELECT
          job.payload || jsonb_build_object(
            'organization', organization.payload - 'tags' - 'jobs',
            'project', NULL,
            'online', job.online,
            'blocked', job.blocked
          ) AS payload
        FROM job_search_documents job
        JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE job.managed_ecosystems && $1::text[]
          AND cardinality(job.tags) > 0
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
      `,
      [normalized],
    );
    return rows.map(row => row.payload);
  }

  async getAllJobPayloads(): Promise<JobListResult[]> {
    const rows = await this.postgres.query<{ payload: JobListResult }>(`
      SELECT
        job.payload
        || CASE
          WHEN organization.payload IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object(
            'organization', organization.payload - 'tags' - 'jobs',
            'project', NULL
          )
        END
        || jsonb_build_object(
          'isOnline', job.online,
          'isBlocked', job.blocked
        ) AS payload
      FROM job_search_documents job
      LEFT JOIN organization_search_documents organization
        ON organization.organization_id = job.organization_id
      WHERE cardinality(job.tags) > 0
      ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
    `);
    return rows.map(row => row.payload);
  }

  async getOrganizationJobPayloads(
    organizationId: string,
  ): Promise<JobListResult[]> {
    const rows = await this.postgres.query<{ payload: JobListResult }>(
      `
        SELECT
          job.payload
          || CASE
            WHEN organization.payload IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'organization', organization.payload - 'tags' - 'jobs',
              'project', NULL
            )
          END
          || jsonb_build_object(
            'online', job.online,
            'blocked', job.blocked,
            'applications', (
              SELECT count(*)
              FROM graph_relationships application
              WHERE application.target_id = job.job_node_id
                AND application.type = 'APPLIED_TO'
            ),
            'views', (
              SELECT count(*)
              FROM graph_relationships view_event
              WHERE view_event.target_id = job.job_node_id
                AND view_event.type = 'VIEWED_DETAILS'
            )
          ) AS payload
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE job.organization_id = $1
          AND cardinality(job.tags) > 0
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
      `,
      [organizationId],
    );
    return rows.map(row => row.payload);
  }

  async searchJobs(
    params: JobSearchParams,
  ): Promise<SearchPage<JobListResult>> {
    const where = new SqlPredicateBuilder();
    if (params.online === true || !params.includeOffline) where.add("online");
    if (params.blocked === true) {
      where.add("blocked");
    } else if (!params.includeBlocked) {
      where.add("NOT blocked");
    }
    where.add("(organization_id IS NOT NULL OR project_id IS NOT NULL)");
    where.add("cardinality(tags) > 0");
    if (params.suppressPublicForExpertOrganizations !== false) {
      where.add("NOT (access = 'public' AND organization_has_expert_jobs)");
    }
    if (params.publicAccessOnly) where.add("access = 'public'");
    if (params.publishedBeforeOrAt !== undefined) {
      where.add(
        `published_timestamp <= ${where.bind(params.publishedBeforeOrAt)}`,
      );
    }

    if (params.ecosystemHeader) {
      where.add(
        `${where.bind(slugify(params.ecosystemHeader))} = ANY(managed_ecosystems)`,
      );
    }
    where.addArrayOverlap("ecosystems", params.ecosystems);
    where.addArrayOverlap("tags", params.tags);
    where.addArrayOverlap("project_names", params.projects);
    where.addArrayOverlap("investor_names", params.investors);
    where.addArrayOverlap("funding_round_names", params.fundingRounds);
    where.addArrayOverlap("chain_names", params.chains);
    where.addArrayOverlap("classifications", params.classifications);
    where.addArrayOverlap("commitments", params.commitments);
    where.addArrayOverlap("location_types", params.locations);

    const organizations = normalizeList(params.organizations);
    if (organizations?.length) {
      where.add(
        `organization_name = ANY(${where.bind(organizations)}::text[])`,
      );
    }
    const seniorities = normalizeList(params.seniority);
    if (seniorities?.length) {
      where.add(`seniority = ANY(${where.bind(seniorities)}::text[])`);
    }

    where.addRange("salary", params.minSalaryRange, params.maxSalaryRange);
    where.addRange(
      "headcount_estimate",
      params.minHeadCount,
      params.maxHeadCount,
    );
    where.addRange("max_tvl", params.minTvl, params.maxTvl);
    where.addRange(
      "max_monthly_volume",
      params.minMonthlyVolume,
      params.maxMonthlyVolume,
    );
    where.addRange(
      "max_monthly_fees",
      params.minMonthlyFees,
      params.maxMonthlyFees,
    );
    where.addRange(
      "max_monthly_revenue",
      params.minMonthlyRevenue,
      params.maxMonthlyRevenue,
    );
    where.addEqual("has_audits", params.audits);
    where.addEqual("has_hacks", params.hacks);
    where.addEqual("has_token", params.token);
    where.addEqual("onboard_into_web3", params.onboardIntoWeb3);

    if (params.expertJobs !== null && params.expertJobs !== undefined) {
      where.add(`access ${params.expertJobs ? "=" : "<>"} 'protected'`);
    }
    if (params.startDate) {
      where.add(`published_timestamp >= ${where.bind(params.startDate)}`);
    }
    if (params.endDate) {
      where.add(`published_timestamp < ${where.bind(params.endDate)}`);
    }
    const searchQuery = params.query?.trim();
    if (searchQuery) {
      const [match] = await this.postgres.query<{ hasExactMatch: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM job_search_documents
            WHERE search_vector @@ websearch_to_tsquery('simple', $1)
          ) AS "hasExactMatch"
        `,
        [searchQuery],
      );
      const queryParam = where.bind(searchQuery);
      where.add(
        match?.hasExactMatch
          ? `search_vector @@ websearch_to_tsquery('simple', ${queryParam})`
          : `job_node_id IN (
              SELECT fuzzy.job_node_id
              FROM job_search_documents fuzzy
              WHERE fuzzy.search_text % ${queryParam}
              ORDER BY similarity(fuzzy.search_text, ${queryParam}) DESC,
                       fuzzy.job_node_id
              LIMIT 1000
            )`,
      );
    }

    const sortExpressions: Record<string, string> = {
      audits: "has_audits::int",
      hacks: "has_hacks::int",
      chains: "cardinality(chain_names)",
      tvl: "max_tvl",
      monthlyVolume: "max_monthly_volume",
      monthlyFees: "max_monthly_fees",
      monthlyRevenue: "max_monthly_revenue",
      fundingDate: "latest_funding_timestamp",
      headcountEstimate: "headcount_estimate",
      teamSize: "headcount_estimate",
      publicationDate: "published_timestamp",
      salary: "salary",
    };
    const sortExpression =
      sortExpressions[params.orderBy ?? "publicationDate"] ??
      sortExpressions.publicationDate;
    const direction = params.order === "asc" ? "ASC" : "DESC";
    const baseOrder = (alias = ""): string => {
      const prefix = alias ? `${alias}.` : "";
      return `
        ${prefix}featured DESC,
        CASE WHEN ${prefix}featured
          THEN ${prefix}feature_start_timestamp
        END ASC NULLS LAST,
        CASE WHEN ${prefix}featured
          THEN ${prefix}feature_end_timestamp - ${prefix}feature_start_timestamp
        END DESC NULLS LAST,
        ${prefix}sort_value ${direction} NULLS LAST,
        ${prefix}job_node_id
      `;
    };
    const paging = pageValues(params.page, params.limit);
    const limitParam = where.bind(paging.limit);
    const offsetParam = where.bind(paging.offset);

    const rows = await this.postgres.query<SearchRow<JobListResult>>(
      `
        WITH filtered AS (
          SELECT
            job_node_id,
            organization_id,
            access,
            (
              featured
              AND feature_start_timestamp IS NOT NULL
              AND feature_end_timestamp IS NOT NULL
              AND feature_start_timestamp <
                (extract(epoch FROM statement_timestamp()) * 1000)::bigint
              AND feature_end_timestamp >
                (extract(epoch FROM statement_timestamp()) * 1000)::bigint
            ) AS featured,
            feature_start_timestamp,
            feature_end_timestamp,
            ${sortExpression} AS sort_value,
            count(*) OVER () AS total_count
          FROM job_search_documents
          ${where.toSql()}
        ), ranked AS (
          SELECT *, row_number() OVER (
            PARTITION BY (access = 'protected')
            ORDER BY ${baseOrder()}
          ) AS access_rank
          FROM filtered
        ), page AS (
          SELECT *
          FROM ranked
          ORDER BY
            CASE
              WHEN access = 'protected' THEN access_rank * 2 - 1
              ELSE access_rank * 2
            END,
            ${baseOrder()}
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        )
        SELECT CASE
          WHEN organization.payload IS NULL THEN job.payload
          ELSE job.payload || jsonb_build_object(
            'organization', organization.payload - 'tags' - 'jobs',
            'project', NULL
          )
        END AS payload,
        page.total_count
        FROM page
        JOIN job_search_documents job ON job.job_node_id = page.job_node_id
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = page.organization_id
        ORDER BY
          CASE
            WHEN page.access = 'protected' THEN page.access_rank * 2 - 1
            ELSE page.access_rank * 2
          END,
          ${baseOrder("page")}
      `,
      where.parameters,
    );

    return toPage(rows, paging.page);
  }

  async getPublicJobPayloads(authenticated: boolean): Promise<JobListResult[]> {
    const cutoff = 1_746_057_600_000;
    const rows = await this.postgres.query<{ payload: JobListResult }>(
      `
        SELECT
          job.payload
          || CASE
            WHEN organization.payload IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'organization', organization.payload - 'tags' - 'jobs',
              'project', NULL
            )
          END AS payload
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE job.online
          AND NOT job.blocked
          AND cardinality(job.tags) > 0
          AND (job.organization_id IS NOT NULL OR job.project_id IS NOT NULL)
          AND (
            NOT $1::boolean
            OR NOT (
              job.access = 'public'
              AND job.organization_has_expert_jobs
            )
          )
          AND CASE
            WHEN $1::boolean THEN job.published_timestamp <= $2
            ELSE job.access = 'public'
          END
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
      `,
      [authenticated, cutoff],
    );
    return rows.map(row => row.payload);
  }

  async getArchiveJobPayloads(
    page: number | null | undefined,
    limit: number | null | undefined,
  ): Promise<
    SearchPage<
      JobListResult & {
        online: boolean;
        publishedTimestampIsVerified: boolean;
      }
    >
  > {
    const paging = pageValues(page, limit);
    const rows = await this.postgres.query<
      SearchRow<
        JobListResult & {
          online: boolean;
          publishedTimestampIsVerified: boolean;
        }
      >
    >(
      `
        SELECT
          job.payload
          || CASE
            WHEN organization.payload IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'organization', organization.payload - 'tags' - 'jobs',
              'project', NULL
            )
          END
          || jsonb_build_object(
            'online', job.online,
            'publishedTimestampIsVerified', COALESCE(
              (job.payload ->> 'publishedTimestampIsVerified')::boolean,
              false
            )
          ) AS payload,
          count(*) OVER () AS total_count
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE NOT job.blocked
          AND cardinality(job.tags) > 0
          AND (job.organization_id IS NOT NULL OR job.project_id IS NOT NULL)
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
        LIMIT $1 OFFSET $2
      `,
      [paging.limit, paging.offset],
    );
    return toPage(rows, paging.page);
  }

  async getJobFilterValues(
    ecosystem?: string | string[],
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const parameters: unknown[] = [];
    const predicates = ["job.online", "cardinality(job.tags) > 0"];
    if (ecosystem) {
      const ecosystems = Array.isArray(ecosystem)
        ? (normalizeList(ecosystem) ?? [])
        : [slugify(ecosystem)];
      parameters.push(ecosystems);
      predicates.push(
        `organization.managed_ecosystems && $${parameters.length}::text[]`,
      );
    }
    if (organizationId) {
      parameters.push(organizationId);
      predicates.push(`owner.organization_id = $${parameters.length}`);
    }

    const [row] = await this.postgres.query<Record<string, unknown>>(
      `
        WITH scoped_jobs AS MATERIALIZED (
          SELECT
            job.job_node_id,
            job.salary,
            job.salary_currency,
            job.tags,
            job.classifications,
            job.commitments,
            job.location_types,
            job.seniority,
            job.filter_labels,
            owner.organization_id AS owner_organization_id,
            organization.name AS owner_organization_name,
            organization.headcount_estimate AS owner_headcount_estimate,
            organization.project_names AS owner_project_names,
            organization.investors AS owner_investor_names,
            organization.funding_rounds AS owner_funding_round_names,
            organization.chains AS owner_chain_names,
            organization.ecosystems AS owner_ecosystems,
            organization.filter_labels AS owner_filter_labels
          FROM job_search_documents job
          JOIN job_search_owners owner ON owner.job_node_id = job.job_node_id
          JOIN organization_search_documents organization
            ON organization.organization_node_id = owner.organization_node_id
          WHERE ${predicates.join(" AND ")}
        ), scoped_job_documents AS MATERIALIZED (
          SELECT DISTINCT ON (job_node_id)
            job_node_id,
            salary,
            salary_currency,
            tags,
            classifications,
            commitments,
            location_types,
            seniority,
            filter_labels
          FROM scoped_jobs
          ORDER BY job_node_id
        ), scoped_organizations AS MATERIALIZED (
          SELECT DISTINCT ON (owner_organization_id)
            owner_organization_id,
            owner_organization_name,
            owner_headcount_estimate,
            owner_project_names,
            owner_investor_names,
            owner_funding_round_names,
            owner_chain_names,
            owner_ecosystems,
            owner_filter_labels
          FROM scoped_jobs
          ORDER BY owner_organization_id
        ), eligible_organizations AS MATERIALIZED (
          SELECT scoped.*
          FROM scoped_organizations scoped
          WHERE NOT EXISTS (
              SELECT 1
              FROM job_search_owners blocked_owner
              JOIN job_search_documents blocked_job
                ON blocked_job.job_node_id = blocked_owner.job_node_id
              WHERE blocked_owner.organization_id = scoped.owner_organization_id
                AND blocked_job.blocked
            )
        ), eligible_projects AS MATERIALIZED (
          SELECT project.*
          FROM project_search_documents project
          WHERE project.organization_ids && COALESCE((
            SELECT array_agg(DISTINCT slugify_text(owner_organization_id))
            FROM eligible_organizations
          ), ARRAY[]::text[])
        ), organization_label_values AS MATERIALIZED (
          SELECT
            section.category,
            array_agg(DISTINCT label.value ORDER BY label.value) AS labels
          FROM eligible_organizations organization
          CROSS JOIN LATERAL jsonb_each(jsonb_build_object(
            'projects', organization.owner_filter_labels -> 'projects',
            'investors', organization.owner_filter_labels -> 'investors',
            'fundingRounds',
              organization.owner_filter_labels -> 'fundingRounds',
            'chains', organization.owner_filter_labels -> 'chains',
            'ecosystems', organization.owner_filter_labels -> 'ecosystems'
          ))
            section(category, labels_json)
          CROSS JOIN LATERAL jsonb_each_text(
            CASE
              WHEN jsonb_typeof(section.labels_json) = 'object'
                THEN section.labels_json
              ELSE '{}'::jsonb
            END
          ) label
          GROUP BY section.category
        )
        SELECT
          (SELECT min(salary)::float8 FROM scoped_job_documents
            WHERE salary_currency ILIKE '%USD%') AS "minSalaryRange",
          (SELECT max(salary)::float8 FROM scoped_job_documents
            WHERE salary_currency ILIKE '%USD%') AS "maxSalaryRange",
          (SELECT min(tvl)::float8 FROM eligible_projects) AS "minTvl",
          (SELECT max(tvl)::float8 FROM eligible_projects) AS "maxTvl",
          (SELECT min(monthly_volume)::float8 FROM eligible_projects) AS "minMonthlyVolume",
          (SELECT max(monthly_volume)::float8 FROM eligible_projects) AS "maxMonthlyVolume",
          (SELECT max(monthly_fees)::float8 FROM eligible_projects) AS "minMonthlyFees",
          (SELECT max(monthly_fees)::float8 FROM eligible_projects) AS "maxMonthlyFees",
          (SELECT max(monthly_revenue)::float8 FROM eligible_projects) AS "minMonthlyRevenue",
          (SELECT max(monthly_revenue)::float8 FROM eligible_projects) AS "maxMonthlyRevenue",
          (SELECT min(owner_headcount_estimate) FROM scoped_organizations) AS "minHeadCount",
          (SELECT max(owner_headcount_estimate) FROM scoped_organizations) AS "maxHeadCount",
          ${filterLabels("tags", "tags", "scoped_job_documents", "scoped_job_documents")} AS tags,
          COALESCE(
            (SELECT labels FROM organization_label_values WHERE category = 'projects'),
            ${fallbackLabels("owner_project_names", "eligible_organizations")}
          ) AS projects,
          ${filterLabels("organizations", "ARRAY[owner_organization_name]", "scoped_organizations", "scoped_organizations", "owner_filter_labels")} AS organizations,
          COALESCE(
            (SELECT labels FROM organization_label_values WHERE category = 'investors'),
            ${fallbackLabels("owner_investor_names", "eligible_organizations")}
          ) AS investors,
          COALESCE(
            (SELECT labels FROM organization_label_values WHERE category = 'fundingRounds'),
            ${fallbackLabels("owner_funding_round_names", "eligible_organizations")}
          ) AS "fundingRounds",
          COALESCE(
            (SELECT labels FROM organization_label_values WHERE category = 'chains'),
            ${fallbackLabels("owner_chain_names", "eligible_organizations")}
          ) AS chains,
          COALESCE(
            (SELECT labels FROM organization_label_values WHERE category = 'ecosystems'),
            ${fallbackLabels("owner_ecosystems", "eligible_organizations")}
          ) AS ecosystems,
          ${filterLabels("classifications", "classifications", "scoped_job_documents", "scoped_job_documents")} AS classifications,
          ${filterLabels("commitments", "commitments", "scoped_job_documents", "scoped_job_documents")} AS commitments,
          ${filterLabels("locations", "location_types", "scoped_job_documents", "scoped_job_documents")} AS locations,
          (SELECT array_remove(array_agg(DISTINCT seniority), NULL)
            FROM scoped_job_documents) AS seniority
      `,
      parameters,
    );
    return row ?? {};
  }

  async getAllJobsFilterValues(): Promise<{
    category: string[];
    organizations: string[];
  }> {
    const values = await this.getJobFilterValues();
    return {
      category: (values.classifications as string[] | undefined) ?? [],
      organizations: (values.organizations as string[] | undefined) ?? [],
    };
  }

  async getJobByShortUuid(
    shortUuid: string,
    options: { ecosystem?: string; includeOffline?: boolean } = {},
  ): Promise<JobListResult | undefined> {
    const [row] = await this.postgres.query<{ payload: JobListResult }>(
      `
        SELECT
          COALESCE(job.detail_payload, job.payload)
          || CASE
            WHEN organization.payload IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'organization', organization.payload - 'tags' - 'jobs',
              'project', NULL
            )
          END
          || jsonb_build_object(
            'online', job.online,
            'blocked', job.blocked,
            'applications', (
              SELECT count(*)
              FROM graph_relationships application
              WHERE application.target_id = job.job_node_id
                AND application.type = 'APPLIED_TO'
            ),
            'views', (
              SELECT count(*)
              FROM graph_relationships view_event
              WHERE view_event.target_id = job.job_node_id
                AND view_event.type = 'VIEWED_DETAILS'
            )
          ) AS payload
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE job.short_uuid = $1
          AND cardinality(job.tags) > 0
          AND ($2::boolean OR (job.online AND NOT job.blocked))
          AND ($3::text IS NULL OR $3 = ANY(job.managed_ecosystems))
        ORDER BY job.online DESC, job.blocked ASC, job.job_node_id
        LIMIT 1
      `,
      [
        shortUuid,
        options.includeOffline ?? false,
        options.ecosystem ? slugify(options.ecosystem) : null,
      ],
    );
    return row?.payload;
  }

  async getOrganizationPayloads(ecosystem?: string): Promise<OrgListResult[]> {
    const params: unknown[] = [];
    const ecosystemPredicate = ecosystem
      ? "WHERE $1 = ANY(managed_ecosystems)"
      : "";
    if (ecosystem) params.push(slugify(ecosystem));
    const rows = await this.postgres.query<{ payload: OrgListResult }>(
      `
        SELECT payload
        FROM organization_search_documents
        ${ecosystemPredicate}
        ORDER BY recent_funding_timestamp DESC NULLS LAST, name
      `,
      params,
    );
    return rows.map(row => row.payload);
  }

  async getOrganizationsWithLinks(
    organizationId?: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.postgres.query<{
      payload: Record<string, unknown>;
    }>(
      `
        SELECT
          organization.payload || jsonb_build_object(
            'discords', links.discords,
            'websites', links.websites,
            'rawWebsites', links.raw_websites,
            'docs', links.docs,
            'telegrams', links.telegrams,
            'githubs', links.githubs,
            'aliases', links.aliases,
            'twitters', links.twitters,
            'grantSites', links.grant_sites,
            'jobsites', links.jobsites,
            'detectedJobsites', links.detected_jobsites
          ) AS payload
        FROM organization_search_documents organization
        JOIN graph_nodes node ON node.id = organization.organization_node_id
        CROSS JOIN LATERAL (
          SELECT
            COALESCE(to_jsonb(array_agg(related.properties ->> 'invite')
              FILTER (WHERE relationship.type = 'HAS_DISCORD')), '[]'::jsonb) AS discords,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'url')
              FILTER (WHERE relationship.type = 'HAS_WEBSITE')), '[]'::jsonb) AS websites,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'url')
              FILTER (WHERE relationship.type = 'HAS_RAW_WEBSITE')), '[]'::jsonb) AS raw_websites,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'url')
              FILTER (WHERE relationship.type = 'HAS_DOCSITE')), '[]'::jsonb) AS docs,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'username')
              FILTER (WHERE relationship.type = 'HAS_TELEGRAM')), '[]'::jsonb) AS telegrams,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'login')
              FILTER (WHERE relationship.type = 'HAS_GITHUB')), '[]'::jsonb) AS githubs,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'name')
              FILTER (WHERE relationship.type = 'HAS_ORGANIZATION_ALIAS')), '[]'::jsonb) AS aliases,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'username')
              FILTER (WHERE relationship.type = 'HAS_TWITTER')), '[]'::jsonb) AS twitters,
            COALESCE(to_jsonb(array_agg(related.properties ->> 'url')
              FILTER (WHERE relationship.type = 'HAS_GRANTSITE')), '[]'::jsonb) AS grant_sites,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', related.properties -> 'id',
              'url', related.properties -> 'url',
              'type', related.properties -> 'type'
            )) FILTER (
              WHERE relationship.type = 'HAS_JOBSITE'
                AND related.label = 'Jobsite'
            ), '[]'::jsonb) AS jobsites,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', related.properties -> 'id',
              'url', related.properties -> 'url',
              'type', related.properties -> 'type'
            )) FILTER (
              WHERE relationship.type = 'HAS_JOBSITE'
                AND related.label = 'DetectedJobsite'
            ), '[]'::jsonb) AS detected_jobsites
          FROM graph_relationships relationship
          JOIN graph_nodes related ON related.id = relationship.target_id
          WHERE relationship.source_id = node.id
        ) links
        WHERE ($1::text IS NULL OR organization.organization_id = $1)
        ORDER BY organization.organization_node_id
      `,
      [organizationId ?? null],
    );
    return rows.map(row => row.payload);
  }

  async searchOrganizations(
    params: Partial<OrgListParams> & { ecosystemHeader?: string },
  ): Promise<SearchPage<OrgListResult>> {
    const where = new SqlPredicateBuilder();
    if (params.ecosystemHeader) {
      where.add(
        `${where.bind(slugify(params.ecosystemHeader))} = ANY(managed_ecosystems)`,
      );
    }
    where.addRange(
      "headcount_estimate",
      params.minHeadCount,
      params.maxHeadCount,
    );
    where.addArrayOverlap("investors", params.investors);
    where.addArrayOverlap("funding_rounds", params.fundingRounds);
    where.addArrayOverlap("ecosystems", params.ecosystems);
    where.addArrayOverlap("project_names", params.projects);
    where.addArrayOverlap("tags", params.tags);
    where.addArrayOverlap("chains", params.chains);
    where.addArrayOverlap("names", params.names);
    const locations = normalizeList(params.locations);
    if (locations?.length) {
      where.add(`location = ANY(${where.bind(locations)}::text[])`);
    }
    where.addEqual("has_projects", params.hasProjects);
    if (params.query?.trim()) {
      const queryParam = where.bind(params.query.trim());
      where.add(
        `(search_vector @@ websearch_to_tsquery('simple', ${queryParam}) OR search_text % ${queryParam})`,
      );
    }

    const sortExpressions: Record<string, string> = {
      recentFundingDate: "recent_funding_timestamp",
      recentJobDate: "recent_job_timestamp",
      headcountEstimate: "headcount_estimate",
      rating: "aggregate_rating",
      name: "name",
    };
    const sortExpression =
      sortExpressions[params.orderBy ?? "recentFundingDate"] ??
      sortExpressions.recentFundingDate;
    const direction = params.order === "asc" ? "ASC" : "DESC";
    const paging = pageValues(params.page, params.limit);
    const limitParam = where.bind(paging.limit);
    const offsetParam = where.bind(paging.offset);

    const rows = await this.postgres.query<SearchRow<OrgListResult>>(
      `
        SELECT payload, count(*) OVER () AS total_count
        FROM organization_search_documents
        ${where.toSql()}
        ORDER BY ${sortExpression} ${direction} NULLS LAST, name ASC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      where.parameters,
    );
    return toPage(rows, paging.page);
  }

  async getOrganizationById(
    id: string,
    ecosystem?: string,
  ): Promise<OrgListResult | undefined> {
    const [row] = await this.postgres.query<{ payload: OrgListResult }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM organization_search_documents
        WHERE organization_id = $1
          AND ($2::text IS NULL OR $2 = ANY(managed_ecosystems))
        ORDER BY organization_node_id
        LIMIT 1
      `,
      [id, ecosystem ? slugify(ecosystem) : null],
    );
    return row?.payload;
  }

  async getOrganizationBySlug(
    slug: string,
    ecosystem?: string,
  ): Promise<OrgListResult | undefined> {
    const [row] = await this.postgres.query<{ payload: OrgListResult }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM organization_search_documents
        WHERE slug = $1
          AND ($2::text IS NULL OR $2 = ANY(managed_ecosystems))
        ORDER BY organization_node_id
        LIMIT 1
      `,
      [slugify(slug), ecosystem ? slugify(ecosystem) : null],
    );
    return row?.payload;
  }

  async findOrganizationIdByWebsite(
    domains: string[],
  ): Promise<string | undefined> {
    const [row] = await this.postgres.query<{ organization_id: string }>(
      `
        SELECT organization.properties ->> 'orgId' AS organization_id
        FROM graph_nodes organization
        JOIN graph_relationships relationship
          ON relationship.source_id = organization.id
         AND relationship.type = 'HAS_WEBSITE'
        JOIN graph_nodes website ON website.id = relationship.target_id
        WHERE organization.label = 'Organization'
          AND EXISTS (
            SELECT 1
            FROM unnest($1::text[]) domain
            WHERE lower(website.properties ->> 'url') LIKE '%' || lower(domain) || '%'
               OR lower(domain) LIKE '%' || lower(website.properties ->> 'url') || '%'
          )
        ORDER BY organization.id
        LIMIT 1
      `,
      [domains],
    );
    return row?.organization_id;
  }

  async getOrganizationFilterValues(
    ecosystem?: string,
  ): Promise<Record<string, unknown>> {
    const parameters: unknown[] = [];
    const ecosystemSql = ecosystem
      ? "AND $1 = ANY(organization.managed_ecosystems)"
      : "";
    if (ecosystem) parameters.push(slugify(ecosystem));
    const [row] = await this.postgres.query<Record<string, unknown>>(
      `
        WITH scoped_jobs AS MATERIALIZED (
          SELECT
            job.job_node_id,
            owner.organization_id AS owner_organization_id,
            organization.headcount_estimate,
            organization.funding_rounds AS funding_round_names,
            organization.investors AS investor_names,
            organization.ecosystems,
            organization.filter_labels AS owner_filter_labels,
            job.location_types,
            job.filter_labels AS job_filter_labels
          FROM job_search_documents job
          JOIN job_search_owners owner ON owner.job_node_id = job.job_node_id
          JOIN organization_search_documents organization
            ON organization.organization_node_id = owner.organization_node_id
          WHERE job.online
          ${ecosystemSql}
        ), scoped_job_documents AS MATERIALIZED (
          SELECT DISTINCT ON (job_node_id)
            job_node_id,
            location_types,
            job_filter_labels
          FROM scoped_jobs
          ORDER BY job_node_id
        ), scoped_organizations AS MATERIALIZED (
          SELECT DISTINCT ON (owner_organization_id)
            owner_organization_id,
            headcount_estimate,
            funding_round_names,
            investor_names,
            ecosystems,
            owner_filter_labels
          FROM scoped_jobs
          ORDER BY owner_organization_id
        ), eligible_organizations AS MATERIALIZED (
          SELECT scoped.*
          FROM scoped_organizations scoped
          WHERE NOT EXISTS (
              SELECT 1
              FROM job_search_owners blocked_owner
              JOIN job_search_documents blocked_job
                ON blocked_job.job_node_id = blocked_owner.job_node_id
              WHERE blocked_owner.organization_id = scoped.owner_organization_id
                AND blocked_job.blocked
            )
        )
        SELECT
          (SELECT min(headcount_estimate) FROM scoped_organizations) AS "minHeadCount",
          (SELECT max(headcount_estimate) FROM scoped_organizations) AS "maxHeadCount",
          ${filterLabels("fundingRounds", "funding_round_names", "eligible_organizations", "eligible_organizations", "owner_filter_labels")} AS "fundingRounds",
          ${filterLabels("investors", "investor_names", "eligible_organizations", "eligible_organizations", "owner_filter_labels")} AS investors,
          ${filterLabels("ecosystems", "ecosystems", "eligible_organizations", "eligible_organizations", "owner_filter_labels")} AS ecosystems,
          ${filterLabels("locations", "location_types", "scoped_job_documents", "scoped_job_documents", "job_filter_labels")} AS locations
      `,
      parameters,
    );
    return row ?? {};
  }

  async searchProjects(
    params: Partial<ProjectListParams> & { ecosystemHeader?: string },
  ): Promise<SearchPage<ProjectListResult>> {
    const where = new SqlPredicateBuilder();
    if (params.ecosystemHeader) {
      where.add(
        `${where.bind(slugify(params.ecosystemHeader))} = ANY(managed_ecosystems)`,
      );
    }
    where.addRange("tvl", params.minTvl, params.maxTvl);
    where.addRange(
      "monthly_volume",
      params.minMonthlyVolume,
      params.maxMonthlyVolume,
    );
    where.addRange(
      "monthly_fees",
      params.minMonthlyFees,
      params.maxMonthlyFees,
    );
    where.addRange(
      "monthly_revenue",
      params.minMonthlyRevenue,
      params.maxMonthlyRevenue,
    );
    where.addEqual("has_audits", params.audits);
    where.addEqual("has_hacks", params.hacks);
    where.addEqual("has_token", params.token);
    where.addArrayOverlap("organization_names", params.organizations);
    where.addArrayOverlap("investors", params.investors);
    where.addArrayOverlap("chains", params.chains);
    where.addArrayOverlap("categories", params.categories);
    where.addArrayOverlap("ecosystems", params.ecosystems);
    where.addArrayOverlap("tags", params.tags);
    where.addArrayOverlap("names", params.names);
    if (params.query?.trim()) {
      const queryParam = where.bind(params.query.trim());
      where.add(
        `(search_vector @@ websearch_to_tsquery('simple', ${queryParam}) OR search_text % ${queryParam})`,
      );
    }

    const sortExpressions: Record<string, string> = {
      audits: "has_audits::int",
      hacks: "has_hacks::int",
      chains: "cardinality(chains)",
      tvl: "tvl",
      monthlyVolume: "monthly_volume",
      monthlyFees: "monthly_fees",
      monthlyRevenue: "monthly_revenue",
    };
    const sortExpression = params.orderBy
      ? (sortExpressions[params.orderBy] ?? "name")
      : "name";
    const direction = params.order === "desc" ? "DESC" : "ASC";
    const paging = pageValues(params.page, params.limit);
    const limitParam = where.bind(paging.limit);
    const offsetParam = where.bind(paging.offset);

    const rows = await this.postgres.query<SearchRow<ProjectListResult>>(
      `
        SELECT payload, count(*) OVER () AS total_count
        FROM project_search_documents
        ${where.toSql()}
        ORDER BY ${sortExpression} ${direction} NULLS LAST, name ASC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      where.parameters,
    );
    return toPage(rows, paging.page);
  }

  async getProjectById<T = ProjectListResult>(
    id: string,
    ecosystem?: string,
  ): Promise<T | undefined> {
    const [row] = await this.postgres.query<{ payload: T }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM project_search_documents
        WHERE project_id = $1
          AND ($2::text IS NULL OR $2 = ANY(managed_ecosystems))
        ORDER BY project_node_id
        LIMIT 1
      `,
      [id, ecosystem ? slugify(ecosystem) : null],
    );
    return row?.payload;
  }

  async getProjectBySlug<T = ProjectListResult>(
    slug: string,
    ecosystem?: string,
  ): Promise<T | undefined> {
    const [row] = await this.postgres.query<{ payload: T }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM project_search_documents
        WHERE slug = $1
          AND ($2::text IS NULL OR $2 = ANY(managed_ecosystems))
        ORDER BY project_node_id
        LIMIT 1
      `,
      [slugify(slug), ecosystem ? slugify(ecosystem) : null],
    );
    return row?.payload;
  }

  async getProjectPayloads<T = ProjectListResult>(
    options: {
      ecosystem?: string;
      organizationId?: string;
      category?: string;
    } = {},
  ): Promise<T[]> {
    const where = new SqlPredicateBuilder();
    if (options.ecosystem) {
      where.add(
        `${where.bind(slugify(options.ecosystem))} = ANY(managed_ecosystems)`,
      );
    }
    if (options.organizationId) {
      where.add(
        `${where.bind(slugify(options.organizationId))} = ANY(organization_ids)`,
      );
    }
    if (options.category) {
      where.add(`${where.bind(slugify(options.category))} = ANY(categories)`);
    }
    const rows = await this.postgres.query<{ payload: T }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM project_search_documents
        ${where.toSql()}
        ORDER BY name, project_node_id
      `,
      where.parameters,
    );
    return rows.map(row => row.payload);
  }

  async searchProjectPayloads<T = ProjectListResult>(
    query: string,
  ): Promise<T[]> {
    const normalized = query.trim();
    if (!normalized) return this.getProjectPayloads();
    const rows = await this.postgres.query<{ payload: T }>(
      `
        SELECT COALESCE(detail_payload, payload) AS payload
        FROM project_search_documents
        WHERE search_vector @@ websearch_to_tsquery('simple', $1)
           OR search_text % $1
        ORDER BY greatest(similarity(search_text, $1), 0) DESC,
                 name,
                 project_node_id
      `,
      [normalized],
    );
    return rows.map(row => row.payload);
  }

  async getProjectCompetitorPayloads<T = ProjectListResult>(
    projectId: string,
    ecosystem?: string,
  ): Promise<T[]> {
    const parameters: unknown[] = [projectId];
    const ecosystemSql = ecosystem
      ? `AND $2 = ANY(candidate.managed_ecosystems)`
      : "";
    if (ecosystem) parameters.push(slugify(ecosystem));
    const rows = await this.postgres.query<{ payload: T }>(
      `
        SELECT COALESCE(candidate.detail_payload, candidate.payload) AS payload
        FROM project_search_documents source
        JOIN project_search_documents candidate
          ON candidate.categories && source.categories
         AND candidate.project_id <> source.project_id
        WHERE source.project_id = $1
          ${ecosystemSql}
        ORDER BY candidate.name, candidate.project_node_id
      `,
      parameters,
    );
    return rows.map(row => row.payload);
  }

  async findProjectIdByWebsite(domains: string[]): Promise<string | undefined> {
    const [row] = await this.postgres.query<{ project_id: string }>(
      `
        SELECT project.properties ->> 'id' AS project_id
        FROM graph_nodes project
        JOIN graph_relationships relationship
          ON relationship.source_id = project.id
         AND relationship.type = 'HAS_WEBSITE'
        JOIN graph_nodes website ON website.id = relationship.target_id
        WHERE project.label = 'Project'
          AND EXISTS (
            SELECT 1
            FROM unnest($1::text[]) domain
            WHERE lower(website.properties ->> 'url') LIKE '%' || lower(domain) || '%'
               OR lower(domain) LIKE '%' || lower(website.properties ->> 'url') || '%'
          )
        ORDER BY project.id
        LIMIT 1
      `,
      [domains],
    );
    return row?.project_id;
  }

  async getProjectFilterValues(
    ecosystem?: string,
  ): Promise<Record<string, unknown>> {
    const parameters: unknown[] = [];
    const ecosystemSql = ecosystem
      ? "AND $1 = ANY(organization.managed_ecosystems)"
      : "";
    if (ecosystem) parameters.push(slugify(ecosystem));
    const [row] = await this.postgres.query<Record<string, unknown>>(
      `
        WITH scoped_jobs AS MATERIALIZED (
          SELECT
            job.job_node_id,
            owner.organization_id AS owner_organization_id,
            organization.name AS owner_organization_name,
            organization.investors AS owner_investor_names,
            organization.filter_labels AS owner_filter_labels
          FROM job_search_documents job
          JOIN job_search_owners owner ON owner.job_node_id = job.job_node_id
          JOIN organization_search_documents organization
            ON organization.organization_node_id = owner.organization_node_id
          WHERE job.online
          ${ecosystemSql}
        ), scoped_organizations AS MATERIALIZED (
          SELECT DISTINCT ON (owner_organization_id)
            owner_organization_id,
            owner_organization_name,
            owner_investor_names,
            owner_filter_labels
          FROM scoped_jobs
          ORDER BY owner_organization_id
        ), eligible_organizations AS MATERIALIZED (
          SELECT scoped.*
          FROM scoped_organizations scoped
          WHERE NOT EXISTS (
              SELECT 1
              FROM job_search_owners blocked_owner
              JOIN job_search_documents blocked_job
                ON blocked_job.job_node_id = blocked_owner.job_node_id
              WHERE blocked_owner.organization_id = scoped.owner_organization_id
                AND blocked_job.blocked
            )
        ), active_projects AS MATERIALIZED (
          SELECT project.*
          FROM project_search_documents project
          WHERE project.organization_ids && COALESCE((
            SELECT array_agg(DISTINCT slugify_text(owner_organization_id))
            FROM scoped_organizations
          ), ARRAY[]::text[])
        ), eligible_projects AS MATERIALIZED (
          SELECT project.*
          FROM project_search_documents project
          WHERE project.organization_ids && COALESCE((
            SELECT array_agg(DISTINCT slugify_text(owner_organization_id))
            FROM eligible_organizations
          ), ARRAY[]::text[])
        )
        SELECT
          (SELECT min(tvl)::float8 FROM eligible_projects) AS "minTvl",
          (SELECT max(tvl)::float8 FROM eligible_projects) AS "maxTvl",
          (SELECT min(monthly_volume)::float8 FROM eligible_projects) AS "minMonthlyVolume",
          (SELECT max(monthly_volume)::float8 FROM eligible_projects) AS "maxMonthlyVolume",
          (SELECT max(monthly_fees)::float8 FROM eligible_projects) AS "minMonthlyFees",
          (SELECT max(monthly_fees)::float8 FROM eligible_projects) AS "maxMonthlyFees",
          (SELECT max(monthly_revenue)::float8 FROM eligible_projects) AS "minMonthlyRevenue",
          (SELECT max(monthly_revenue)::float8 FROM eligible_projects) AS "maxMonthlyRevenue",
          ${filterLabels("organizations", "ARRAY[owner_organization_name]", "scoped_organizations", "scoped_organizations", "owner_filter_labels")} AS organizations,
          ${filterLabels("chains", "chains", "eligible_projects", "eligible_projects")} AS chains,
          ${filterLabels("ecosystems", "ecosystems", "eligible_projects", "eligible_projects")} AS ecosystems,
          ${filterLabels("categories", "categories", "active_projects", "active_projects")} AS categories,
          ${filterLabels("investors", "owner_investor_names", "eligible_organizations", "eligible_organizations", "owner_filter_labels")} AS investors
      `,
      parameters,
    );
    return row ?? {};
  }
}

const fallbackLabels = (expression: string, source: string): string => `
  COALESCE(
    (
      SELECT array_agg(DISTINCT fallback ORDER BY fallback)
      FROM ${source} fallback_doc
      CROSS JOIN LATERAL unnest(${expression}) fallback
      WHERE fallback IS NOT NULL AND fallback <> ''
    ),
    ARRAY[]::text[]
  )
`;

const filterLabels = (
  category: string,
  fallbackExpression: string,
  fallbackSource = "docs",
  labelSource = "docs",
  labelColumn = "filter_labels",
): string => `
  COALESCE(
    (
      SELECT array_agg(DISTINCT label ORDER BY label)
      FROM ${labelSource} label_doc
      CROSS JOIN LATERAL jsonb_each_text(
        COALESCE(label_doc.${labelColumn} -> '${category}', '{}'::jsonb)
      ) labels(slug, label)
    ),
    (
      SELECT array_agg(DISTINCT fallback ORDER BY fallback)
      FROM ${fallbackSource} fallback_doc
      CROSS JOIN LATERAL unnest(${fallbackExpression}) fallback
      WHERE fallback IS NOT NULL AND fallback <> ''
    ),
    ARRAY[]::text[]
  )
`;

const toPage = <T>(rows: SearchRow<T>[], page: number): SearchPage<T> => ({
  page,
  count: rows.length,
  total: Number(rows[0]?.total_count ?? 0),
  data: rows.map(row => row.payload),
});
