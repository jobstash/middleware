import { EmployerSearchQuery } from "./device-execution.protocol";

type Catalogue = {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
};
export interface EmployerCandidate {
  ref: string;
  kind: "profile" | "organization" | "project";
  name: string;
  aliases: string[];
  website: string | null;
  match: "exact_name" | "alias" | "website" | "similar";
  profile: { ref: string; name: string } | null;
}

// Same host identity as the catalogue's website lookups: equal host or a subdomain either way.
const hostMatches = (
  url: string,
): string => `(normalized_url_host(${url}) = input.host
  OR right(normalized_url_host(${url}), char_length(input.host) + 1) = '.' || input.host
  OR right(input.host, char_length(normalized_url_host(${url})) + 1) = '.' || normalized_url_host(${url}))`;
const stringArray = (
  value: string,
): string => `(SELECT COALESCE(jsonb_agg(alias.value #>> '{}' ORDER BY alias.ordinal), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${value}) = 'array' THEN ${value} ELSE '[]'::jsonb END)
    WITH ORDINALITY alias(value, ordinal)
  WHERE jsonb_typeof(alias.value) = 'string' AND btrim(alias.value #>> '{}') <> '' AND alias.ordinal <= 20)`;
const exactDocuments = (
  table: string,
  idColumn: string,
  kind: string,
  label: string,
): string => `
  SELECT '${kind}' AS kind, entity.id, 2 AS tier,
    CASE WHEN input.slug IN (slugify_text(entity.properties ->> 'name'), slugify_text(entity.properties ->> 'normalizedName'))
      THEN 'exact_name' ELSE 'alias' END AS match, 1::real AS score
  FROM input JOIN ${table} document ON document.names @> ARRAY[input.slug]
  JOIN graph_nodes entity ON entity.id = document.${idColumn} AND entity.label = '${label}'
  WHERE input.slug <> '' AND NOT entity_property_is_banned(entity.properties)`;
// The catalogue's existing fuzzy search: full-text or trigram on search_text.
const similarDocuments = (
  table: string,
  idColumn: string,
  kind: string,
  label: string,
): string => `(
  SELECT '${kind}' AS kind, entity.id, 3 AS tier, 'similar' AS match,
    greatest(similarity(lower(document.name), lower(input.name)), similarity(document.search_text, input.name))::real AS score
  FROM input JOIN ${table} document
    ON document.search_vector @@ websearch_to_tsquery('simple', input.name) OR document.search_text % input.name
  JOIN graph_nodes entity ON entity.id = document.${idColumn} AND entity.label = '${label}'
  WHERE NOT entity_property_is_banned(entity.properties)
  ORDER BY score DESC, entity.id LIMIT 3)`;

