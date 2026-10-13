import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import {
  AlertClaim,
  AlertFollow,
  AlertJob,
  AlertOrganization,
} from "./agency-alerts.types";

const rows = async <T>(
  executor: PostgresService | EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  // Normalize the compatible TypeORM and repository generic overloads.
  const query = executor.query as (
    sql: string,
    parameters?: unknown[],
  ) => Promise<unknown>;
  const result = await query.call(executor, sql, parameters);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : (result as T[]);
};

// UserEmail is the existing verified-email label; UserUnverifiedEmail never qualifies.
const recipientJoin = `
  JOIN graph_nodes account ON account.id = follow.user_node_id AND account.label = 'User'
  JOIN LATERAL (
    SELECT email.* FROM graph_relationships contact
    JOIN graph_nodes email ON email.id = contact.target_id AND email.label = 'UserEmail'
    WHERE contact.source_id = account.id AND contact.type = 'HAS_EMAIL'
      AND NULLIF(email.properties ->> 'email', '') IS NOT NULL
    ORDER BY COALESCE(jsonb_boolean_value(email.properties, 'main'), false) DESC, email.id LIMIT 1
  ) email ON email.id = follow.email_node_id AND email.properties ->> 'email' = follow.recipient_email
  JOIN access_workspaces workspace ON workspace.id = follow.workspace_id
    AND workspace.alerts_enabled AND workspace.plan_code = 'agency'
  JOIN graph_nodes profile ON profile.id = workspace.primary_profile_node_id AND profile.label = 'EntityProfile'
    AND NOT COALESCE(jsonb_boolean_value(profile.properties, 'banned'), false)
  JOIN access_workspace_members member ON member.workspace_id = workspace.id
    AND member.user_id = follow.user_id
  WHERE lower(account.properties ->> 'wallet') = lower(follow.user_id)
`;

@Injectable()
export class AgencyAlertsRepository {
  constructor(private readonly postgres: PostgresService) {}

  async recipient(userId: string): Promise<{
    userNodeId: string;
    emailNodeId: string;
    email: string;
  } | null> {
    const [recipient] = await rows<{
      userNodeId: string;
      emailNodeId: string;
      email: string;
    }>(
      this.postgres,
      `
      SELECT account.id::text AS "userNodeId", email.id::text AS "emailNodeId",
        email.properties ->> 'email' AS email
      FROM graph_nodes account
      JOIN graph_relationships contact ON contact.source_id = account.id AND contact.type = 'HAS_EMAIL'
      JOIN graph_nodes email ON email.id = contact.target_id AND email.label = 'UserEmail'
      WHERE account.label = 'User' AND lower(account.properties ->> 'wallet') = lower($1)
        AND NULLIF(email.properties ->> 'email', '') IS NOT NULL
      ORDER BY COALESCE(jsonb_boolean_value(email.properties, 'main'), false) DESC, email.id
      LIMIT 1
    `,
      [userId],
    );
    return recipient ?? null;
  }

  follows(workspaceId: string, userId: string): Promise<AlertFollow[]> {
    return rows(
      this.postgres,
      `
      SELECT follow.organization_id AS "organizationId",
        COALESCE(organization.name, follow.organization_name) AS name,
        organization.slug, organization.payload ->> 'logoUrl' AS "logoUrl",
        follow.created_at::text AS "followedAt",
        NOT EXISTS (SELECT 1 FROM (
          SELECT email.id, email.properties ->> 'email' AS address
          FROM graph_nodes email JOIN graph_relationships contact ON contact.target_id = email.id
          WHERE contact.source_id = follow.user_node_id AND contact.type = 'HAS_EMAIL'
            AND email.label = 'UserEmail' AND NULLIF(email.properties ->> 'email', '') IS NOT NULL
          ORDER BY COALESCE(jsonb_boolean_value(email.properties, 'main'), false) DESC, email.id LIMIT 1
        ) selected WHERE selected.id = follow.email_node_id AND selected.address = follow.recipient_email)
        AS "deliveryPaused"
      FROM agency_alert_follows follow
      LEFT JOIN organization_search_documents organization ON organization.organization_id = follow.organization_id
      WHERE follow.workspace_id = $1::uuid AND follow.user_id = $2
      ORDER BY follow.created_at, follow.id
    `,
      [workspaceId, userId],
    );
  }

