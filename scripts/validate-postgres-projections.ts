import "dotenv/config";
import { Pool } from "pg";
import {
  JobDetailsEntity,
  JobListResultEntity,
  OrgDetailsResultEntity,
  OrgListResultEntity,
  ProjectDetailsEntity,
  ProjectListResultEntity,
} from "../src/shared/entities";

const DEFAULT_DATABASE_URL =
  "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash";

type PayloadRow = { payload: Record<string, unknown> };

const postgres = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  max: 1,
  application_name: "middleware-projection-validator",
});

const validate = (
  name: string,
  rows: PayloadRow[],
  decode: (payload: Record<string, unknown>) => unknown,
): { name: string; total: number; valid: number; errors: string[] } => {
  let valid = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try {
      decode(row.payload);
      valid++;
    } catch (error) {
      if (errors.length < 10) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return { name, total: rows.length, valid, errors };
};

const main = async (): Promise<void> => {
  const jobs = await postgres.query<PayloadRow>(`
    SELECT
      job.payload || CASE
        WHEN organization.payload IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object(
          'organization', organization.payload,
          'project', NULL
        )
      END AS payload
    FROM job_search_documents job
    LEFT JOIN organization_search_documents organization
      ON organization.organization_id = job.organization_id
    WHERE job.online
      AND NOT job.blocked
      AND (job.organization_id IS NOT NULL OR job.project_id IS NOT NULL)
      AND NOT (
        job.access = 'public'
        AND job.organization_has_expert_jobs
      )
  `);
  const organizations = await postgres.query<PayloadRow>(
    "SELECT payload FROM organization_search_documents",
  );
  const projects = await postgres.query<PayloadRow>(
    "SELECT payload FROM project_search_documents",
  );
  const jobDetails = await postgres.query<PayloadRow>(`
    SELECT
      job.payload || CASE
        WHEN organization.payload IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object(
          'organization', organization.payload,
          'project', NULL
        )
      END AS payload
    FROM job_search_documents job
    LEFT JOIN organization_search_documents organization
      ON organization.organization_id = job.organization_id
    WHERE job.online AND NOT job.blocked
    ORDER BY job.job_node_id
    LIMIT 100
  `);
  const organizationDetails = await postgres.query<PayloadRow>(`
    SELECT detail_payload AS payload
    FROM organization_search_documents
    ORDER BY organization_node_id
    LIMIT 100
  `);
  const projectDetails = await postgres.query<PayloadRow>(`
    SELECT detail_payload AS payload
    FROM project_search_documents
    ORDER BY project_node_id
    LIMIT 100
  `);

  const results = [
    validate("jobs", jobs.rows, payload =>
      new JobListResultEntity(payload as never).getProperties(),
    ),
    validate("organizations", organizations.rows, payload =>
      new OrgListResultEntity(payload as never).getProperties(),
    ),
    validate("projects", projects.rows, payload =>
      new ProjectListResultEntity(payload as never).getProperties(),
    ),
    validate("job-details-sample", jobDetails.rows, payload =>
      new JobDetailsEntity(payload as never).getProperties(),
    ),
    validate("organization-details-sample", organizationDetails.rows, payload =>
      new OrgDetailsResultEntity(payload as never).getProperties(),
    ),
    validate("project-details-sample", projectDetails.rows, payload =>
      new ProjectDetailsEntity(payload as never).getProperties(),
    ),
  ];

  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => result.valid !== result.total)) {
    process.exitCode = 1;
  }
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgres.end();
  });
