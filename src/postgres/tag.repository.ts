import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Tag, TagPair, TagPreference } from "src/shared/types";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

type TagNode = {
  nodeId: string;
  properties: Tag;
};

export type TagMatch = Tag & {
  input: string;
  score: number;
  jobCount: number;
};

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

const canonicalJoins = (tagAlias: string): string => `
  LEFT JOIN LATERAL (
    SELECT preferred.id, preferred.properties
    FROM graph_relationships synonym_relationship
    JOIN graph_nodes preferred
      ON preferred.id = CASE
        WHEN synonym_relationship.source_id = ${tagAlias}.id
          THEN synonym_relationship.target_id
        ELSE synonym_relationship.source_id
      END
     AND preferred.label = 'Tag'
    JOIN graph_relationships preferred_designation
      ON preferred_designation.source_id = preferred.id
     AND preferred_designation.type = 'HAS_TAG_DESIGNATION'
    JOIN graph_nodes designation
      ON designation.id = preferred_designation.target_id
     AND designation.label = 'PreferredDesignation'
    WHERE synonym_relationship.type = 'IS_SYNONYM_OF'
      AND (
        synonym_relationship.source_id = ${tagAlias}.id
        OR synonym_relationship.target_id = ${tagAlias}.id
      )
    ORDER BY preferred.id
    LIMIT 1
  ) preferred ON true
  LEFT JOIN LATERAL (
    SELECT paired.id, paired.properties
    FROM graph_relationships paired_designation
    JOIN graph_nodes designation
      ON designation.id = paired_designation.target_id
     AND designation.label = 'PairedDesignation'
    JOIN graph_relationships pairing
      ON pairing.source_id = ${tagAlias}.id
     AND pairing.type = 'IS_PAIR_OF'
    JOIN graph_nodes paired
      ON paired.id = pairing.target_id
     AND paired.label = 'Tag'
    WHERE paired_designation.source_id = ${tagAlias}.id
      AND paired_designation.type = 'HAS_TAG_DESIGNATION'
    ORDER BY paired.id
    LIMIT 1
  ) paired ON true
`;

const unblockedPredicate = (tagAlias: string): string => `
  NOT EXISTS (
    SELECT 1
    FROM graph_relationships designation_relationship
    JOIN graph_nodes blocked
      ON blocked.id = designation_relationship.target_id
     AND blocked.label = 'BlockedDesignation'
    WHERE designation_relationship.source_id = ${tagAlias}.id
      AND designation_relationship.type = 'HAS_TAG_DESIGNATION'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM graph_relationships related_relationship
    JOIN graph_nodes related_tag
      ON related_tag.id = CASE
        WHEN related_relationship.source_id = ${tagAlias}.id
          THEN related_relationship.target_id
        ELSE related_relationship.source_id
      END
     AND related_tag.label = 'Tag'
    JOIN graph_relationships related_designation
      ON related_designation.source_id = related_tag.id
     AND related_designation.type = 'HAS_TAG_DESIGNATION'
    JOIN graph_nodes blocked
      ON blocked.id = related_designation.target_id
     AND blocked.label = 'BlockedDesignation'
    WHERE related_relationship.type IN ('IS_SYNONYM_OF', 'IS_PAIR_OF')
      AND (
        related_relationship.source_id = ${tagAlias}.id
        OR related_relationship.target_id = ${tagAlias}.id
      )
  )
`;

