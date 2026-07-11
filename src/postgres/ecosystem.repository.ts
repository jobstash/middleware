import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { slugify } from "src/shared/helpers";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

export type EcosystemProperties = {
  id: string;
  name: string;
  normalizedName: string;
  createdTimestamp: number;
  updatedTimestamp?: number;
};

export type EcosystemRecord = {
  nodeId: string;
  properties: EcosystemProperties;
  memberPayloads: Record<string, unknown>[];
};

export type StoredFilterProperties = {
  id: string;
  name: string;
  filter: string;
  public: boolean;
  createdTimestamp: number;
  updatedTimestamp?: number;
};

type MutationResult<T> =
  | { status: "created" | "updated"; value: T }
  | { status: "conflict" | "not_found"; value?: undefined };

const queryRows = async <T>(
  executor: QueryExecutor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(sql, parameters);
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }
  return result as T[];
};

@Injectable()
export class EcosystemRepository {
  constructor(private readonly postgres: PostgresService) {}

  async createEcosystem(
    organizationId: string,
    name: string,
  ): Promise<MutationResult<EcosystemProperties>> {
    return this.postgres.transaction(async manager => {
      const [owner] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT id::text AS "nodeId"
          FROM graph_nodes
          WHERE label = 'Organization'
            AND properties ->> 'orgId' = $1
          FOR UPDATE
        `,
        [organizationId],
      );
      if (!owner) return { status: "not_found" as const };

      const normalizedName = slugify(name);
      const [duplicate] = await queryRows<{ found: boolean }>(
        manager,
        `
          SELECT true AS found
          FROM graph_relationships ownership
          JOIN graph_nodes ecosystem ON ecosystem.id = ownership.target_id
          WHERE ownership.source_id = $1
            AND ownership.type = 'OWNS_ECOSYSTEM'
            AND ecosystem.label = 'OrganizationEcosystem'
            AND ecosystem.properties ->> 'normalizedName' = $2
          LIMIT 1
        `,
        [owner.nodeId, normalizedName],
      );
      if (duplicate) return { status: "conflict" as const };

      const now = Date.now();
      const properties: EcosystemProperties = {
        id: randomUUID(),
        name,
        normalizedName,
        createdTimestamp: now,
      };
      const [ecosystem] = await queryRows<{ nodeId: string }>(
        manager,
        `
          INSERT INTO graph_nodes (label, labels, node_key, properties)
          VALUES (
            'OrganizationEcosystem',
            ARRAY['OrganizationEcosystem']::text[],
            $1,
            $2::jsonb
          )
          RETURNING id::text AS "nodeId"
        `,
        [`runtime:${properties.id}`, JSON.stringify(properties)],
      );
      await queryRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          ) VALUES ($1, $2, 'OWNS_ECOSYSTEM', '', '{}'::jsonb)
        `,
        [owner.nodeId, ecosystem.nodeId],
      );
      return { status: "created" as const, value: properties };
    });
  }

  async findOwnedEcosystems(
    organizationId: string,
    idOrSlug?: string,
  ): Promise<EcosystemRecord[]> {
    return queryRows<EcosystemRecord>(
      this.postgres,
      `
        SELECT
          ecosystem.id::text AS "nodeId",
          ecosystem.properties,
          COALESCE(
            jsonb_agg(member_document.payload ORDER BY member_document.name)
              FILTER (WHERE member_document.organization_node_id IS NOT NULL),
            '[]'::jsonb
          ) AS "memberPayloads"
        FROM graph_nodes owner
        JOIN graph_relationships ownership
          ON ownership.source_id = owner.id
         AND ownership.type = 'OWNS_ECOSYSTEM'
        JOIN graph_nodes ecosystem
          ON ecosystem.id = ownership.target_id
         AND ecosystem.label = 'OrganizationEcosystem'
        LEFT JOIN graph_relationships membership
          ON membership.target_id = ecosystem.id
         AND membership.type = 'IS_MEMBER_OF_ECOSYSTEM'
        LEFT JOIN organization_search_documents member_document
          ON member_document.organization_node_id = membership.source_id
        WHERE owner.label = 'Organization'
          AND owner.properties ->> 'orgId' = $1
          AND (
            $2::text IS NULL
            OR ecosystem.properties ->> 'id' = $2
            OR ecosystem.properties ->> 'normalizedName' = $2
          )
        GROUP BY ecosystem.id, ecosystem.properties
        ORDER BY ecosystem.properties ->> 'name', ecosystem.id
      `,
      [organizationId, idOrSlug ?? null],
    );
  }

  async findOwnerOrganizationId(idOrSlug: string): Promise<string | undefined> {
    const [row] = await queryRows<{ organizationId: string }>(
      this.postgres,
      `
        SELECT owner.properties ->> 'orgId' AS "organizationId"
        FROM graph_nodes ecosystem
        JOIN graph_relationships ownership
          ON ownership.target_id = ecosystem.id
         AND ownership.type = 'OWNS_ECOSYSTEM'
        JOIN graph_nodes owner
          ON owner.id = ownership.source_id
         AND owner.label = 'Organization'
        WHERE ecosystem.label = 'OrganizationEcosystem'
          AND (
            ecosystem.properties ->> 'id' = $1
            OR ecosystem.properties ->> 'normalizedName' = $1
          )
        ORDER BY owner.id
        LIMIT 1
      `,
      [idOrSlug],
    );
    return row?.organizationId;
  }

  async updateEcosystem(
    organizationId: string,
    idOrSlug: string,
    name: string | undefined,
  ): Promise<MutationResult<EcosystemProperties>> {
    return this.postgres.transaction(async manager => {
      const ecosystem = await this.findOwnedEcosystemForUpdate(
        manager,
        organizationId,
        idOrSlug,
      );
      if (!ecosystem) return { status: "not_found" as const };
      if (!name) {
        return { status: "updated" as const, value: ecosystem.properties };
      }

      const normalizedName = slugify(name);
      const [duplicate] = await queryRows<{ found: boolean }>(
        manager,
        `
          SELECT true AS found
          FROM graph_relationships ownership
          JOIN graph_nodes candidate ON candidate.id = ownership.target_id
          WHERE ownership.source_id = $1
            AND ownership.type = 'OWNS_ECOSYSTEM'
            AND candidate.label = 'OrganizationEcosystem'
            AND candidate.id <> $2
            AND candidate.properties ->> 'normalizedName' = $3
          LIMIT 1
        `,
        [ecosystem.ownerNodeId, ecosystem.nodeId, normalizedName],
      );
      if (duplicate) return { status: "conflict" as const };

      const [updated] = await queryRows<{ properties: EcosystemProperties }>(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb,
              updated_at = now()
          WHERE id = $1
          RETURNING properties
        `,
        [
          ecosystem.nodeId,
          JSON.stringify({
            name,
            normalizedName,
            updatedTimestamp: Date.now(),
          }),
        ],
      );
      const memberIds = await this.findMemberNodeIds(manager, ecosystem.nodeId);
      await this.refreshEcosystemDocuments(manager, memberIds);
      return { status: "updated" as const, value: updated.properties };
    });
  }

  async deleteEcosystem(
    organizationId: string,
    idOrSlug: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const ecosystem = await this.findOwnedEcosystemForUpdate(
        manager,
        organizationId,
        idOrSlug,
      );
      if (!ecosystem) return false;
      const memberIds = await this.findMemberNodeIds(manager, ecosystem.nodeId);
      await queryRows(manager, "DELETE FROM graph_nodes WHERE id = $1", [
        ecosystem.nodeId,
      ]);
      await this.refreshEcosystemDocuments(manager, memberIds);
      return true;
    });
  }

  async replaceMemberOrganizations(
    organizationId: string,
    idOrSlug: string,
    organizationIds: string[],
  ): Promise<EcosystemRecord | undefined> {
    const found = await this.postgres.transaction(async manager => {
      const ecosystem = await this.findOwnedEcosystemForUpdate(
        manager,
        organizationId,
        idOrSlug,
      );
      if (!ecosystem) return false;

      const oldMemberIds = await this.findMemberNodeIds(
        manager,
        ecosystem.nodeId,
      );
      const requested = [...new Set(organizationIds)];
      const members = requested.length
        ? await queryRows<{ nodeId: string }>(
            manager,
            `
              SELECT id::text AS "nodeId"
              FROM graph_nodes
              WHERE label = 'Organization'
                AND properties ->> 'orgId' = ANY($1::text[])
              ORDER BY id
            `,
            [requested],
          )
        : [];
      await queryRows(
        manager,
        `
          DELETE FROM graph_relationships
          WHERE target_id = $1
            AND type = 'IS_MEMBER_OF_ECOSYSTEM'
        `,
        [ecosystem.nodeId],
      );
      if (members.length) {
        await queryRows(
          manager,
          `
            INSERT INTO graph_relationships (
              source_id, target_id, type, relationship_key, properties
            )
            SELECT member_id, $1, 'IS_MEMBER_OF_ECOSYSTEM', '', '{}'::jsonb
            FROM unnest($2::bigint[]) AS member_id
            ON CONFLICT (source_id, target_id, type, relationship_key) DO NOTHING
          `,
          [ecosystem.nodeId, members.map(member => member.nodeId)],
        );
      }
      await this.refreshEcosystemDocuments(manager, [
        ...new Set([...oldMemberIds, ...members.map(member => member.nodeId)]),
      ]);
      return true;
    });
    if (!found) return undefined;
    return (await this.findOwnedEcosystems(organizationId, idOrSlug))[0];
  }

  async createStoredFilter(
    organizationId: string,
    wallet: string,
    input: { name: string; filter: string; public: boolean },
  ): Promise<StoredFilterProperties | undefined> {
    return this.postgres.transaction(async manager => {
      const [identity] = await queryRows<{
        organizationNodeId: string;
        userNodeId: string;
      }>(
        manager,
        `
          SELECT
            organization.id::text AS "organizationNodeId",
            user_node.id::text AS "userNodeId"
          FROM graph_nodes organization
          CROSS JOIN graph_nodes user_node
          WHERE organization.label = 'Organization'
            AND organization.properties ->> 'orgId' = $1
            AND user_node.label = 'User'
            AND lower(user_node.properties ->> 'wallet') = lower($2)
          FOR UPDATE OF organization, user_node
        `,
        [organizationId, wallet],
      );
      if (!identity) return undefined;

      const [existing] = await queryRows<{
        properties: StoredFilterProperties;
      }>(
        manager,
        `
          SELECT filter_node.properties
          FROM graph_relationships organization_filter
          JOIN graph_nodes filter_node
            ON filter_node.id = organization_filter.target_id
           AND filter_node.label = 'StoredFilter'
          JOIN graph_relationships creator_filter
            ON creator_filter.target_id = filter_node.id
           AND creator_filter.type = 'CREATED_STORED_FILTER'
           AND creator_filter.source_id = $2
          WHERE organization_filter.source_id = $1
            AND organization_filter.type = 'HAS_STORED_FILTER'
            AND filter_node.properties ->> 'filter' = $3
          LIMIT 1
        `,
        [identity.organizationNodeId, identity.userNodeId, input.filter],
      );
      if (existing) return existing.properties;

      const properties: StoredFilterProperties = {
        id: randomUUID(),
        ...input,
        createdTimestamp: Date.now(),
      };
      const [filterNode] = await queryRows<{ nodeId: string }>(
        manager,
        `
          INSERT INTO graph_nodes (label, labels, node_key, properties)
          VALUES ('StoredFilter', ARRAY['StoredFilter']::text[], $1, $2::jsonb)
          RETURNING id::text AS "nodeId"
        `,
        [`runtime:${properties.id}`, JSON.stringify(properties)],
      );
      await queryRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          ) VALUES
            ($1, $3, 'HAS_STORED_FILTER', '', '{}'::jsonb),
            ($2, $3, 'CREATED_STORED_FILTER', '', '{}'::jsonb)
        `,
        [identity.organizationNodeId, identity.userNodeId, filterNode.nodeId],
      );
      return properties;
    });
  }

  async findStoredFilters(
    organizationId: string,
    wallet: string,
    id?: string,
  ): Promise<StoredFilterProperties[]> {
    const rows = await queryRows<{ properties: StoredFilterProperties }>(
      this.postgres,
      `
        SELECT filter_node.properties
        FROM graph_nodes organization
        JOIN graph_relationships organization_filter
          ON organization_filter.source_id = organization.id
         AND organization_filter.type = 'HAS_STORED_FILTER'
        JOIN graph_nodes filter_node
          ON filter_node.id = organization_filter.target_id
         AND filter_node.label = 'StoredFilter'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND ($3::text IS NULL OR filter_node.properties ->> 'id' = $3)
          AND (
            COALESCE((filter_node.properties ->> 'public')::boolean, false)
            OR EXISTS (
              SELECT 1
              FROM graph_relationships creator_filter
              JOIN graph_nodes user_node
                ON user_node.id = creator_filter.source_id
               AND user_node.label = 'User'
              WHERE creator_filter.target_id = filter_node.id
                AND creator_filter.type = 'CREATED_STORED_FILTER'
                AND lower(user_node.properties ->> 'wallet') = lower($2)
            )
          )
        ORDER BY filter_node.properties ->> 'name', filter_node.id
      `,
      [organizationId, wallet, id ?? null],
    );
    return rows.map(row => row.properties);
  }

  async updateStoredFilter(
    organizationId: string,
    wallet: string,
    id: string,
    patch: Partial<Pick<StoredFilterProperties, "name" | "filter" | "public">>,
  ): Promise<StoredFilterProperties | undefined> {
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const [row] = await queryRows<{ properties: StoredFilterProperties }>(
      this.postgres,
      `
        UPDATE graph_nodes filter_node
        SET properties = filter_node.properties || $4::jsonb,
            updated_at = now()
        FROM graph_nodes organization,
             graph_relationships organization_filter,
             graph_relationships creator_filter,
             graph_nodes user_node
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND organization_filter.source_id = organization.id
          AND organization_filter.target_id = filter_node.id
          AND organization_filter.type = 'HAS_STORED_FILTER'
          AND filter_node.label = 'StoredFilter'
          AND filter_node.properties ->> 'id' = $3
          AND creator_filter.target_id = filter_node.id
          AND creator_filter.source_id = user_node.id
          AND creator_filter.type = 'CREATED_STORED_FILTER'
          AND user_node.label = 'User'
          AND lower(user_node.properties ->> 'wallet') = lower($2)
        RETURNING filter_node.properties
      `,
      [
        organizationId,
        wallet,
        id,
        JSON.stringify({ ...cleanPatch, updatedTimestamp: Date.now() }),
      ],
    );
    return row?.properties;
  }

  async deleteStoredFilter(
    organizationId: string,
    wallet: string,
    id: string,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        DELETE FROM graph_nodes filter_node
        USING graph_nodes organization,
              graph_relationships organization_filter,
              graph_relationships creator_filter,
              graph_nodes user_node
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND organization_filter.source_id = organization.id
          AND organization_filter.target_id = filter_node.id
          AND organization_filter.type = 'HAS_STORED_FILTER'
          AND filter_node.label = 'StoredFilter'
          AND filter_node.properties ->> 'id' = $3
          AND creator_filter.target_id = filter_node.id
          AND creator_filter.source_id = user_node.id
          AND creator_filter.type = 'CREATED_STORED_FILTER'
          AND user_node.label = 'User'
          AND lower(user_node.properties ->> 'wallet') = lower($2)
        RETURNING filter_node.id::text AS id
      `,
      [organizationId, wallet, id],
    );
    return rows.length > 0;
  }

  private async findOwnedEcosystemForUpdate(
    manager: EntityManager,
    organizationId: string,
    idOrSlug: string,
  ): Promise<
    | {
        nodeId: string;
        ownerNodeId: string;
        properties: EcosystemProperties;
      }
    | undefined
  > {
    const [row] = await queryRows<{
      nodeId: string;
      ownerNodeId: string;
      properties: EcosystemProperties;
    }>(
      manager,
      `
        SELECT
          ecosystem.id::text AS "nodeId",
          owner.id::text AS "ownerNodeId",
          ecosystem.properties
        FROM graph_nodes owner
        JOIN graph_relationships ownership
          ON ownership.source_id = owner.id
         AND ownership.type = 'OWNS_ECOSYSTEM'
        JOIN graph_nodes ecosystem
          ON ecosystem.id = ownership.target_id
         AND ecosystem.label = 'OrganizationEcosystem'
        WHERE owner.label = 'Organization'
          AND owner.properties ->> 'orgId' = $1
          AND (
            ecosystem.properties ->> 'id' = $2
            OR ecosystem.properties ->> 'normalizedName' = $2
          )
        FOR UPDATE OF owner, ecosystem
      `,
      [organizationId, idOrSlug],
    );
    return row;
  }

  private async findMemberNodeIds(
    executor: QueryExecutor,
    ecosystemNodeId: string,
  ): Promise<string[]> {
    const rows = await queryRows<{ nodeId: string }>(
      executor,
      `
        SELECT source_id::text AS "nodeId"
        FROM graph_relationships
        WHERE target_id = $1
          AND type = 'IS_MEMBER_OF_ECOSYSTEM'
        ORDER BY source_id
      `,
      [ecosystemNodeId],
    );
    return rows.map(row => row.nodeId);
  }

  private async refreshEcosystemDocuments(
    executor: QueryExecutor,
    organizationNodeIds: string[],
  ): Promise<void> {
    if (!organizationNodeIds.length) return;
    await queryRows(
      executor,
      "SELECT refresh_organization_ecosystem_documents($1::bigint[])",
      [organizationNodeIds],
    );
  }
}
