import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios, { AxiosInstance } from "axios";
import * as https from "https";
import { PostgresService } from "src/postgres/postgres.service";

/** Scorer HTTP client for intro-path lookups (same settings as team intelligence). */
export const INTRO_PATHS_HTTP = "INTRO_PATHS_HTTP";
export function introPathsHttp(config: ConfigService): AxiosInstance {
  return axios.create({
    baseURL: config.get<string>("SCORER_DOMAIN"),
    headers: {
      Authorization: `Bearer ${config.get<string>("SCORER_API_KEY")}`,
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 15_000,
  });
}

/** The GitHub username the Privy webhook synchronizes, else the linked indexer account. */
export async function ownerGithubLogin(
  db: PostgresService,
  owner: string,
): Promise<string | null> {
  const [github] = await db.query<{ login: string | null }>(
    `SELECT COALESCE(
      (SELECT NULLIF(btrim(account.properties->>'github'),'') FROM graph_relationships link
        JOIN graph_nodes account ON account.id=link.target_id AND account.label='LinkedAccount'
        WHERE link.source_id=$1 AND link.type='HAS_LINKED_ACCOUNT' ORDER BY account.id LIMIT 1),
      (SELECT NULLIF(btrim(account.properties->>'login'),'') FROM graph_relationships link
        JOIN graph_nodes account ON account.id=link.target_id AND account.label='GithubUser'
        WHERE link.source_id=$1 AND link.type='HAS_GITHUB_USER' ORDER BY account.id LIMIT 1)) AS login`,
    [owner],
  );
  return github?.login ? github.login : null;
}

export interface JobEmployer {
  company: string;
  orgLogins: string[];
}

/** Employer name and linked GitHub organization logins per platform job id; unknown ids are absent. */
export async function jobEmployerGithubLogins(
  db: PostgresService,
  jobIds: string[],
): Promise<Map<string, JobEmployer>> {
  const rows = await db.query<{
    id: string;
    company: string;
    org_logins: string[];
  }>(
    `WITH requested AS (SELECT id, CASE WHEN substring(id FROM 6)::numeric <= 9223372036854775807 THEN substring(id FROM 6)::bigint END AS node_id
      FROM unnest($1::text[]) input(id))
    SELECT requested.id, COALESCE(NULLIF(j.organization_name,''), o.payload->>'name', '') AS company,
      COALESCE(array_agg(DISTINCT lower(gh.properties->>'login')) FILTER (WHERE gh.properties->>'login' IS NOT NULL), '{}') AS org_logins
    FROM requested JOIN job_search_documents j ON j.job_node_id = requested.node_id
    LEFT JOIN organization_search_documents o ON o.organization_id = j.organization_id
    LEFT JOIN graph_relationships e ON e.source_id = o.organization_node_id AND e.type = 'HAS_GITHUB'
    LEFT JOIN graph_nodes gh ON gh.id = e.target_id AND gh.label = 'GithubOrganization'
    GROUP BY requested.id, j.organization_name, o.payload`,
    [jobIds],
  );
  return new Map(
    rows.map(row => [
      row.id,
      { company: row.company, orgLogins: row.org_logins ?? [] },
    ]),
  );
}

interface ScorerIntroPath {
  targetOrg: string;
  [key: string]: unknown;
}
interface ScorerIntroPaths {
  available: boolean;
  asOf: string;
  source: string;
  paths: ScorerIntroPath[];
}

const SCORER_ORG_LIMIT = 20;

/** Direct and one-intermediary GitHub paths from the device owner into each job's employer. */
export async function introPaths(
  db: PostgresService,
  http: Pick<AxiosInstance, "post">,
  owner: string,
  jobIds: string[],
): Promise<unknown> {
  const login = await ownerGithubLogin(db, owner);
  if (!login) return { github: null, reason: "github_required", jobs: [] };
  const employers = await jobEmployerGithubLogins(db, jobIds);
  if (jobIds.some(id => !employers.has(id)))
    throw new NotFoundException("Job not found");
  const jobs = jobIds.map(jobId => {
    const employer = employers.get(jobId) as JobEmployer;
    return { jobId, company: employer.company, orgLogins: employer.orgLogins };
  });
  const orgLogins = Array.from(
    new Set(jobs.flatMap(job => job.orgLogins)),
  ).slice(0, SCORER_ORG_LIMIT);
  const github = { login };
  if (!orgLogins.length)
    return { github, jobs: jobs.map(job => ({ ...job, paths: [] })) };
  let result: ScorerIntroPaths;
  try {
    const response = await http.post<ScorerIntroPaths>(
      "/scorer/intro-paths/query",
      { sourceLogin: login, targetOrgLogins: orgLogins, limit: 50 },
    );
    result = response.data;
  } catch (error) {
    Sentry.withScope(scope => {
      scope.setTags({ action: "intro_paths", source: "device-execution" });
      scope.setExtra("orgLogins", orgLogins);
      Sentry.captureException(error);
    });
    return {
      github,
      available: false,
      jobs: jobs.map(job => ({ ...job, paths: [] })),
    };
  }
  const paths = Array.isArray(result.paths) ? result.paths : [];
  return {
    github,
    available: result.available,
    asOf: result.asOf,
    source: result.source,
    inferred: true,
    jobs: jobs.map(job => ({
      ...job,
      paths: paths.filter(path =>
        job.orgLogins.includes(String(path.targetOrg).toLowerCase()),
      ),
    })),
  };
}