const employerSql = `
  WITH input AS MATERIALIZED (
    SELECT $1::text AS name, slugify_text($1::text) AS slug, normalized_url_host($2::text) AS host
  ), profiles AS MATERIALIZED (
    SELECT profile.id, profile.properties, info.properties AS info,
      COALESCE(NULLIF(btrim(info.properties ->> 'displayName'), ''), NULLIF(btrim(info.properties ->> 'name'), ''),
        profile.properties ->> 'slug') AS name
    FROM graph_nodes profile
    JOIN graph_relationships profile_info ON profile_info.source_id = profile.id AND profile_info.type = 'HAS_PROFILE_INFO'
    JOIN graph_nodes info ON info.id = profile_info.target_id AND info.label = 'ProfileInfo'
    WHERE profile.label = 'EntityProfile' AND NOT entity_property_is_banned(profile.properties)
  ), hits AS (
    SELECT 'profile' AS kind, profile.id, 0 AS tier,
      CASE WHEN input.slug IN (profile.properties ->> 'slug', slugify_text(profile.info ->> 'displayName'), slugify_text(profile.info ->> 'name'))
        THEN 'exact_name' ELSE 'alias' END AS match, 1::real AS score
    FROM profiles profile, input
    WHERE input.slug <> '' AND (
      input.slug IN (profile.properties ->> 'slug', slugify_text(profile.info ->> 'displayName'), slugify_text(profile.info ->> 'name'))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(profile.properties -> 'aliases') = 'array'
          THEN profile.properties -> 'aliases' ELSE '[]'::jsonb END) alias(value)
        WHERE slugify_text(alias.value) = input.slug))
    UNION ALL
    SELECT 'profile', profile.id, 1, 'website', 1
    FROM profiles profile, input
    WHERE input.host IS NOT NULL AND ${hostMatches("profile.info ->> 'canonicalSite'")}
    UNION ALL
    SELECT lower(entity.label), entity.id, 1, 'website', 1
    FROM input
    JOIN graph_nodes website ON website.label = 'Website' AND ${hostMatches("website.properties ->> 'url'")}
    JOIN graph_relationships link ON link.target_id = website.id AND link.type = 'HAS_WEBSITE'
    JOIN graph_nodes entity ON entity.id = link.source_id AND entity.label IN ('Organization', 'Project')
    WHERE input.host IS NOT NULL AND NOT entity_property_is_banned(entity.properties)
    UNION ALL ${exactDocuments("organization_search_documents", "organization_node_id", "organization", "Organization")}
    UNION ALL ${exactDocuments("project_search_documents", "project_node_id", "project", "Project")}
    UNION ALL ${similarDocuments("organization_search_documents", "organization_node_id", "organization", "Organization")}
    UNION ALL ${similarDocuments("project_search_documents", "project_node_id", "project", "Project")}
  ), best AS (
    SELECT DISTINCT ON (kind, id) kind, id, tier, match, score FROM hits
    ORDER BY kind, id, tier, (match = 'exact_name') DESC, score DESC
  ), candidates AS (
    SELECT best.*, parent.id AS parent_id, parent.name AS parent_name,
      CASE WHEN best.kind = 'profile' THEN profile.name ELSE NULLIF(btrim(entity.properties ->> 'name'), '') END AS name,
      CASE best.kind
        WHEN 'profile' THEN ${stringArray("profile.properties -> 'aliases'")}
        WHEN 'organization' THEN ${stringArray("COALESCE(organization.detail_payload -> 'aliases', organization.payload -> 'aliases', entity.properties -> 'aliases')")}
        ELSE ${stringArray("COALESCE(project.detail_payload -> 'aliases', project.payload -> 'aliases', entity.properties -> 'aliases')")}
      END AS aliases,
      CASE WHEN best.kind = 'profile' THEN NULLIF(btrim(profile.info ->> 'canonicalSite'), '') ELSE (
        SELECT NULLIF(btrim(website.properties ->> 'url'), '')
        FROM graph_relationships link JOIN graph_nodes website ON website.id = link.target_id AND website.label = 'Website'
        WHERE link.source_id = entity.id AND link.type = 'HAS_WEBSITE' ORDER BY website.id LIMIT 1
      ) END AS website
    FROM best
    JOIN graph_nodes entity ON entity.id = best.id
    LEFT JOIN profiles profile ON best.kind = 'profile' AND profile.id = best.id
    LEFT JOIN organization_search_documents organization ON best.kind = 'organization' AND organization.organization_node_id = best.id
    LEFT JOIN project_search_documents project ON best.kind = 'project' AND project.project_node_id = best.id
    LEFT JOIN LATERAL (
      SELECT owner.id, owner.name
      FROM graph_relationships membership JOIN profiles owner ON owner.id = membership.source_id
      WHERE best.kind <> 'profile' AND membership.target_id = best.id
        AND membership.type IN ('PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT')
      ORDER BY owner.id LIMIT 1
    ) parent ON true
  )
  SELECT kind || ':' || id AS ref, kind, name, aliases, website, match,
    CASE WHEN parent_id IS NULL THEN NULL ELSE jsonb_build_object('ref', 'profile:' || parent_id, 'name', parent_name) END AS profile
  FROM candidates candidate
  WHERE name IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM best WHERE best.kind = 'profile' AND best.id = candidate.parent_id)
  ORDER BY tier, (kind = 'profile') DESC, (match = 'exact_name') DESC, score DESC, name, id
  LIMIT 5`;

/** Read-only public catalogue candidates for client-side employer matching. */
export async function employerSearch(
  db: Catalogue,
  queries: EmployerSearchQuery[],
): Promise<{
  results: Array<{ name: string; candidates: EmployerCandidate[] }>;
}> {
  const results: Array<{ name: string; candidates: EmployerCandidate[] }> = [];
  for (const query of queries) {
    const name = query.name.trim();
    const candidates = (await db.query(employerSql, [
      name,
      query.website?.trim() ?? null,
    ])) as EmployerCandidate[];
    results.push({ name, candidates });
  }
  return { results };
}
