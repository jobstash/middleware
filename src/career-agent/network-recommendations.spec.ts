import { ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntroductionPath, NetworkEdge, NetworkService } from "./network.service";

function fixture() {
  const state = {
    root: "candidate-root" as string | null,
    paid: true,
    warehouseFails: false,
    organizationSuppressed: false,
    targetKnown: true,
    extraTarget: false,
    asOf: "2026-08-01",
    suppressed: new Set<string>(),
    deniedOrganizations: new Set<string>(),
    cache: new Map<string, { paths: IntroductionPath[]; truncated: boolean }>(),
    payload: {
      name: "Public company",
      description: "Public organization description",
      summary: "Public organization summary",
      website: "https://company.example/careers",
      github: "https://github.com/company",
      funds: [{ name: "Private fund intelligence" }],
      people: [{ email: "private-person@example.test" }],
      annotations: [{ text: "Private operator annotation" }],
      projects: [{ name: "Private project metadata" }],
      source: { credential: "private-source-token" },
    } as Record<string, unknown>,
  };
  const cacheKey = (values: unknown[]) => JSON.stringify(values.slice(0, 3));
  const query = jest.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("AS privy")) return [{ privy: "local-privy-fixture" }];
    if (sql.includes("pg_advisory_xact_lock") || sql.includes("DELETE FROM candidate_network_leases") ||
        sql.includes("INSERT INTO candidate_network_leases")) return [];
    if (sql.includes("AS personal FROM candidate_network_leases")) return [{ total: 0, personal: 0 }];
    if (sql.includes("AS suppressed")) return [{ suppressed: state.organizationSuppressed }];
    if (sql.includes("github.properties->>'login'")) return state.targetKnown ? [{ login: "company-gh" }] : [];
    if (sql.includes("source_table='person_suppressions'"))
      return [...state.suppressed].map(login => ({ login }));
    if (sql.startsWith("SELECT paths,truncated")) {
      const cached = state.cache.get(cacheKey(values));
      return cached ? [cached] : [];
    }
    if (sql.startsWith("INSERT INTO candidate_network_cache")) {
      state.cache.set(cacheKey(values), { paths: JSON.parse(values[3] as string), truncated: values[4] as boolean });
      return [];
    }
    if (sql.includes("FROM unnest"))
      return (values[0] as string[]).filter(login => state.deniedOrganizations.has(login.toLowerCase())).map(login => ({ login }));
    if (sql.startsWith("SELECT login,contacts"))
      return [{ login: "direct", contacts: [{ kind: "email", value: "private-contact@example.test", source: "private-contact-source" }] }];
    if (sql.includes("SELECT payload,updated_at FROM organization_search_documents"))
      return [{ payload: state.payload, updated_at: new Date("2026-09-01T00:00:00Z") }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  });
  const db = { query, transaction: async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query }) };
  const config = new ConfigService({
    CAREER_DATA_PROTECTION_KEY: "72".repeat(32),
    RECRUITERS_PUBLIC_ORIGIN: "http://127.0.0.1:3001",
  });
  const service = new NetworkService(db as never, {
    owner: async (wallet: string) => `owner:${wallet.toLowerCase()}`,
    requireAdvanced: async () => { if (!state.paid) throw new ForbiddenException(); },
  } as never, config, {
    getUserById: async () => ({ linkedAccounts: state.root ? [{
      type: "github_oauth", subject: "verified-local-subject", verifiedAt: new Date(), username: state.root,
    }] : [] }),
  } as never);
  const edge = (a: string, b: string, organization: string): NetworkEdge => ({
    user_a: a, user_b: b, shared_org: organization,
    overlap_start: "2025-01-01", overlap_end: state.asOf,
    common_repos: ["private-org/private-repository"], strength_score: 1,
  });
  const warehouse = jest.spyOn(service as unknown as {
    query: (sql: string, params: unknown) => Promise<unknown[]>;
  }, "query").mockImplementation(async sql => {
    if (state.warehouseFails) throw new Error("Local fixture warehouse outage");
    if (sql.includes("email_observations")) return [{
      login: "first-two", email: "private-commit@example.test", source: "https://github.com/private-org/private-repository/commit/secret", asOf: state.asOf,
    }];
    if (sql.includes("current_staff")) return ["direct", "hidden-target-two", "hidden-target-three", ...(state.extraTarget ? ["fourth"] : [])].map(user_login => ({ user_login }));
    if (sql.includes("work_history")) return [{ organization: "private-root-org" }];
    if (sql.includes("employees")) return [{ user_login: "private-peer" }];
    if (sql.includes("user_a={root:String}")) return [
      edge(state.root!, "direct", "direct-org"),
      edge(state.root!, "first-two", "two-org"),
      edge(state.root!, "first-three", "three-org"),
      ...(state.extraTarget ? [edge(state.root!, "fourth", "four-org")] : []),
    ];
    if (sql.includes("one_hop_paths")) return [
      edge("first-two", "hidden-target-two", "two-org"),
      edge("hidden-middle", "hidden-target-three", "three-org"),
    ];
    if (sql.includes("co_worker_edges")) return [
      edge("first-three", "hidden-middle", "three-org"),
      edge("first-three", "hidden-cycle-peer", "three-org"),
      edge("hidden-cycle-peer", "hidden-middle", "three-org"),
    ];
    throw new Error(`Unexpected fixture warehouse query: ${sql}`);
  });
  return { service, state, warehouse, config };
}