@Injectable()
export class TagRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findAll(): Promise<Tag[]> {
    const rows = await queryRows<{ properties: Tag }>(
      this.postgres,
      `
        SELECT properties
        FROM graph_nodes
        WHERE label = 'Tag'
        ORDER BY properties ->> 'name', id
      `,
    );
    return rows.map(row => row.properties);
  }

  async findById(id: string): Promise<Tag | undefined> {
    return (await this.findNode({ id }))?.properties;
  }

  async findByNormalizedName(normalizedName: string): Promise<Tag | undefined> {
    return (await this.findNode({ normalizedName }))?.properties;
  }

  async findPreferredTag(
    normalizedName: string,
  ): Promise<TagPreference | undefined> {
    const [row] = await queryRows<{ value: TagPreference }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'tag', tag.properties,
          'synonyms', COALESCE((
            SELECT jsonb_agg(DISTINCT synonym.properties)
            FROM graph_relationships relationship
            JOIN graph_nodes synonym
              ON synonym.id = CASE
                WHEN relationship.source_id = tag.id THEN relationship.target_id
                ELSE relationship.source_id
              END
             AND synonym.label = 'Tag'
            WHERE relationship.type = 'IS_SYNONYM_OF'
              AND (relationship.source_id = tag.id OR relationship.target_id = tag.id)
          ), '[]'::jsonb)
        ) AS value
        FROM graph_nodes tag
        JOIN graph_relationships relationship
          ON relationship.source_id = tag.id
         AND relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = relationship.target_id
         AND designation.label = 'PreferredDesignation'
        WHERE tag.label = 'Tag'
          AND tag.properties ->> 'normalizedName' = $1
        LIMIT 1
      `,
      [normalizedName],
    );
    return row?.value;
  }

  async findBlockedTag(normalizedName: string): Promise<Tag | undefined> {
    const [row] = await queryRows<{ properties: Tag }>(
      this.postgres,
      `
        SELECT tag.properties
        FROM graph_nodes tag
        JOIN graph_relationships relationship
          ON relationship.source_id = tag.id
         AND relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = relationship.target_id
         AND designation.label = 'BlockedDesignation'
        WHERE tag.label = 'Tag'
          AND tag.properties ->> 'normalizedName' = $1
        LIMIT 1
      `,
      [normalizedName],
    );
    return row?.properties;
  }

  async getUnblockedTags(): Promise<Tag[]> {
    const rows = await queryRows<{ properties: Tag }>(
      this.postgres,
      `
        SELECT DISTINCT ON (COALESCE(preferred.id, paired.id, tag.id))
          COALESCE(preferred.properties, paired.properties, tag.properties)
            AS properties
        FROM graph_nodes tag
        JOIN graph_relationships job_tag
          ON job_tag.target_id = tag.id
         AND job_tag.type = 'HAS_TAG'
        JOIN job_search_documents job ON job.job_node_id = job_tag.source_id
        ${canonicalJoins("tag")}
        WHERE tag.label = 'Tag'
          AND job.organization_id IS NOT NULL
          AND ${unblockedPredicate("tag")}
        ORDER BY COALESCE(preferred.id, paired.id, tag.id), tag.id
      `,
    );
    return rows.map(row => row.properties);
  }

  async getPopularTags(limit: number, upperBound: number): Promise<Tag[]> {
    const rows = await queryRows<{ properties: Tag }>(
      this.postgres,
      `
        WITH resolved AS MATERIALIZED (
          SELECT
            COALESCE(preferred.id, paired.id, tag.id) AS canonical_id,
            COALESCE(preferred.properties, paired.properties, tag.properties)
              AS properties,
            job.job_node_id
          FROM graph_nodes tag
          JOIN graph_relationships job_tag
            ON job_tag.target_id = tag.id
           AND job_tag.type = 'HAS_TAG'
          JOIN job_search_documents job
            ON job.job_node_id = job_tag.source_id
           AND job.online
           AND NOT job.blocked
           AND job.organization_id IS NOT NULL
          ${canonicalJoins("tag")}
          WHERE tag.label = 'Tag'
            AND ${unblockedPredicate("tag")}
        )
        SELECT (array_agg(properties))[1] AS properties
        FROM resolved
        GROUP BY canonical_id
        HAVING count(DISTINCT job_node_id) >= 1
          AND count(DISTINCT job_node_id) < $1
        ORDER BY count(DISTINCT job_node_id) DESC, canonical_id
        LIMIT NULLIF($2, 0)
      `,
      [Math.max(2, upperBound || Number.MAX_SAFE_INTEGER), Math.max(0, limit)],
    );
    return rows.map(row => row.properties);
  }

  async getTagsByDesignation(label: string): Promise<Tag[]> {
    const rows = await queryRows<{ properties: Tag }>(
      this.postgres,
      `
        SELECT tag.properties
        FROM graph_nodes tag
        JOIN graph_relationships relationship
          ON relationship.source_id = tag.id
         AND relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = relationship.target_id
         AND designation.label = $1
        WHERE tag.label = 'Tag'
        ORDER BY tag.properties ->> 'name', tag.id
      `,
      [label],
    );
    return rows.map(row => row.properties);
  }

  async getPreferredTags(): Promise<TagPreference[]> {
    const rows = await queryRows<{ value: TagPreference }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'tag', tag.properties,
          'synonyms', COALESCE(jsonb_agg(DISTINCT synonym.properties)
            FILTER (WHERE synonym.id IS NOT NULL), '[]'::jsonb)
        ) AS value
        FROM graph_nodes tag
        JOIN graph_relationships designation_relationship
          ON designation_relationship.source_id = tag.id
         AND designation_relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = designation_relationship.target_id
         AND designation.label = 'PreferredDesignation'
        LEFT JOIN graph_relationships synonym_relationship
          ON synonym_relationship.type = 'IS_SYNONYM_OF'
         AND (
           synonym_relationship.source_id = tag.id
           OR synonym_relationship.target_id = tag.id
         )
        LEFT JOIN graph_nodes synonym
          ON synonym.id = CASE
            WHEN synonym_relationship.source_id = tag.id
              THEN synonym_relationship.target_id
            ELSE synonym_relationship.source_id
          END
         AND synonym.label = 'Tag'
        WHERE tag.label = 'Tag'
        GROUP BY tag.id, tag.properties
        ORDER BY tag.properties ->> 'name', tag.id
      `,
    );
    return rows.map(row => row.value);
  }

  async getPairedTags(): Promise<TagPair[]> {
    const rows = await queryRows<{ value: TagPair }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'tag', tag.properties,
          'pairings', COALESCE(jsonb_agg(DISTINCT paired.properties)
            FILTER (WHERE paired.id IS NOT NULL), '[]'::jsonb)
        ) AS value
        FROM graph_nodes tag
        JOIN graph_relationships designation_relationship
          ON designation_relationship.source_id = tag.id
         AND designation_relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = designation_relationship.target_id
         AND designation.label = 'PairedDesignation'
        LEFT JOIN graph_relationships pairing
          ON pairing.source_id = tag.id
         AND pairing.type = 'IS_PAIR_OF'
        LEFT JOIN graph_nodes paired
          ON paired.id = pairing.target_id
         AND paired.label = 'Tag'
        WHERE tag.label = 'Tag'
        GROUP BY tag.id, tag.properties
        ORDER BY tag.properties ->> 'name', tag.id
      `,
    );
    return rows.map(row => row.value);
  }

  async createTag(
    properties: Pick<Tag, "name" | "normalizedName">,
    creatorWallet: string,
  ): Promise<Tag> {
    return this.postgres.transaction(async manager => {
      const id = randomUUID();
      const tagProperties: Tag = {
        id,
        ...properties,
        createdTimestamp: Date.now(),
      };
      const [tag] = await queryRows<TagNode>(
        manager,
        `
          INSERT INTO graph_nodes (label, labels, node_key, properties)
          VALUES ('Tag', ARRAY['Tag']::text[], $1, $2::jsonb)
          RETURNING id::text AS "nodeId", properties
        `,
        [`runtime:${id}`, JSON.stringify(tagProperties)],
      );
      const designation = await this.ensureDesignation(
        manager,
        "DefaultDesignation",
      );
      await this.insertRelationship(
        manager,
        tag.nodeId,
        designation,
        "HAS_TAG_DESIGNATION",
        {
          creator: creatorWallet,
          createdTimestamp: Date.now(),
        },
      );
      return tag.properties;
    });
  }

  async setDesignation(options: {
    normalizedName: string;
    designation:
      | "BlockedDesignation"
      | "PreferredDesignation"
      | "AllowedDesignation";
    creatorWallet: string;
    includeSynonyms?: boolean;
    replaceAllowed?: boolean;
  }): Promise<Tag | undefined> {
    return this.postgres.transaction(async manager => {
      const tag = await this.findNode(
        { normalizedName: options.normalizedName },
        manager,
      );
      if (!tag) return undefined;
      const tagIds = options.includeSynonyms
        ? await this.getSynonymComponentIds(manager, [tag.nodeId])
        : [tag.nodeId];
      const designation = await this.ensureDesignation(
        manager,
        options.designation,
      );
      if (options.replaceAllowed) {
        await queryRows(
          manager,
          `
            DELETE FROM graph_relationships relationship
            USING graph_nodes target
            WHERE relationship.source_id = ANY($1::bigint[])
              AND relationship.target_id = target.id
              AND relationship.type = 'HAS_TAG_DESIGNATION'
              AND target.label IN ('AllowedDesignation', 'DefaultDesignation')
          `,
          [tagIds],
        );
      }
      for (const tagId of tagIds) {
        await this.insertRelationship(
          manager,
          tagId,
          designation,
          "HAS_TAG_DESIGNATION",
          { creator: options.creatorWallet, createdTimestamp: Date.now() },
        );
      }
      await this.refreshJobsForTags(manager, tagIds);
      return tag.properties;
    });
  }

  async removeDesignation(
    normalizedName: string,
    designation: string,
    includeSynonyms = false,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const tag = await this.findNode({ normalizedName }, manager);
      if (!tag) return false;
      const tagIds = includeSynonyms
        ? await this.getSynonymComponentIds(manager, [tag.nodeId])
        : [tag.nodeId];
      const rows = await queryRows<{ tagId: string }>(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes designation
          WHERE relationship.source_id = ANY($1::bigint[])
            AND relationship.target_id = designation.id
            AND relationship.type = 'HAS_TAG_DESIGNATION'
            AND designation.label = $2
          RETURNING relationship.source_id::text AS "tagId"
        `,
        [tagIds, designation],
      );
      if (rows.length) await this.refreshJobsForTags(manager, tagIds);
      return rows.length > 0;
    });
  }

  async hasDesignation(
    normalizedName: string,
    designation: string,
    creatorWallet?: string,
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes tag
          JOIN graph_relationships relationship
            ON relationship.source_id = tag.id
           AND relationship.type = 'HAS_TAG_DESIGNATION'
          JOIN graph_nodes designation ON designation.id = relationship.target_id
          WHERE tag.label = 'Tag'
            AND tag.properties ->> 'normalizedName' = $1
            AND designation.label = $2
            AND (
              $3::text IS NULL
              OR relationship.properties ->> 'creator' = $3
            )
        ) AS found
      `,
      [normalizedName, designation, creatorWallet ?? null],
    );
    return row?.found ?? false;
  }

  async areSynonymConnected(
    firstNormalizedName: string,
    secondNormalizedName: string,
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        WITH RECURSIVE origin AS (
          SELECT id
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'normalizedName' = $1
        ), component(id) AS (
          SELECT id FROM origin
          UNION
          SELECT CASE
            WHEN relationship.source_id = component.id THEN relationship.target_id
            ELSE relationship.source_id
          END
          FROM component
          JOIN graph_relationships relationship
            ON relationship.type = 'IS_SYNONYM_OF'
           AND (
             relationship.source_id = component.id
             OR relationship.target_id = component.id
           )
        )
        SELECT EXISTS (
          SELECT 1
          FROM component
          JOIN graph_nodes tag ON tag.id = component.id
          WHERE tag.label = 'Tag'
            AND tag.properties ->> 'normalizedName' = $2
        ) AS found
      `,
      [firstNormalizedName, secondNormalizedName],
    );
    return row?.found ?? false;
  }

  async getPreferredForSynonym(
    normalizedName: string,
  ): Promise<TagPreference | undefined> {
    const [row] = await queryRows<{ normalizedName: string }>(
      this.postgres,
      `
        SELECT preferred.properties ->> 'normalizedName' AS "normalizedName"
        FROM graph_nodes synonym
        JOIN graph_relationships relationship
          ON relationship.type = 'IS_SYNONYM_OF'
         AND (
           relationship.source_id = synonym.id
           OR relationship.target_id = synonym.id
         )
        JOIN graph_nodes preferred
          ON preferred.id = CASE
            WHEN relationship.source_id = synonym.id THEN relationship.target_id
            ELSE relationship.source_id
          END
         AND preferred.label = 'Tag'
        JOIN graph_relationships designation_relationship
          ON designation_relationship.source_id = preferred.id
         AND designation_relationship.type = 'HAS_TAG_DESIGNATION'
        JOIN graph_nodes designation
          ON designation.id = designation_relationship.target_id
         AND designation.label = 'PreferredDesignation'
        WHERE synonym.label = 'Tag'
          AND synonym.properties ->> 'normalizedName' = $1
        ORDER BY preferred.id
        LIMIT 1
      `,
      [normalizedName],
    );
    return row ? this.findPreferredTag(row.normalizedName) : undefined;
  }

  async connectSynonyms(
    firstNormalizedName: string,
    secondNormalizedName: string,
    creatorWallet?: string,
    requireFirstPreferred = false,
  ): Promise<Tag[]> {
    return this.postgres.transaction(async manager => {
      const first = await this.findNode(
        { normalizedName: firstNormalizedName },
        manager,
      );
      const second = await this.findNode(
        { normalizedName: secondNormalizedName },
        manager,
      );
      if (!first || !second) return [];
      if (
        requireFirstPreferred &&
        !(await this.hasDesignationInExecutor(
          manager,
          first.nodeId,
          "PreferredDesignation",
        ))
      ) {
        return [];
      }
      const componentIds = await this.getSynonymComponentIds(manager, [
        first.nodeId,
        second.nodeId,
      ]);
      await queryRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          )
          SELECT
            least(first_id, second_id),
            greatest(first_id, second_id),
            'IS_SYNONYM_OF',
            '',
            $2::jsonb
          FROM unnest($1::bigint[]) first_id
          CROSS JOIN unnest($1::bigint[]) second_id
          WHERE first_id < second_id
          ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
            properties = graph_relationships.properties || EXCLUDED.properties,
            updated_at = now()
        `,
        [
          componentIds,
          JSON.stringify({
            ...(creatorWallet ? { creator: creatorWallet } : {}),
            createdTimestamp: Date.now(),
          }),
        ],
      );
      await this.refreshJobsForTags(manager, componentIds);
      return [first.properties, second.properties];
    });
  }

  async disconnectSynonyms(
    firstNormalizedName: string,
    secondNormalizedName: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const rows = await queryRows<{ firstId: string; secondId: string }>(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes first_tag, graph_nodes second_tag
          WHERE relationship.type = 'IS_SYNONYM_OF'
            AND first_tag.label = 'Tag'
            AND first_tag.properties ->> 'normalizedName' = $1
            AND second_tag.label = 'Tag'
            AND second_tag.properties ->> 'normalizedName' = $2
            AND (
              (relationship.source_id = first_tag.id AND relationship.target_id = second_tag.id)
              OR (relationship.source_id = second_tag.id AND relationship.target_id = first_tag.id)
            )
          RETURNING first_tag.id::text AS "firstId", second_tag.id::text AS "secondId"
        `,
        [firstNormalizedName, secondNormalizedName],
      );
      if (rows.length) {
        await this.refreshJobsForTags(manager, [
          rows[0].firstId,
          rows[0].secondId,
        ]);
      }
      return rows.length > 0;
    });
  }

  async replacePairings(
    originNormalizedName: string,
    pairedNormalizedNames: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const origin = await this.findNode(
        { normalizedName: originNormalizedName },
        manager,
      );
      if (!origin) return false;
      const designation = await this.ensureDesignation(
        manager,
        "PairedDesignation",
      );
      await this.insertRelationship(
        manager,
        origin.nodeId,
        designation,
        "HAS_TAG_DESIGNATION",
      );
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'IS_PAIR_OF'",
        [origin.nodeId],
      );
      const targets = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT id::text AS "nodeId"
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'normalizedName' = ANY($1::text[])
        `,
        [[...new Set(pairedNormalizedNames)]],
      );
      for (const target of targets) {
        await this.insertRelationship(
          manager,
          origin.nodeId,
          target.nodeId,
          "IS_PAIR_OF",
          {
            creator: creatorWallet,
            createdTimestamp: Date.now(),
          },
        );
      }
      await this.refreshJobsForTags(manager, [
        origin.nodeId,
        ...targets.map(target => target.nodeId),
      ]);
      return true;
    });
  }

  async linkTagToJob(tagId: string, jobId: string): Promise<Tag | undefined> {
    return this.postgres.transaction(async manager => {
      const tag = await this.findNode({ id: tagId }, manager);
      const job = await this.findGraphNode(
        "StructuredJobpost",
        { id: jobId },
        manager,
      );
      if (!tag || !job) return undefined;
      await this.insertRelationship(
        manager,
        job.nodeId,
        tag.nodeId,
        "HAS_TAG",
        {
          createdTimestamp: Date.now(),
          originatingJobpostId: jobId,
        },
      );
      await queryRows(
        manager,
        "SELECT refresh_job_search_document_ids(ARRAY[$1::bigint])",
        [job.nodeId],
      );
      return tag.properties;
    });
  }

  async updateTag(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Tag | undefined> {
    return this.postgres.transaction(async manager => {
      const [tag] = await queryRows<TagNode>(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb,
              updated_at = now()
          WHERE label = 'Tag'
            AND properties ->> 'id' = $1
          RETURNING id::text AS "nodeId", properties
        `,
        [id, JSON.stringify(patch)],
      );
      if (!tag) return undefined;
      await this.refreshJobsForTags(manager, [tag.nodeId]);
      return tag.properties;
    });
  }

  async deleteTag(id: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const tag = await this.findNode({ id }, manager);
      if (!tag) return false;
      const jobIds = await this.findJobIdsForTags(manager, [tag.nodeId]);
      await queryRows(manager, "DELETE FROM graph_nodes WHERE id = $1", [
        tag.nodeId,
      ]);
      await this.refreshJobIds(manager, jobIds);
      return true;
    });
  }

  async fuzzyMatches(
    inputs: string[],
    perInput = 5,
    requireJobs = true,
  ): Promise<TagMatch[]> {
    if (!inputs.length) return [];
    const rows = await queryRows<{
      input: string;
      properties: Tag;
      score: number | string;
      jobCount: string;
    }>(
      this.postgres,
      `
        WITH inputs AS MATERIALIZED (
          SELECT input, ordinal
          FROM unnest($1::text[]) WITH ORDINALITY AS value(input, ordinal)
        ), candidates AS MATERIALIZED (
          SELECT
            input.input,
            input.ordinal,
            tag.id AS source_tag_id,
            tag.properties,
            CASE
              WHEN tag.properties ->> 'normalizedName' = slugify_text(input.input)
                THEN 1.0
              ELSE greatest(
                similarity(lower(tag.properties ->> 'name'), lower(input.input)),
                similarity(tag.properties ->> 'normalizedName', slugify_text(input.input))
              )
            END AS base_score
          FROM inputs input
          CROSS JOIN LATERAL (
            SELECT tag.*
            FROM graph_nodes tag
            WHERE tag.label = 'Tag'
              AND ${unblockedPredicate("tag")}
              AND (
                tag.properties ->> 'normalizedName' = slugify_text(input.input)
                OR lower(tag.properties ->> 'name') % lower(input.input)
                OR (tag.properties ->> 'normalizedName') % slugify_text(input.input)
                OR lower(tag.properties ->> 'name') LIKE '%' || lower(input.input) || '%'
              )
            ORDER BY
              (tag.properties ->> 'normalizedName' = slugify_text(input.input)) DESC,
              greatest(
                similarity(lower(tag.properties ->> 'name'), lower(input.input)),
                similarity(tag.properties ->> 'normalizedName', slugify_text(input.input))
              ) DESC,
              tag.id
            LIMIT $2
          ) tag
        ), resolved AS (
          SELECT
            candidate.input,
            candidate.ordinal,
            COALESCE(preferred.id, paired.id, source.id) AS tag_id,
            COALESCE(preferred.properties, paired.properties, source.properties)
              AS properties,
            candidate.base_score
          FROM candidates candidate
          JOIN graph_nodes source ON source.id = candidate.source_tag_id
          ${canonicalJoins("source")}
        ), scored AS (
          SELECT
            resolved.*,
            count(DISTINCT job.job_node_id) AS job_count,
            resolved.base_score * ln(count(DISTINCT job.job_node_id) + 2.0)
              AS score
          FROM resolved
          LEFT JOIN graph_relationships job_tag
            ON job_tag.target_id = resolved.tag_id
           AND job_tag.type = 'HAS_TAG'
          LEFT JOIN job_search_documents job
            ON job.job_node_id = job_tag.source_id
          GROUP BY
            resolved.input,
            resolved.ordinal,
            resolved.tag_id,
            resolved.properties,
            resolved.base_score
        )
        SELECT DISTINCT ON (input, tag_id)
          input,
          properties,
          score,
          job_count::text AS "jobCount"
        FROM scored
        WHERE NOT $3::boolean OR job_count > 0
        ORDER BY input, tag_id, score DESC
      `,
      [[...new Set(inputs)], Math.max(1, Math.min(20, perInput)), requireJobs],
    );
    return rows.map(row => ({
      ...row.properties,
      input: row.input,
      score: Number(row.score),
      jobCount: Number(row.jobCount),
    }));
  }

  async getCooccurrence(tagIds: string[]): Promise<Map<string, number>> {
    if (!tagIds.length) return new Map();
    const rows = await queryRows<{ tagId: string; count: string }>(
      this.postgres,
      `
        WITH selected AS (
          SELECT id, properties ->> 'id' AS tag_id
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'id' = ANY($1::text[])
        )
        SELECT
          source.tag_id AS "tagId",
          count(DISTINCT target.tag_id)::text AS count
        FROM selected source
        JOIN graph_relationships source_job
          ON source_job.target_id = source.id
         AND source_job.type = 'HAS_TAG'
        JOIN graph_relationships target_job
          ON target_job.source_id = source_job.source_id
         AND target_job.type = 'HAS_TAG'
        JOIN selected target
          ON target.id = target_job.target_id
         AND target.id <> source.id
        GROUP BY source.tag_id
      `,
      [[...new Set(tagIds)]],
    );
    return new Map(rows.map(row => [row.tagId, Number(row.count)]));
  }

  private async findNode(
    where: { id?: string; normalizedName?: string },
    executor: QueryExecutor = this.postgres,
  ): Promise<TagNode | undefined> {
    const node = await this.findGraphNode("Tag", where, executor);
    if (!node) return undefined;

    return {
      nodeId: node.nodeId,
      properties: node.properties as unknown as Tag,
    };
  }

  private async findGraphNode(
    label: string,
    where: Record<string, unknown>,
    executor: QueryExecutor,
  ): Promise<
    { nodeId: string; properties: Record<string, unknown> } | undefined
  > {
    const [row] = await queryRows<{
      nodeId: string;
      properties: Record<string, unknown>;
    }>(
      executor,
      `
        SELECT id::text AS "nodeId", properties
        FROM graph_nodes
        WHERE label = $1
          AND properties @> $2::jsonb
        ORDER BY id
        LIMIT 1
      `,
      [label, JSON.stringify(where)],
    );
    return row;
  }

  private async ensureDesignation(
    manager: EntityManager,
    label: string,
  ): Promise<string> {
    const existing = await this.findGraphNode(label, {}, manager);
    if (existing) return existing.nodeId;
    const id = randomUUID();
    const [created] = await queryRows<{ nodeId: string }>(
      manager,
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS "nodeId"
      `,
      [label, `runtime:${label}`, JSON.stringify({ id, name: label })],
    );
    return created.nodeId;
  }

  private async insertRelationship(
    executor: QueryExecutor,
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await queryRows(
      executor,
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = graph_relationships.properties || EXCLUDED.properties,
          updated_at = now()
      `,
      [sourceNodeId, targetNodeId, type, JSON.stringify(properties)],
    );
  }

  private async hasDesignationInExecutor(
    executor: QueryExecutor,
    tagNodeId: string,
    designation: string,
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      executor,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_relationships relationship
          JOIN graph_nodes designation ON designation.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = 'HAS_TAG_DESIGNATION'
            AND designation.label = $2
        ) AS found
      `,
      [tagNodeId, designation],
    );
    return row?.found ?? false;
  }

  private async getSynonymComponentIds(
    executor: QueryExecutor,
    seedIds: string[],
  ): Promise<string[]> {
    const rows = await queryRows<{ id: string }>(
      executor,
      `
        WITH RECURSIVE component(id) AS (
          SELECT unnest($1::bigint[])
          UNION
          SELECT CASE
            WHEN relationship.source_id = component.id THEN relationship.target_id
            ELSE relationship.source_id
          END
          FROM component
          JOIN graph_relationships relationship
            ON relationship.type = 'IS_SYNONYM_OF'
           AND (
             relationship.source_id = component.id
             OR relationship.target_id = component.id
           )
        )
        SELECT DISTINCT id::text AS id
        FROM component
        ORDER BY id
      `,
      [seedIds],
    );
    return rows.map(row => row.id);
  }

  private async findJobIdsForTags(
    executor: QueryExecutor,
    tagNodeIds: string[],
  ): Promise<string[]> {
    if (!tagNodeIds.length) return [];
    const rows = await queryRows<{ id: string }>(
      executor,
      `
        SELECT DISTINCT source_id::text AS id
        FROM graph_relationships
        WHERE type = 'HAS_TAG'
          AND target_id = ANY($1::bigint[])
      `,
      [tagNodeIds],
    );
    return rows.map(row => row.id);
  }

  private async refreshJobsForTags(
    executor: QueryExecutor,
    tagNodeIds: string[],
  ): Promise<void> {
    await this.refreshJobIds(
      executor,
      await this.findJobIdsForTags(executor, tagNodeIds),
    );
  }

  private async refreshJobIds(
    executor: QueryExecutor,
    jobNodeIds: string[],
  ): Promise<void> {
    if (!jobNodeIds.length) return;
    await queryRows(
      executor,
      "SELECT refresh_job_search_document_ids($1::bigint[])",
      [jobNodeIds],
    );
  }
}
