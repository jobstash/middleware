import { createHmac, randomUUID } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrivyService } from "src/auth/privy/privy.service";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { candidateOrigin } from "./candidate-origin";
export function clickhouseParameter(value: string | string[]): string {
  return Array.isArray(value)
    ? "[" +
        value
          .map(
            item =>
              "'" + item.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'",
          )
          .join(",") +
        "]"
    : value;
}
export interface NetworkEdge {
  user_a: string;
  user_b: string;
  shared_org: string;
  overlap_start: string;
  overlap_end: string;
  common_repos: string[];
  strength_score: number;
}
export interface IntroductionPath {
  people: string[];
  edges: {
    organization: string;
    from: string;
    to: string;
    caption: string;
    asOf: string;
    repositories: string[];
  }[];
}
export interface CandidateNetworkRecommendation {
  id: string;
  organizationId: string;
  hopCount: number;
  firstContact: { displayName: string; publicProfileUrl: string };
  evidenceSummary: string;
  pathSummary: string;
}
export interface CandidateNetworkRecommendations {
  verified: boolean;
  available: boolean | null;
  truncated: boolean;
  unavailable: boolean;
  recommendations: CandidateNetworkRecommendation[];
  action?: { type: "connect_github"; label: string; href: string };
}
/** Join only bounded source and target neighborhoods. Never query the global 3-hop model. */
export function assemblePaths(
  root: string,
  targets: Set<string>,
  left: NetworkEdge[],
  right: NetworkEdge[],
  bridges: NetworkEdge[],
  suppressed: Set<string>,
  coverage?: { truncated: boolean },
): IntroductionPath[] {
  const edgeMap = new Map<string, NetworkEdge[]>();
  for (const e of [...left, ...right, ...bridges]) {
    if (
      suppressed.has(e.user_a.toLowerCase()) ||
      suppressed.has(e.user_b.toLowerCase())
    )
      continue;
    for (const node of [e.user_a, e.user_b]) {
      const rows = edgeMap.get(node) ?? [];
      if (
        !rows.some(
          x =>
            x.user_a === e.user_a &&
            x.user_b === e.user_b &&
            x.shared_org === e.shared_org,
        )
      )
        rows.push(e);
      edgeMap.set(node, rows);
    }
  }
  const results: IntroductionPath[] = [];
  let visited = 0;
  const visit = (people: string[], edges: NetworkEdge[]): void => {
    if (++visited > 20000) return;
    const current = people[people.length - 1];
    if (edges.length && targets.has(current)) {
      results.push({
        people,
        edges: edges.map((e, i) => ({
          organization: e.shared_org,
          from: people[i],
          to: people[i + 1],
          caption: "Overlapping GitHub write or merge activity",
          asOf: e.overlap_end,
          repositories: e.common_repos.slice(0, 10),
        })),
      });
      return;
    }
    if (edges.length === 3 || results.length >= 50) return;
    for (const edge of edgeMap.get(current) ?? []) {
      const next = edge.user_a === current ? edge.user_b : edge.user_a;
      if (!people.includes(next)) visit([...people, next], [...edges, edge]);
      if (results.length >= 50 || visited > 20000) break;
    }
  };
  if (!suppressed.has(root.toLowerCase())) visit([root], []);
  if (coverage && (visited > 20000 || results.length > 30))
    coverage.truncated = true;
  return results.sort((a, b) => a.edges.length - b.edges.length).slice(0, 30);
}
@Injectable()
export class NetworkService {
  private readonly pendingPaths = new Map<
    string,
    Promise<Record<string, unknown>>
  >();
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly config: ConfigService,
    private readonly privy: PrivyService,
  ) {}
  async root(wallet: string): Promise<{ owner: string; root: string | null }> {
    const owner = await this.career.owner(wallet);
    const [row] = await this.db.query<{ privy: string }>(
      `SELECT properties->>'privyId' AS privy FROM graph_nodes WHERE id=$1`,
      [owner],
    );
    if (!row.privy) return { owner, root: null };
    const user = await this.privy.getUserById(row.privy);
    const github = user?.linkedAccounts.find(
      a => a.type === "github_oauth" && a.subject !== "-1" && a.verifiedAt,
    );
    return {
      owner,
      root: github?.type === "github_oauth" ? github.username : null,
    };
  }
  private async query<T>(
    sql: string,
    params: Record<string, string | string[]>,
  ): Promise<T[]> {
    const endpoint = this.config.get<string>("CAREER_CLICKHOUSE_URL"),
      password = this.config.get<string>("CAREER_CLICKHOUSE_PASSWORD");
    if (!endpoint)
      throw new ServiceUnavailableException(
        "Introduction paths are unavailable",
      );
    const url = new URL(endpoint);
    url.searchParams.set("readonly", "1");
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(`param_${key}`, clickhouseParameter(value));
    url.searchParams.set("max_execution_time", "3");
    url.searchParams.set("max_rows_to_read", "1000000");
    url.searchParams.set("read_overflow_mode", "throw");
    url.searchParams.set("max_result_rows", "5000");
    url.searchParams.set("result_overflow_mode", "throw");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-ClickHouse-User":
          this.config.get<string>("CAREER_CLICKHOUSE_USER") ?? "jobstash_paths",
        "X-ClickHouse-Key": password ?? "",
      },
      body: `${sql} FORMAT JSON`,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        "Introduction paths could not be loaded",
      );
    const data = (await response.json()) as { data: T[] };
    return data.data;
  }
  async company(organizationId: string): Promise<Record<string, unknown>> {
    await this.assertVisibleOrganization(organizationId);
    const [row] = await this.db.query<{
      payload: Record<string, unknown>;
      updated_at: Date;
    }>(
      `SELECT payload,updated_at FROM organization_search_documents WHERE organization_id=$1`,
      [organizationId],
    );
    if (!row) throw new NotFoundException("Organization not found");
    const fields = [
      "orgId",
      "name",
      "description",
      "summary",
      "projects",
      "categories",
      "chains",
      "fundingRounds",
      "investors",
      "teamSize",
      "website",
      "github",
      "source",
      "sources",
    ];
    const context: Record<string, unknown> = {};
    for (const key of fields)
      context[key] =
        typeof row.payload[key] === "string"
          ? String(row.payload[key]).slice(0, 12000)
          : (row.payload[key] ?? null);
    const projects = (
      Array.isArray(row.payload.projects) ? row.payload.projects : []
    ).slice(0, 12) as Record<string, unknown>[];
    context.projects = projects.map(p =>
      Object.fromEntries(
        [
          "id",
          "name",
          "summary",
          "description",
          "category",
          "chains",
          "tvl",
          "monthlyRevenue",
          "monthlyFees",
          "updatedTimestamp",
          "sources",
          "source",
          "website",
        ].map(key => [
          key,
          typeof p[key] === "string"
            ? String(p[key]).slice(0, 4000)
            : (p[key] ?? null),
        ]),
      ),
    );
    for (const key of ["fundingRounds", "investors"])
      context[key] = (
        Array.isArray(row.payload[key]) ? row.payload[key] : []
      ).slice(0, 30);
    context.categories = [
      ...new Set(
        projects.flatMap(p =>
          typeof p.category === "string"
            ? [p.category]
            : p.category &&
                typeof p.category === "object" &&
                "name" in p.category
              ? [p.category.name]
              : [],
        ),
      ),
    ];
    context.chains = [
      ...new Set(
        projects.flatMap(p =>
          Array.isArray(p.chains)
            ? p.chains.flatMap(c =>
                typeof c === "string" ? [c] : c?.name ? [c.name] : [],
              )
            : [],
        ),
      ),
    ];
    context.teamSize =
      row.payload.headcountEstimate ?? row.payload.teamSize ?? null;
    const [signals] = await this.db.query<{
      retainedStaff: number;
      asOf: string;
    }>(
      `SELECT count(DISTINCT source_id)::int AS "retainedStaff",max(record->>'updated_at') AS "asOf"
       FROM candidate_network_staff_associations WHERE organization_id=$1
       AND NOT candidate_network_person_suppressed(source_id,record->>'github_login')`,
      [organizationId],
    );
    const investments = await this.db.query<Record<string, unknown>>(
      `WITH owners AS (SELECT edge.source_id AS id FROM graph_relationships edge
         JOIN organization_search_documents org ON org.organization_node_id=edge.target_id
         WHERE org.organization_id=$1 AND edge.type='PROFILE_HAS_ORGANIZATION'),
       participating AS (SELECT f.fund_slug,max(f.round_date) AS last_investment,max(f.updated_at) AS as_of,
          count(DISTINCT f.round_key)::int AS rounds FROM fund_activity_documents f
          WHERE f.owner_node_id IN(SELECT id FROM owners) AND f.fund_participated GROUP BY f.fund_slug)
       SELECT fund.fund_id AS id,fund.name,fund.website,fund.portfolio_count AS "portfolioCount",
         fund.staff_count AS "staffCount",p.rounds,p.last_investment AS "lastInvestment",p.as_of AS "asOf",
         'Canonical funding-round investment relationships' AS source,
         COALESCE((SELECT jsonb_agg(row) FROM (SELECT DISTINCT org.organization_id AS id,org.payload->>'name' AS name
           FROM fund_activity_documents a JOIN graph_relationships edge ON edge.source_id=a.owner_node_id AND edge.type='PROFILE_HAS_ORGANIZATION'
           JOIN organization_search_documents org ON org.organization_node_id=edge.target_id
           WHERE a.fund_slug=p.fund_slug AND a.fund_participated AND NOT candidate_network_org_suppressed(org.organization_id)
           ORDER BY org.organization_id LIMIT 20) row),'[]') AS portfolio
       FROM participating p JOIN fund_analytics_documents fund ON fund.normalized_name=p.fund_slug
       ORDER BY p.last_investment DESC NULLS LAST,fund.fund_id LIMIT 30`,
      [organizationId],
    );
    context.funds = investments;
    context.people = {
      retainedStaff: signals.retainedStaff,
      source: "Trusted canonical staff associations",
      asOf: signals.asOf,
    };
    let activity: Record<string, unknown> | null = null;
    try {
      const github = await this.db.query<{ login: string }>(
        `SELECT g.properties->>'login' AS login FROM graph_relationships e JOIN graph_nodes g ON g.id=e.target_id
        JOIN organization_search_documents org ON org.organization_node_id=e.source_id WHERE org.organization_id=$1 AND e.type='HAS_GITHUB' LIMIT 20`,
        [organizationId],
      );
      if (github.length) {
        const [observed] = await this.query<Record<string, unknown>>(
          `SELECT countDistinct(user_login) AS contributors,sum(write_ops) AS writeOperations,toString(max(last_write_date)) AS asOf
          FROM intropath_graph.current_staff WHERE organization IN {organizations:Array(String)}`,
          { organizations: github.map(g => g.login.toLowerCase()) },
        );
        activity = {
          ...observed,
          source:
            "Observed GitHub write and merge activity; not a total headcount",
        };
      }
    } catch {
      /* Bounded graph failure does not hide canonical context. */
    }
    context.activity = activity;
    return {
      id: organizationId,
      ...context,
      fields: Object.fromEntries(
        Object.entries(context).map(([key, value]) => [
          key,
          {
            value,
            source:
              key === "funds"
                ? "Canonical funding-round investment relationships; per-fund observation dates"
                : key === "people"
                  ? "Trusted canonical staff associations"
                  : key === "activity"
                    ? (activity?.source ?? null)
                    : (row.payload.source ??
                      "JobStash canonical organization read model"),
            asOf:
              key === "funds"
                ? null
                : key === "people"
                  ? signals.asOf
                  : key === "activity"
                    ? (activity?.asOf ?? null)
                    : row.updated_at,
          },
        ]),
      ),
      asOf: row.updated_at,
      source:
        row.payload.source ?? "JobStash canonical organization read model",
    };
  }
  async candidateCompany(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertVisibleOrganization(organizationId);
    const [row] = await this.db.query<{
      payload: Record<string, unknown>;
      updated_at: Date;
    }>(
      `SELECT payload,updated_at FROM organization_search_documents WHERE organization_id=$1`,
      [organizationId],
    );
    if (!row) throw new NotFoundException("Organization not found");
    const text = (value: unknown, limit: number): string | null =>
      typeof value === "string" ? value.slice(0, limit) : null;
    const publicUrl = (value: unknown): string | null => {
      if (typeof value !== "string" || value.length > 2048) return null;
      try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) &&
          !url.username && !url.password
          ? url.href
          : null;
      } catch {
        return null;
      }
    };
    return {
      id: organizationId,
      name: text(row.payload.name, 200),
      description: text(row.payload.description, 6000),
      summary: text(row.payload.summary, 2000),
      website: publicUrl(row.payload.website),
      github: publicUrl(row.payload.github),
      asOf: row.updated_at,
    };
  }
  async recommendations(
    wallet: string,
    organizationId: string,
  ): Promise<CandidateNetworkRecommendations> {
    // Keep the verified-root, entitlement, lease, cache and suppression boundary.
    const result = await this.paths(wallet, organizationId, true);
    if (!result.verified)
      return {
        verified: false,
        available: null,
        truncated: false,
        unavailable: false,
        recommendations: [],
        action: {
          type: "connect_github",
          label: "Connect GitHub to find introduction suggestions",
          href: `${candidateOrigin(this.config)}/settings#connected-accounts`,
        },
      };
    const paths = (result.paths ?? []) as IntroductionPath[];
    const eligible = paths.filter(path =>
      path.edges.length >= 1 && path.edges.length <= 3 &&
      path.people.length === path.edges.length + 1 &&
      new Set(path.people.map(person => person.toLowerCase())).size === path.people.length &&
      /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(path.people[1]),
    );
    const recommendations: CandidateNetworkRecommendation[] = [];
    if (eligible.length) {
      const owner = await this.career.owner(wallet);
      for (const path of eligible.slice(0, 3)) {
        const firstContact = path.people[1];
        recommendations.push({
          id: this.recommendationId(owner, organizationId, path),
          organizationId,
          hopCount: path.edges.length,
          firstContact: {
            displayName: firstContact,
            publicProfileUrl: `https://github.com/${encodeURIComponent(firstContact)}`,
          },
          evidenceSummary:
            "Inferred from overlapping GitHub contribution activity. This does not verify friendship, employment or willingness to make an introduction.",
          pathSummary: `You → ${firstContact}${
            path.edges.length === 1 ? " (possible company contact)" :
              path.edges.length === 2 ? " → a possible company contact" :
                " → one further connection → a possible company contact"
          }`,
        });
      }
    }
    return {
      verified: true,
      available: recommendations.length ? true : result.available === false ? false : null,
      truncated: result.truncated === true || paths.length > 3 || eligible.length !== paths.length,
      unavailable: result.unavailable === true || result.available === null,
      recommendations,
    };
  }
  private recommendationId(
    owner: string,
    organizationId: string,
    path: IntroductionPath,
  ): string {
    const key = this.config.get<string>("CAREER_DATA_PROTECTION_KEY") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(key))
      throw new ServiceUnavailableException(
        "Introduction suggestion signing is not configured",
      );
    // Explicit tuples remain stable when PostgreSQL JSONB reorders object keys.
    // Domain separation binds the owner, target, verified cached root and evidence.
    return createHmac("sha256", Buffer.from(key, "hex"))
      .update(JSON.stringify([
        "candidate-network-recommendation-v1",
        owner,
        organizationId,
        path.people,
        path.edges.map(edge => [
          edge.organization, edge.from, edge.to, edge.caption, edge.asOf,
          edge.repositories,
        ]),
      ]))
      .digest("hex");
  }
  async assertRecommendationVisible(
    db: { query(sql: string, parameters: unknown[]): Promise<unknown[]> },
    owner: string,
    organizationId: string,
    suggestionId: string,
  ): Promise<void> {
    // Used inside the owning mutation transaction: acquiring another network
    // lease here would contend with its owner-row lock.
    const rows = await db.query(
      `SELECT candidate.path FROM candidate_network_cache cache
       CROSS JOIN LATERAL jsonb_array_elements(cache.paths) candidate(path)
       WHERE cache.user_node_id=$1 AND cache.organization_id=$2 AND cache.expires_at>now()
         AND candidate.path->'people'->>0=cache.root
         AND NOT candidate_network_org_suppressed($2)
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(candidate.path->'people') person
           WHERE candidate_network_person_suppressed(NULL,person.value))
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(candidate.path->'edges') edge
           WHERE candidate_network_github_org_suppressed(edge->>'organization'))
       LIMIT 30`,
      [owner, organizationId],
    ) as { path: IntroductionPath }[];
    if (!rows.some(row => this.recommendationId(owner, organizationId, row.path) === suggestionId))
      throw new NotFoundException("Introduction suggestion is no longer available");
  }
  async people(
    wallet: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    await this.career.requireAdvanced(await this.career.owner(wallet));
    await this.assertVisibleOrganization(organizationId);
    const rows = await this.db.query<{
      id: string;
      name: string;
      role: string;
      login: string;
      source: string;
      asOf: string;
      contacts: { kind: string; value: string }[];
    }>(
      `
      SELECT staff.source_id AS id,staff.record->>'name' AS name,staff.record->>'job_title' AS role,
        staff.record->>'github_login' AS login,staff.record->>'source' AS source,staff.record->>'updated_at' AS "asOf",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',social.record->>'kind','value',social.record->>'value'))
          FROM candidate_network_legacy_records social WHERE social.source_database=staff.source_database AND social.source_table='staff_socials' AND social.record->>'staff_id'=staff.source_id),'[]') AS contacts
      FROM candidate_network_staff_associations staff
      WHERE staff.organization_id=$1
        AND NOT candidate_network_person_suppressed(staff.source_id,staff.record->>'github_login')
        AND (staff.organization_id IS NULL OR NOT candidate_network_org_suppressed(staff.organization_id))
      ORDER BY staff.source_id LIMIT 101`,
      [organizationId],
    );
    const selected = rows.slice(0, 100);
    const emails = await this.commitContacts(
      selected.flatMap(row => (row.login ? [row.login.toLowerCase()] : [])),
    );
    return {
      people: selected.map(row => ({
        ...row,
        contacts: [
          ...row.contacts
            .filter(
              contact =>
                [
                  "linkedin",
                  "twitter",
                  "telegram",
                  "warpcast",
                  "github",
                ].includes(contact.kind) && /^https:\/\//i.test(contact.value),
            )
            .map(contact => ({
              ...contact,
              source: `Retained staff profile ${row.id}; ${row.source ?? "legacy source"}`,
              asOf: row.asOf,
            })),
          ...(emails.get(row.login?.toLowerCase()) ?? []),
        ],
      })),
      truncated: rows.length > 100,
      source: "Retained canonical staff associations",
      asOf: new Date().toISOString(),
    };
  }
  async paths(
    wallet: string,
    organizationId: string,
    contacts = false,
  ): Promise<Record<string, unknown>> {
    wallet = wallet.toLowerCase();
    const key = JSON.stringify([wallet, organizationId, contacts]);
    const pending = this.pendingPaths.get(key);
    if (pending) return pending;
    if (
      this.pendingPaths.size >= 8 ||
      [...this.pendingPaths.keys()].filter(k => JSON.parse(k)[0] === wallet)
        .length >= 2
    )
      throw new ServiceUnavailableException(
        "Introduction paths are busy; try again shortly",
      );
    const work = this.withLease(wallet, () =>
      this.loadPaths(wallet, organizationId, contacts),
    );
    this.pendingPaths.set(key, work);
    try {
      return await work;
    } finally {
      this.pendingPaths.delete(key);
    }
  }
  private async withLease<T>(
    wallet: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const owner = await this.career.owner(wallet);
    const id = randomUUID();
    await this.db.transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(782304191)");
      const [usage] = await manager.query(
        `SELECT count(*)::int AS total,count(*) FILTER(WHERE user_node_id=$1)::int AS personal FROM candidate_network_leases WHERE expires_at>now()`,
        [owner],
      );
      if (usage.total >= 8 || usage.personal >= 2)
        throw new ServiceUnavailableException(
          "Introduction paths are busy; try again shortly",
        );
      await manager.query(
        "DELETE FROM candidate_network_leases WHERE expires_at<=now()",
      );
      await manager.query(
        "INSERT INTO candidate_network_leases(id,user_node_id,expires_at) VALUES($1,$2,now()+interval '2 minutes')",
        [id, owner],
      );
    });
    try {
      return await work();
    } finally {
      await this.db.query("DELETE FROM candidate_network_leases WHERE id=$1", [
        id,
      ]);
    }
  }
  private async assertVisibleOrganization(id: string): Promise<void> {
    const [row] = await this.db.query<{ suppressed: boolean }>(
      "SELECT candidate_network_org_suppressed($1) AS suppressed",
      [id],
    );
    if (row.suppressed) throw new NotFoundException("Organization not found");
  }
  private async commitContacts(
    logins: string[],
  ): Promise<
    Map<string, { kind: string; value: string; source: string; asOf: string }[]>
  > {
    const contacts = new Map<
      string,
      { kind: string; value: string; source: string; asOf: string }[]
    >();
    if (!logins.length) return contacts;
    try {
      const rows = await this.query<{
        login: string;
        email: string;
        source: string;
        asOf: string;
      }>(
        `SELECT lower(login) AS login,email,last_evidence_url AS source,toString(last_seen_at) AS asOf
        FROM intropath_threat_intel.email_observations
        WHERE login IN {logins:Array(String)} AND github_user_id>0
          AND github_user_id IN (SELECT current_github_user_id FROM intropath_threat_intel.identity_handle_periods WHERE login IN {logins:Array(String)} AND handle_contested=0 AND current_github_user_id=github_user_id)
          AND (login,github_user_id) IN (SELECT login,current_github_user_id FROM intropath_threat_intel.identity_handle_periods WHERE login IN {logins:Array(String)} AND handle_contested=0 AND current_github_user_id=github_user_id)
          AND email_source = 'git_commit'
          AND startsWith(last_evidence_url,'https://github.com/')
          AND position(last_evidence_url,'/commit/')>0
          AND NOT match(lower(email),'no[-_.]?reply')
        ORDER BY last_seen_at DESC LIMIT 3 BY login LIMIT 150`,
        { logins },
      );
      for (const row of rows)
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          const list = contacts.get(row.login) ?? [];
          if (!list.some(c => c.value === row.email))
            list.push({
              kind: "email",
              value: row.email,
              source: row.source,
              asOf: row.asOf,
            });
          contacts.set(row.login, list);
        }
    } catch {
      /* Contact-source outages leave contacts unknown; paths still work. */
    }
    return contacts;
  }
  private async loadPaths(
    wallet: string,
    organizationId: string,
    contacts: boolean,
  ): Promise<Record<string, unknown>> {
    const { owner, root } = await this.root(wallet);
    if (contacts) await this.career.requireAdvanced(owner);
    if (!root) return { verified: false, available: null, paths: [] };
    await this.assertVisibleOrganization(organizationId);
    const organizations = await this.db.query<{ login: string }>(
      `SELECT github.properties->>'login' AS login FROM graph_nodes org JOIN graph_relationships edge ON edge.source_id=org.id AND edge.type='HAS_GITHUB' JOIN graph_nodes github ON github.id=edge.target_id WHERE org.label='Organization' AND org.properties->>'orgId'=$1 ORDER BY github.id LIMIT 20`,
      [organizationId],
    );
    if (!organizations.some(org => org.login))
      return { verified: true, available: null, paths: [] };
    const suppressedRows = await this.db.query<{ login: string }>(
      `SELECT login FROM candidate_network_metadata WHERE suppressed
       UNION SELECT lower(record->>'github_login') AS login FROM candidate_network_legacy_records
       WHERE source_table='person_suppressions' AND record->>'github_login' IS NOT NULL
         AND COALESCE(record->>'status','pending') NOT IN ('rejected','denied','withdrawn')`,
    );
    const suppressed = new Set(suppressedRows.map(r => r.login.toLowerCase()));
    const [cached] = await this.db.query<{
      paths: IntroductionPath[];
      truncated: boolean;
    }>(
      `SELECT paths,truncated FROM candidate_network_cache WHERE user_node_id=$1 AND organization_id=$2 AND root=$3 AND expires_at>now()`,
      [owner, organizationId, root],
    );
    let paths = cached?.paths;
    let truncated = cached?.truncated ?? false;
    if (!paths) {
      try {
        const targets = await this.query<{ user_login: string }>(
          `SELECT user_login FROM intropath_graph.current_staff WHERE organization IN {organizations:Array(String)} ORDER BY last_write_date DESC LIMIT 300`,
          {
            organizations: organizations
              .filter(org => org.login)
              .map(org => org.login.toLowerCase()),
          },
        );
        const targetSet = new Set(
          targets
            .map(t => t.user_login)
            .filter(t => !suppressed.has(t.toLowerCase())),
        );
        const columns =
          "user_a,user_b,shared_org,toString(overlap_start) AS overlap_start,toString(overlap_end) AS overlap_end,common_repos,strength_score";
        // The released warehouse already materializes both edge directions in
        // one_hop_paths, ordered by target_org. Reuse that index without requiring
        // a production projection or scanning the global three-hop view.
        const rootOrganizations = await this.query<{ organization: string }>(
          `SELECT tupleElement(tupleElement(item,1),1) AS organization FROM intropath_graph.work_history ARRAY JOIN organizations AS item WHERE username={root:String} ORDER BY organization LIMIT 20`,
          { root: root.toLowerCase() },
        );
        let left: NetworkEdge[];
        const hopColumns =
          "source_user AS user_a,target_user AS user_b,connection_org AS shared_org,toString(overlap_start) AS overlap_start,toString(overlap_end) AS overlap_end,common_repos,edge_strength AS strength_score";
        if (rootOrganizations.length) {
          const peers = await this.query<{ user_login: string }>(
            `SELECT DISTINCT user_login FROM intropath_graph.employees WHERE organization IN {organizations:Array(String)} ORDER BY user_login LIMIT 3000`,
            { organizations: rootOrganizations.map(r => r.organization) },
          );
          truncated ||= peers.length >= 3000;
          left = await this.query<NetworkEdge>(
            `SELECT ${columns} FROM (SELECT * FROM intropath_graph.co_worker_edges WHERE user_a={root:String}
             UNION ALL SELECT * FROM intropath_graph.co_worker_edges WHERE user_a IN {peers:Array(String)} AND user_b={root:String})
             ORDER BY strength_score DESC LIMIT 100`,
            { root, peers: peers.map(p => p.user_login) },
          );
        } else {
          // Former contributors have no current target projection. Restrict the
          // reverse lookup to people with activity at their recorded organizations.
          // Without an indexed history, only the forward neighbourhood can be
          // checked safely. Mark it incomplete instead of scanning all employees.
          truncated = true;
          left = await this.query<NetworkEdge>(
            `SELECT ${columns} FROM intropath_graph.co_worker_edges WHERE user_a={root:String} ORDER BY strength_score DESC LIMIT 100`,
            { root },
          );
        }
        const right = targetSet.size
          ? await this.query<NetworkEdge>(
              `SELECT ${hopColumns} FROM intropath_graph.one_hop_paths WHERE target_org IN {organizations:Array(String)} AND target_user IN {targets:Array(String)} ORDER BY edge_strength DESC LIMIT 1000`,
              {
                organizations: organizations
                  .filter(org => org.login)
                  .map(org => org.login.toLowerCase()),
                targets: [...targetSet],
              },
            )
          : [];
        const leftNodes = [
          ...new Set(
            left
              .flatMap(e => [e.user_a, e.user_b])
              .filter(n => n !== root && !suppressed.has(n.toLowerCase())),
          ),
        ];
        const rightNodes = [
          ...new Set(
            right
              .flatMap(e => [e.user_a, e.user_b])
              .filter(n => !suppressed.has(n.toLowerCase())),
          ),
        ];
        const bridge =
          leftNodes.length && rightNodes.length
            ? await this.query<NetworkEdge>(
                `SELECT ${columns} FROM (SELECT * FROM intropath_graph.co_worker_edges WHERE user_a IN {left:Array(String)} AND user_b IN {right:Array(String)} UNION ALL SELECT * FROM intropath_graph.co_worker_edges WHERE user_b IN {left:Array(String)} AND user_a IN {right:Array(String)}) ORDER BY strength_score DESC LIMIT 2000`,
                { left: leftNodes, right: rightNodes },
              )
            : [];
        const coverage = { truncated: false };
        paths = assemblePaths(
          root,
          targetSet,
          left,
          right,
          bridge,
          suppressed,
          coverage,
        );
        truncated =
          truncated ||
          coverage.truncated ||
          organizations.length >= 20 ||
          targets.length >= 300 ||
          rootOrganizations.length >= 20 ||
          left.length >= 100 ||
          right.length >= 1000 ||
          bridge.length >= 2000 ||
          paths.length >= 30;
        await this.db.query(
          `INSERT INTO candidate_network_cache(user_node_id,organization_id,root,paths,truncated,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') ON CONFLICT(user_node_id,organization_id) DO UPDATE SET root=EXCLUDED.root,paths=EXCLUDED.paths,truncated=EXCLUDED.truncated,expires_at=EXCLUDED.expires_at`,
          [owner, organizationId, root, JSON.stringify(paths), truncated],
        );
      } catch {
        return {
          verified: true,
          available: null,
          unavailable: true,
          truncated: true,
          paths: [],
        };
      }
    }
    const organizationsInPaths = [
      ...new Set(paths.flatMap(p => p.edges.map(e => e.organization))),
    ];
    const deniedOrganizations = await this.db.query<{ login: string }>(
      `SELECT login FROM unnest($1::text[]) login WHERE candidate_network_github_org_suppressed(login)`,
      [organizationsInPaths],
    );
    const denied = new Set(
      deniedOrganizations.map(row => row.login.toLowerCase()),
    );
    paths = paths.filter(
      p =>
        p.people.every(n => !suppressed.has(n.toLowerCase())) &&
        p.edges.every(e => !denied.has(e.organization.toLowerCase())),
    );
    if (!contacts)
      return {
        verified: true,
        available: paths.length ? true : truncated ? null : false,
        truncated,
      };
    // Contact rows are server-gated, attributed, and restricted to people in returned paths.
    const logins = [...new Set(paths.flatMap(p => p.people))];
    const rows = await this.db.query<{
      login: string;
      contacts: {
        kind: string;
        value: string;
        source: string;
        asOf?: string;
      }[];
    }>(
      `SELECT login,contacts FROM candidate_network_metadata WHERE login=ANY($1::text[]) AND NOT suppressed`,
      [logins],
    );
    const commitContacts = await this.commitContacts(logins);
    const people = logins.map(login => ({
      login,
      profiles: [
        {
          kind: "github",
          value: `https://github.com/${encodeURIComponent(login)}`,
          source: "GitHub graph identity",
        },
      ],
      contacts: [
        ...(rows.find(r => r.login === login)?.contacts ?? []),
        ...(commitContacts.get(login.toLowerCase()) ?? []),
      ].filter(
        c =>
          c.source &&
          c.value &&
          (c.kind !== "email" ||
            (!/no[-_.]?reply|noreply/i.test(c.value) &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value))),
      ),
    }));
    return {
      verified: true,
      available: paths.length ? true : truncated ? null : false,
      paths,
      people,
      source: "GitHub contribution graph",
      asOf: new Date().toISOString(),
      bounded: true,
      truncated,
    };
  }
  async annotations(
    organizationId: string,
  ): Promise<Record<string, unknown>[]> {
    await this.assertVisibleOrganization(organizationId);
    return this.db.query(
      `SELECT staff.source_id AS "staffId",staff.record->>'name' AS name,
       staff.record->>'job_title' AS role,staff.record->>'source' AS source,
       staff.record->>'updated_at' AS "asOf",COALESCE(metadata.annotations,'[]') AS annotations
       FROM candidate_network_staff_associations staff LEFT JOIN candidate_network_metadata metadata
         ON metadata.login=lower(staff.record->>'github_login')
       WHERE staff.organization_id=$1 AND NOT candidate_network_person_suppressed(staff.source_id,staff.record->>'github_login')
       ORDER BY staff.source_id LIMIT 100`,
      [organizationId],
    );
  }
  async reachableJobs(wallet: string): Promise<Set<string>> {
    const { owner, root } = await this.root(wallet);
    await this.career.requireAdvanced(owner);
    if (!root) return new Set();
    const rows = await this.db.query<{ short_uuid: string }>(
      `SELECT j.short_uuid FROM job_search_documents j JOIN candidate_network_cache c ON c.organization_id=j.organization_id WHERE NOT candidate_network_org_suppressed(j.organization_id) AND c.user_node_id=$1 AND c.root=$2 AND c.expires_at>now() AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.paths) path WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(path->'people') person WHERE candidate_network_person_suppressed(NULL,person.value)) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(path->'edges') edge WHERE candidate_network_github_org_suppressed(edge->>'organization')))`,
      [owner, root],
    );
    return new Set(rows.map(r => r.short_uuid));
  }
}
