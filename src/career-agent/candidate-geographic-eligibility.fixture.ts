import { readFileSync } from "node:fs";
import { join } from "node:path";

type Database = { query(sql: string, values?: unknown[]): Promise<unknown> };

/** Minimal isolated catalog for behavior tests; production uses the GeoNames catalog. */
export async function installCandidateGeographyFixture(db: Database): Promise<void> {
  await db.query(`
    ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS work_arrangement jsonb;
    CREATE TABLE place_reference(place_id text PRIMARY KEY,kind text,canonical_name text,normalized_name text,
      country_code text,ancestor_place_ids text[] DEFAULT '{}',timezone_ids text[] DEFAULT '{}',properties jsonb DEFAULT '{}');
    CREATE TABLE place_aliases(alias_normalized text,place_id text,priority integer DEFAULT 0);
    CREATE OR REPLACE FUNCTION slugify_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS
      'SELECT trim(both ''-'' from regexp_replace(lower($1),''[^a-z0-9]+'',''-'',''g''))';
    CREATE FUNCTION resolve_place_alias(alias_text text,allowed_kinds text[] DEFAULT NULL,
      country_code_hint text DEFAULT NULL,ancestor_place_id_hint text DEFAULT NULL)
    RETURNS text LANGUAGE sql STABLE AS $$
      WITH candidates AS (
        SELECT DISTINCT p.place_id, p.normalized_name=slugify_text(alias_text) AS exact,
          COALESCE(a.priority,0) AS priority
        FROM place_reference p LEFT JOIN place_aliases a ON a.place_id=p.place_id
          AND a.alias_normalized=slugify_text(alias_text)
        WHERE (p.normalized_name=slugify_text(alias_text) OR a.place_id IS NOT NULL)
          AND (allowed_kinds IS NULL OR p.kind=ANY(allowed_kinds))
          AND (country_code_hint IS NULL OR p.country_code=upper(country_code_hint))
          AND (ancestor_place_id_hint IS NULL OR p.place_id=ancestor_place_id_hint OR ancestor_place_id_hint=ANY(p.ancestor_place_ids))
      ), ranked AS (SELECT *,dense_rank() OVER(ORDER BY exact DESC,priority DESC) AS rank FROM candidates)
      SELECT min(place_id) FROM ranked WHERE rank=1 HAVING count(DISTINCT place_id)=1
    $$;
    INSERT INTO place_reference(place_id,kind,canonical_name,normalized_name,country_code,ancestor_place_ids,timezone_ids) VALUES
      ('europe','continent','Europe','europe',NULL,'{emea}','{}'),
      ('emea','business_region','EMEA','emea',NULL,'{}','{}'),
      ('north-america','continent','North America','north-america',NULL,'{}','{}'),
      ('nl','country','The Netherlands','the-netherlands','NL','{europe,emea}','{Europe/Amsterdam}'),
      ('us','country','United States','united-states','US','{north-america}','{America/Los_Angeles,America/New_York}'),
      ('de','country','Germany','germany','DE','{europe,emea}','{Europe/Berlin}'),
      ('amsterdam','city','Amsterdam','amsterdam','NL','{nl,europe,emea}','{Europe/Amsterdam}'),
      ('rotterdam','city','Rotterdam','rotterdam','NL','{nl,europe,emea}','{Europe/Amsterdam}'),
      ('san-francisco','city','San Francisco','san-francisco','US','{us,north-america}','{America/Los_Angeles}'),
      ('berlin','city','Berlin','berlin','DE','{de,europe,emea}','{Europe/Berlin}');
    INSERT INTO place_aliases VALUES('netherlands','nl',70),('sf','san-francisco',70),('holland','nl',60);
    CREATE TABLE job_availability_extractions(raw_job_node_id bigint,jobsite_node_id bigint,extractor_version text,extracted_at timestamptz DEFAULT now());
    CREATE TABLE job_work_location_options(raw_job_node_id bigint,jobsite_node_id bigint,extractor_version text,
      option_key text DEFAULT 'primary',alternative_group_key text,mode text DEFAULT 'remote',scope text DEFAULT 'global',
      countries text[] DEFAULT '{}',regions text[] DEFAULT '{}',excluded_countries text[] DEFAULT '{}',excluded_regions text[] DEFAULT '{}',
      minimum_utc_offset_minutes integer,maximum_utc_offset_minutes integer,timezone_preference_strength text DEFAULT 'unstated',
      required_minimum_utc_offset_minutes integer,required_maximum_utc_offset_minutes integer,
      preferred_minimum_utc_offset_minutes integer,preferred_maximum_utc_offset_minutes integer,
      residency_requirements text[] DEFAULT '{}',residency_requirement text,
      work_authorizations text[] DEFAULT '{}',work_authorization text,sponsorship_status text DEFAULT 'unstated',
      office_city text,office_location jsonb,attendance_cadence text,travel_requirement text,arrangement_confidence text DEFAULT 'source_stated');
  `);
  await db.query(readFileSync(join(__dirname, "../../scripts/sql/candidate-geographic-eligibility.sql"), "utf8"));
}

export async function saveCandidateGeographyFixture(
  db: Database, structuredId: string | number, rawId: string | number,
): Promise<void> {
  await db.query(`UPDATE job_search_documents SET work_arrangement='{"version":"WorkArrangementV1","classification":"verified_remote","fullyRemote":true}' WHERE job_node_id=$1`, [structuredId]);
  await db.query(`INSERT INTO job_availability_extractions(raw_job_node_id,jobsite_node_id,extractor_version) VALUES($1,$1,'geo-test')`, [rawId]);
  await db.query(`INSERT INTO job_work_location_options(raw_job_node_id,jobsite_node_id,extractor_version) VALUES($1,$1,'geo-test')`, [rawId]);
}
