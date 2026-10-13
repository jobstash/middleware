import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import { AccessWorkspacesService } from "./access-workspaces.service";

export interface AlertPartnerWorkspace {
  id: string;
  primaryProfileId: string;
  profileName: string;
  domain: string;
  ownerUserId: string;
  status: string;
  alertsEnabled: boolean;
  whitelistUpdatedAt: string | null;
  whitelistUpdatedBy: string | null;
  members: { userId: string; role: string }[];
}

@Injectable()
export class AgencyAlertsAdminService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly workspaces: AccessWorkspacesService,
  ) {}

  async list(
    workspaceId?: string,
  ): Promise<{ workspaces: AlertPartnerWorkspace[] }> {
    const workspaces = await this.postgres.query<
      AlertPartnerWorkspace & Record<string, unknown>
    >(
      `
      SELECT workspace.id::text, profile.properties ->> 'id' AS "primaryProfileId",
        COALESCE(profile.properties ->> 'name', profile.properties ->> 'slug', profile.properties ->> 'id') AS "profileName",
        workspace.normalized_registrable_domain AS domain, workspace.owner_user_id AS "ownerUserId",
        workspace.status, workspace.alerts_enabled AS "alertsEnabled",
        workspace.alerts_whitelist_updated_at::text AS "whitelistUpdatedAt",
        workspace.alerts_whitelist_updated_by AS "whitelistUpdatedBy",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', member.user_id, 'role', member.role)
          ORDER BY member.user_id) FROM access_workspace_members member WHERE member.workspace_id = workspace.id), '[]'::jsonb) AS members
      FROM access_workspaces workspace JOIN graph_nodes profile ON profile.id = workspace.primary_profile_node_id
      WHERE workspace.plan_code = 'agency' AND ($1::uuid IS NULL OR workspace.id = $1::uuid)
      ORDER BY workspace.created_at DESC, workspace.id LIMIT 200
    `,
      [workspaceId ?? null],
    );
    return { workspaces };
  }

  private async existingUser(userId: string): Promise<string> {
    const [user] = await this.postgres.query<{ wallet: string }>(
      `
      SELECT properties ->> 'wallet' AS wallet FROM graph_nodes
      WHERE label = 'User' AND lower(properties ->> 'wallet') = lower($1)
      ORDER BY id LIMIT 1
    `,
      [userId],
    );
    if (!user)
      throw new BadRequestException(
        "An existing JobStash account wallet is required; email addresses are not accepted",
      );
    return user.wallet;
  }

  async provision(
    actorUserId: string,
    input: { primaryProfileId: string; ownerUserId: string; domain: string },
  ): Promise<AlertPartnerWorkspace> {
    const ownerUserId = await this.existingUser(input.ownerUserId);
    const [existing] = await this.postgres.query<{
      id: string;
      ownerUserId: string;
      domain: string;
    }>(
      `
      SELECT workspace.id::text, workspace.owner_user_id AS "ownerUserId", workspace.normalized_registrable_domain AS domain
      FROM access_workspaces workspace JOIN graph_nodes profile ON profile.id = workspace.primary_profile_node_id
      WHERE profile.label = 'EntityProfile' AND profile.properties ->> 'id' = $1
        AND NOT COALESCE(jsonb_boolean_value(profile.properties, 'banned'), false)
    `,
      [input.primaryProfileId],
    );
    if (existing) {
      if (
        existing.ownerUserId !== ownerUserId ||
        existing.domain !== input.domain.trim().toLowerCase()
      ) {
        throw new ConflictException(
          "This profile already belongs to a different workspace owner or domain; manage that workspace instead",
        );
      }
      return this.approve(existing.id, actorUserId, true);
    }
    // Reuse existing domain normalization, collision rules and owner membership creation.
    // Workspace creation defaults to no paid entitlement; approving Alert never changes billing.
    const workspace = await this.workspaces.create(
      ownerUserId,
      input.primaryProfileId,
      input.domain,
    );
    if (typeof workspace.id !== "string")
      throw new Error("Workspace creation did not return an id");
    return this.approve(workspace.id, actorUserId, true);
  }

  async approve(
    workspaceId: string,
    actorUserId: string,
    enabled: boolean,
  ): Promise<AlertPartnerWorkspace> {
    const updated = await this.postgres.query(
      `
      WITH changed AS (
        UPDATE access_workspaces workspace SET alerts_enabled = $3,
          alerts_whitelist_updated_by = $2, alerts_whitelist_updated_at = clock_timestamp(), updated_at = now()
        FROM graph_nodes profile WHERE workspace.id = $1::uuid AND workspace.plan_code = 'agency'
          AND profile.id = workspace.primary_profile_node_id AND profile.label = 'EntityProfile'
          AND (NOT $3 OR NOT COALESCE(jsonb_boolean_value(profile.properties, 'banned'), false))
        RETURNING workspace.id
      ) SELECT id::text FROM changed
    `,
      [workspaceId, actorUserId, enabled],
    );
    if (!updated.length)
      throw new NotFoundException(
        "Agency workspace and available profile required for approval",
      );
    return (await this.list(workspaceId)).workspaces[0];
  }

  async putMember(
    workspaceId: string,
    actorUserId: string,
    userId: string,
    role: "admin" | "analyst" | "viewer",
  ): Promise<AlertPartnerWorkspace> {
    const wallet = await this.existingUser(userId);
    const updated = await this.postgres.query(
      `
      WITH changed AS (
        INSERT INTO access_workspace_members (workspace_id, user_id, role, invited_by)
        SELECT workspace.id, $2, $3, $4 FROM access_workspaces workspace
        WHERE workspace.id = $1::uuid AND workspace.plan_code = 'agency' AND workspace.owner_user_id <> $2
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by
          WHERE access_workspace_members.role <> 'owner'
        RETURNING workspace_id
      ) SELECT workspace_id FROM changed
    `,
      [workspaceId, wallet, role, actorUserId],
    );
    if (!updated.length)
      throw new BadRequestException(
        "Workspace not found or owner membership cannot be changed here",
      );
    return (await this.list(workspaceId)).workspaces[0];
  }

  async removeMember(
    workspaceId: string,
    userId: string,
  ): Promise<AlertPartnerWorkspace> {
    const [workspace] = (await this.list(workspaceId)).workspaces;
    if (!workspace) throw new NotFoundException("Workspace not found");
    const wallet = await this.existingUser(userId);
    if (workspace.ownerUserId === wallet)
      throw new BadRequestException("The workspace owner cannot be removed");
    await this.postgres.query(
      `DELETE FROM access_workspace_members WHERE workspace_id = $1::uuid AND user_id = $2 AND role <> 'owner'`,
      [workspaceId, wallet],
    );
    return (await this.list(workspaceId)).workspaces[0];
  }
}
