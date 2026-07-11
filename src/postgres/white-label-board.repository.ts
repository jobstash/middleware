import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

export type WhiteLabelBoardProperties = {
  id: string;
  name: string;
  route: string;
  domain?: string | null;
  visibility: "public" | "private";
  createdTimestamp: number;
  updatedTimestamp: number;
};

export type WhiteLabelBoardRecord = {
  nodeId: string;
  properties: WhiteLabelBoardProperties;
  sourceType: "organization" | "ecosystem";
  sourceId: string;
  ownerOrganizationId: string;
};

type BoardInput = {
  name: string;
  route: string;
  domain?: string | null;
  visibility: "public" | "private";
  sourceType: "organization" | "ecosystem";
  sourceSlug: string;
};

type MutationResult =
  | { status: "created" | "updated"; record: WhiteLabelBoardRecord }
  | { status: "conflict" | "not_found"; record?: undefined };

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
export class WhiteLabelBoardRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    organizationId: string,
    input: BoardInput,
  ): Promise<MutationResult> {
    return this.postgres.transaction(async manager => {
      const [owner] = await managerRows<{ nodeId: string }>(
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
      if (await this.routeConflicts(manager, input, undefined)) {
        return { status: "conflict" as const };
      }
      const source = await this.findSource(manager, input);
      if (!source) return { status: "not_found" as const };

      const id = randomUUID();
      const now = Date.now();
      const properties: WhiteLabelBoardProperties = {
        id,
        name: input.name,
        route: input.route,
        domain: input.domain ?? null,
        visibility: input.visibility,
        createdTimestamp: now,
        updatedTimestamp: now,
      };
      const [board] = await managerRows<{ nodeId: string }>(
        manager,
        `
          INSERT INTO graph_nodes (label, labels, node_key, properties)
          VALUES (
            'WhiteLabelBoard', ARRAY['WhiteLabelBoard']::text[], $1, $2::jsonb
          )
          RETURNING id::text AS "nodeId"
        `,
        [`runtime:${id}`, JSON.stringify(properties)],
      );
      await managerRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          ) VALUES
            ($1, $2, 'HAS_WHITE_LABEL_BOARD', '', '{}'::jsonb),
            ($2, $3, 'HAS_SOURCE', '', $4::jsonb)
        `,
        [
          owner.nodeId,
          board.nodeId,
          source.nodeId,
          JSON.stringify({ type: input.sourceType }),
        ],
      );
      return {
        status: "created" as const,
        record: {
          nodeId: board.nodeId,
          properties,
          sourceType: input.sourceType,
          sourceId: source.sourceId,
          ownerOrganizationId: organizationId,
        },
      };
    });
  }

  async find(options: {
    organizationId?: string;
    routeOrDomain?: string;
    publicOnly?: boolean;
    organizationSourcesOnly?: boolean;
  }): Promise<WhiteLabelBoardRecord[]> {
    return this.postgres.query<WhiteLabelBoardRecord>(
      `
        SELECT
          board.id::text AS "nodeId",
          board.properties,
          COALESCE(
            source_relationship.properties ->> 'type',
            CASE
              WHEN source.label = 'Organization' THEN 'organization'
              ELSE 'ecosystem'
            END
          ) AS "sourceType",
          CASE
            WHEN source.label = 'Organization'
              THEN source.properties ->> 'normalizedName'
            ELSE source.properties ->> 'id'
          END AS "sourceId",
          owner.properties ->> 'orgId' AS "ownerOrganizationId"
        FROM graph_nodes owner
        JOIN graph_relationships ownership
          ON ownership.source_id = owner.id
         AND ownership.type = 'HAS_WHITE_LABEL_BOARD'
        JOIN graph_nodes board
          ON board.id = ownership.target_id
         AND board.label = 'WhiteLabelBoard'
        JOIN graph_relationships source_relationship
          ON source_relationship.source_id = board.id
         AND source_relationship.type = 'HAS_SOURCE'
        JOIN graph_nodes source ON source.id = source_relationship.target_id
        WHERE owner.label = 'Organization'
          AND ($1::text IS NULL OR owner.properties ->> 'orgId' = $1)
          AND (
            $2::text IS NULL
            OR board.properties ->> 'route' = $2
            OR board.properties ->> 'domain' = $2
          )
          AND (
            NOT $3::boolean
            OR board.properties ->> 'visibility' = 'public'
          )
          AND (
            NOT $4::boolean
            OR COALESCE(
              source_relationship.properties ->> 'type',
              CASE WHEN source.label = 'Organization' THEN 'organization' ELSE 'ecosystem' END
            ) = 'organization'
          )
        ORDER BY board.properties ->> 'name', board.id
      `,
      [
        options.organizationId ?? null,
        options.routeOrDomain ?? null,
        options.publicOnly ?? false,
        options.organizationSourcesOnly ?? false,
      ],
    );
  }

  async update(
    organizationId: string,
    routeOrDomain: string,
    input: BoardInput,
  ): Promise<MutationResult> {
    return this.postgres.transaction(async manager => {
      const [board] = await managerRows<{ nodeId: string }>(
        manager,
        `
          SELECT board.id::text AS "nodeId"
          FROM graph_nodes owner
          JOIN graph_relationships ownership
            ON ownership.source_id = owner.id
           AND ownership.type = 'HAS_WHITE_LABEL_BOARD'
          JOIN graph_nodes board
            ON board.id = ownership.target_id
           AND board.label = 'WhiteLabelBoard'
          WHERE owner.label = 'Organization'
            AND owner.properties ->> 'orgId' = $1
            AND (
              board.properties ->> 'route' = $2
              OR board.properties ->> 'domain' = $2
            )
          FOR UPDATE OF board
        `,
        [organizationId, routeOrDomain],
      );
      if (!board) return { status: "not_found" as const };
      if (await this.routeConflicts(manager, input, board.nodeId)) {
        return { status: "conflict" as const };
      }
      const source = await this.findSource(manager, input);
      if (!source) return { status: "not_found" as const };

      const [updated] = await managerRows<{
        properties: WhiteLabelBoardProperties;
      }>(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb,
              updated_at = now()
          WHERE id = $1
          RETURNING properties
        `,
        [
          board.nodeId,
          JSON.stringify({
            name: input.name,
            route: input.route,
            domain: input.domain ?? null,
            visibility: input.visibility,
            updatedTimestamp: Date.now(),
          }),
        ],
      );
      await managerRows(
        manager,
        `
          DELETE FROM graph_relationships
          WHERE source_id = $1
            AND type = 'HAS_SOURCE'
        `,
        [board.nodeId],
      );
      await managerRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          ) VALUES ($1, $2, 'HAS_SOURCE', '', $3::jsonb)
        `,
        [
          board.nodeId,
          source.nodeId,
          JSON.stringify({ type: input.sourceType }),
        ],
      );
      return {
        status: "updated" as const,
        record: {
          nodeId: board.nodeId,
          properties: updated.properties,
          sourceType: input.sourceType,
          sourceId: source.sourceId,
          ownerOrganizationId: organizationId,
        },
      };
    });
  }

  async delete(
    organizationId: string,
    routeOrDomain: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const rows = await managerRows<{ id: string }>(
        manager,
        `
          DELETE FROM graph_nodes board
          USING graph_nodes owner, graph_relationships ownership
          WHERE owner.label = 'Organization'
            AND owner.properties ->> 'orgId' = $1
            AND ownership.source_id = owner.id
            AND ownership.target_id = board.id
            AND ownership.type = 'HAS_WHITE_LABEL_BOARD'
            AND board.label = 'WhiteLabelBoard'
            AND (
              board.properties ->> 'route' = $2
              OR board.properties ->> 'domain' = $2
            )
          RETURNING board.id::text AS id
        `,
        [organizationId, routeOrDomain],
      );
      return rows.length > 0;
    });
  }

  private async routeConflicts(
    manager: EntityManager,
    input: BoardInput,
    excludedNodeId: string | undefined,
  ): Promise<boolean> {
    const [row] = await managerRows<{ found: boolean }>(
      manager,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes board
          WHERE board.label = 'WhiteLabelBoard'
            AND ($3::bigint IS NULL OR board.id <> $3)
            AND (
              board.properties ->> 'route' = $1
              OR (
                $2::text IS NOT NULL
                AND board.properties ->> 'domain' = $2
                AND board.properties ->> 'route' = $1
              )
            )
        ) AS found
      `,
      [input.route, input.domain ?? null, excludedNodeId ?? null],
    );
    return row?.found ?? false;
  }

  private async findSource(
    manager: EntityManager,
    input: BoardInput,
  ): Promise<{ nodeId: string; sourceId: string } | undefined> {
    const label =
      input.sourceType === "organization"
        ? "Organization"
        : "OrganizationEcosystem";
    const [source] = await managerRows<{ nodeId: string; sourceId: string }>(
      manager,
      `
        SELECT
          id::text AS "nodeId",
          CASE
            WHEN label = 'Organization' THEN properties ->> 'normalizedName'
            ELSE properties ->> 'id'
          END AS "sourceId"
        FROM graph_nodes
        WHERE label = $1
          AND properties ->> 'normalizedName' = $2
        ORDER BY id
        LIMIT 1
      `,
      [label, input.sourceSlug],
    );
    return source;
  }
}