  search(
    workspaceId: string,
    userId: string,
    query: string,
  ): Promise<(AlertOrganization & { following: boolean })[]> {
    return rows(
      this.postgres,
      `
      SELECT organization.organization_id AS "organizationId", organization.name,
        organization.slug, organization.payload ->> 'logoUrl' AS "logoUrl",
        EXISTS (SELECT 1 FROM agency_alert_follows follow WHERE follow.workspace_id = $1::uuid
          AND follow.user_id = $2 AND follow.organization_id = organization.organization_id) AS following
      FROM organization_search_documents organization
      WHERE NOT COALESCE(jsonb_boolean_value(organization.payload, 'blocked'), false)
        AND NOT COALESCE(jsonb_boolean_value(organization.payload, 'banned'), false)
        AND ($3 = '' OR organization.name ILIKE '%' || $3 || '%' ESCAPE '\\')
      ORDER BY organization.name, organization.organization_id LIMIT 25
    `,
      [workspaceId, userId, query.replace(/[\\%_]/g, "\\$&")],
    );
  }

  async follow(
    workspaceId: string,
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    // Identity, whitelist and verified recipient are checked again in the write statement.
    const result = await rows(
      this.postgres,
      `
      INSERT INTO agency_alert_follows
        (id, workspace_id, user_id, user_node_id, email_node_id, recipient_email, organization_id, organization_name)
      SELECT $4::uuid, workspace.id, member.user_id, account.id, email.id,
        email.properties ->> 'email', organization.organization_id, organization.name
      FROM access_workspaces workspace
      JOIN graph_nodes profile ON profile.id = workspace.primary_profile_node_id AND profile.label = 'EntityProfile'
        AND NOT COALESCE(jsonb_boolean_value(profile.properties, 'banned'), false)
      JOIN access_workspace_members member ON member.workspace_id = workspace.id AND member.user_id = $2
      JOIN graph_nodes account ON account.label = 'User' AND lower(account.properties ->> 'wallet') = lower(member.user_id)
      JOIN LATERAL (
        SELECT email.* FROM graph_relationships contact
        JOIN graph_nodes email ON email.id = contact.target_id AND email.label = 'UserEmail'
        WHERE contact.source_id = account.id AND contact.type = 'HAS_EMAIL'
          AND NULLIF(email.properties ->> 'email', '') IS NOT NULL
        ORDER BY COALESCE(jsonb_boolean_value(email.properties, 'main'), false) DESC, email.id LIMIT 1
      ) email ON true
      JOIN organization_search_documents organization ON organization.organization_id = $3
        AND NOT COALESCE(jsonb_boolean_value(organization.payload, 'blocked'), false)
        AND NOT COALESCE(jsonb_boolean_value(organization.payload, 'banned'), false)
      WHERE workspace.id = $1::uuid AND workspace.alerts_enabled
        AND workspace.plan_code = 'agency'
      ON CONFLICT (workspace_id, user_id, organization_id) DO UPDATE SET organization_name = EXCLUDED.organization_name
      RETURNING id
    `,
      [workspaceId, userId, organizationId, randomUUID()],
    );
    return result.length > 0;
  }

  async unfollow(
    workspaceId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await rows(
      this.postgres,
      `DELETE FROM agency_alert_follows
      WHERE workspace_id = $1::uuid AND user_id = $2 AND ($3::text IS NULL OR organization_id = $3)
    `,
      [workspaceId, userId, organizationId ?? null],
    );
  }

