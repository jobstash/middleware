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

  it("returns a bounded minimal organization directory with case-insensitive search", async () => {
    query.mockResolvedValue([
      {
        data: [
          {
            id: "node-public-id",
            orgId: "org-1",
            name: "Acme Labs",
            projectCount: 2,
          },
        ],
        total: "7",
      },
    ]);

    await expect(
      repository.getAdminOrganizationDirectory({
        query: "  AcMe  ",
        limit: 25,
        offset: 5,
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "node-public-id",
          orgId: "org-1",
          name: "Acme Labs",
          projectCount: 2,
        },
      ],
      total: 7,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM organization_search_documents organization");
    expect(sql).toContain("WITH filtered AS NOT MATERIALIZED");
    expect(sql).toContain("organization.search_values");
    expect(sql).toContain("organization.payload ->> 'summary'");
    expect(sql).toContain("position(lower($1)");
    expect(sql).toContain("LIMIT $2 OFFSET $3");
    expect(sql).not.toContain("graph_nodes");
    expect(sql).not.toContain("graph_relationships");
    expect(parameters).toEqual(["AcMe", 25, 5]);
  });

  it("returns a bounded minimal project directory with all searchable summary fields", async () => {
    query.mockResolvedValue([
      {
        data: [
          {
            id: "project-1",
            name: "Acme Protocol",
            category: "DeFi",
            orgIds: ["org-1"],
          },
        ],
        total: 1,
      },
    ]);

    await expect(
      repository.getAdminProjectDirectory({
        query: "DeFi",
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "project-1",
          name: "Acme Protocol",
          category: "DeFi",
          orgIds: ["org-1"],
        },
      ],
      total: 1,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM project_search_documents project");
    expect(sql).toContain("project.search_values");
    expect(sql).toContain("project.organization_ids");
    expect(sql).toContain("->> 'summary'");
    expect(sql).toContain("->> 'category'");
    expect(sql).toContain("->> 'website'");
    expect(sql).not.toContain("graph_nodes");
    expect(sql).not.toContain("graph_relationships");
    expect(parameters).toEqual(["DeFi", 10, 0]);
  });

  it("parameterizes the ecosystem job-list constraint", async () => {
    await repository.getJobPayloads("Ethereum Ecosystem");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("$1 = ANY(job.managed_ecosystems)");
    expect(sql).not.toContain("ethereum-ecosystem");
    expect(parameters).toEqual(["ethereum-ecosystem"]);
  });

  it("pushes organization and ecosystem job-list scopes into PostgreSQL", async () => {
    await repository.getJobPayloads("Ethereum Ecosystem", "org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("$1 = ANY(job.managed_ecosystems)");
    expect(sql).toContain("job.organization_id = $2");
    expect(sql).not.toContain("org-1' OR true --");
    expect(parameters).toEqual(["ethereum-ecosystem", "org-1' OR true --"]);
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
      "chain_names",
      "classifications",
      "commitments",
      "location_types",
    ]) {
      expect(sql).toContain(`${column} &&`);
    }
    expect(sql).toContain("latest_funding_round_name = ANY(");
    expect(parameters).toEqual(
      expect.arrayContaining([
        ["solidity"],
        ["project-a"],
        ["investor-a"],
        ["series-a"],
        ["ethereum"],
        ["engineering"],
        ["fulltime"],
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
    expect(sql).toContain("salary_currency = 'USD'");
    expect(sql).toContain("COALESCE(headcount_estimate, 0) <");
    expect(sql).toContain("COALESCE(max_tvl, 0) >=");
    expect(sql).toContain("min_tvl IS NOT NULL AND min_tvl <");
    expect(sql).toContain("has_audits =");
    expect(sql).toContain("NOT has_hacks");
    expect(sql).toContain("has_token =");
    expect(sql).toContain("onboard_into_web3 =");
    expect(parameters).toEqual(
      expect.arrayContaining([50_000, 200_000, true, false]),
    );
  });

  it("preserves legacy false project booleans for organization jobs", async () => {
    await repository.searchJobs({
      audits: false,
      hacks: false,
      token: false,
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("(organization_id IS NOT NULL OR NOT has_audits)");
    expect(sql).toContain("(organization_id IS NOT NULL OR NOT has_hacks)");
    expect(sql).toContain("(organization_id IS NOT NULL OR has_token)");
  });

  it("activates false project booleans when another organization filter is truthy", async () => {
    await repository.searchJobs({
      minHeadCount: 10,
      audits: false,
      hacks: false,
      token: false,
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("AND NOT has_audits");
    expect(sql).toContain("AND NOT has_hacks");
    expect(sql).toContain("AND has_token");
    expect(sql).not.toContain("organization_id IS NOT NULL OR NOT has_audits");
    expect(sql).not.toContain("organization_id IS NOT NULL OR NOT has_hacks");
    expect(sql).not.toContain("organization_id IS NOT NULL OR has_token");
  });

  it("keeps free-text job search out of generated SQL", async () => {
    const malicious = "x'); DROP TABLE graph_nodes; --";
    query.mockResolvedValueOnce([
      {
        job_node_id: "1",
        access: "public",
        search_values: ["Protocol Engineer"],
      },
    ]);
    await repository.searchJobs({ query: malicious });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).not.toContain(malicious);
    expect(parameters ?? []).not.toContain(malicious);
  });

  it("does not transfer fuzzy targets when job text search is inactive", async () => {
    await repository.searchJobs({ tags: ["Solidity"] });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("NULL::text[] AS search_values");
  });

  it("uses the projected legacy fuzzysort targets", async () => {
    query
      .mockResolvedValueOnce([
        {
          job_node_id: "1",
          access: "public",
          search_values: ["Protocol Engineer"],
        },
      ])
      .mockResolvedValueOnce([{ payload: { id: "job-1" } }]);

    await repository.searchJobs({ query: "protocol engineer" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("search_values");
    expect(query.mock.calls[0][1] ?? []).not.toContain("protocol engineer");
    expect(query.mock.calls[1][1]).toEqual([["1"]]);
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

  it("preserves legacy job limits before hydrating selected IDs", async () => {
    const candidates = Array.from({ length: 123 }, (_, index) => ({
      job_node_id: String(index + 1),
      access: "public",
      search_values: [],
    }));
    query.mockResolvedValueOnce(candidates).mockResolvedValueOnce(
      candidates.map(candidate => ({
        payload: { id: `job-${candidate.job_node_id}` },
      })),
    );

    const result = await repository.searchJobs({ page: 1, limit: 5000 });

    expect(result).toMatchObject({ page: 1, count: 123, total: 123 });
    expect(result.data[0]).toEqual({ id: "job-1" });
    expect(result.data.at(-1)).toEqual({ id: "job-123" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).not.toContain("LIMIT");
    expect(query.mock.calls[1][1]).toEqual([
      candidates.map(candidate => candidate.job_node_id),
    ]);
  });

  it("preserves legacy negative-page slicing", async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      job_node_id: String(index + 1),
      access: "public",
      search_values: [],
    }));
    query
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([
        { payload: { id: "job-2" } },
        { payload: { id: "job-3" } },
      ]);

    const result = await repository.searchJobs({ page: -1, limit: 2 });

    expect(result).toMatchObject({ page: -1, count: 2, total: 5 });
    expect(query.mock.calls[1][1]).toEqual([["2", "3"]]);
  });

  it("supports explicit public-only and expert-only job filters", async () => {
    await repository.searchJobs({ expertJobs: true });
    expect(query.mock.calls[0][0]).toContain("access = 'protected'");

    query.mockClear();
    await repository.searchJobs({ expertJobs: false });
    expect(query.mock.calls[0][0]).toContain("access <> 'protected'");
    expect(query.mock.calls[0][0]).toContain("organization_has_expert_jobs");
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
    expect(sql).toContain("JOIN graph_nodes node");
    expect(sql).toContain("'needsManualReview'");
    expect(sql).toContain("'manualReviewProposedActions'");
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

  it("pushes organization filters and ordering into SQL before fuzzy matching", async () => {
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
    expect(sql).toContain("OR managed_ecosystems &&");
    expect(sql).toContain("has_projects =");
    expect(sql).toContain("recent_job_timestamp ASC");
    expect(sql).toContain("search_values");
    expect(sql).not.toContain("acme");
    expect(parameters).not.toContain("acme");

    query.mockClear();
    await repository.searchOrganizations({ hasProjects: false });
    expect(query.mock.calls[0][0]).toContain("has_projects = $1");
    expect(query.mock.calls[0][1]).toEqual([false, 10, 0]);
  });

  it("projects organization link collections in one parameterized query", async () => {
    await repository.getOrganizationsWithLinks("org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("CROSS JOIN LATERAL");
    expect(sql).toContain("'detectedJobsites'");
    expect(sql).toContain("'needsManualReview'");
    expect(sql).toContain("'manualReviewEvidence'");
    expect(sql).toContain("array_agg(DISTINCT related.properties");
    expect(sql).toContain("jsonb_agg(DISTINCT jsonb_build_object");
    expect(sql).toContain(
      "related.properties ->> 'type' IS DISTINCT FROM 'unavailable'",
    );
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

  it("uses legacy natural name ordering for organizations", async () => {
    await repository.searchOrganizations({ orderBy: "name", order: "desc" });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain(
      "ORDER BY name COLLATE jobstash_natural ASC, organization_node_id ASC",
    );
    expect(sql).not.toContain("name COLLATE jobstash_natural DESC");
  });

  it("pushes project filters and metric ordering into SQL before fuzzy matching", async () => {
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

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM project_search_documents");
    expect(sql).toContain("organization_names &&");
    expect(sql).toContain("OR managed_ecosystems &&");
    expect(sql).toContain("has_token =");
    expect(sql).toContain("monthly_volume DESC");
    expect(sql).toContain("search_values");
    expect(sql).not.toContain("alpha");
    expect(parameters).not.toContain("alpha");
  });

  it("applies both true and false project-search boolean aliases", async () => {
    await repository.searchProjects({
      hasAudits: true,
      hasHacks: true,
      hasToken: true,
      audits: false,
      hacks: false,
      token: false,
    });

    const [enabledSql, enabledParameters] = query.mock.calls[0];
    expect(enabledSql).toContain("has_audits = $1");
    expect(enabledSql).toContain("has_hacks = $2");
    expect(enabledSql).toContain("has_token = $3");
    expect(enabledParameters).toEqual([true, true, true, 10, 0]);

    query.mockClear();
    await repository.searchProjects({
      hasAudits: false,
      hasHacks: false,
      hasToken: false,
      audits: true,
      hacks: true,
      token: true,
    });

    const [disabledSql, disabledParameters] = query.mock.calls[0];
    expect(disabledSql).toContain("has_audits = $1");
    expect(disabledSql).toContain("has_hacks = $2");
    expect(disabledSql).toContain("has_token = $3");
    expect(disabledParameters).toEqual([false, false, false, 10, 0]);
  });

  it("keeps strict project-list booleans separate from search aliases", async () => {
    await repository.searchProjects({
      audits: false,
      hacks: true,
      token: false,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("has_audits = $1");
    expect(sql).toContain("has_hacks = $2");
    expect(sql).toContain("has_token = $3");
    expect(sql).not.toContain("token_address_not_explicit_null");
    expect(parameters).toEqual([false, true, false, 10, 0]);
  });

  it("orders projects with the JavaScript-compatible natural collation", async () => {
    await repository.searchProjects({ order: "desc" });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain(
      "ORDER BY name COLLATE jobstash_natural DESC NULLS LAST, project_node_id ASC",
    );
  });

  it("hydrates exact fuzzysort matches by projected identity order", async () => {
    query
      .mockResolvedValueOnce([
        { node_id: "2", search_values: ["Beta", "Acme Labs"] },
        { node_id: "1", search_values: ["Acme"] },
      ])
      .mockResolvedValueOnce([
        { payload: { orgId: "org-beta" } },
        { payload: { orgId: "org-acme" } },
      ]);

    await expect(
      repository.searchOrganizations({ query: "acme", limit: 20 }),
    ).resolves.toEqual({
      page: 1,
      count: 2,
      total: 2,
      data: [{ orgId: "org-beta" }, { orgId: "org-acme" }],
    });
    expect(query.mock.calls[1][1]).toEqual([["2", "1"]]);
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
    expect(sql).toContain(
      "NOT entity_property_is_banned(organization.properties)",
    );
    expect(sql).not.toContain(malicious);
    expect(parameters).toEqual([[malicious]]);
  });

  it("excludes banned projects from website identity lookups", async () => {
    query.mockResolvedValue([{ project_id: "project-1" }]);

    await expect(
      repository.findProjectIdByWebsite(["project.example"]),
    ).resolves.toBe("project-1");
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("NOT entity_property_is_banned(project.properties)");
    expect(parameters).toEqual([["project.example"]]);
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
