import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";

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
        WHERE workspace.id = $1::uuid
          AND EXISTS (
            SELECT 1 FROM access_workspace_members member
            WHERE member.workspace_id = workspace.id AND member.user_id = $2
          )
      `,
      [workspaceId, userId],
    );
    return result?.value ?? null;
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
            fields: [...(options.revealedFields ?? [])].sort(),
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
