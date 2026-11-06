import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios, { AxiosInstance } from "axios";
import * as https from "https";
import { PostgresService } from "src/postgres/postgres.service";
import {
  GithubEndpoint,
  githubLoginPattern,
  IntroPathsArgs,
} from "./device-execution.protocol";

/** Scorer HTTP client for intro-path lookups (same settings as team intelligence). */
export const INTRO_PATHS_HTTP = "INTRO_PATHS_HTTP";
export function introPathsHttp(config: ConfigService): AxiosInstance {
  return axios.create({
    baseURL: config.get<string>("SCORER_DOMAIN"),
    headers: {
      Authorization: `Bearer ${config.get<string>("SCORER_API_KEY")}`,
    },
    httpsAgent: new https.Agent(),
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

interface ScorerIntroPaths {
  source: GithubEndpoint;
  available: boolean;
  asOf: string | null;
  inferred: true;
  coverage: { source: "indexed" | "not_indexed" | "unavailable"; maxHops: 2 };
  reason?: "unavailable";
  targets: (GithubEndpoint & {
    status:
      | "ok"
      | "no_paths"
      | "source_not_indexed"
      | "target_not_indexed"
      | "unavailable";
    paths: Record<string, unknown>[];
  })[];
}

/** GitHub endpoint paths are independent of jobs and publication windows. */
export async function introPaths(
  db: PostgresService,
  http: Pick<AxiosInstance, "post">,
  owner: string,
  args: IntroPathsArgs,
): Promise<unknown> {
  let source = args.source;
  if (!source) {
    const login = await ownerGithubLogin(db, owner);
    if (login && githubLoginPattern.test(login))
      source = { login: login.toLowerCase(), kind: "user" };
  }
  const unavailable = (reason: "github_required" | "unavailable"): unknown => ({
    source: source ?? null,
    available: false,
    asOf: null,
    inferred: true,
    coverage: { source: "unavailable", maxHops: 2 },
    reason,
    targets: args.targets.map(target => ({
      ...target,
      status: "unavailable",
      paths: [],
    })),
  });
  if (!source) return unavailable("github_required");
  try {
    const { data } = await http.post<ScorerIntroPaths>(
      "/scorer/intro-paths/query",
      { source, targets: args.targets, limit: 50 },
    );
    if (
      typeof data.available !== "boolean" ||
      !data.coverage ||
      !Array.isArray(data.targets) ||
      data.targets.length !== args.targets.length ||
      data.targets.some(
        (target, index) =>
          target.login !== args.targets[index].login ||
          target.kind !== args.targets[index].kind ||
          !Array.isArray(target.paths) ||
          ![
            "ok",
            "no_paths",
            "source_not_indexed",
            "target_not_indexed",
            "unavailable",
          ].includes(target.status),
      )
    )
      throw new Error("Invalid introduction response");
    return {
      source,
      available: data.available,
      asOf: data.asOf,
      inferred: true,
      coverage: data.coverage,
      ...(data.reason ? { reason: data.reason } : {}),
      targets: data.targets,
    };
  } catch (error) {
    Sentry.withScope(scope => {
      scope.setTags({ action: "intro_paths", source: "device-execution" });
      Sentry.captureException(error);
    });
    return unavailable("unavailable");
  }
}
