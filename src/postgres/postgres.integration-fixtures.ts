import type { PostgresService } from "./postgres.service";

export async function createProfileMemberFixture(
  postgres: PostgresService,
  label: "Organization" | "Project",
  key: string,
  properties: Record<string, unknown>,
): Promise<string> {
  const membershipType =
    label === "Organization"
      ? "PROFILE_HAS_ORGANIZATION"
      : "PROFILE_HAS_PROJECT";
  const [row] = await postgres.query<{ id: string }>(
    `
      WITH profile AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          'EntityProfile',
          ARRAY['EntityProfile']::text[],
          $2 || ':fixture-profile',
          jsonb_build_object(
            'id', $2 || ':fixture-profile',
            'slug', $2 || '-fixture-profile'
          )
        )
        RETURNING id
      ), profile_info AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          'ProfileInfo',
          ARRAY['ProfileInfo']::text[],
          $2 || ':fixture-profile-info',
          jsonb_build_object(
            'id', $2 || ':fixture-profile-info',
            'name', COALESCE($3::jsonb ->> 'name', $2)
          )
        )
        RETURNING id
      ), member AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id
      ), info_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT profile.id, profile_info.id, 'HAS_PROFILE_INFO', '', '{}'::jsonb
        FROM profile CROSS JOIN profile_info
        RETURNING id
      ), membership_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT profile.id, member.id, $4, '', '{}'::jsonb
        FROM profile CROSS JOIN member
        RETURNING id
      )
      SELECT member.id::text AS id
      FROM member
      CROSS JOIN info_edge
      CROSS JOIN membership_edge
    `,
    [label, key, JSON.stringify(properties), membershipType],
  );
  return row.id;
}

export async function createOwnedJobsiteFixture(
  postgres: PostgresService,
  ownerNodeId: string,
  key: string,
  properties: Record<string, unknown>,
): Promise<string> {
  const [row] = await postgres.query<{ id: string }>(
    `
      WITH jobsite AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ('Jobsite', ARRAY['Jobsite']::text[], $2, $3::jsonb)
        RETURNING id
      ), ownership_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT $1::bigint, jobsite.id, 'HAS_JOBSITE', '', '{}'::jsonb
        FROM jobsite
        RETURNING id
      )
      SELECT jobsite.id::text AS id
      FROM jobsite
      CROSS JOIN ownership_edge
    `,
    [ownerNodeId, key, JSON.stringify(properties)],
  );
  return row.id;
}

export async function attachStructuredJobToEmployerFixture(
  postgres: PostgresService,
  ownerNodeId: string,
  structuredJobNodeId: string,
  key: string,
  options: { workMode?: "remote" | "hybrid" | "onsite" } = {},
): Promise<{ jobsiteNodeId: string; rawJobNodeId: string }> {
  const [row] = await postgres.query<{
    jobsiteNodeId: string;
    rawJobNodeId: string;
  }>(
    `
      WITH jobsite AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          'Jobsite',
          ARRAY['Jobsite']::text[],
          $3 || ':fixture-jobsite',
          jsonb_build_object(
            'id', $3 || ':fixture-jobsite',
            'type', 'custom',
            'url', 'https://fixture.invalid/jobs'
          )
        )
        RETURNING id
      ), raw_job AS (
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          'Jobpost',
          ARRAY['Jobpost']::text[],
          $3 || ':fixture-raw-job',
          jsonb_build_object(
            'id', $3 || ':fixture-raw-job',
            'url', 'https://fixture.invalid/jobs/' || $3
          )
        )
        RETURNING id
      ), ownership_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT $1::bigint, jobsite.id, 'HAS_JOBSITE', '', '{}'::jsonb
        FROM jobsite
        RETURNING id
      ), raw_job_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT jobsite.id, raw_job.id, 'HAS_JOBPOST', '', '{}'::jsonb
        FROM jobsite CROSS JOIN raw_job
        RETURNING id
      ), structured_job_edge AS (
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        )
        SELECT raw_job.id, $2::bigint, 'HAS_STRUCTURED_JOBPOST', '', '{}'::jsonb
        FROM raw_job
        RETURNING id
      )
      SELECT
        jobsite.id::text AS "jobsiteNodeId",
        raw_job.id::text AS "rawJobNodeId"
      FROM jobsite
      CROSS JOIN raw_job
      CROSS JOIN ownership_edge
      CROSS JOIN raw_job_edge
      CROSS JOIN structured_job_edge
    `,
    [ownerNodeId, structuredJobNodeId, key],
  );

  if (options.workMode) {
    await postgres.query(
      `
        INSERT INTO job_availability_extractions (
          raw_job_node_id,
          jobsite_node_id,
          extractor_version,
          evidence_count
        ) VALUES ($1, $2, 'fixture-v1', 1)
      `,
      [row.rawJobNodeId, row.jobsiteNodeId],
    );
    await postgres.query(
      `
        INSERT INTO job_work_location_options (
          raw_job_node_id,
          jobsite_node_id,
          extractor_version,
          option_key,
          mode,
          scope,
          confidence,
          employer_authored_remote_evidence,
          evidence_quote,
          evidence_start_offset,
          evidence_end_offset,
          evidence_trust,
          evidence_source_v1,
          arrangement_confidence
        ) VALUES (
          $1,
          $2,
          'fixture-v1',
          $3,
          $3,
          'unstated',
          1,
          $3 = 'remote',
          initcap($3),
          0,
          length($3),
          'employer_body',
          'employer_body',
          'source_stated'
        )
      `,
      [row.rawJobNodeId, row.jobsiteNodeId, options.workMode],
    );
  }

  return row;
}
