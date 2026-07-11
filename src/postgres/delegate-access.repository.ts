import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DelegateAccessRequest } from "src/shared/interfaces/org";
import { PostgresService } from "./postgres.service";

@Injectable()
export class DelegateAccessRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getStatus(
    fromOrganizationId: string,
    toOrganizationId: string,
  ): Promise<"accepted" | "pending" | "revoked" | undefined> {
    const [row] = await this.postgres.query<{ status: string }>(
      `
        SELECT relationship.properties ->> 'status' AS status
        FROM graph_nodes source
        JOIN graph_relationships relationship
          ON relationship.source_id = source.id
         AND relationship.type = 'HAS_DELEGATE_ACCESS'
        JOIN graph_nodes target ON target.id = relationship.target_id
        WHERE source.label = 'Organization'
          AND source.properties ->> 'orgId' = $1
          AND target.label = 'Organization'
          AND target.properties ->> 'orgId' = $2
        LIMIT 1
      `,
      [fromOrganizationId, toOrganizationId],
    );
    return row?.status as "accepted" | "pending" | "revoked" | undefined;
  }

  async getRequests(organizationId: string): Promise<DelegateAccessRequest[]> {
    const rows = await this.postgres.query<{ request: DelegateAccessRequest }>(
      `
        SELECT relationship.properties || jsonb_build_object(
          'requestor', COALESCE((
            SELECT verification.properties ->> 'account'
            FROM graph_nodes user_node
            JOIN graph_relationships verification
              ON verification.source_id = user_node.id
             AND verification.target_id = source.id
             AND verification.type = 'VERIFIED_FOR_ORG'
            WHERE user_node.label = 'User'
              AND user_node.properties ->> 'wallet' = relationship.properties ->> 'requestorAddress'
              AND verification.properties ->> 'credential' = 'email'
            ORDER BY verification.id
            LIMIT 1
          ), relationship.properties ->> 'requestorAddress'),
          'grantor', COALESCE((
            SELECT verification.properties ->> 'account'
            FROM graph_nodes user_node
            JOIN graph_relationships verification
              ON verification.source_id = user_node.id
             AND verification.target_id = target.id
             AND verification.type = 'VERIFIED_FOR_ORG'
            WHERE user_node.label = 'User'
              AND user_node.properties ->> 'wallet' = relationship.properties ->> 'grantorAddress'
              AND verification.properties ->> 'credential' = 'email'
            ORDER BY verification.id
            LIMIT 1
          ), relationship.properties ->> 'grantorAddress'),
          'revoker', COALESCE((
            SELECT verification.properties ->> 'account'
            FROM graph_nodes user_node
            JOIN graph_relationships verification
              ON verification.source_id = user_node.id
             AND verification.target_id = target.id
             AND verification.type = 'VERIFIED_FOR_ORG'
            WHERE user_node.label = 'User'
              AND user_node.properties ->> 'wallet' = relationship.properties ->> 'revokerAddress'
              AND verification.properties ->> 'credential' = 'email'
            ORDER BY verification.id
            LIMIT 1
          ), relationship.properties ->> 'revokerAddress'),
          'fromOrgId', source.properties ->> 'orgId',
          'fromOrgName', source.properties ->> 'name',
          'fromOrgLogo', COALESCE(
            source.properties ->> 'logoUrl',
            graph_first_related_text(source.id, 'HAS_WEBSITE', 'url')
          ),
          'toOrgId', target.properties ->> 'orgId',
          'toOrgName', target.properties ->> 'name',
          'toOrgLogo', COALESCE(
            target.properties ->> 'logoUrl',
            graph_first_related_text(target.id, 'HAS_WEBSITE', 'url')
          )
        ) AS request
        FROM graph_nodes source
        JOIN graph_relationships relationship
          ON relationship.source_id = source.id
         AND relationship.type = 'HAS_DELEGATE_ACCESS'
        JOIN graph_nodes target
          ON target.id = relationship.target_id
         AND target.label = 'Organization'
        WHERE source.label = 'Organization'
          AND (
            source.properties ->> 'orgId' = $1
            OR target.properties ->> 'orgId' = $1
          )
        ORDER BY NULLIF(
          relationship.properties ->> 'createdTimestamp',
          ''
        )::numeric DESC NULLS LAST
      `,
      [organizationId],
    );
    return rows.map(row => row.request);
  }

  async organizationExists(organizationId: string): Promise<boolean> {
    const [row] = await this.postgres.query<{ found: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes
          WHERE label = 'Organization'
            AND properties ->> 'orgId' = $1
        ) AS found
      `,
      [organizationId],
    );
    return row?.found ?? false;
  }

  async request(options: {
    fromOrganizationId: string;
    toOrganizationId: string;
    requestorAddress: string;
    authToken: string;
    expiryDurationMs: number;
  }): Promise<boolean> {
    const now = Date.now();
    const rows = await this.postgres.query<{ id: string }>(
      `
        WITH organizations AS (
          SELECT
            max(id) FILTER (WHERE properties ->> 'orgId' = $1) AS source_id,
            max(id) FILTER (WHERE properties ->> 'orgId' = $2) AS target_id
          FROM graph_nodes
          WHERE label = 'Organization'
            AND properties ->> 'orgId' IN ($1, $2)
        )
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT
          source_id,
          target_id,
          'HAS_DELEGATE_ACCESS',
          '',
          $3::jsonb
        FROM organizations
        WHERE source_id IS NOT NULL AND target_id IS NOT NULL
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = EXCLUDED.properties,
          updated_at = now()
        RETURNING id::text AS id
      `,
      [
        options.fromOrganizationId,
        options.toOrganizationId,
        JSON.stringify({
          id: randomUUID(),
          createdTimestamp: now,
          expiryTimestamp: now + options.expiryDurationMs,
          requestorAddress: options.requestorAddress,
          status: "pending",
          authToken: options.authToken,
        }),
      ],
    );
    return this.normalizeRows(rows).length > 0;
  }

  async accept(options: {
    fromOrganizationId: string;
    toOrganizationId: string;
    grantorAddress: string;
    authToken: string;
  }): Promise<boolean> {
    return this.updateStatus(
      options.fromOrganizationId,
      options.toOrganizationId,
      `
        AND relationship.properties ->> 'status' = 'pending'
        AND relationship.properties ->> 'authToken' = $3
        AND NULLIF(relationship.properties ->> 'expiryTimestamp', '')::numeric > $4
      `,
      [options.authToken, Date.now()],
      {
        status: "accepted",
        grantorAddress: options.grantorAddress,
        updatedTimestamp: Date.now(),
      },
      ["authToken"],
    );
  }

  async revoke(options: {
    fromOrganizationId: string;
    toOrganizationId: string;
    actorAddress: string;
  }): Promise<boolean> {
    return this.updateStatus(
      options.fromOrganizationId,
      options.toOrganizationId,
      "AND relationship.properties ->> 'status' = 'accepted'",
      [],
      {
        status: "revoked",
        revokerAddress: options.actorAddress,
        updatedTimestamp: Date.now(),
      },
    );
  }

  private async updateStatus(
    fromOrganizationId: string,
    toOrganizationId: string,
    extraPredicate: string,
    extraParameters: unknown[],
    patch: Record<string, unknown>,
    removeProperties: string[] = [],
  ): Promise<boolean> {
    const removeParameter = 3 + extraParameters.length;
    const patchParameter = removeParameter + 1;
    const rows = await this.postgres.query<{ id: string }>(
      `
        UPDATE graph_relationships relationship
        SET properties = (
              relationship.properties - $${removeParameter}::text[]
            ) || $${patchParameter}::jsonb,
            updated_at = now()
        FROM graph_nodes source, graph_nodes target
        WHERE relationship.source_id = source.id
          AND relationship.target_id = target.id
          AND relationship.type = 'HAS_DELEGATE_ACCESS'
          AND source.label = 'Organization'
          AND source.properties ->> 'orgId' = $1
          AND target.label = 'Organization'
          AND target.properties ->> 'orgId' = $2
          ${extraPredicate}
        RETURNING relationship.id::text AS id
      `,
      [
        fromOrganizationId,
        toOrganizationId,
        ...extraParameters,
        removeProperties,
        JSON.stringify(patch),
      ],
    );
    return this.normalizeRows(rows).length > 0;
  }

  private normalizeRows<T>(rows: T[]): T[] {
    return Array.isArray(rows) && Array.isArray(rows[0])
      ? (rows[0] as T[])
      : rows;
  }
}
