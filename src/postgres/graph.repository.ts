import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

export type GraphNodeRecord<T extends object> = {
  nodeId: string;
  properties: T;
};

type QueryExecutor = PostgresService | EntityManager;

const executeQuery = async <T>(
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
export class GraphRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findNode<T extends object>(
    label: string,
    where: Partial<T>,
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNodeRecord<T> | undefined> {
    const [node] = await this.findNodes<T>(label, where, 1, executor);
    return node;
  }

  async findNodes<T extends object>(
    label: string,
    where: Partial<T> = {},
    limit?: number,
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNodeRecord<T>[]> {
    const parameters: unknown[] = [label, JSON.stringify(where)];
    const limitSql = limit === undefined ? "" : `LIMIT $3`;
    if (limit !== undefined) parameters.push(limit);
    return executeQuery<GraphNodeRecord<T>>(
      executor,
      `
        SELECT id::text AS "nodeId", properties
        FROM graph_nodes
        WHERE label = $1
          AND properties @> $2::jsonb
        ORDER BY id
        ${limitSql}
      `,
      parameters,
    );
  }

  async findRelatedNodes<T extends object>(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    relationshipType: string;
    targetLabel?: string;
    targetWhere?: Record<string, unknown>;
    direction?: "outgoing" | "incoming";
    executor?: QueryExecutor;
  }): Promise<GraphNodeRecord<T>[]> {
    const direction = options.direction ?? "outgoing";
    const sourceColumn = direction === "outgoing" ? "source_id" : "target_id";
    const targetColumn = direction === "outgoing" ? "target_id" : "source_id";
    return executeQuery<GraphNodeRecord<T>>(
      options.executor ?? this.postgres,
      `
        SELECT target.id::text AS "nodeId", target.properties
        FROM graph_nodes source
        JOIN graph_relationships relationship
          ON relationship.${sourceColumn} = source.id
         AND relationship.type = $3
        JOIN graph_nodes target ON target.id = relationship.${targetColumn}
        WHERE source.label = $1
          AND source.properties @> $2::jsonb
          AND ($4::text IS NULL OR target.label = $4)
          AND target.properties @> $5::jsonb
        ORDER BY relationship.id, target.id
      `,
      [
        options.sourceLabel,
        JSON.stringify(options.sourceWhere),
        options.relationshipType,
        options.targetLabel ?? null,
        JSON.stringify(options.targetWhere ?? {}),
      ],
    );
  }

  async updateNodesFromPatches<T extends object>(options: {
    label: string;
    identityProperty: string;
    patches: Array<{ identity: string; patch: Partial<T> }>;
    executor?: QueryExecutor;
  }): Promise<GraphNodeRecord<T>[]> {
    if (!options.patches.length) return [];
    return executeQuery<GraphNodeRecord<T>>(
      options.executor ?? this.postgres,
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($3::jsonb) AS row(
            identity text,
            patch jsonb
          )
        )
        UPDATE graph_nodes node
        SET properties = node.properties || incoming.patch,
            updated_at = now()
        FROM incoming
        WHERE node.label = $1
          AND node.properties ->> $2 = incoming.identity
        RETURNING node.id::text AS "nodeId", node.properties
      `,
      [
        options.label,
        options.identityProperty,
        JSON.stringify(options.patches),
      ],
    );
  }

  async relabelRelatedNodes<T extends object>(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    relationshipType: string;
    targetLabel: string;
    targetWhere?: Record<string, unknown>;
    targetProperty?: string;
    targetValues?: string[];
    newLabel: string;
    executor?: QueryExecutor;
  }): Promise<GraphNodeRecord<T>[]> {
    return executeQuery<GraphNodeRecord<T>>(
      options.executor ?? this.postgres,
      `
        WITH source AS (
          SELECT id
          FROM graph_nodes
          WHERE label = $1
            AND properties @> $2::jsonb
        ), targets AS (
          SELECT target.id
          FROM source
          JOIN graph_relationships relationship
            ON relationship.source_id = source.id
           AND relationship.type = $3
          JOIN graph_nodes target
            ON target.id = relationship.target_id
           AND target.label = $4
           AND target.properties @> $5::jsonb
           AND (
             $7::text IS NULL
             OR target.properties ->> $7 = ANY($8::text[])
           )
        )
        UPDATE graph_nodes target
        SET label = $6,
            labels = array_append(array_remove(target.labels, $4), $6),
            updated_at = now()
        FROM targets
        WHERE target.id = targets.id
        RETURNING target.id::text AS "nodeId", target.properties
      `,
      [
        options.sourceLabel,
        JSON.stringify(options.sourceWhere),
        options.relationshipType,
        options.targetLabel,
        JSON.stringify(options.targetWhere ?? {}),
        options.newLabel,
        options.targetProperty ?? null,
        options.targetValues ?? [],
      ],
    );
  }

  async createNode<T extends object>(
    label: string,
    properties: T,
    nodeKey = String(
      (properties as Record<string, unknown>).id ?? randomUUID(),
    ),
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNodeRecord<T>> {
    const [node] = await executeQuery<GraphNodeRecord<T>>(
      executor,
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        ON CONFLICT (label, node_key) DO UPDATE SET
          properties = graph_nodes.properties || EXCLUDED.properties,
          updated_at = now()
        RETURNING id::text AS "nodeId", properties
      `,
      [label, nodeKey, JSON.stringify(properties)],
    );
    return node;
  }

  async updateNodes<T extends object>(
    label: string,
    where: Partial<T>,
    patch: Partial<T>,
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNodeRecord<T>[]> {
    return executeQuery<GraphNodeRecord<T>>(
      executor,
      `
        UPDATE graph_nodes
        SET properties = properties || $3::jsonb,
            updated_at = now()
        WHERE label = $1
          AND properties @> $2::jsonb
        RETURNING id::text AS "nodeId", properties
      `,
      [label, JSON.stringify(where), JSON.stringify(patch)],
    );
  }

  async deleteNodes(
    label: string,
    where: Record<string, unknown>,
    executor: QueryExecutor = this.postgres,
  ): Promise<number> {
    const rows = await executeQuery<{ id: string }>(
      executor,
      `
        DELETE FROM graph_nodes
        WHERE label = $1
          AND properties @> $2::jsonb
        RETURNING id
      `,
      [label, JSON.stringify(where)],
    );
    return rows.length;
  }

  async upsertRelationship(options: {
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    key?: string;
    properties?: Record<string, unknown>;
    executor?: QueryExecutor;
  }): Promise<void> {
    const executor = options.executor ?? this.postgres;
    await executeQuery(
      executor,
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = graph_relationships.properties || EXCLUDED.properties,
          updated_at = now()
      `,
      [
        options.sourceNodeId,
        options.targetNodeId,
        options.type,
        options.key ?? "",
        JSON.stringify(options.properties ?? {}),
      ],
    );
  }

  async deleteRelationships(options: {
    sourceNodeId: string;
    type: string;
    targetNodeIds?: string[];
    executor?: QueryExecutor;
  }): Promise<number> {
    const executor = options.executor ?? this.postgres;
    const rows = await executeQuery<{ id: string }>(
      executor,
      `
        DELETE FROM graph_relationships
        WHERE source_id = $1
          AND type = $2
          AND ($3::bigint[] IS NULL OR target_id = ANY($3::bigint[]))
        RETURNING id
      `,
      [options.sourceNodeId, options.type, options.targetNodeIds ?? null],
    );
    return rows.length;
  }

  async hasRelationship(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    type: string;
    targetLabel: string;
    targetWhere: Record<string, unknown>;
  }): Promise<boolean> {
    const [row] = await this.postgres.query<{ found: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes source
          JOIN graph_relationships relationship
            ON relationship.source_id = source.id
           AND relationship.type = $3
          JOIN graph_nodes target ON target.id = relationship.target_id
          WHERE source.label = $1
            AND source.properties @> $2::jsonb
            AND target.label = $4
            AND target.properties @> $5::jsonb
        ) AS found
      `,
      [
        options.sourceLabel,
        JSON.stringify(options.sourceWhere),
        options.type,
        options.targetLabel,
        JSON.stringify(options.targetWhere),
      ],
    );
    return row?.found ?? false;
  }

  async setRelationshipsToNodes(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    type: string;
    targetLabel: string;
    targetProperty: string;
    targetValues: string[];
    replace?: boolean;
  }): Promise<GraphNodeRecord<Record<string, unknown>>[]> {
    return this.transaction(async manager => {
      const source = await this.findNode<Record<string, unknown>>(
        options.sourceLabel,
        options.sourceWhere,
        manager,
      );
      if (!source) return [];
      if (options.replace ?? true) {
        await this.deleteRelationships({
          sourceNodeId: source.nodeId,
          type: options.type,
          executor: manager,
        });
      }
      const values = [...new Set(options.targetValues)];
      if (!values.length) return [];
      const targets = await executeQuery<
        GraphNodeRecord<Record<string, unknown>>
      >(
        manager,
        `
          SELECT id::text AS "nodeId", properties
          FROM graph_nodes
          WHERE label = $1
            AND properties ->> $2 = ANY($3::text[])
          ORDER BY id
        `,
        [options.targetLabel, options.targetProperty, values],
      );
      await executeQuery(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          )
          SELECT $1, target.id, $2, '', '{}'::jsonb
          FROM graph_nodes target
          WHERE target.id = ANY($3::bigint[])
          ON CONFLICT (source_id, target_id, type, relationship_key) DO NOTHING
        `,
        [source.nodeId, options.type, targets.map(target => target.nodeId)],
      );
      return targets;
    });
  }

  async deleteRelationshipsToNodes(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    type: string;
    targetLabel: string;
    targetProperty: string;
    targetValues: string[];
  }): Promise<number> {
    if (!options.targetValues.length) return 0;
    const rows = await executeQuery<{ id: string }>(
      this.postgres,
      `
        DELETE FROM graph_relationships relationship
        USING graph_nodes source, graph_nodes target
        WHERE relationship.source_id = source.id
          AND relationship.target_id = target.id
          AND relationship.type = $3
          AND source.label = $1
          AND source.properties @> $2::jsonb
          AND target.label = $4
          AND target.properties ->> $5 = ANY($6::text[])
        RETURNING relationship.id::text AS id
      `,
      [
        options.sourceLabel,
        JSON.stringify(options.sourceWhere),
        options.type,
        options.targetLabel,
        options.targetProperty,
        [...new Set(options.targetValues)],
      ],
    );
    return rows.length;
  }

  async deleteRelationshipBetween(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    type: string;
    targetLabel: string;
    targetWhere: Record<string, unknown>;
  }): Promise<number> {
    return this.transaction(async manager => {
      const source = await this.findNode<Record<string, unknown>>(
        options.sourceLabel,
        options.sourceWhere,
        manager,
      );
      const target = await this.findNode<Record<string, unknown>>(
        options.targetLabel,
        options.targetWhere,
        manager,
      );
      if (!source || !target) return 0;
      return this.deleteRelationships({
        sourceNodeId: source.nodeId,
        type: options.type,
        targetNodeIds: [target.nodeId],
        executor: manager,
      });
    });
  }

  async replaceRelatedValueNodes(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    type: string;
    targetLabel: string;
    targetProperty: string;
    values: string[];
  }): Promise<string[]> {
    const values = [...new Set(options.values.filter(value => value !== ""))];
    return this.transaction(async manager => {
      const source = await this.findNode<Record<string, unknown>>(
        options.sourceLabel,
        options.sourceWhere,
        manager,
      );
      if (!source) return [];

      const oldTargets = await executeQuery<{ id: string }>(
        manager,
        `
          SELECT target.id::text AS id
          FROM graph_relationships relationship
          JOIN graph_nodes target ON target.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = $2
            AND target.label = $3
        `,
        [source.nodeId, options.type, options.targetLabel],
      );
      await this.deleteRelationships({
        sourceNodeId: source.nodeId,
        type: options.type,
        executor: manager,
      });

      const desiredTargetIds = new Set<string>();
      for (const value of values) {
        let target = await this.findNode<Record<string, unknown>>(
          options.targetLabel,
          { [options.targetProperty]: value },
          manager,
        );
        if (!target) {
          target = await this.createNode(
            options.targetLabel,
            {
              id: randomUUID(),
              [options.targetProperty]: value,
            },
            `runtime:${options.targetProperty}:${value}`,
            manager,
          );
        }
        desiredTargetIds.add(target.nodeId);
        await this.upsertRelationship({
          sourceNodeId: source.nodeId,
          targetNodeId: target.nodeId,
          type: options.type,
          executor: manager,
        });
      }

      const removableIds = oldTargets
        .map(target => target.id)
        .filter(targetId => !desiredTargetIds.has(targetId));
      if (removableIds.length) {
        await executeQuery(
          manager,
          `
            DELETE FROM graph_nodes target
            WHERE target.id = ANY($1::bigint[])
              AND NOT EXISTS (
                SELECT 1
                FROM graph_relationships relationship
                WHERE relationship.source_id = target.id
                   OR relationship.target_id = target.id
              )
          `,
          [removableIds],
        );
      }
      return values;
    });
  }

  async replaceOwnedRelatedNodes<T extends Record<string, unknown>>(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    relationshipType: string;
    targetLabel: string;
    nodes: T[];
    nodeKeyProperty?: keyof T & string;
  }): Promise<GraphNodeRecord<T>[]> {
    return this.transaction(async manager => {
      const source = await this.findNode<Record<string, unknown>>(
        options.sourceLabel,
        options.sourceWhere,
        manager,
      );
      if (!source) return [];

      const oldTargets = await this.findRelatedNodes<T>({
        sourceLabel: options.sourceLabel,
        sourceWhere: options.sourceWhere,
        relationshipType: options.relationshipType,
        targetLabel: options.targetLabel,
        executor: manager,
      });
      if (oldTargets.length) {
        await this.deleteRelationships({
          sourceNodeId: source.nodeId,
          type: options.relationshipType,
          targetNodeIds: oldTargets.map(target => target.nodeId),
          executor: manager,
        });
        await executeQuery(
          manager,
          `
            DELETE FROM graph_nodes target
            WHERE target.id = ANY($1::bigint[])
              AND NOT EXISTS (
                SELECT 1
                FROM graph_relationships relationship
                WHERE relationship.source_id = target.id
                   OR relationship.target_id = target.id
              )
          `,
          [oldTargets.map(target => target.nodeId)],
        );
      }

      const created: GraphNodeRecord<T>[] = [];
      for (const properties of options.nodes) {
        const keyProperty = options.nodeKeyProperty;
        const keyValue = keyProperty ? properties[keyProperty] : undefined;
        const nodeKey = `${options.sourceLabel}:${source.nodeId}:${options.relationshipType}:${String(
          keyValue ?? randomUUID(),
        )}`;
        const target = await this.createNode(
          options.targetLabel,
          properties,
          nodeKey,
          manager,
        );
        await this.upsertRelationship({
          sourceNodeId: source.nodeId,
          targetNodeId: target.nodeId,
          type: options.relationshipType,
          executor: manager,
        });
        created.push(target);
      }
      return created;
    });
  }

  async changeNodeLabel<T extends object>(options: {
    sourceLabel: string;
    sourceWhere: Record<string, unknown>;
    newLabel: string;
    conflictWhere?: Record<string, unknown>;
    removeProperties?: string[];
  }): Promise<
    | { status: "not_found" | "conflict"; node?: undefined }
    | { status: "updated"; node: GraphNodeRecord<T> }
  > {
    return this.transaction(async manager => {
      const source = await this.findNode<Record<string, unknown>>(
        options.sourceLabel,
        options.sourceWhere,
        manager,
      );
      if (!source) return { status: "not_found" as const };
      if (options.conflictWhere) {
        const conflict = await this.findNode(
          options.newLabel,
          options.conflictWhere,
          manager,
        );
        if (conflict) return { status: "conflict" as const };
      }

      const [node] = await executeQuery<GraphNodeRecord<T>>(
        manager,
        `
          UPDATE graph_nodes
          SET label = $2,
              labels = array_append(array_remove(labels, $1), $2),
              properties = properties - $3::text[],
              updated_at = now()
          WHERE id = $4
          RETURNING id::text AS "nodeId", properties
        `,
        [
          options.sourceLabel,
          options.newLabel,
          options.removeProperties ?? [],
          source.nodeId,
        ],
      );
      return { status: "updated" as const, node };
    });
  }

  async deleteNodeWithOwnedDescendants(options: {
    rootLabel: string;
    rootWhere: Record<string, unknown>;
    relationshipTypes: string[];
    ownedLabels: string[];
  }): Promise<{ rootDeleted: boolean; descendantsDeleted: number }> {
    return this.transaction(async manager => {
      const root = await this.findNode<Record<string, unknown>>(
        options.rootLabel,
        options.rootWhere,
        manager,
      );
      if (!root) return { rootDeleted: false, descendantsDeleted: 0 };

      const outgoing = async (sourceNodeId: string): Promise<string[]> => {
        const rows = await executeQuery<{ id: string }>(
          manager,
          `
            SELECT DISTINCT target.id::text AS id
            FROM graph_relationships relationship
            JOIN graph_nodes target ON target.id = relationship.target_id
            WHERE relationship.source_id = $1
              AND relationship.type = ANY($2::text[])
              AND target.label = ANY($3::text[])
          `,
          [sourceNodeId, options.relationshipTypes, options.ownedLabels],
        );
        return rows.map(row => row.id);
      };

      const pending = await outgoing(root.nodeId);
      await executeQuery(manager, "DELETE FROM graph_nodes WHERE id = $1", [
        root.nodeId,
      ]);

      const visited = new Set<string>();
      let descendantsDeleted = 0;
      while (pending.length) {
        const nodeId = pending.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const [candidate] = await executeQuery<{ is_orphan: boolean }>(
          manager,
          `
            SELECT NOT EXISTS (
              SELECT 1
              FROM graph_relationships relationship
              WHERE relationship.target_id = node.id
            ) AS is_orphan
            FROM graph_nodes node
            WHERE node.id = $1
              AND node.label = ANY($2::text[])
            FOR UPDATE
          `,
          [nodeId, options.ownedLabels],
        );
        if (!candidate?.is_orphan) continue;

        pending.push(...(await outgoing(nodeId)));
        const deleted = await executeQuery<{ id: string }>(
          manager,
          "DELETE FROM graph_nodes WHERE id = $1 RETURNING id::text AS id",
          [nodeId],
        );
        descendantsDeleted += deleted.length;
      }
      return { rootDeleted: true, descendantsDeleted };
    });
  }

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.postgres.transaction(work);
  }
}
