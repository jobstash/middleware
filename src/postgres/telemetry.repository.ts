import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type DashboardJobStatsRow = {
  active: string;
  inactive: string;
  expert: string;
  promoted: string;
  applicationsThisMonth: string;
  totalApplications: string;
  totalJobCount: string;
};

const managerRows = async <T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await manager.query(sql, parameters);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : (result as T[]);
};

@Injectable()
export class TelemetryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async logUserLoginEvent(walletOrPrivyId: string): Promise<void> {
    await this.postgres.transaction(async manager => {
      const [user] = await managerRows<{ nodeId: string }>(
        manager,
        `
          SELECT id::text AS "nodeId"
          FROM graph_nodes
          WHERE label = 'User'
            AND (
              properties ->> 'wallet' = $1
              OR properties ->> 'privyId' = $1
            )
          ORDER BY id
          LIMIT 1
          FOR UPDATE
        `,
        [walletOrPrivyId],
      );
      if (!user) return;
      const properties = {
        id: randomUUID(),
        createdTimestamp: Date.now(),
      };
      const [history] = await managerRows<{ nodeId: string }>(
        manager,
        `
          SELECT history.id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes history
            ON history.id = relationship.target_id
           AND history.label = 'LoginHistory'
          WHERE relationship.source_id = $1
            AND relationship.type = 'LOGGED_IN'
          ORDER BY history.id
          LIMIT 1
          FOR UPDATE OF history
        `,
        [user.nodeId],
      );
      if (history) {
        await managerRows(
          manager,
          `
            UPDATE graph_nodes
            SET properties = $2::jsonb,
                updated_at = now()
            WHERE id = $1
          `,
          [history.nodeId, JSON.stringify(properties)],
        );
        return;
      }
      const [created] = await managerRows<{ nodeId: string }>(
        manager,
        `
          INSERT INTO graph_nodes (label, labels, node_key, properties)
          VALUES ('LoginHistory', ARRAY['LoginHistory']::text[], $1, $2::jsonb)
          RETURNING id::text AS "nodeId"
        `,
        [`runtime:${properties.id}`, JSON.stringify(properties)],
      );
      await managerRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          ) VALUES ($1, $2, 'LOGGED_IN', '', '{}'::jsonb)
        `,
        [user.nodeId, created.nodeId],
      );
    });
  }

  async getJobEventCount(options: {
    organizationId: string;
    shortUuid?: string | null;
    relationshipType: "VIEWED_DETAILS" | "APPLIED_TO";
    epochStart?: number | null;
    epochEnd?: number | null;
  }): Promise<number> {
    const [row] = await this.postgres.query<{ count: string }>(
      `
        SELECT count(DISTINCT event.id)::text AS count
        FROM job_search_documents job
        JOIN graph_relationships event
          ON event.target_id = job.job_node_id
         AND event.type = $3
        WHERE job.organization_id = $1
          AND ($2::text IS NULL OR job.short_uuid = $2)
          AND (
            $4::bigint IS NULL
            OR NULLIF(event.properties ->> 'createdTimestamp', '')::numeric >= $4
          )
          AND (
            $5::bigint IS NULL
            OR NULLIF(event.properties ->> 'createdTimestamp', '')::numeric <= $5
          )
      `,
      [
        options.organizationId,
        options.shortUuid ?? null,
        options.relationshipType,
        options.epochStart ?? null,
        options.epochEnd ?? null,
      ],
    );
    return Number(row?.count ?? 0);
  }

  async getDashboardJobStats(options: {
    type: "ecosystem" | "organization";
    id: string;
    applicationEpochStart: number;
  }): Promise<{
    jobCounts: {
      active: number;
      inactive: number;
      expert: number;
      promoted: number;
    };
    applicationsThisMonth: number;
    totalApplications: number;
    totalJobCount: number;
  }> {
    const [row] = await this.postgres.query<DashboardJobStatsRow>(
      `
        WITH jobs AS MATERIALIZED (
          SELECT *
          FROM job_search_documents job
          WHERE CASE
            WHEN $1 = 'ecosystem' THEN $2 = ANY(job.managed_ecosystems)
            ELSE job.organization_id = $2
          END
        ), applications AS MATERIALIZED (
          SELECT
            count(*) AS total,
            count(*) FILTER (
              WHERE NULLIF(
                application.properties ->> 'createdTimestamp',
                ''
              )::numeric >= $3
            ) AS recent
          FROM graph_relationships application
          JOIN jobs ON jobs.job_node_id = application.target_id
          WHERE application.type = 'APPLIED_TO'
        )
        SELECT
          count(*) FILTER (WHERE jobs.online)::text AS active,
          count(*) FILTER (WHERE NOT jobs.online)::text AS inactive,
          count(*) FILTER (
            WHERE jobs.online AND jobs.access = 'protected'
          )::text AS expert,
          count(*) FILTER (
            WHERE jobs.online AND jobs.featured
          )::text AS promoted,
          applications.recent::text AS "applicationsThisMonth",
          applications.total::text AS "totalApplications",
          count(*)::text AS "totalJobCount"
        FROM jobs
        CROSS JOIN applications
        GROUP BY applications.recent, applications.total
      `,
      [options.type, options.id, options.applicationEpochStart],
    );
    return {
      jobCounts: {
        active: Number(row?.active ?? 0),
        inactive: Number(row?.inactive ?? 0),
        expert: Number(row?.expert ?? 0),
        promoted: Number(row?.promoted ?? 0),
      },
      applicationsThisMonth: Number(row?.applicationsThisMonth ?? 0),
      totalApplications: Number(row?.totalApplications ?? 0),
      totalJobCount: Number(row?.totalJobCount ?? 0),
    };
  }

  async getDashboardJobStatsSeries(options: {
    type: "ecosystem" | "organization";
    id: string;
  }): Promise<
    { organization: string; stats: { month: string; count: number }[] }[]
  > {
    const rows = await this.postgres.query<{
      organization: string;
      stats: Array<{ month: string; count: number | string }>;
    }>(
      `
        WITH organizations AS MATERIALIZED (
          SELECT organization_id, name
          FROM organization_search_documents
          WHERE CASE
            WHEN $1 = 'ecosystem' THEN $2 = ANY(managed_ecosystems)
            ELSE organization_id = $2
          END
        ), months AS MATERIALIZED (
          SELECT
            index,
            date_trunc('month', current_timestamp)
              - (index * interval '1 month') AS month_end,
            date_trunc('month', current_timestamp)
              - ((index + 1) * interval '1 month') AS month_start
          FROM generate_series(0, 12) AS index
        ), counts AS (
          SELECT
            organization.organization_id,
            organization.name,
            month.index,
            to_char(month.month_end, 'FMMonth') AS month,
            count(DISTINCT job.job_node_id)::integer AS count
          FROM organizations organization
          CROSS JOIN months month
          LEFT JOIN job_search_documents job
            ON job.organization_id = organization.organization_id
           AND job.published_timestamp >= extract(epoch FROM month.month_start) * 1000
           AND job.published_timestamp < extract(epoch FROM month.month_end) * 1000
          GROUP BY
            organization.organization_id,
            organization.name,
            month.index,
            month.month_end
        )
        SELECT
          name AS organization,
          jsonb_agg(
            jsonb_build_object('month', month, 'count', count)
            ORDER BY index
          ) AS stats
        FROM counts
        GROUP BY organization_id, name
        ORDER BY name
      `,
      [options.type, options.id],
    );
    return rows.map(row => ({
      organization: row.organization,
      stats: row.stats.map(item => ({
        month: item.month,
        count: Number(item.count),
      })),
    }));
  }

  async getDashboardTalentStats(
    epochStart: number,
    topN: number,
  ): Promise<{
    topJobCategories: { label: string; count: number }[];
    totalAvailableTalent: number;
    newTalentThisWeek: number;
    recentApplication: number | null;
  }> {
    const [row] = await this.postgres.query<{
      topJobCategories: Array<{ label: string; count: number | string }>;
      totalAvailableTalent: string;
      newTalentThisWeek: string;
      recentApplication: string | null;
    }>(
      `
        WITH talent AS MATERIALIZED (
          SELECT properties
          FROM graph_nodes
          WHERE label = 'User'
            AND COALESCE((properties ->> 'available')::boolean, false)
        ), categories AS MATERIALIZED (
          SELECT
            COALESCE(NULLIF(job.payload ->> 'classification', ''), 'Unclassified') AS label,
            count(application.id)::integer AS count,
            max(NULLIF(
              application.properties ->> 'createdTimestamp',
              ''
            )::numeric)::bigint AS recent_application
          FROM graph_relationships application
          JOIN graph_nodes applicant
            ON applicant.id = application.source_id
           AND applicant.label = 'User'
           AND COALESCE((applicant.properties ->> 'available')::boolean, false)
          JOIN job_search_documents job
            ON job.job_node_id = application.target_id
           AND job.organization_id IS NOT NULL
          WHERE application.type = 'APPLIED_TO'
          GROUP BY COALESCE(
            NULLIF(job.payload ->> 'classification', ''),
            'Unclassified'
          )
        )
        SELECT
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('label', label, 'count', count)
              ORDER BY count DESC, label
            )
            FROM (
              SELECT label, count
              FROM categories
              ORDER BY count DESC, label
              LIMIT $2
            ) ranked
          ), '[]'::jsonb) AS "topJobCategories",
          (SELECT count(*)::text FROM talent) AS "totalAvailableTalent",
          (SELECT count(*)::text FROM talent
            WHERE NULLIF(properties ->> 'createdTimestamp', '')::numeric >= $1
          ) AS "newTalentThisWeek",
          (SELECT max(recent_application)::text FROM categories)
            AS "recentApplication"
      `,
      [epochStart, topN],
    );
    return {
      topJobCategories: (row?.topJobCategories ?? []).map(category => ({
        label: category.label,
        count: Number(category.count),
      })),
      totalAvailableTalent: Number(row?.totalAvailableTalent ?? 0),
      newTalentThisWeek: Number(row?.newTalentThisWeek ?? 0),
      recentApplication:
        row?.recentApplication === null || row?.recentApplication === undefined
          ? null
          : Number(row.recentApplication),
    };
  }
}
