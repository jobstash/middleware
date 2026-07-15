import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { slugify } from "src/shared/helpers";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

export type ApplicantList =
  | "all"
  | "shortlisted"
  | "archived"
  | "new"
  | "interviewing"
  | "hired";

export type JobTagMatchData = {
  jobTags: string[];
  tagMappings: Array<{
    id: string;
    name: string;
    normalizedName: string;
    expanded: string[];
  }>;
  allTags: Array<{ id: string; name: string; normalizedName: string }>;
};

const asBoolean = (value: unknown): boolean =>
  value === true || String(value).toLowerCase() === "true";

const asNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const managerQuery = async <T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await manager.query(sql, parameters);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : (result as T[]);
};

const normalizeMutationRows = <T>(result: T[]): T[] =>
  Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : result;

@Injectable()
export class JobGraphRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getUserJobPayloads(
    wallet: string,
    relationshipType: "BOOKMARKED" | "APPLIED_TO",
    ecosystem?: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.postgres.query<{
      payload: Record<string, unknown>;
    }>(
      `
        SELECT
          COALESCE(job.detail_payload, job.payload)
          || CASE
            WHEN organization.payload IS NOT NULL THEN jsonb_build_object(
              'organization', organization.payload,
              'project', NULL
            )
            WHEN project.detail_payload IS NOT NULL OR project.payload IS NOT NULL
              THEN jsonb_build_object(
                'organization', NULL,
                'project', COALESCE(project.detail_payload, project.payload)
              )
            ELSE '{}'::jsonb
          END AS payload
        FROM graph_nodes applicant
        JOIN graph_relationships user_job
          ON user_job.source_id = applicant.id
         AND user_job.type = $2
        JOIN job_search_documents job ON job.job_node_id = user_job.target_id
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        LEFT JOIN project_search_documents project
          ON project.project_id = job.project_id
        WHERE applicant.label = 'User'
          AND lower(applicant.properties ->> 'wallet') = lower($1)
          AND job.online
          AND NOT job.blocked
          AND ($3::text IS NULL OR $3 = ANY(job.managed_ecosystems))
          AND (organization.payload IS NOT NULL OR project.payload IS NOT NULL)
        ORDER BY job.published_timestamp DESC NULLS LAST, job.job_node_id
      `,
      [wallet, relationshipType, ecosystem ? slugify(ecosystem) : null],
    );
    return rows.map(row => row.payload);
  }

  async getJobFolders(
    options: {
      wallet?: string;
      id?: string;
      slug?: string;
      publicOnly?: boolean;
    } = {},
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.postgres.query<{
      payload: Record<string, unknown>;
    }>(
      `
        SELECT folder.properties || jsonb_build_object(
          'jobs', COALESCE(jobs.value, '[]'::jsonb)
        ) AS payload
        FROM graph_nodes folder
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(job_payload ORDER BY published_timestamp DESC NULLS LAST)
            AS value
          FROM (
            SELECT DISTINCT ON (job.job_node_id)
              job.job_node_id,
              job.published_timestamp,
              COALESCE(job.detail_payload, job.payload)
              || CASE
                WHEN organization.payload IS NOT NULL THEN jsonb_build_object(
                  'organization', organization.payload,
                  'project', NULL
                )
                WHEN project.detail_payload IS NOT NULL OR project.payload IS NOT NULL
                  THEN jsonb_build_object(
                    'organization', NULL,
                    'project', COALESCE(project.detail_payload, project.payload)
                  )
                ELSE '{}'::jsonb
              END AS job_payload
            FROM graph_relationships contains_job
            JOIN job_search_documents job
              ON job.job_node_id = contains_job.target_id
            LEFT JOIN organization_search_documents organization
              ON organization.organization_id = job.organization_id
            LEFT JOIN project_search_documents project
              ON project.project_id = job.project_id
            WHERE contains_job.source_id = folder.id
              AND contains_job.type = 'CONTAINS_JOBPOST'
              AND job.online
              AND NOT job.blocked
              AND (organization.payload IS NOT NULL OR project.payload IS NOT NULL)
            ORDER BY job.job_node_id, job.published_timestamp DESC NULLS LAST
          ) folder_jobs
        ) jobs ON true
        WHERE folder.label = 'JobpostFolder'
          AND ($1::text IS NULL OR folder.properties ->> 'id' = $1)
          AND ($2::text IS NULL OR folder.properties ->> 'slug' = $2)
          AND (
            NOT $3::boolean
            OR COALESCE((folder.properties ->> 'isPublic')::boolean, false)
          )
          AND (
            $4::text IS NULL
            OR EXISTS (
              SELECT 1
              FROM graph_relationships created_folder
              JOIN graph_nodes owner ON owner.id = created_folder.source_id
              WHERE created_folder.target_id = folder.id
                AND created_folder.type = 'CREATED_FOLDER'
                AND owner.label = 'User'
                AND lower(owner.properties ->> 'wallet') = lower($4)
            )
          )
        ORDER BY folder.properties ->> 'name', folder.id
      `,
      [
        options.id ?? null,
        options.slug ?? null,
        options.publicOnly ?? false,
        options.wallet ?? null,
      ],
    );
    return rows.map(row => row.payload);
  }

  async updateApplicantLists(options: {
    applicants: { wallet: string; job: string }[];
    list: string;
    field: "list" | "adminList";
    organizationId?: string;
  }): Promise<number> {
    if (!options.applicants.length) return 0;
    const rows = await this.postgres.query<{ id: string }>(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS row(wallet text, job text)
        )
        UPDATE graph_relationships application
        SET properties = jsonb_set(
              application.properties,
              ARRAY[$3]::text[],
              to_jsonb($2::text),
              true
            ),
            updated_at = now()
        FROM incoming
        JOIN graph_nodes applicant
          ON applicant.label = 'User'
         AND lower(applicant.properties ->> 'wallet') = lower(incoming.wallet)
        JOIN graph_nodes job
          ON job.label = 'StructuredJobpost'
         AND job.properties ->> 'shortUUID' = incoming.job
        JOIN job_search_documents document ON document.job_node_id = job.id
        WHERE application.source_id = applicant.id
          AND application.target_id = job.id
          AND application.type = 'APPLIED_TO'
          AND (
            $4::text IS NULL
            OR (
              document.organization_id = $4
              AND document.online
              AND NOT document.blocked
            )
          )
        RETURNING application.id::text AS id
      `,
      [
        JSON.stringify(options.applicants),
        options.list,
        options.field,
        options.organizationId ?? null,
      ],
    );
    return normalizeMutationRows(rows).length;
  }

  async saveJobFolder(options: {
    id?: string;
    wallet?: string;
    name: string;
    isPublic: boolean;
    jobs: string[];
  }): Promise<string | undefined> {
    return this.postgres.transaction(async manager => {
      let folderNodeId: string;
      let folderId = options.id;
      if (folderId) {
        const [folder] = await managerQuery<{ node_id: string }>(
          manager,
          `
            UPDATE graph_nodes
            SET properties = properties || $2::jsonb,
                updated_at = now()
            WHERE label = 'JobpostFolder'
              AND properties ->> 'id' = $1
            RETURNING id::text AS node_id
          `,
          [
            folderId,
            JSON.stringify({
              name: options.name,
              slug: slugify(options.name),
              isPublic: options.isPublic,
            }),
          ],
        );
        if (!folder) return undefined;
        folderNodeId = folder.node_id;
      } else {
        if (!options.wallet) return undefined;
        folderId = randomUUID();
        const [owner] = await managerQuery<{ node_id: string }>(
          manager,
          `
            SELECT id::text AS node_id
            FROM graph_nodes
            WHERE label = 'User'
              AND lower(properties ->> 'wallet') = lower($1)
            ORDER BY id
            LIMIT 1
          `,
          [options.wallet],
        );
        if (!owner) return undefined;
        const [folder] = await managerQuery<{ node_id: string }>(
          manager,
          `
            INSERT INTO graph_nodes (label, labels, node_key, properties)
            VALUES ('JobpostFolder', ARRAY['JobpostFolder'], $1, $2::jsonb)
            RETURNING id::text AS node_id
          `,
          [
            folderId,
            JSON.stringify({
              id: folderId,
              name: options.name,
              slug: slugify(options.name),
              isPublic: options.isPublic,
            }),
          ],
        );
        folderNodeId = folder.node_id;
        await managerQuery(
          manager,
          `
            INSERT INTO graph_relationships (
              source_id, target_id, type, relationship_key, properties
            ) VALUES ($1, $2, 'CREATED_FOLDER', '', '{}'::jsonb)
          `,
          [owner.node_id, folderNodeId],
        );
      }

      await managerQuery(
        manager,
        `
          DELETE FROM graph_relationships
          WHERE source_id = $1
            AND type = 'CONTAINS_JOBPOST'
        `,
        [folderNodeId],
      );
      if (options.jobs.length) {
        await managerQuery(
          manager,
          `
            INSERT INTO graph_relationships (
              source_id, target_id, type, relationship_key, properties
            )
            SELECT $1, job.id, 'CONTAINS_JOBPOST', '', '{}'::jsonb
            FROM graph_nodes job
            WHERE job.label = 'StructuredJobpost'
              AND job.properties ->> 'shortUUID' = ANY($2::text[])
            ON CONFLICT (source_id, target_id, type, relationship_key) DO NOTHING
          `,
          [folderNodeId, [...new Set(options.jobs)]],
        );
      }
      return folderId;
    });
  }

  async deleteJobFolder(id: string): Promise<boolean> {
    const result = await this.postgres.query<{ id: string }>(
      `
        DELETE FROM graph_nodes
        WHERE label = 'JobpostFolder'
          AND properties ->> 'id' = $1
        RETURNING id::text AS id
      `,
      [id],
    );
    return normalizeMutationRows(result).length > 0;
  }

  async replaceJobRelationships(options: {
    shortUuids: string[];
    relationshipType: string;
    targetLabel: string;
    targetProperty?: string;
    targetValues?: string[];
    creator?: string;
    replace?: boolean;
  }): Promise<number> {
    if (!options.shortUuids.length) return 0;
    return this.postgres.transaction(async manager => {
      const jobs = await managerQuery<{ node_id: string }>(
        manager,
        `
          SELECT id::text AS node_id
          FROM graph_nodes
          WHERE label = 'StructuredJobpost'
            AND properties ->> 'shortUUID' = ANY($1::text[])
          ORDER BY id
        `,
        [[...new Set(options.shortUuids)]],
      );
      const jobIds = jobs.map(job => job.node_id);
      if (!jobIds.length) return 0;

      if (options.replace ?? true) {
        await managerQuery(
          manager,
          `
            DELETE FROM graph_relationships
            WHERE source_id = ANY($1::bigint[])
              AND type = $2
          `,
          [jobIds, options.relationshipType],
        );
      }

      const targets = await managerQuery<{ node_id: string }>(
        manager,
        `
          SELECT id::text AS node_id
          FROM graph_nodes
          WHERE label = $1
            AND (
              $2::text IS NULL
              OR properties ->> $2 = ANY($3::text[])
            )
          ORDER BY id
        `,
        [
          options.targetLabel,
          options.targetProperty ?? null,
          options.targetValues ?? [],
        ],
      );
      if (targets.length) {
        await managerQuery(
          manager,
          `
            INSERT INTO graph_relationships (
              source_id, target_id, type, relationship_key, properties
            )
            SELECT
              source_id,
              target_id,
              $3,
              '',
              jsonb_strip_nulls(jsonb_build_object(
                'creator', $4::text,
                'createdTimestamp', $5::bigint
              ))
            FROM unnest($1::bigint[]) source_id
            CROSS JOIN unnest($2::bigint[]) target_id
            ON CONFLICT (source_id, target_id, type, relationship_key)
            DO UPDATE SET
              properties = graph_relationships.properties || EXCLUDED.properties,
              updated_at = now()
          `,
          [
            jobIds,
            targets.map(target => target.node_id),
            options.relationshipType,
            options.creator ?? null,
            Date.now(),
          ],
        );
      }
      await this.refreshJobs(manager, jobIds);
      return jobIds.length;
    });
  }

  async deleteJobRelationships(options: {
    shortUuids: string[];
    relationshipType: string;
    targetLabel?: string;
  }): Promise<number> {
    if (!options.shortUuids.length) return 0;
    return this.postgres.transaction(async manager => {
      const deleted = await managerQuery<{ job_id: string }>(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes job, graph_nodes target
          WHERE relationship.source_id = job.id
            AND relationship.target_id = target.id
            AND relationship.type = $2
            AND job.label = 'StructuredJobpost'
            AND job.properties ->> 'shortUUID' = ANY($1::text[])
            AND ($3::text IS NULL OR target.label = $3)
          RETURNING job.id::text AS job_id
        `,
        [
          [...new Set(options.shortUuids)],
          options.relationshipType,
          options.targetLabel ?? null,
        ],
      );
      const jobIds = [...new Set(deleted.map(row => row.job_id))];
      await this.refreshJobs(manager, jobIds);
      return deleted.length;
    });
  }

  async updateJobProperties(
    shortUuids: string[],
    patch: Record<string, unknown>,
  ): Promise<number> {
    if (!shortUuids.length) return 0;
    return this.postgres.transaction(async manager => {
      const jobs = await managerQuery<{ node_id: string }>(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb,
              updated_at = now()
          WHERE label = 'StructuredJobpost'
            AND properties ->> 'shortUUID' = ANY($1::text[])
          RETURNING id::text AS node_id
        `,
        [[...new Set(shortUuids)], JSON.stringify(patch)],
      );
      const jobIds = jobs.map(job => job.node_id);
      await this.refreshJobs(manager, jobIds);
      return jobIds.length;
    });
  }

  private async refreshJobs(
    manager: EntityManager,
    jobIds: string[],
  ): Promise<void> {
    if (!jobIds.length) return;
    await managerQuery(
      manager,
      "SELECT refresh_job_search_document_ids($1::bigint[])",
      [jobIds],
    );
  }

  async getSimilarJobs(
    shortUuid: string,
    ecosystem?: string,
  ): Promise<Record<string, unknown>[]> {
    const now = Date.now();
    const decayMs = 30 * 24 * 60 * 60 * 1000;
    const rows = await this.postgres.query<{
      payload: Record<string, unknown>;
    }>(
      `
        WITH source AS MATERIALIZED (
          SELECT *
          FROM job_search_documents
          WHERE short_uuid = $1
            AND online
            AND NOT blocked
            AND organization_id IS NOT NULL
            AND ($2::text IS NULL OR $2 = ANY(managed_ecosystems))
          ORDER BY job_node_id
          LIMIT 1
        ), scored AS (
          SELECT
            candidate.*,
            organization.payload AS organization_payload,
            0.4 * shared.value::numeric / cardinality(source.tags)
              + 0.3 * (
                1.0 / (
                  1.0 + ($3::bigint - candidate.published_timestamp)::numeric
                    / $4::numeric
                )
              )
              + 0.3 * CASE
                WHEN candidate.classifications && source.classifications THEN 1.0
                ELSE 0.0
              END AS score
          FROM source
          JOIN job_search_documents candidate
            ON candidate.job_node_id <> source.job_node_id
           AND candidate.online
           AND NOT candidate.blocked
           AND candidate.organization_id IS NOT NULL
           AND candidate.organization_id <> source.organization_id
           AND candidate.published_timestamp >= $3::bigint - $4::bigint
           AND candidate.tags && source.tags
           AND ($2::text IS NULL OR $2 = ANY(candidate.managed_ecosystems))
          JOIN organization_search_documents organization
            ON organization.organization_id = candidate.organization_id
          CROSS JOIN LATERAL (
            SELECT count(DISTINCT tag)::integer AS value
            FROM unnest(candidate.tags) tag
            WHERE tag = ANY(source.tags)
          ) shared
          WHERE cardinality(source.tags) > 0
        )
        SELECT jsonb_build_object(
          'shortUUID', short_uuid,
          'title', title,
          'timestamp', published_timestamp,
          'organization', jsonb_build_object(
            'name', organization_payload -> 'name',
            'logoUrl', organization_payload -> 'logoUrl',
            'normalizedName', organization_payload -> 'normalizedName',
            'website', organization_payload -> 'website'
          )
        ) AS payload
        FROM scored
        ORDER BY score DESC, published_timestamp DESC, job_node_id
        LIMIT 5
      `,
      [shortUuid, ecosystem ? slugify(ecosystem) : null, now, decayMs],
    );
    return rows.map(row => row.payload);
  }

  async getJobTagMatchData(
    shortUuid: string,
  ): Promise<JobTagMatchData | undefined> {
    const rows = await this.postgres.query<{
      id: string;
      name: string;
      normalized_name: string;
      related: Array<{ id: string; name: string; normalizedName: string }>;
    }>(
      `
        WITH source AS (
          SELECT job_node_id
          FROM job_search_documents
          WHERE short_uuid = $1
            AND online
            AND NOT blocked
          ORDER BY job_node_id
          LIMIT 1
        ), direct_tags AS (
          SELECT DISTINCT tag.id, tag.properties
          FROM source
          JOIN graph_relationships job_tag
            ON job_tag.source_id = source.job_node_id
           AND job_tag.type = 'HAS_TAG'
          JOIN graph_nodes tag
            ON tag.id = job_tag.target_id
           AND tag.label = 'Tag'
          WHERE NOT EXISTS (
            SELECT 1
            FROM graph_relationships designation
            JOIN graph_nodes blocked ON blocked.id = designation.target_id
            WHERE designation.source_id = tag.id
              AND designation.type = 'HAS_TAG_DESIGNATION'
              AND blocked.label = 'BlockedDesignation'
          )
        )
        SELECT
          direct.properties ->> 'id' AS id,
          direct.properties ->> 'name' AS name,
          direct.properties ->> 'normalizedName' AS normalized_name,
          COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'id', related.properties ->> 'id',
            'name', related.properties ->> 'name',
            'normalizedName', related.properties ->> 'normalizedName'
          )) FILTER (WHERE related.id IS NOT NULL), '[]'::jsonb) AS related
        FROM direct_tags direct
        LEFT JOIN graph_relationships relationship
          ON (
            relationship.source_id = direct.id
            OR relationship.target_id = direct.id
          )
         AND relationship.type IN ('IS_SYNONYM_OF', 'IS_PAIR_OF')
        LEFT JOIN graph_nodes related
          ON related.id = CASE
            WHEN relationship.source_id = direct.id THEN relationship.target_id
            ELSE relationship.source_id
          END
         AND related.label = 'Tag'
        WHERE related.id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM graph_relationships designation
          JOIN graph_nodes blocked ON blocked.id = designation.target_id
          WHERE designation.source_id = related.id
            AND designation.type = 'HAS_TAG_DESIGNATION'
            AND blocked.label = 'BlockedDesignation'
        )
        GROUP BY direct.id, direct.properties
        ORDER BY direct.properties ->> 'normalizedName'
      `,
      [shortUuid],
    );
    if (!rows.length) return undefined;

    const tagMappings = rows.map(row => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      expanded: [
        row.normalized_name,
        ...row.related.map(tag => tag.normalizedName),
      ].filter(
        (value, index, values) => value && values.indexOf(value) === index,
      ),
    }));
    const allTags = [
      ...new Map(
        rows
          .flatMap(row => [
            { id: row.id, name: row.name, normalizedName: row.normalized_name },
            ...row.related,
          ])
          .map(tag => [tag.normalizedName, tag] as const),
      ).values(),
    ];
    return {
      tagMappings,
      allTags,
      jobTags: [...new Set(tagMappings.flatMap(mapping => mapping.expanded))],
    };
  }

  async getSuggestedJobPayloads(options: {
    skills: string[];
    minimumOverlapRatio: number;
    minimumMatchCount: number;
    limit: number;
    offset: number;
  }): Promise<{
    total: number;
    rows: Record<string, unknown>[];
  }> {
    const rows = await this.postgres.query<{
      total_count: string;
      payload: Record<string, unknown>;
    }>(
      `
        WITH direct_skills AS MATERIALIZED (
          SELECT id, properties ->> 'normalizedName' AS normalized_name
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'normalizedName' = ANY($1::text[])
        ), expanded_skills AS MATERIALIZED (
          SELECT normalized_name FROM direct_skills
          UNION
          SELECT related.properties ->> 'normalizedName'
          FROM direct_skills direct
          JOIN graph_relationships relationship
            ON (
              relationship.source_id = direct.id
              OR relationship.target_id = direct.id
            )
           AND relationship.type IN ('IS_SYNONYM_OF', 'IS_PAIR_OF')
          JOIN graph_nodes related
            ON related.id = CASE
              WHEN relationship.source_id = direct.id THEN relationship.target_id
              ELSE relationship.source_id
            END
           AND related.label = 'Tag'
        ), skill_names AS MATERIALIZED (
          SELECT COALESCE(array_agg(DISTINCT normalized_name), ARRAY[]::text[]) AS value
          FROM expanded_skills
          WHERE normalized_name IS NOT NULL
        ), scored AS MATERIALIZED (
          SELECT
            job.*,
            overlap.matched_count,
            CASE
              WHEN cardinality(job.tags) = 0 OR $7::integer = 0
                THEN 0.0
              ELSE sqrt(
                overlap.matched_count::numeric / cardinality(job.tags)
                * overlap.matched_count::numeric / $7::integer
              )
            END AS overlap_ratio
          FROM job_search_documents job
          CROSS JOIN skill_names
          CROSS JOIN LATERAL (
            SELECT count(DISTINCT tag)::integer AS matched_count
            FROM unnest(job.tags) tag
            WHERE tag = ANY(skill_names.value)
          ) overlap
          WHERE job.online
            AND NOT job.blocked
            AND job.published_timestamp >= $2
            AND job.tags && skill_names.value
        ), filtered AS (
          SELECT *
          FROM scored
          WHERE matched_count >= $3
            AND overlap_ratio >= $4
        )
        SELECT
          count(*) OVER ()::text AS total_count,
          jsonb_build_object(
            'id', job.payload -> 'id',
            'shortUUID', job.payload -> 'shortUUID',
            'title', job.payload -> 'title',
            'url', job.payload -> 'url',
            'summary', job.payload -> 'summary',
            'salary', job.payload -> 'salary',
            'minimumSalary', job.payload -> 'minimumSalary',
            'maximumSalary', job.payload -> 'maximumSalary',
            'salaryCurrency', job.payload -> 'salaryCurrency',
            'paysInCrypto', job.payload -> 'paysInCrypto',
            'offersTokenAllocation', job.payload -> 'offersTokenAllocation',
            'seniority', job.payload -> 'seniority',
            'timestamp', to_jsonb(job.published_timestamp),
            'commitment', job.payload -> 'commitment',
            'locationType', job.payload -> 'locationType',
            'classification', job.payload -> 'classification',
            'location', job.payload -> 'location',
            'access', to_jsonb(COALESCE(job.access, 'public')),
            'featured', to_jsonb(COALESCE(job.featured, false)),
            'featureStartDate', job.payload -> 'featureStartDate',
            'featureEndDate', job.payload -> 'featureEndDate',
            'onboardIntoWeb3',
              to_jsonb(COALESCE(job.onboard_into_web3, false)),
            'organization', CASE
              WHEN organization.payload IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', organization.payload -> 'id',
                'name', organization.payload -> 'name',
                'normalizedName', organization.payload -> 'normalizedName',
                'orgId', organization.payload -> 'orgId',
                'website', organization.payload -> 'website',
                'summary', organization.payload -> 'summary',
                'location', organization.payload -> 'location',
                'description', organization.payload -> 'description',
                'logoUrl', organization.payload -> 'logoUrl',
                'headcountEstimate',
                  organization.payload -> 'headcountEstimate',
                'fundingRounds', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', funding_round.value -> 'id',
                      'date', funding_round.value -> 'date',
                      'roundName', funding_round.value -> 'roundName',
                      'raisedAmount', funding_round.value -> 'raisedAmount'
                    )
                    ORDER BY funding_round.ordinality
                  )
                  FROM jsonb_array_elements(
                    COALESCE(
                      organization.payload -> 'fundingRounds',
                      '[]'::jsonb
                    )
                  ) WITH ORDINALITY AS funding_round(value, ordinality)
                  WHERE funding_round.value -> 'id' IS NOT NULL
                    AND funding_round.value -> 'id' <> 'null'::jsonb
                ), '[]'::jsonb),
                'investors', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', investor.value -> 'id',
                      'name', investor.value -> 'name',
                      'normalizedName', investor.value -> 'normalizedName'
                    )
                    ORDER BY investor.ordinality
                  )
                  FROM jsonb_array_elements(
                    COALESCE(
                      organization.payload -> 'investors',
                      '[]'::jsonb
                    )
                  ) WITH ORDINALITY AS investor(value, ordinality)
                ), '[]'::jsonb)
              )
            END,
            'tags', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', tag.value -> 'id',
                  'name', tag.value -> 'name',
                  'normalizedName', tag.value -> 'normalizedName'
                )
                ORDER BY tag.ordinality
              )
              FROM jsonb_array_elements(
                COALESCE(job.payload -> 'tags', '[]'::jsonb)
              ) WITH ORDINALITY AS tag(value, ordinality)
              WHERE tag.value -> 'name' IS NOT NULL
                AND tag.value -> 'name' <> 'null'::jsonb
            ), '[]'::jsonb)
          ) AS payload
        FROM filtered job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        ORDER BY job.published_timestamp DESC, job.overlap_ratio DESC, job.job_node_id
        LIMIT $5 OFFSET $6
      `,
      [
        [...new Set(options.skills.map(slugify))],
        Date.now() - 30 * 24 * 60 * 60 * 1000,
        options.minimumMatchCount,
        options.minimumOverlapRatio,
        options.limit,
        options.offset,
        options.skills.length,
      ],
    );
    return {
      total: Number(rows[0]?.total_count ?? 0),
      rows: rows.map(row => row.payload),
    };
  }

  async getApplicants(options: {
    list: ApplicantList;
    organizationId?: string;
    useAdminList?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const applications = await this.postgres.query<{
      application_id: string;
      application_properties: Record<string, unknown>;
      applicant_id: string;
      applicant_properties: Record<string, unknown>;
      organization_id: string | null;
      project_id: string | null;
      job_tags: string[];
      job_payload: Record<string, unknown>;
    }>(
      `
        SELECT
          application.id::text AS application_id,
          application.properties AS application_properties,
          applicant.id::text AS applicant_id,
          applicant.properties AS applicant_properties,
          job.organization_id,
          job.project_id,
          job.tags AS job_tags,
          COALESCE(job.detail_payload, job.payload) AS job_payload
        FROM graph_relationships application
        JOIN graph_nodes applicant
          ON applicant.id = application.source_id
         AND applicant.label = 'User'
        JOIN job_search_documents job
          ON job.job_node_id = application.target_id
        JOIN organization_search_documents owner
          ON owner.organization_id = job.organization_id
        WHERE application.type = 'APPLIED_TO'
          AND job.online
          AND NOT job.blocked
          AND COALESCE((applicant.properties ->> 'available')::boolean, false)
          AND ($1::text IS NULL OR job.organization_id = $1)
          AND CASE
            WHEN $2 = 'all' THEN true
            WHEN $2 = 'new' THEN application.properties ->> $3 IS NULL
            ELSE application.properties ->> $3 = $2
          END
        ORDER BY (application.properties ->> 'createdTimestamp')::bigint DESC NULLS LAST,
                 application.id
      `,
      [
        options.organizationId ?? null,
        options.list,
        options.useAdminList ? "adminList" : "list",
      ],
    );
    if (!applications.length) return [];

    const applicantIds = [
      ...new Set(applications.map(application => application.applicant_id)),
    ];
    const organizationIds = [
      ...new Set(
        applications.flatMap(application =>
          application.organization_id ? [application.organization_id] : [],
        ),
      ),
    ];
    const projectIds = [
      ...new Set(
        applications.flatMap(application =>
          application.project_id ? [application.project_id] : [],
        ),
      ),
    ];

    const [
      firstRelated,
      profiles,
      workHistories,
      notes,
      organizations,
      projects,
    ] = await Promise.all([
      this.postgres.query<{
        applicant_id: string;
        type: string;
        properties: Record<string, unknown>;
      }>(
        `
          SELECT DISTINCT ON (relationship.source_id, relationship.type)
            relationship.source_id::text AS applicant_id,
            relationship.type,
            related.properties
          FROM graph_relationships relationship
          JOIN graph_nodes related ON related.id = relationship.target_id
          WHERE relationship.source_id = ANY($1::bigint[])
            AND relationship.type IN (
              'HAS_GITHUB_USER', 'HAS_LINKED_ACCOUNT', 'HAS_LOCATION'
            )
          ORDER BY relationship.source_id, relationship.type, relationship.id
        `,
        [applicantIds],
      ),
      this.postgres.query<{
        applicant_id: string;
        emails: string[];
        wallets: string[];
        skills: Record<string, unknown>[];
        skill_names: string[];
        showcases: Record<string, unknown>[];
      }>(
        `
          SELECT
            relationship.source_id::text AS applicant_id,
            COALESCE(array_agg(related.properties ->> 'email' ORDER BY relationship.id)
              FILTER (
                WHERE relationship.type = 'HAS_EMAIL'
                  AND related.properties ->> 'email' IS NOT NULL
              ), ARRAY[]::text[]) AS emails,
            COALESCE(array_agg(related.properties ->> 'address' ORDER BY relationship.id)
              FILTER (
                WHERE relationship.type = 'HAS_LINKED_WALLET'
                  AND related.properties ->> 'address' IS NOT NULL
              ), ARRAY[]::text[]) AS wallets,
            COALESCE(jsonb_agg(
              related.properties || jsonb_build_object(
                'canTeach', CASE lower(relationship.properties ->> 'canTeach')
                  WHEN 'true' THEN true
                  WHEN 'false' THEN false
                  ELSE NULL
                END
              ) ORDER BY relationship.id
            ) FILTER (WHERE relationship.type = 'HAS_SKILL'), '[]'::jsonb) AS skills,
            COALESCE(array_agg(DISTINCT related.properties ->> 'normalizedName')
              FILTER (
                WHERE relationship.type = 'HAS_SKILL'
                  AND related.properties ->> 'normalizedName' IS NOT NULL
              ), ARRAY[]::text[]) AS skill_names,
            COALESCE(jsonb_agg(related.properties ORDER BY relationship.id)
              FILTER (WHERE relationship.type = 'HAS_SHOWCASE'), '[]'::jsonb) AS showcases
          FROM graph_relationships relationship
          JOIN graph_nodes related ON related.id = relationship.target_id
          WHERE relationship.source_id = ANY($1::bigint[])
            AND relationship.type IN (
              'HAS_EMAIL', 'HAS_LINKED_WALLET', 'HAS_SKILL', 'HAS_SHOWCASE'
            )
          GROUP BY relationship.source_id
        `,
        [applicantIds],
      ),
      this.postgres.query<{
        applicant_id: string;
        value: Record<string, unknown>[];
      }>(
        `
          SELECT
            relationship.source_id::text AS applicant_id,
            jsonb_agg(
              history.properties || jsonb_build_object(
                'login', COALESCE(history.properties -> 'login', '""'::jsonb),
                'name', COALESCE(history.properties -> 'name', 'null'::jsonb),
                'logoUrl', COALESCE(history.properties -> 'logoUrl', 'null'::jsonb),
                'description', COALESCE(history.properties -> 'description', 'null'::jsonb),
                'url', COALESCE(history.properties -> 'url', 'null'::jsonb),
                'firstContributedAt', COALESCE(history.properties -> 'firstContributedAt', '0'::jsonb),
                'lastContributedAt', COALESCE(history.properties -> 'lastContributedAt', '0'::jsonb),
                'commitsCount', COALESCE(history.properties -> 'commitsCount', 'null'::jsonb),
                'tenure', COALESCE(history.properties -> 'tenure', '0'::jsonb),
                'cryptoNative', COALESCE(history.properties -> 'cryptoNative', 'false'::jsonb),
                'createdAt', COALESCE(history.properties -> 'createdAt', '0'::jsonb),
                'updatedAt', COALESCE(history.properties -> 'updatedAt', 'null'::jsonb),
                'repositories', COALESCE((
                  SELECT jsonb_agg(
                    repository.properties || jsonb_build_object(
                      'name', COALESCE(repository.properties -> 'name', '""'::jsonb),
                      'url', COALESCE(repository.properties -> 'url', '""'::jsonb),
                      'description', COALESCE(repository.properties -> 'description', 'null'::jsonb),
                      'commitsCount', COALESCE(repository.properties -> 'commitsCount', 'null'::jsonb),
                      'firstContributedAt', COALESCE(repository.properties -> 'firstContributedAt', '0'::jsonb),
                      'lastContributedAt', COALESCE(repository.properties -> 'lastContributedAt', '0'::jsonb),
                      'skills', COALESCE(repository.properties -> 'skills', '[]'::jsonb),
                      'tenure', COALESCE(repository.properties -> 'tenure', '0'::jsonb),
                      'stars', COALESCE(repository.properties -> 'stars', '0'::jsonb),
                      'cryptoNative', COALESCE(repository.properties -> 'cryptoNative', 'false'::jsonb),
                      'createdAt', COALESCE(repository.properties -> 'createdAt', '0'::jsonb),
                      'updatedAt', COALESCE(repository.properties -> 'updatedAt', 'null'::jsonb)
                    ) ORDER BY repository.id
                  )
                  FROM graph_relationships worked_on
                  JOIN graph_nodes repository
                    ON repository.id = worked_on.target_id
                  WHERE worked_on.source_id = history.id
                    AND worked_on.type = 'WORKED_ON_REPO'
                ), '[]'::jsonb)
              ) ORDER BY relationship.id
            ) AS value
          FROM graph_relationships relationship
          JOIN graph_nodes history ON history.id = relationship.target_id
          WHERE relationship.source_id = ANY($1::bigint[])
            AND relationship.type = 'HAS_WORK_HISTORY'
          GROUP BY relationship.source_id
        `,
        [applicantIds],
      ),
      this.postgres.query<{
        applicant_id: string;
        organization_id: string;
        value: unknown;
      }>(
        `
          SELECT DISTINCT ON (
            recruiter_relationship.source_id,
            organization.properties ->> 'orgId'
          )
            recruiter_relationship.source_id::text AS applicant_id,
            organization.properties ->> 'orgId' AS organization_id,
            recruiter_note.properties -> 'note' AS value
          FROM graph_relationships recruiter_relationship
          JOIN graph_nodes recruiter_note
            ON recruiter_note.id = recruiter_relationship.target_id
          JOIN graph_relationships talent_relationship
            ON talent_relationship.target_id = recruiter_note.id
           AND talent_relationship.type = 'HAS_TALENT_NOTE'
          JOIN graph_nodes organization
            ON organization.id = talent_relationship.source_id
           AND organization.label = 'Organization'
          WHERE recruiter_relationship.source_id = ANY($1::bigint[])
            AND recruiter_relationship.type = 'HAS_RECRUITER_NOTE'
          ORDER BY
            recruiter_relationship.source_id,
            organization.properties ->> 'orgId',
            recruiter_relationship.id
        `,
        [applicantIds],
      ),
      organizationIds.length
        ? this.postgres.query<{
            organization_id: string;
            payload: Record<string, unknown>;
          }>(
            `
              SELECT organization_id, payload
              FROM organization_search_documents
              WHERE organization_id = ANY($1::text[])
            `,
            [organizationIds],
          )
        : [],
      projectIds.length
        ? this.postgres.query<{
            project_id: string;
            payload: Record<string, unknown>;
          }>(
            `
              SELECT project_id, COALESCE(detail_payload, payload) AS payload
              FROM project_search_documents
              WHERE project_id = ANY($1::text[])
            `,
            [projectIds],
          )
        : [],
    ]);

    const relatedByKey = new Map(
      firstRelated.map(related => [
        related.applicant_id + ":" + related.type,
        related.properties,
      ]),
    );
    const profilesById = new Map(
      profiles.map(profile => [profile.applicant_id, profile]),
    );
    const workHistoriesById = new Map(
      workHistories.map(history => [history.applicant_id, history.value]),
    );
    const notesByKey = new Map(
      notes.map(note => [
        note.applicant_id + ":" + note.organization_id,
        note.value,
      ]),
    );
    const organizationsById = new Map(
      organizations.map(
        organization =>
          [organization.organization_id, organization.payload] as const,
      ),
    );
    const projectsById = new Map(
      projects.map(project => [project.project_id, project.payload] as const),
    );

    return applications.map(application => {
      const applicant = application.applicant_properties;
      const profile = profilesById.get(application.applicant_id);
      const github =
        relatedByKey.get(application.applicant_id + ":HAS_GITHUB_USER") ?? {};
      const linkedAccount =
        relatedByKey.get(application.applicant_id + ":HAS_LINKED_ACCOUNT") ??
        {};
      const rawLocation =
        relatedByKey.get(application.applicant_id + ":HAS_LOCATION") ?? {};
      const skillNames = new Set(profile?.skill_names ?? []);
      const matchingSkills = new Set(
        application.job_tags.filter(tag => skillNames.has(tag)),
      ).size;

      return {
        oss: null,
        calendly: null,
        interviewed: null,
        attestations: { upvotes: null, downvotes: null },
        note: application.organization_id
          ? (notesByKey.get(
              application.applicant_id + ":" + application.organization_id,
            ) ?? null)
          : null,
        cryptoNative: asBoolean(applicant.cryptoNative),
        cryptoAdjacent: asBoolean(applicant.cryptoAdjacent),
        appliedTimestamp: asNumber(
          application.application_properties.createdTimestamp,
        ),
        user: {
          wallet: String(applicant.wallet ?? ""),
          availableForWork: asBoolean(applicant.available),
          name: applicant.name ?? null,
          githubAvatar: github.avatarUrl ?? null,
          alternateEmails: profile?.emails ?? [],
          linkedAccounts: {
            discord: linkedAccount.discord ?? null,
            telegram: linkedAccount.telegram ?? null,
            google: linkedAccount.google ?? null,
            apple: linkedAccount.apple ?? null,
            github: linkedAccount.github ?? null,
            farcaster: linkedAccount.farcaster ?? null,
            twitter: linkedAccount.twitter ?? null,
            email: linkedAccount.email ?? null,
            wallets: profile?.wallets ?? [],
          },
          location: {
            ...rawLocation,
            city: rawLocation.city ?? null,
            country: rawLocation.country ?? null,
          },
          matchingSkills,
          skills: profile?.skills ?? [],
          showcases: profile?.showcases ?? [],
          workHistory: workHistoriesById.get(application.applicant_id) ?? [],
          cryptoNative: asBoolean(applicant.cryptoNative),
          cryptoAdjacent: asBoolean(applicant.cryptoAdjacent),
        },
        job: {
          ...application.job_payload,
          organization: application.organization_id
            ? (organizationsById.get(application.organization_id) ?? null)
            : null,
          project: application.project_id
            ? (projectsById.get(application.project_id) ?? null)
            : null,
        },
      };
    });
  }
}
