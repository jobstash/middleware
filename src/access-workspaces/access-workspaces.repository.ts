import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { AgencyBountyOpportunities } from "./access-workspaces.dto";
import {
  aggregateKnownBountyTotals,
  groupKnownBountyTotalsByCompany,
} from "./bounty-amounts";

type Executor = PostgresService | EntityManager;

const rows = async <T>(
  executor: Executor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(sql, parameters);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : (result as T[]);
};

export interface WorkspaceAuthorization {
  workspaceId: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  entitled: boolean;
}

type DomainTransferResult =
  | { status: "not_found" | "active_source_requires_bypass" | "unchanged" }
  | { status: "transferred"; value: Record<string, unknown> };

@Injectable()
export class AccessWorkspacesRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(options: {
    ownerUserId: string;
    primaryProfileId: string;
    normalizedDomain: string;
  }): Promise<Record<string, unknown> | null> {
    return this.postgres.transaction(async manager => {
      const [profile] = await rows<{ nodeId: string }>(
        manager,
        `
          SELECT id::text AS "nodeId"
          FROM graph_nodes
          WHERE label = 'EntityProfile'
            AND properties ->> 'id' = $1
            AND NOT COALESCE(jsonb_boolean_value(properties, 'banned'), false)
          ORDER BY id LIMIT 1 FOR SHARE
        `,
        [options.primaryProfileId],
      );
      if (!profile) return null;
      const [workspace] = await rows<{ id: string }>(
        manager,
        `
          INSERT INTO access_workspaces (
            primary_profile_node_id, owner_user_id,
            normalized_registrable_domain
          ) VALUES ($1::bigint, $2, $3)
          RETURNING id::text AS id
        `,
        [profile.nodeId, options.ownerUserId, options.normalizedDomain],
      );
      await rows(
        manager,
        `
          INSERT INTO access_workspace_members (workspace_id, user_id, role)
          VALUES ($1::uuid, $2, 'owner')
        `,
        [workspace.id, options.ownerUserId],
      );
      return this.getForMember(workspace.id, options.ownerUserId, manager);
    });
  }

  async getForMember(
    workspaceId: string,
    userId: string,
    executor: Executor = this.postgres,
  ): Promise<Record<string, unknown> | null> {
    const [result] = await rows<{ value: Record<string, unknown> }>(
      executor,
      `
        SELECT jsonb_build_object(
          'id', workspace.id::text,
          'primaryProfileId', profile.properties ->> 'id',
          'ownerUserId', workspace.owner_user_id,
          'domain', workspace.normalized_registrable_domain,
          'status', workspace.status,
          'planCode', workspace.plan_code,
          'monthlyPriceCents', workspace.monthly_price_cents,
          'stripeQuantity', workspace.stripe_quantity,
          'unlimitedSeats', true,
          'entitlementEnabled', workspace.entitlement_enabled,
          'currentRole', requester.role,
          'members', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'userId', member.user_id,
              'role', member.role,
              'joinedAt', member.joined_at
            ) ORDER BY CASE member.role
              WHEN 'owner' THEN 1 WHEN 'admin' THEN 2
              WHEN 'analyst' THEN 3 ELSE 4 END, member.user_id)
            FROM access_workspace_members member
            WHERE member.workspace_id = workspace.id
          ), '[]'::jsonb)
        ) AS value
        FROM access_workspaces workspace
        JOIN graph_nodes profile
          ON profile.id = workspace.primary_profile_node_id
         AND profile.label = 'EntityProfile'
        JOIN access_workspace_members requester
          ON requester.workspace_id = workspace.id
         AND requester.user_id = $2
        WHERE workspace.id = $1::uuid
      `,
      [workspaceId, userId],
    );
    return result?.value ?? null;
  }

  async listForMember(userId: string): Promise<Record<string, unknown>[]> {
    const result = await rows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', workspace.id::text,
          'primaryProfileId', profile.properties ->> 'id',
          'domain', workspace.normalized_registrable_domain,
          'status', workspace.status,
          'planCode', workspace.plan_code,
          'monthlyPriceCents', workspace.monthly_price_cents,
          'stripeQuantity', workspace.stripe_quantity,
          'unlimitedSeats', true,
          'entitlementEnabled', workspace.entitlement_enabled,
          'currentRole', requester.role
        ) AS value
        FROM access_workspaces workspace
        JOIN graph_nodes profile
          ON profile.id = workspace.primary_profile_node_id
         AND profile.label = 'EntityProfile'
        JOIN access_workspace_members requester
          ON requester.workspace_id = workspace.id
         AND requester.user_id = $1
        ORDER BY
          (workspace.status = 'active' AND workspace.entitlement_enabled) DESC,
          workspace.normalized_registrable_domain,
          workspace.id
      `,
      [userId],
    );
    return result.map(row => row.value);
  }

  async listBountyOpportunities(
    limit: number,
    includeOffline = false,
  ): Promise<AgencyBountyOpportunities> {
    const [result] = await rows<{
      value: Omit<AgencyBountyOpportunities, "summary" | "companies"> & {
        summary: Omit<AgencyBountyOpportunities["summary"], "knownTotals">;
        companies: Omit<
          AgencyBountyOpportunities["companies"][number],
          "knownTotals"
        >[];
      };
      amountRows: { companyId: string; bountyAmount: string | null }[];
    }>(
      this.postgres,
      `
        WITH career_bounty_targets AS MATERIALIZED (
          SELECT DISTINCT ON (structured_edge.target_id)
            structured_edge.target_id AS job_node_id,
            jobsite.properties AS site_properties
          FROM graph_nodes jobsite
          JOIN graph_relationships jobsite_job
            ON jobsite_job.source_id = jobsite.id
           AND jobsite_job.type = 'HAS_JOBPOST'
          JOIN graph_nodes raw_job
            ON raw_job.id = jobsite_job.target_id
           AND raw_job.label = 'Jobpost'
          JOIN graph_relationships structured_edge
            ON structured_edge.source_id = raw_job.id
           AND structured_edge.type = 'HAS_STRUCTURED_JOBPOST'
          WHERE jobsite.label IN ('Jobsite', 'DetectedJobsite')
            AND COALESCE(
              jsonb_boolean_value(jobsite.properties, 'paysBounty'), false
            )
          ORDER BY structured_edge.target_id,
            CASE jobsite.label WHEN 'Jobsite' THEN 0 ELSE 1 END,
            jobsite.id
        ), bounty_targets AS MATERIALIZED (
          SELECT structured.id AS job_node_id,
            structured.properties AS structured_properties,
            career.site_properties
          FROM graph_nodes structured
          LEFT JOIN career_bounty_targets career
            ON career.job_node_id = structured.id
          WHERE structured.label = 'StructuredJobpost'
            AND (
              COALESCE(
                jsonb_boolean_value(structured.properties, 'paysBounty'), false
              )
              OR career.job_node_id IS NOT NULL
            )
        ), owner_by_job AS MATERIALIZED (
          SELECT DISTINCT ON (ownership.job_node_id)
            ownership.job_node_id,
            organization.organization_id,
            organization.name,
            organization.slug,
            organization.payload ->> 'logoUrl' AS logo_url
          FROM job_search_owners ownership
          JOIN organization_search_documents organization
            ON organization.organization_node_id = ownership.organization_node_id
          ORDER BY ownership.job_node_id, organization.name,
            organization.organization_node_id
        ), scoped_jobs AS MATERIALIZED (
          SELECT job.job_node_id, job.short_uuid, job.title, job.location,
            job.published_timestamp, job.online,
            jsonb_numeric_value(
              job.payload, 'lastSeenTimestamp'
            ) AS document_last_seen_timestamp,
            NULLIF(job.payload ->> 'summary', '') AS summary,
            NULLIF(job.payload ->> 'url', '') AS url,
            NULLIF(job.payload ->> 'classification', '') AS classification,
            COALESCE(
              direct_organization.organization_id, owner.organization_id,
              project.project_id, 'job:' || job.job_node_id::text
            ) AS company_id,
            CASE WHEN COALESCE(
              direct_organization.organization_id, owner.organization_id
            ) IS NOT NULL THEN 'organization' ELSE 'project' END
              AS company_type,
            COALESCE(
              direct_organization.name, owner.name, project.name, 'Unknown'
            ) AS company_name,
            COALESCE(
              direct_organization.slug, owner.slug, project.slug
            ) AS company_slug,
            COALESCE(
              direct_organization.payload ->> 'logoUrl', owner.logo_url,
              project.payload ->> 'logoUrl'
            ) AS company_logo_url
          FROM job_search_documents job
          LEFT JOIN organization_search_documents direct_organization
            ON direct_organization.organization_id = job.organization_id
          LEFT JOIN project_search_documents project
            ON project.project_id = job.project_id
          LEFT JOIN owner_by_job owner
            ON owner.job_node_id = job.job_node_id
          WHERE NOT job.blocked
            AND ($2::boolean OR job.online)
        ), bounty_jobs AS MATERIALIZED (
          SELECT scoped_jobs.*,
            COALESCE(
              raw_seen.last_seen_timestamp,
              scoped_jobs.document_last_seen_timestamp,
              scoped_jobs.published_timestamp
            ) AS last_seen_timestamp,
            CASE WHEN COALESCE(
              jsonb_boolean_value(
                target.structured_properties, 'paysBounty'
              ), false
            ) THEN NULLIF(
              target.structured_properties ->> 'bountyAmount', ''
            ) ELSE NULLIF(
              target.site_properties ->> 'bountyAmount', ''
            ) END AS bounty_amount,
            CASE WHEN COALESCE(
              jsonb_boolean_value(
                target.structured_properties, 'paysBounty'
              ), false
            ) THEN 'job_posting' ELSE 'career_page' END AS bounty_source
          FROM scoped_jobs
          JOIN bounty_targets target
            ON target.job_node_id = scoped_jobs.job_node_id
          LEFT JOIN LATERAL (
            SELECT max(jsonb_numeric_value(
              raw_job.properties, 'lastSeenTimestamp'
            )) AS last_seen_timestamp
            FROM graph_relationships raw_job_edge
            JOIN graph_nodes raw_job
              ON raw_job.id = raw_job_edge.source_id
             AND raw_job.label = 'Jobpost'
            WHERE raw_job_edge.target_id = scoped_jobs.job_node_id
              AND raw_job_edge.type = 'HAS_STRUCTURED_JOBPOST'
          ) raw_seen ON true
        ), published_counts AS (
          SELECT company_id, count(*)::int AS published_job_count
          FROM scoped_jobs
          GROUP BY company_id
        ), companies AS (
          SELECT bounty.company_id, bounty.company_type, bounty.company_name,
            bounty.company_slug, bounty.company_logo_url,
            count(*)::int AS bounty_job_count,
            published.published_job_count,
            max(bounty.published_timestamp) AS latest_published_timestamp,
            max(bounty.last_seen_timestamp) AS last_bounty_seen_timestamp
          FROM bounty_jobs bounty
          JOIN published_counts published USING (company_id)
          GROUP BY bounty.company_id, bounty.company_type,
            bounty.company_name, bounty.company_slug,
            bounty.company_logo_url, published.published_job_count
        )
        SELECT jsonb_build_object(
          'summary', jsonb_build_object(
            'openJobCount', (SELECT count(*)::int FROM bounty_jobs),
            'bountyJobCount', (SELECT count(*)::int FROM bounty_jobs),
            'publishedJobCount', (
              SELECT COALESCE(sum(published_job_count), 0)::int
              FROM companies
            ),
            'companyCount', (SELECT count(*)::int FROM companies),
            'disclosedAmountCount', (SELECT count(*)::int FROM bounty_jobs
              WHERE bounty_amount IS NOT NULL)
          ),
          'companies', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', company_id,
              'type', company_type,
              'name', company_name,
              'slug', company_slug,
              'logoUrl', company_logo_url,
              'openBountyJobCount', bounty_job_count,
              'bountyJobCount', bounty_job_count,
              'publishedJobCount', published_job_count,
              'latestPublishedTimestamp', latest_published_timestamp,
              'lastBountySeenTimestamp', last_bounty_seen_timestamp
            ) ORDER BY bounty_job_count DESC,
              last_bounty_seen_timestamp DESC NULLS LAST, company_name)
            FROM companies
          ), '[]'::jsonb),
          'jobs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'shortUUID', latest.short_uuid,
              'title', latest.title,
              'summary', latest.summary,
              'url', latest.url,
              'location', latest.location,
              'classification', latest.classification,
              'publishedTimestamp', latest.published_timestamp,
              'lastSeenTimestamp', latest.last_seen_timestamp,
              'online', latest.online,
              'bountyAmount', latest.bounty_amount,
              'bountySource', latest.bounty_source,
              'companyId', latest.company_id,
              'companyType', latest.company_type,
              'companyName', latest.company_name,
              'companySlug', latest.company_slug,
              'companyLogoUrl', latest.company_logo_url
            ) ORDER BY latest.published_timestamp DESC NULLS LAST,
              latest.job_node_id DESC)
            FROM (
              SELECT * FROM bounty_jobs
              ORDER BY published_timestamp DESC NULLS LAST, job_node_id DESC
              LIMIT $1::int
            ) latest
          ), '[]'::jsonb)
        ) AS value,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'companyId', company_id,
            'bountyAmount', bounty_amount
          ) ORDER BY company_id, job_node_id)
          FROM bounty_jobs
          WHERE bounty_amount IS NOT NULL
        ), '[]'::jsonb) AS "amountRows"
      `,
      [limit, includeOffline],
    );
    if (!result?.value) {
      return {
        summary: {
          openJobCount: 0,
          bountyJobCount: 0,
          publishedJobCount: 0,
          companyCount: 0,
          disclosedAmountCount: 0,
          knownTotals: [],
        },
        companies: [],
        jobs: [],
      };
    }
    const amountRows = result.amountRows ?? [];
    const companyTotals = groupKnownBountyTotalsByCompany(amountRows);
    return {
      ...result.value,
      summary: {
        ...result.value.summary,
        knownTotals: aggregateKnownBountyTotals(amountRows),
      },
      companies: result.value.companies.map(company => ({
        ...company,
        knownTotals: companyTotals.get(company.id) ?? [],
      })),
    };
  }

  async authorize(
    workspaceId: string,
    userId: string,
    executor: Executor = this.postgres,
  ): Promise<WorkspaceAuthorization | null> {
    const [authorization] = await rows<WorkspaceAuthorization>(
      executor,
      `
        SELECT workspace.id::text AS "workspaceId", member.role,
          (workspace.status = 'active'
            AND workspace.entitlement_enabled) AS entitled
        FROM access_workspaces workspace
        JOIN access_workspace_members member
          ON member.workspace_id = workspace.id
        WHERE workspace.id = $1::uuid AND member.user_id = $2
      `,
      [workspaceId, userId],
    );
    return authorization ?? null;
  }

  async transferDomain(options: {
    targetWorkspaceId: string;
    actorUserId: string;
    normalizedDomain: string;
    reason: string;
    superadminBypass: boolean;
  }): Promise<DomainTransferResult> {
    return this.postgres.transaction(async manager => {
      const [target] = await rows<{
        id: string;
        domain: string;
        status: string;
      }>(
        manager,
        `
          SELECT id::text AS id,
            normalized_registrable_domain AS domain, status
          FROM access_workspaces
          WHERE id = $1::uuid
          FOR UPDATE
        `,
        [options.targetWorkspaceId],
      );
      if (!target) return { status: "not_found" };
      if (target.domain === options.normalizedDomain) {
        return { status: "unchanged" };
      }
      const [source] = await rows<{
        id: string;
        domain: string;
        status: string;
      }>(
        manager,
        `
          SELECT id::text AS id,
            normalized_registrable_domain AS domain, status
          FROM access_workspaces
          WHERE normalized_registrable_domain = $1
          FOR UPDATE
        `,
        [options.normalizedDomain],
      );
      if (
        source?.status === "active" &&
        source.id !== target.id &&
        !options.superadminBypass
      ) {
        return { status: "active_source_requires_bypass" };
      }

      const beforeSnapshot = {
        requestedDomain: options.normalizedDomain,
        target: { id: target.id, domain: target.domain, status: target.status },
        source: source
          ? { id: source.id, domain: source.domain, status: source.status }
          : null,
      };
      if (source && source.id !== target.id) {
        await rows(
          manager,
          `
            UPDATE access_workspaces
            SET normalized_registrable_domain = $2, updated_at = now()
            WHERE id = $1::uuid
          `,
          [source.id, `transfer-${source.id}.invalid`],
        );
      }
      await rows(
        manager,
        `
          UPDATE access_workspaces
          SET normalized_registrable_domain = $2, updated_at = now()
          WHERE id = $1::uuid
        `,
        [target.id, options.normalizedDomain],
      );
      if (source && source.id !== target.id) {
        await rows(
          manager,
          `
            UPDATE access_workspaces
            SET normalized_registrable_domain = $2, updated_at = now()
            WHERE id = $1::uuid
          `,
          [source.id, target.domain],
        );
      }
      const afterSnapshot = {
        requestedDomain: options.normalizedDomain,
        target: {
          id: target.id,
          domain: options.normalizedDomain,
          status: target.status,
        },
        source: source
          ? { id: source.id, domain: target.domain, status: source.status }
          : null,
      };
      const [audit] = await rows<{ value: Record<string, unknown> }>(
        manager,
        `
          INSERT INTO access_workspace_domain_transfers (
            normalized_registrable_domain, from_workspace_id,
            to_workspace_id, actor_user_id, superadmin_bypass, reason,
            before_snapshot, after_snapshot
          ) VALUES ($1, $2::uuid, $3::uuid, $4, $5::boolean, $6,
            $7::jsonb, $8::jsonb)
          RETURNING jsonb_build_object(
            'id', id::text,
            'domain', normalized_registrable_domain,
            'fromWorkspaceId', from_workspace_id::text,
            'toWorkspaceId', to_workspace_id::text,
            'superadminBypass', superadmin_bypass,
            'reason', reason,
            'before', before_snapshot,
            'after', after_snapshot,
            'createdAt', created_at
          ) AS value
        `,
        [
          options.normalizedDomain,
          source?.id ?? null,
          target.id,
          options.actorUserId,
          options.superadminBypass,
          options.reason,
          JSON.stringify(beforeSnapshot),
          JSON.stringify(afterSnapshot),
        ],
      );
      return { status: "transferred", value: audit.value };
    });
  }

  async putMember(options: {
    workspaceId: string;
    actorUserId: string;
    userId: string;
    role: "admin" | "analyst" | "viewer";
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const authorization = await this.authorize(
        options.workspaceId,
        options.actorUserId,
        manager,
      );
      if (!authorization || !["owner", "admin"].includes(authorization.role)) {
        return false;
      }
      const changed = await rows(
        manager,
        `
          INSERT INTO access_workspace_members (
            workspace_id, user_id, role, invited_by
          ) VALUES ($1::uuid, $2, $3, $4)
          ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
          WHERE access_workspace_members.role <> 'owner'
          RETURNING user_id
        `,
        [
          options.workspaceId,
          options.userId,
          options.role,
          options.actorUserId,
        ],
      );
      return changed.length === 1;
    });
  }

  async removeMember(options: {
    workspaceId: string;
    actorUserId: string;
    userId: string;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const authorization = await this.authorize(
        options.workspaceId,
        options.actorUserId,
        manager,
      );
      if (!authorization || !["owner", "admin"].includes(authorization.role)) {
        return false;
      }
      const deleted = await rows(
        manager,
        `
          DELETE FROM access_workspace_members
          WHERE workspace_id = $1::uuid AND user_id = $2 AND role <> 'owner'
          RETURNING user_id
        `,
        [options.workspaceId, options.userId],
      );
      return deleted.length === 1;
    });
  }

  async inspectProfile(options: {
    workspaceId: string;
    actorUserId: string;
    slug: string;
    revealedFields?: string[];
  }): Promise<{
    authorization: WorkspaceAuthorization | null;
    profileNodeId?: string;
    payload?: Record<string, unknown>;
    recentRevealCount?: number;
  }> {
    return this.postgres.transaction(async manager => {
      const authorization = await this.authorize(
        options.workspaceId,
        options.actorUserId,
        manager,
      );
      if (!authorization?.entitled) return { authorization };
      if (options.revealedFields?.length && authorization.role === "viewer") {
        return { authorization };
      }
      const [profile] = await rows<{
        profileNodeId: string;
        payload: Record<string, unknown>;
      }>(
        manager,
        `
          SELECT profile.id::text AS "profileNodeId",
            jsonb_build_object(
              'id', profile.properties ->> 'id',
              'slug', profile.properties ->> 'slug',
              'category', profile.properties ->> 'category',
              'info', info.properties,
              'children', COALESCE((
                SELECT jsonb_agg(child.properties || jsonb_build_object(
                  'type', lower(child.label)
                ) ORDER BY child.label, child.id)
                FROM graph_relationships membership
                JOIN graph_nodes child ON child.id = membership.target_id
                WHERE membership.source_id = profile.id
                  AND membership.type IN (
                    'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
                  )
                  AND child.label IN ('Organization', 'Project')
              ), '[]'::jsonb)
            ) AS payload
          FROM graph_nodes profile
          JOIN graph_relationships info_edge
            ON info_edge.source_id = profile.id
           AND info_edge.type = 'HAS_PROFILE_INFO'
          JOIN graph_nodes info
            ON info.id = info_edge.target_id AND info.label = 'ProfileInfo'
          WHERE profile.label = 'EntityProfile'
            AND profile.properties ->> 'slug' = $1
            AND NOT COALESCE(
              jsonb_boolean_value(profile.properties, 'banned'), false
            )
          LIMIT 1
        `,
        [options.slug],
      );
      if (!profile) return { authorization };

      const action = options.revealedFields?.length ? "reveal" : "inspect";
      let recentRevealCount = 0;
      if (action === "reveal") {
        const [count] = await rows<{ count: string }>(
          manager,
          `
            SELECT count(*)::text AS count
            FROM inspect_audits
            WHERE workspace_id = $1::uuid AND actor_user_id = $2
              AND action = 'reveal'
              AND created_at >= now() - interval '1 hour'
          `,
          [options.workspaceId, options.actorUserId],
        );
        recentRevealCount = Number(count?.count ?? 0);
      }
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            workspaceId: options.workspaceId,
            actorUserId: options.actorUserId,
            profileNodeId: profile.profileNodeId,
            action,
            fields: [...(options.revealedFields ?? [])].sort((left, right) =>
              left.localeCompare(right),
            ),
          }),
        )
        .digest("hex");
      await rows(
        manager,
        `
          INSERT INTO inspect_audits (
            workspace_id, actor_user_id, profile_node_id, action,
            revealed_fields, request_fingerprint
          ) VALUES ($1::uuid, $2, $3::bigint, $4, $5::text[], $6)
        `,
        [
          options.workspaceId,
          options.actorUserId,
          profile.profileNodeId,
          action,
          options.revealedFields ?? [],
          fingerprint,
        ],
      );
      return { ...profile, authorization, recentRevealCount };
    });
  }
}