describe("Candidate introduction recommendations", () => {
  it("curates one-, two- and three-hop paths without revealing the root, intermediate identities or private evidence", async () => {
    const { service, state } = fixture();
    const result = await service.recommendations("alice", "company");
    expect(result).toMatchObject({ verified: true, available: true, truncated: false, unavailable: false });
    expect(result.recommendations.map(item => item.hopCount)).toEqual([1, 2, 3]);
    expect(result.recommendations.map(item => item.firstContact)).toEqual([
      { displayName: "direct", publicProfileUrl: "https://github.com/direct" },
      { displayName: "first-two", publicProfileUrl: "https://github.com/first-two" },
      { displayName: "first-three", publicProfileUrl: "https://github.com/first-three" },
    ]);
    for (const suggestion of result.recommendations) {
      expect(suggestion.id).toMatch(/^[a-f0-9]{64}$/);
      expect(suggestion.pathSummary.split("→").length - 1).toBe(suggestion.hopCount);
    }
    for (const cached of state.cache.values()) for (const path of cached.paths) {
      expect(new Set(path.people).size).toBe(path.people.length);
      expect(path.edges.length).toBeLessThanOrEqual(3);
    }
    const serialized = JSON.stringify(result);
    for (const secret of ["candidate-root", "owner:alice", "hidden-target-two", "hidden-target-three", "hidden-middle", "hidden-cycle-peer", "private-org", "private-contact", "private-commit", "two-org", "three-org"])
      expect(serialized).not.toContain(secret);
  });

  it("limits suggestions to three and distinguishes incomplete coverage from a complete negative", async () => {
    const { service, state } = fixture();
    state.extraTarget = true;
    const result = await service.recommendations("alice", "company");
    expect(result.recommendations.map(item => item.hopCount)).toEqual([1, 1, 2]);
    expect(result.truncated).toBe(true);
    state.suppressed.add(state.root!);
    expect(await service.recommendations("alice", "company")).toMatchObject({ available: false, unavailable: false, recommendations: [] });
    for (const cached of state.cache.values()) cached.truncated = true;
    expect(await service.recommendations("alice", "company")).toMatchObject({ available: null, recommendations: [] });
  });

  it("refreshes person and organization suppression even when all paths come from cache", async () => {
    const { service, state, warehouse } = fixture();
    const original = await service.recommendations("alice", "company");
    warehouse.mockClear();
    state.suppressed.add("hidden-middle");
    state.deniedOrganizations.add("two-org");
    const filtered = await service.recommendations("alice", "company");
    expect(filtered.recommendations.map(item => item.id)).toEqual([original.recommendations[0].id]);
    expect(warehouse.mock.calls.every(([sql]) => sql.includes("email_observations"))).toBe(true);
    state.suppressed.add("direct");
    expect(await service.recommendations("alice", "company")).toMatchObject({ available: false, recommendations: [] });
    state.organizationSuppressed = true;
    await expect(service.recommendations("alice", "company")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("binds stable opaque IDs to owner, verified root, organization and cached evidence", async () => {
    const { service, state, config } = fixture();
    const original = (await service.recommendations("alice", "company")).recommendations[0].id;
    // A JSONB round-trip may reorder every object key without changing evidence.
    for (const cached of state.cache.values()) for (const path of cached.paths)
      path.edges = path.edges.map(edge =>
        Object.fromEntries(Object.entries(edge).reverse()) as IntroductionPath["edges"][number]);
    expect((await service.recommendations("ALICE", "company")).recommendations[0].id).toBe(original);
    expect((await service.recommendations("bob", "company")).recommendations[0].id).not.toBe(original);
    expect((await service.recommendations("alice", "other-company")).recommendations[0].id).not.toBe(original);
    state.asOf = "2026-09-01";
    expect((await service.recommendations("alice", "company")).recommendations[0].id).toBe(original);
    state.cache.clear();
    expect((await service.recommendations("alice", "company")).recommendations[0].id).not.toBe(original);
    state.asOf = "2026-08-01";
    state.root = "new-verified-root";
    expect((await service.recommendations("alice", "company")).recommendations[0].id).not.toBe(original);
    const originalGet = config.get.bind(config);
    const missingKey = jest.spyOn(config, "get").mockImplementation(key =>
      key === "CAREER_DATA_PROTECTION_KEY" ? "" : originalGet(key));
    try {
      await expect(service.recommendations("alice", "company")).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      missingKey.mockRestore();
    }
  });

  it("guides an unlinked candidate to the configured account page without querying arbitrary GitHub handles", async () => {
    const { service, state, warehouse } = fixture();
    state.root = null;
    expect(await service.recommendations("alice", "company")).toMatchObject({
      verified: false, available: null, recommendations: [],
      action: { type: "connect_github", href: "http://127.0.0.1:3001/settings#connected-accounts" },
    });
    expect(warehouse).not.toHaveBeenCalled();
    state.paid = false;
    await expect(service.recommendations("alice", "company")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps query failure and missing company evidence unknown and does not cache a failed search", async () => {
    const { service, state } = fixture();
    state.warehouseFails = true;
    expect(await service.recommendations("alice", "company")).toMatchObject({
      verified: true, available: null, unavailable: true, recommendations: [],
    });
    expect(state.cache.size).toBe(0);
    state.warehouseFails = false;
    expect((await service.recommendations("alice", "company")).available).toBe(true);
    state.targetKnown = false;
    expect(await service.recommendations("alice", "unknown-company")).toMatchObject({ available: null, unavailable: true, recommendations: [] });
  });
});

describe("Candidate public company context", () => {
  it("returns public descriptions and actionable URLs without private people, funds or nested metadata", async () => {
    const { service, state } = fixture();
    const result = await service.candidateCompany("company");
    expect(result).toMatchObject({
      id: "company", name: "Public company", description: "Public organization description",
      website: "https://company.example/careers", github: "https://github.com/company",
    });
    expect(JSON.stringify(result)).not.toMatch(/private|funds|people|annotations|projects|credential/i);
    state.payload.description = "x".repeat(10000);
    state.payload.website = "javascript:alert('unsafe')";
    state.payload.github = "https://secret:credential@github.com/company";
    const bounded = await service.candidateCompany("company");
    expect((bounded.description as string).length).toBeLessThanOrEqual(6000);
    expect(bounded.website).toBeNull();
    expect(bounded.github).toBeNull();
    state.organizationSuppressed = true;
    await expect(service.candidateCompany("company")).rejects.toBeInstanceOf(NotFoundException);
  });
});
