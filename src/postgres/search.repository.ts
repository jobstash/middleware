import { Injectable } from "@nestjs/common";
import { SearchNav } from "src/shared/interfaces";
import { slugify } from "src/shared/helpers";
import { SuggestionGroupId } from "src/search/dto/job-suggestions.input";
import { SuggestionItem } from "src/search/dto/job-suggestions.output";
import { SkillSuggestionItem } from "src/search/dto/skill-suggestions.output";
import { SitemapJob } from "src/search/dto/pillar-page.output";
import { PostgresService } from "./postgres.service";

export type NavigationFacet = {
  pillar: string;
  label: string;
};

export type PillarSitemapEntry = {
  type: string;
  key: string;
  label: string;
  lastModified: number;
  jobCount: number;
};

type PillarJobPayload = Record<string, unknown>;

const projectionNavigation: Partial<
  Record<
    SearchNav,
    { table: string; facets: { pillar: string; jsonKey: string }[] }
  >
> = {
  projects: {
    table: "project_search_documents",
    facets: [
      { pillar: "categories", jsonKey: "categories" },
      { pillar: "chains", jsonKey: "chains" },
      { pillar: "organizations", jsonKey: "organizations" },
      { pillar: "investors", jsonKey: "investors" },
      { pillar: "names", jsonKey: "names" },
      { pillar: "tags", jsonKey: "tags" },
    ],
  },
  organizations: {
    table: "organization_search_documents",
    facets: [
      { pillar: "locations", jsonKey: "locations" },
      { pillar: "investors", jsonKey: "investors" },
      { pillar: "fundingRounds", jsonKey: "fundingRounds" },
      { pillar: "chains", jsonKey: "chains" },
      { pillar: "names", jsonKey: "names" },
      { pillar: "tags", jsonKey: "tags" },
      { pillar: "projects", jsonKey: "projects" },
    ],
  },
  vcs: {
    table: "organization_search_documents",
    facets: [{ pillar: "names", jsonKey: "investors" }],
  },
};

const suggestionFacetKeys: Exclude<SuggestionGroupId, "jobs">[] = [
  "organizations",
  "tags",
  "classifications",
  "locations",
  "investors",
  "fundingRounds",
];

const labelArray = (key: string): string => `
  COALESCE(
    ARRAY(
      SELECT entry.value
      FROM jsonb_each_text(
        COALESCE(source.filter_labels -> '${key}', '{}'::jsonb)
      ) entry
      ORDER BY entry.value
    ),
    ARRAY[]::text[]
  )
`;

const labelArrayWithFallback = (
  key: string,
  fallbackColumn: string,
): string => `
  ARRAY(
    SELECT DISTINCT entry.value
    FROM unnest(
      ${labelArray(key)}
      || COALESCE(source.${fallbackColumn}, ARRAY[]::text[])
    ) AS entry(value)
    WHERE entry.value <> ''
    ORDER BY entry.value
  )
`;

const organizationSummary = (alias: string): string => `
  jsonb_build_object(
    'id', ${alias}.payload -> 'id',
    'orgId', ${alias}.payload -> 'orgId',
    'name', ${alias}.payload -> 'name',
    'normalizedName', ${alias}.payload -> 'normalizedName',
    'summary', ${alias}.payload -> 'summary',
    'description', ${alias}.payload -> 'description',
    'logoUrl', ${alias}.payload -> 'logoUrl',
    'location', ${alias}.payload -> 'location',
    'headcountEstimate', ${alias}.payload -> 'headcountEstimate',
    'website', ${alias}.payload -> 'website',
    'discord', ${alias}.payload -> 'discord',
    'telegram', ${alias}.payload -> 'telegram',
    'github', ${alias}.payload -> 'github',
    'twitter', ${alias}.payload -> 'twitter',
    'docs', ${alias}.payload -> 'docs',
    'aliases', COALESCE(${alias}.payload -> 'aliases', '[]'::jsonb),
    'projects', COALESCE(${alias}.payload -> 'projects', '[]'::jsonb),
    'fundingRounds', COALESCE(${alias}.payload -> 'fundingRounds', '[]'::jsonb),
    'investors', COALESCE(${alias}.payload -> 'investors', '[]'::jsonb)
  )
`;