  async claim(): Promise<AlertClaim | null> {
    return this.postgres.transaction(async manager => {
      const [follow] = await rows<{
        id: string;
        workspaceId: string;
        userId: string;
        recipientEmail: string;
        organizationName: string;
      }>(
        manager,
        `
        SELECT follow.id::text, follow.workspace_id::text AS "workspaceId", follow.user_id AS "userId",
          follow.recipient_email AS "recipientEmail", follow.organization_name AS "organizationName"
        FROM agency_alert_follows follow ${recipientJoin}
          AND EXISTS (SELECT 1 FROM agency_alert_publications publication
            WHERE publication.organization_id = follow.organization_id AND publication.observed_at > follow.created_at
              AND publication.observed_at <= statement_timestamp()
              AND NOT EXISTS (SELECT 1 FROM agency_alert_delivery_jobs delivered
                WHERE delivered.follow_id = follow.id AND delivered.short_uuid = publication.short_uuid))
        ORDER BY follow.last_attempt_at NULLS FIRST, follow.created_at, follow.id
        LIMIT 1 FOR UPDATE OF follow SKIP LOCKED
      `,
      );
      if (!follow) return null;
      const publications = await rows<{ shortUUID: string }>(
        manager,
        `
        SELECT publication.short_uuid AS "shortUUID"
        FROM agency_alert_publications publication JOIN agency_alert_follows follow ON follow.id = $1::uuid
        WHERE publication.organization_id = follow.organization_id AND publication.observed_at > follow.created_at
          AND publication.observed_at <= statement_timestamp()
          AND NOT EXISTS (SELECT 1 FROM agency_alert_delivery_jobs delivered
            WHERE delivered.follow_id = follow.id AND delivered.short_uuid = publication.short_uuid)
        ORDER BY publication.observed_at, publication.short_uuid LIMIT 50
      `,
        [follow.id],
      );
      const id = randomUUID();
      await rows(
        manager,
        `INSERT INTO agency_alert_deliveries (id, follow_id, status)
        VALUES ($1::uuid, $2::uuid, 'claimed')`,
        [id, follow.id],
      );
      await rows(
        manager,
        `INSERT INTO agency_alert_delivery_jobs (follow_id, short_uuid, delivery_id)
        SELECT $1::uuid, unnest($2::text[]), $3::uuid ON CONFLICT DO NOTHING`,
        [follow.id, publications.map(job => job.shortUUID), id],
      );
      await rows(
        manager,
        `UPDATE agency_alert_follows SET last_attempt_at = clock_timestamp() WHERE id = $1::uuid`,
        [follow.id],
      );
      return { ...follow, id, followId: follow.id };
    });
  }

  async prepare(claim: AlertClaim): Promise<AlertJob[] | null> {
    // A committed claim is never automatically retried, including process death or an ambiguous provider timeout.
    const jobs = await rows<AlertJob>(
      this.postgres,
      `
      SELECT DISTINCT job.short_uuid AS "shortUUID", job.title, job.location
      FROM agency_alert_delivery_jobs delivered
      JOIN job_search_documents job ON job.short_uuid = delivered.short_uuid
      JOIN agency_alert_follows follow ON follow.id = delivered.follow_id
      ${recipientJoin}
        AND delivered.delivery_id = $1::uuid AND follow.id = $2::uuid AND follow.recipient_email = $3
        AND job.online AND NOT job.blocked
        AND job.legacy_list_eligible AND job.access = 'public' AND NOT job.organization_has_expert_jobs
        AND job.organization_id = follow.organization_id AND job.project_id IS NULL AND cardinality(job.tags) > 0
        AND (job.published_timestamp IS NULL OR job.published_timestamp <= extract(epoch FROM statement_timestamp()) * 1000)
      ORDER BY job.title, job.short_uuid
    `,
      [claim.id, claim.followId, claim.recipientEmail],
    );
    return jobs.length ? jobs : null;
  }

  async finish(
    id: string,
    status: "accepted" | "skipped" | "failed_unknown",
  ): Promise<void> {
    await rows(
      this.postgres,
      `UPDATE agency_alert_deliveries SET status = $2, finished_at = clock_timestamp()
      WHERE id = $1::uuid AND status = 'claimed'`,
      [id, status],
    );
  }
}
