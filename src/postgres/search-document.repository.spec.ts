import { SearchDocumentRepository } from "./search-document.repository";
import { PostgresService } from "./postgres.service";

describe("SearchDocumentRepository", () => {
  let query: jest.Mock;
  let repository: SearchDocumentRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    repository = new SearchDocumentRepository({
      query,
    } as unknown as PostgresService);
  });

  it("reads only online, unblocked job documents", async () => {
    await repository.getJobPayloads();

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM job_search_documents");
    expect(sql).toContain("WHERE job.online");
    expect(sql).toContain("AND NOT job.blocked");
    expect(sql).toContain("AND job.legacy_list_eligible");
    expect(sql).toContain("organization_has_expert_jobs");
    expect(parameters).toEqual([]);
  });

  it("loads every sitemap job through one minimal indexed projection", async () => {
    await repository.getFrontendSitemapJobs();

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('job.short_uuid AS "shortUUID"');
    expect(sql).toContain('organization.name AS "organizationName"');
    expect(sql).toContain("cardinality(organization.project_ids) > 0");
    expect(sql).toContain("WHERE job.online");
    expect(sql).toContain("job.legacy_list_eligible");
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("job.payload");
    expect(parameters).toBeUndefined();
  });

  it("loads complete EV sitemap facets without detail payload hydration", async () => {
    await repository.getEvSitemapOrganizations();
    const [organizationSql, organizationParameters] = query.mock.calls[0];
    expect(organizationSql).toContain(
      'organization.normalized_name AS "normalizedName"',
    );
    expect(organizationSql).toContain("jsonb_numeric_value");
    expect(organizationSql).toContain(
      'cardinality(organization.project_ids)::integer AS "projectCount"',
    );
    expect(organizationSql).not.toContain("LIMIT 100");
    expect(organizationParameters).toBeUndefined();

    query.mockClear();
    await repository.getEvSitemapProjects();
    const [projectSql, projectParameters] = query.mock.calls[0];
    expect(projectSql).toContain('normalized_name AS "normalizedName"');
    expect(projectSql).toContain('organization_ids AS "orgIds"');
    expect(projectSql).not.toContain("payload");
    expect(projectSql).not.toContain("LIMIT");
    expect(projectParameters).toBeUndefined();
  });

  it("parameterizes the ecosystem job-list constraint", async () => {
    await repository.getJobPayloads("Ethereum Ecosystem");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("$1 = ANY(job.managed_ecosystems)");
    expect(sql).not.toContain("ethereum-ecosystem");
    expect(parameters).toEqual(["ethereum-ecosystem"]);
  });

  it("reads multiple managed ecosystems with one indexed overlap predicate", async () => {
    await repository.getEcosystemJobPayloads(["Ethereum", "Optimism"]);

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("job.managed_ecosystems && $1::text[]");
    expect(sql).toContain("JOIN organization_search_documents");
    expect(parameters).toEqual([["ethereum", "optimism"]]);
  });

  it("reads all jobs with projected moderation state", async () => {
    await repository.getAllJobPayloads();

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("'isOnline', job.online");
    expect(sql).toContain("'isBlocked', job.blocked");
    expect(sql).not.toContain("WHERE job.online");
    expect(parameters).toBeUndefined();
  });

  it("parameterizes organization job reads and event counts", async () => {
    await repository.getOrganizationJobPayloads("org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("WHERE job.organization_id = $1");
    expect(sql).toContain("application.type = 'APPLIED_TO'");
    expect(sql).toContain("view_event.type = 'VIEWED_DETAILS'");
    expect(sql).not.toContain("org-1' OR true --");
    expect(parameters).toEqual(["org-1' OR true --"]);
  });

  it("pushes every job array filter into PostgreSQL", async () => {
    await repository.searchJobs({
      tags: ["Solidity"],
      projects: ["Project A"],
      investors: ["Investor A"],
      fundingRounds: ["Series A"],
      chains: ["Ethereum"],
      classifications: ["Engineering"],
      commitments: ["Full Time"],
      locations: ["Remote"],
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("legacy_list_eligible");
    for (const column of [
      "tags",
      "project_names",
      "investor_names",
      "funding_round_names",
      "chain_names",
      "classifications",
      "commitments",
      "location_types",
    ]) {
      expect(sql).toContain(`${column} &&`);
    }
    expect(parameters).toEqual(
      expect.arrayContaining([
        ["solidity"],
        ["project-a"],
        ["investor-a"],
        ["series-a"],
        ["ethereum"],
        ["engineering"],
        ["full-time"],
        ["remote"],
      ]),
    );
  });

  it("pushes numeric and boolean job filters into PostgreSQL", async () => {
    await repository.searchJobs({
      minSalaryRange: 50_000,
      maxSalaryRange: 200_000,
      minHeadCount: 10,
      maxHeadCount: 500,
      minTvl: 1_000_000,
      maxTvl: 5_000_000,
      minMonthlyVolume: 100,
      maxMonthlyVolume: 1_000,
      minMonthlyFees: 10,
      maxMonthlyFees: 100,
      minMonthlyRevenue: 5,
      maxMonthlyRevenue: 50,
      audits: true,
      hacks: false,
      token: true,
      onboardIntoWeb3: false,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("COALESCE(salary, 0) >=");
    expect(sql).toContain("COALESCE(headcount_estimate, 0) <");
    expect(sql).toContain("COALESCE(max_tvl, 0) >=");
    expect(sql).toContain("has_audits =");
    expect(sql).toContain("has_hacks =");
    expect(sql).toContain("has_token =");
    expect(sql).toContain("onboard_into_web3 =");
    expect(parameters).toEqual(
      expect.arrayContaining([50_000, 200_000, true, false]),
    );
  });

  it("binds free-text job search instead of interpolating it", async () => {
    const malicious = "x'); DROP TABLE graph_nodes; --";
    query
      .mockResolvedValueOnce([{ hasExactMatch: false }])
      .mockResolvedValueOnce([]);
    await repository.searchJobs({ query: malicious });

    expect(query).toHaveBeenCalledTimes(2);
    const [probeSql, probeParameters] = query.mock.calls[0];
    const [sql, parameters] = query.mock.calls[1];
    expect(probeSql).toContain("websearch_to_tsquery('simple', $1)");
    expect(probeSql).not.toContain(malicious);
    expect(probeParameters).toEqual([malicious]);
    expect(sql).toContain("search_text %");
    expect(sql).not.toContain(malicious);
    expect(parameters).toContain(malicious);
  });

  it("uses direct full-text filtering when the exact probe matches", async () => {
    query
      .mockResolvedValueOnce([{ hasExactMatch: true }])
      .mockResolvedValueOnce([]);

    await repository.searchJobs({ query: "protocol engineer" });

    const [sql, parameters] = query.mock.calls[1];
    expect(sql).toContain(
      "search_vector @@ websearch_to_tsquery('simple', $1)",
    );
    expect(sql).not.toContain("search_text %");
    expect(parameters).toContain("protocol engineer");
  });

  it("uses an allow-listed fallback for an invalid job sort", async () => {
    await repository.searchJobs({
      orderBy: "payload; DROP TABLE graph_nodes" as never,
      order: "asc",
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("published_timestamp AS sort_value");
    expect(sql).toContain("sort_value ASC");
    expect(sql).not.toContain("DROP TABLE");
  });

  it("clamps job pagination and reports totals from the window count", async () => {
    query.mockResolvedValue([{ payload: { id: "job-1" }, total_count: "123" }]);

    const result = await repository.searchJobs({ page: -10, limit: 5000 });

    expect(result).toEqual({
      page: 1,
      count: 1,
      total: 123,
      data: [{ id: "job-1" }],
    });
    const parameters = query.mock.calls[0][1];
    expect(parameters.slice(-2)).toEqual([100, 0]);
  });

  it("supports explicit public-only and expert-only job filters", async () => {
    await repository.searchJobs({ expertJobs: true });
    expect(query.mock.calls[0][0]).toContain("access = 'protected'");

    query.mockClear();
    await repository.searchJobs({ expertJobs: false });
    expect(query.mock.calls[0][0]).toContain("access <> 'protected'");
  });

  it("supports moderation-state searches used by managed ecosystems", async () => {
    await repository.searchJobs({
      online: false,
      blocked: false,
      includeOffline: true,
      includeBlocked: true,
    });
    expect(query.mock.calls[0][0]).not.toContain("WHERE online");
    expect(query.mock.calls[0][0]).not.toContain("NOT blocked");
    expect(query.mock.calls[0][0]).toContain("legacy_list_eligible");

    query.mockClear();
    await repository.searchJobs({
      online: true,
      blocked: true,
      includeOffline: true,
      includeBlocked: true,
    });
    expect(query.mock.calls[0][0]).toContain("WHERE online");
    expect(query.mock.calls[0][0]).toContain("AND blocked");
  });

  it("builds job filter options from projected labels", async () => {
    await repository.getJobFilterValues("ethereum");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("WITH scoped_jobs AS MATERIALIZED");
    expect(sql).toContain("organization_label_values AS MATERIALIZED");
    expect(sql).toContain("filter_labels -> 'tags'");
    expect(sql).toContain('AS "minSalaryRange"');
    expect(sql).toContain("salary_currency ILIKE '%USD%'");
    expect(sql).toContain("managed_ecosystems && $1::text[]");
    expect(parameters).toEqual([["ethereum"]]);
  });

  it("scopes job filter aggregates to one organization", async () => {
    await repository.getJobFilterValues(undefined, "org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("organization_id = $1");
    expect(sql).not.toContain("org-1' OR true --");
    expect(parameters).toEqual(["org-1' OR true --"]);
  });

  it("derives all-jobs filters from the shared aggregate", async () => {
    query.mockResolvedValue([
      { classifications: ["ENGINEERING"], organizations: ["Acme"] },
    ]);

    await expect(repository.getAllJobsFilterValues()).resolves.toEqual({
      category: ["ENGINEERING"],
      organizations: ["Acme"],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("preserves exact category-name matching for the category endpoint", async () => {
    await repository.getProjectPayloads({ category: "DEXes" });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("$1 = ANY(categories)");
    expect(sql).toContain("filter_labels -> 'categories' ->> $1 = $2");
    expect(parameters).toEqual(["dexes", "DEXes"]);
  });

  it("parameterizes deterministic job detail reads", async () => {
    query.mockResolvedValue([{ payload: { id: "job-1" } }]);

    await expect(
      repository.getJobByShortUuid("job-1' OR true --", {
        ecosystem: "Ethereum",
        includeOffline: true,
      }),
    ).resolves.toEqual({ id: "job-1" });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("job.short_uuid = $1");
    expect(sql).toContain("ORDER BY job.online DESC");
    expect(sql).not.toContain("job-1' OR true --");
    expect(parameters).toEqual(["job-1' OR true --", true, "ethereum"]);
  });

  it("pushes organization filters, search, and ordering into SQL", async () => {
    await repository.searchOrganizations({
      minHeadCount: 5,
      maxHeadCount: 100,
      investors: ["Paradigm"],
      fundingRounds: ["Seed"],
      ecosystems: ["Ethereum"],
      projects: ["Alpha"],
      tags: ["Solidity"],
      chains: ["Ethereum"],
      names: ["Acme"],
      locations: ["Berlin"],
      hasProjects: true,
      query: "acme",
      orderBy: "recentJobDate",
      order: "asc",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM organization_search_documents");
    expect(sql).toContain("investors &&");
    expect(sql).toContain("funding_rounds &&");
    expect(sql).toContain("has_projects =");
    expect(sql).toContain("recent_job_timestamp ASC");
    expect(parameters).toContain("acme");
  });

  it("projects organization link collections in one parameterized query", async () => {
    await repository.getOrganizationsWithLinks("org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("CROSS JOIN LATERAL");
    expect(sql).toContain("'detectedJobsites'");
    expect(sql).toContain("organization.organization_id = $1");
    expect(sql).not.toContain("org-1' OR true --");
    expect(parameters).toEqual(["org-1' OR true --"]);
  });

  it("uses an allow-listed fallback for an invalid organization sort", async () => {
    await repository.searchOrganizations({
      orderBy: "payload" as never,
    });
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("recent_funding_timestamp DESC");
  });

  it("pushes project filters and metric ordering into SQL", async () => {
    await repository.searchProjects({
      minTvl: 10,
      maxTvl: 100,
      audits: true,
      hacks: false,
      token: true,
      organizations: ["Acme"],
      investors: ["Paradigm"],
      chains: ["Ethereum"],
      categories: ["DeFi"],
      ecosystems: ["Ethereum"],
      tags: ["Solidity"],
      names: ["Alpha"],
      query: "alpha",
      orderBy: "monthlyVolume",
      order: "desc",
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("FROM project_search_documents");
    expect(sql).toContain("organization_names &&");
    expect(sql).toContain("has_token =");
    expect(sql).toContain("monthly_volume DESC");
  });

  it("parameterizes organization and project detail keys", async () => {
    await repository.getOrganizationById("org-1' OR true --");
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("organization_id = $1"),
      ["org-1' OR true --", null],
    ]);

    query.mockClear();
    await repository.getProjectBySlug("Project Alpha");
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining("slug = $1"),
      ["project-alpha", null],
    ]);
  });

  it("matches organization websites through a bound domain array", async () => {
    query.mockResolvedValue([{ organization_id: "org-1" }]);
    const malicious = "example.com%'; DROP TABLE graph_nodes; --";

    await expect(
      repository.findOrganizationIdByWebsite([malicious]),
    ).resolves.toBe("org-1");
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("unnest($1::text[])");
    expect(sql).not.toContain(malicious);
    expect(parameters).toEqual([[malicious]]);
  });

  it("builds organization and project filter aggregates in one query each", async () => {
    await repository.getOrganizationFilterValues();
    expect(query.mock.calls[0][0]).toContain("FROM job_search_documents");
    expect(query.mock.calls[0][0]).toContain("WHERE job.online");
    expect(query.mock.calls[0][0]).toContain(
      "owner_filter_labels -> 'investors'",
    );

    query.mockClear();
    await repository.getProjectFilterValues();
    expect(query.mock.calls[0][0]).toContain("FROM project_search_documents");
    expect(query.mock.calls[0][0]).toContain("eligible_projects");
    expect(query.mock.calls[0][0]).toContain("filter_labels -> 'categories'");
  });
});