@Injectable()
export class SearchRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getNavigationFacets(
    nav: SearchNav,
    query?: string | null,
  ): Promise<NavigationFacet[]> {
    if (nav === "grants" || nav === "impact") {
      const configs = await this.getGrantConfigs(nav === "grants");
      const pillars = [
        "categories",
        "chains",
        "ecosystems",
        "organizations",
        "names",
      ];
      return pillars.flatMap(pillar => {
        const counts = new Map<string, { label: string; count: number }>();
        for (const config of configs) {
          for (const value of this.asArray(config[pillar])) {
            if (
              query &&
              !value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
            ) {
              continue;
            }
            const key = slugify(value);
            const current = counts.get(key);
            counts.set(key, {
              label: value,
              count: (current?.count ?? 0) + 1,
            });
          }
        }
        return [...counts.values()]
          .sort(
            (first, second) =>
              second.count - first.count ||
              first.label.localeCompare(second.label),
          )
          .slice(0, 10)
          .map(value => ({ pillar, label: value.label }));
      });
    }

    const source = projectionNavigation[nav];
    if (!source) return [];
    const unions = source.facets
      .map(
        facet => `
          SELECT '${facet.pillar}'::text AS pillar, entry.value AS label,
            source.updated_at
          FROM source
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(source.filter_labels -> '${facet.jsonKey}', '{}'::jsonb)
          ) entry
        `,
      )
      .join("\nUNION ALL\n");
    return this.postgres.query<NavigationFacet>(
      `
        WITH source AS MATERIALIZED (
          SELECT filter_labels, updated_at
          FROM ${source.table}
        ), facet_values AS MATERIALIZED (
          ${unions}
        ), aggregated AS (
          SELECT
            pillar,
            label,
            count(*) AS popularity,
            max(updated_at) AS most_recent,
            similarity(lower(label), lower(COALESCE($1, ''))) AS score
          FROM facet_values
          WHERE label IS NOT NULL
            AND label <> ''
            AND (
              $1::text IS NULL
              OR lower(label) LIKE '%' || lower($1) || '%'
            )
          GROUP BY pillar, label
        ), ranked AS (
          SELECT *, row_number() OVER (
            PARTITION BY pillar
            ORDER BY
              CASE WHEN $1::text IS NOT NULL THEN score END DESC NULLS LAST,
              CASE WHEN $1::text IS NULL THEN popularity END DESC NULLS LAST,
              most_recent DESC,
              label
          ) AS rank
          FROM aggregated
        )
        SELECT pillar, label
        FROM ranked
        WHERE rank <= 10
        ORDER BY pillar, rank
      `,
      [query?.trim() || null],
    );
  }

  async getPillarConfigs(
    nav: SearchNav,
    ecosystem?: string,
  ): Promise<Record<string, unknown>[]> {
    if (nav === "grants" || nav === "impact") {
      return this.getGrantConfigs(nav === "grants");
    }
    const ecosystemSlug = ecosystem ? slugify(ecosystem) : null;
    if (nav === "projects") {
      const rows = await this.postgres.query<{
        config: Record<string, unknown>;
      }>(
        `
          SELECT jsonb_build_object(
            'names', ${labelArray("names")},
            'organizations', ${labelArray("organizations")},
            'ecosystems', ${labelArrayWithFallback("ecosystems", "managed_ecosystems")},
            'categories', ${labelArray("categories")},
            'chains', ${labelArray("chains")},
            'investors', ${labelArray("investors")},
            'tags', ${labelArray("tags")},
            'tvl', source.tvl,
            'monthlyFees', source.monthly_fees,
            'monthlyVolume', source.monthly_volume,
            'monthlyRevenue', source.monthly_revenue,
            'audits', source.has_audits,
            'hacks', source.has_hacks,
            'token', source.has_token
          ) AS config
          FROM project_search_documents source
          WHERE $1::text IS NULL OR $1 = ANY(source.managed_ecosystems)
        `,
        [ecosystemSlug],
      );
      return rows.map(row => row.config);
    }
    if (nav === "organizations") {
      const rows = await this.postgres.query<{
        config: Record<string, unknown>;
      }>(
        `
          SELECT jsonb_build_object(
            'names', ${labelArray("names")},
            'chains', ${labelArray("chains")},
            'locations', ${labelArray("locations")},
            'investors', ${labelArray("investors")},
            'fundingRounds', ${labelArray("fundingRounds")},
            'tags', ${labelArray("tags")},
            'projects', ${labelArray("projects")},
            'ecosystems', ${labelArrayWithFallback("ecosystems", "managed_ecosystems")},
            'headCount', source.headcount_estimate,
            'hasProjects', source.has_projects,
            'hasJobs', source.recent_job_timestamp IS NOT NULL
          ) AS config
          FROM organization_search_documents source
          WHERE $1::text IS NULL OR $1 = ANY(source.managed_ecosystems)
        `,
        [ecosystemSlug],
      );
      return rows.map(row => row.config);
    }
    if (nav === "jobs") {
      const rows = await this.postgres.query<{
        config: Record<string, unknown>;
      }>(
        `
          SELECT jsonb_build_object(
            'tags', ${labelArray("tags")},
            'locations', ${labelArray("locations")},
            'commitments', ${labelArray("commitments")},
            'locationTypes', ${labelArrayWithFallback("locationTypes", "location_types")},
            'classifications', ${labelArray("classifications")},
            'seniority', CASE
              WHEN source.seniority IS NULL THEN ARRAY[]::text[]
              WHEN source.seniority = '1' THEN ARRAY['intern']::text[]
              WHEN source.seniority = '2' THEN ARRAY['junior']::text[]
              WHEN source.seniority = '3' THEN ARRAY['senior']::text[]
              WHEN source.seniority = '4' THEN ARRAY['lead']::text[]
              WHEN source.seniority = '5' THEN ARRAY['head']::text[]
              ELSE ARRAY[source.seniority]::text[]
            END,
            'organizations', ${labelArray("organizations")},
            'investors', ${labelArray("investors")},
            'fundingRounds', ${labelArray("fundingRounds")}
          ) AS config
          FROM job_search_documents source
          WHERE source.online
            AND NOT source.blocked
            AND ($1::text IS NULL OR $1 = ANY(source.managed_ecosystems))
        `,
        [ecosystemSlug],
      );
      return rows.map(row => row.config);
    }
    return [];
  }

  async getStoredPillarText(
    nav: SearchNav,
    pillar: string,
    item?: string,
  ): Promise<{ title: string; description: string } | undefined> {
    const [row] = await this.postgres.query<{
      title: string;
      description: string;
    }>(
      `
        SELECT
          properties ->> 'title' AS title,
          properties ->> 'description' AS description
        FROM graph_nodes
        WHERE label = $1
          AND properties ->> 'nav' = $2
          AND properties ->> 'pillar' = $3
          AND (
            ($4::text IS NULL AND properties ->> 'item' IS NULL)
            OR properties ->> 'item' = $4
          )
        ORDER BY id
        LIMIT 1
      `,
      [item ? "PillarItem" : "Pillar", nav, pillar, item ?? null],
    );
    return row?.title && row?.description ? row : undefined;
  }

  async getOrganizationPillar(
    normalizedName: string,
  ): Promise<Record<string, unknown> | undefined> {
    const [row] = await this.postgres.query<{
      payload: Record<string, unknown>;
    }>(
      `
        SELECT ${organizationSummary("organization")} AS payload
        FROM organization_search_documents organization
        WHERE organization.normalized_name = $1
        LIMIT 1
      `,
      [normalizedName],
    );
    return row?.payload;
  }

  async getPillarJobs(options: {
    pillarType: string;
    value: string;
    ecosystem?: string;
    startDate: number;
    endDate: number;
    limit?: number;
  }): Promise<PillarJobPayload[]> {
    const parameters: unknown[] = [options.startDate, options.endDate];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    const predicates = [
      "job.online",
      "NOT job.blocked",
      "job.published_timestamp >= $1",
      "job.published_timestamp <= $2",
    ];
    if (options.ecosystem) {
      predicates.push(
        `${bind(slugify(options.ecosystem))} = ANY(job.managed_ecosystems)`,
      );
    }
    const hasFacetKey = (facet: string, key: string): string =>
      `COALESCE(job.filter_labels -> '${facet}', '{}'::jsonb) ? ${bind(key)}`;
    const value = options.value;
    switch (options.pillarType) {
      case "tags":
        predicates.push(hasFacetKey("tags", value));
        break;
      case "classifications":
        predicates.push(hasFacetKey("classifications", value));
        break;
      case "locations":
        predicates.push(`slugify_text(job.location) = ${bind(value)}`);
        break;
      case "commitments":
        predicates.push(hasFacetKey("commitments", value));
        break;
      case "locationTypes":
        predicates.push(hasFacetKey("locationTypes", value));
        break;
      case "organizations":
        predicates.push(hasFacetKey("organizations", value));
        break;
      case "seniority": {
        const seniority =
          { intern: "1", junior: "2", senior: "3", lead: "4", head: "5" }[
            value.toLowerCase()
          ] ?? value;
        predicates.push(`job.seniority = ${bind(seniority)}`);
        break;
      }
      case "investors":
        predicates.push(hasFacetKey("investors", value));
        break;
      case "fundingRounds":
        predicates.push(hasFacetKey("fundingRounds", value));
        break;
      case "booleans":
        if (value === "expertJobs") predicates.push("job.access = 'protected'");
        else if (value === "onboardIntoWeb3") {
          predicates.push("job.onboard_into_web3");
        }
        break;
      default:
        predicates.push("false");
    }
    const limit = Math.min(100, Math.max(1, options.limit ?? 60));
    parameters.push(limit);
    const rows = await this.postgres.query<{ payload: PillarJobPayload }>(
      `
        SELECT job.detail_payload || jsonb_build_object(
          'organization', CASE
            WHEN organization.organization_id IS NULL THEN NULL
            ELSE ${organizationSummary("organization")}
          END
        ) AS payload
        FROM job_search_documents job
        LEFT JOIN organization_search_documents organization
          ON organization.organization_id = job.organization_id
        WHERE ${predicates.join("\n          AND ")}
        ORDER BY
          job.featured DESC,
          job.feature_start_timestamp ASC NULLS LAST,
          (job.feature_end_timestamp - job.feature_start_timestamp) DESC NULLS LAST,
          job.published_timestamp DESC NULLS LAST,
          job.job_node_id
        LIMIT $${parameters.length}
      `,
      parameters,
    );
    return rows.map(row => row.payload);
  }

  async getJobPillarSitemap(options: {
    startDate: number;
    endDate: number;
  }): Promise<PillarSitemapEntry[]> {
    const rows = await this.postgres.query<{
      type: string;
      key: string;
      label: string;
      lastModified: string;
      jobCount: string;
    }>(
      `
        WITH active AS MATERIALIZED (
          SELECT *
          FROM job_search_documents
          WHERE online
            AND NOT blocked
            AND published_timestamp >= $1
            AND published_timestamp <= $2
        ), facets AS (
          SELECT 'tags'::text AS type, entry.key, entry.value AS label,
            job_node_id, published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'tags', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'locations', slugify_text(location), location,
            job_node_id, published_timestamp
          FROM active WHERE location IS NOT NULL
          UNION ALL
          SELECT 'commitments', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'commitments', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'locationTypes', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'locationTypes', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'classifications', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'classifications', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'seniority', CASE seniority
              WHEN '1' THEN 'intern' WHEN '2' THEN 'junior'
              WHEN '3' THEN 'senior' WHEN '4' THEN 'lead'
              WHEN '5' THEN 'head' ELSE seniority END,
            CASE seniority
              WHEN '1' THEN 'intern' WHEN '2' THEN 'junior'
              WHEN '3' THEN 'senior' WHEN '4' THEN 'lead'
              WHEN '5' THEN 'head' ELSE seniority END,
            job_node_id, published_timestamp
          FROM active WHERE seniority IS NOT NULL
          UNION ALL
          SELECT 'organizations', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'organizations', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'investors', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'investors', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'fundingRounds', entry.key, entry.value, job_node_id,
            published_timestamp
          FROM active
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(filter_labels -> 'fundingRounds', '{}'::jsonb)
          ) entry
          UNION ALL
          SELECT 'booleans', 'expertJobs', 'expertJobs', job_node_id,
            published_timestamp FROM active WHERE access = 'protected'
          UNION ALL
          SELECT 'booleans', 'onboardIntoWeb3', 'onboardIntoWeb3', job_node_id,
            published_timestamp FROM active WHERE onboard_into_web3
        )
        SELECT type, key, min(label) AS label,
          max(published_timestamp)::text AS "lastModified",
          count(DISTINCT job_node_id)::text AS "jobCount"
        FROM facets
        WHERE key IS NOT NULL AND key <> ''
        GROUP BY type, key
        ORDER BY type, key
      `,
      [options.startDate, options.endDate],
    );
    return rows.map(row => ({
      type: row.type,
      key: row.key,
      label: row.label,
      lastModified: Number(row.lastModified),
      jobCount: Number(row.jobCount),
    }));
  }

  async getSuggestionGroups(
    query: string,
    startDate: number,
    endDate: number,
  ): Promise<SuggestionGroupId[]> {
    const facetUnions = suggestionFacetKeys
      .map(
        group => `
          SELECT '${group}'::text AS group_id, entry.value AS label
          FROM recent
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(recent.filter_labels -> '${group}', '{}'::jsonb)
          ) entry
        `,
      )
      .join("\nUNION ALL\n");
    const rows = await this.postgres.query<{ groupId: SuggestionGroupId }>(
      `
        WITH recent AS MATERIALIZED (
          SELECT * FROM job_search_documents
          WHERE online AND NOT blocked
            AND published_timestamp BETWEEN $2 AND $3
        ), candidates AS (
          SELECT 'jobs'::text AS group_id, title AS label FROM recent
          UNION ALL
          ${facetUnions}
        )
        SELECT DISTINCT group_id AS "groupId"
        FROM candidates
        WHERE lower(label) LIKE '%' || lower($1) || '%'
          OR lower(label) % lower($1)
      `,
      [query, startDate, endDate],
    );
    return rows.map(row => row.groupId);
  }

  async getSuggestionItems(options: {
    group: SuggestionGroupId;
    query?: string | null;
    startDate: number;
    endDate: number;
    offset: number;
    limit: number;
  }): Promise<SuggestionItem[]> {
    if (options.group === "jobs") {
      const rows = await this.postgres.query<{
        id: string;
        title: string;
        organizationName: string | null;
      }>(
        `
          SELECT short_uuid AS id, title,
            organization_name AS "organizationName"
          FROM job_search_documents
          WHERE online AND NOT blocked
            AND published_timestamp BETWEEN $2 AND $3
            AND (
              $1::text IS NULL
              OR lower(title) LIKE '%' || lower($1) || '%'
              OR lower(title) % lower($1)
            )
          ORDER BY
            CASE WHEN $1::text IS NOT NULL
              THEN similarity(lower(title), lower($1)) END DESC NULLS LAST,
            published_timestamp DESC NULLS LAST,
            job_node_id
          OFFSET $4 LIMIT $5
        `,
        [
          options.query?.trim() || null,
          options.startDate,
          options.endDate,
          Math.max(0, options.offset),
          Math.max(1, options.limit),
        ],
      );
      return rows.map(row => ({
        id: row.id,
        label: `${row.title}${row.organizationName ? ` at ${row.organizationName}` : ""}`,
        href: `/${slugify(row.title)}/${row.id}`,
      }));
    }

    const group = options.group;
    const prefix: Record<Exclude<SuggestionGroupId, "jobs">, string> = {
      organizations: "o",
      tags: "t",
      classifications: "cl",
      locations: "l",
      investors: "i",
      fundingRounds: "fr",
    };
    const rows = await this.postgres.query<{ id: string; label: string }>(
      `
        WITH recent AS MATERIALIZED (
          SELECT * FROM job_search_documents
          WHERE online AND NOT blocked
            AND published_timestamp BETWEEN $2 AND $3
        ), values AS (
          SELECT entry.key AS id, entry.value AS label,
            count(DISTINCT recent.job_node_id) AS popularity
          FROM recent
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(recent.filter_labels -> '${group}', '{}'::jsonb)
          ) entry
          WHERE $1::text IS NULL
            OR lower(entry.value) LIKE '%' || lower($1) || '%'
            OR lower(entry.value) % lower($1)
          GROUP BY entry.key, entry.value
        )
        SELECT id, label
        FROM values
        ORDER BY
          CASE WHEN $1::text IS NOT NULL
            THEN similarity(lower(label), lower($1)) END DESC NULLS LAST,
          label,
          popularity DESC
        OFFSET $4 LIMIT $5
      `,
      [
        options.query?.trim() || null,
        options.startDate,
        options.endDate,
        Math.max(0, options.offset),
        Math.max(1, options.limit),
      ],
    );
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      href: `/${prefix[group]}-${row.id}`,
    }));
  }

  async getSkillSuggestions(options: {
    query?: string | null;
    startDate: number;
    endDate: number;
    offset: number;
    limit: number;
  }): Promise<SkillSuggestionItem[]> {
    return this.postgres.query<SkillSuggestionItem & Record<string, unknown>>(
      `
        WITH recent_tags AS (
          SELECT entry.key AS normalized_name, entry.value AS name,
            count(DISTINCT job.job_node_id) AS popularity
          FROM job_search_documents job
          CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(job.filter_labels -> 'tags', '{}'::jsonb)
          ) entry
          WHERE job.online AND NOT job.blocked
            AND job.published_timestamp BETWEEN $2 AND $3
            AND (
              $1::text IS NULL
              OR lower(entry.value) LIKE '%' || lower($1) || '%'
              OR lower(entry.value) % lower($1)
            )
          GROUP BY entry.key, entry.value
        )
        SELECT tag.properties ->> 'id' AS id,
          recent_tags.name,
          recent_tags.normalized_name AS "normalizedName"
        FROM recent_tags
        JOIN graph_nodes tag
          ON tag.label = 'Tag'
         AND tag.properties ->> 'normalizedName' = recent_tags.normalized_name
        ORDER BY
          CASE WHEN $1::text IS NOT NULL
            THEN similarity(lower(recent_tags.name), lower($1)) END DESC NULLS LAST,
          recent_tags.popularity DESC,
          recent_tags.name
        OFFSET $4 LIMIT $5
      `,
      [
        options.query?.trim() || null,
        options.startDate,
        options.endDate,
        Math.max(0, options.offset),
        Math.max(1, options.limit),
      ],
    );
  }

  async getSitemapJobs(): Promise<SitemapJob[]> {
    const rows = await this.postgres.query<{
      shortUUID: string;
      title: string | null;
      organizationName: string | null;
      timestamp: string | null;
    }>(
      `
        SELECT short_uuid AS "shortUUID", title,
          organization_name AS "organizationName",
          published_timestamp::text AS timestamp
        FROM job_search_documents
        WHERE online
          AND NOT blocked
          AND cardinality(tags) > 0
        ORDER BY published_timestamp DESC NULLS LAST, job_node_id
      `,
    );
    return rows.map(row => ({
      shortUUID: row.shortUUID,
      title: row.title,
      organizationName: row.organizationName,
      timestamp: row.timestamp ? Number(row.timestamp) : null,
    }));
  }

  private async getGrantConfigs(
    active: boolean,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.postgres.query<{ config: Record<string, unknown> }>(
      `
        SELECT jsonb_build_object(
          'names', ARRAY[program.properties ->> 'name'],
          'date', jsonb_numeric_value(metadata.properties, 'startsAt'),
          'programBudget', jsonb_numeric_value(metadata.properties, 'programBudget'),
          'categories', COALESCE((
            SELECT jsonb_agg(DISTINCT related.properties ->> 'name')
            FROM graph_relationships relationship
            JOIN graph_nodes related ON related.id = relationship.target_id
            WHERE relationship.source_id = metadata.id
              AND relationship.type = 'HAS_CATEGORY'
              AND related.properties ->> 'name' IS NOT NULL
          ), '[]'::jsonb),
          'chains', COALESCE((
            SELECT jsonb_agg(DISTINCT related.properties ->> 'name')
            FROM graph_relationships relationship
            JOIN graph_nodes related ON related.id = relationship.target_id
            WHERE relationship.source_id = metadata.id
              AND relationship.type = 'HAS_NETWORK'
              AND related.properties ->> 'name' IS NOT NULL
          ), '[]'::jsonb),
          'ecosystems', COALESCE((
            SELECT jsonb_agg(DISTINCT related.properties ->> 'name')
            FROM graph_relationships relationship
            JOIN graph_nodes related ON related.id = relationship.target_id
            WHERE relationship.source_id = metadata.id
              AND relationship.type = 'HAS_ECOSYSTEM'
              AND related.properties ->> 'name' IS NOT NULL
          ), '[]'::jsonb),
          'organizations', COALESCE((
            SELECT jsonb_agg(DISTINCT related.properties ->> 'name')
            FROM graph_relationships relationship
            JOIN graph_nodes related ON related.id = relationship.target_id
            WHERE relationship.source_id = metadata.id
              AND relationship.type = 'HAS_ORGANIZATION'
              AND related.properties ->> 'name' IS NOT NULL
          ), '[]'::jsonb)
        ) AS config
        FROM graph_nodes program
        JOIN graph_relationships metadata_relationship
          ON metadata_relationship.source_id = program.id
         AND metadata_relationship.type = 'HAS_METADATA'
        JOIN graph_nodes metadata
          ON metadata.id = metadata_relationship.target_id
         AND metadata.label = 'KarmaGapProgramMetadata'
        WHERE program.label = 'KarmaGapProgram'
          AND EXISTS (
            SELECT 1
            FROM graph_relationships status_relationship
            JOIN graph_nodes status ON status.id = status_relationship.target_id
            WHERE status_relationship.source_id = program.id
              AND status_relationship.type = 'HAS_STATUS'
              AND status.label = 'KarmaGapStatus'
              AND status.properties ->> 'name' = $1
          )
      `,
      [active ? "Active" : "Inactive"],
    );
    return rows.map(row => row.config);
  }

  private asArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return value === null || value === undefined ? [] : [String(value)];
  }
}
