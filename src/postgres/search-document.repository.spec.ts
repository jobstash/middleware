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
    expect(sql).toContain(
      'COALESCE(organization.name, project.name) AS "organizationName"',
    );
    expect(sql).toContain("cardinality(organization.project_ids) > 0");
    expect(sql).toContain("LEFT JOIN project_search_documents project");
    expect(sql).toContain(
      "num_nonnulls(job.organization_id, job.project_id) = 1",
    );
    expect(sql).toContain("WHERE job.online");
    expect(sql).toContain("job.legacy_list_eligible");
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("job.payload");
    expect(parameters).toBeUndefined();
  });

  it("paginates all admin jobs and applies the exact online state", async () => {
    query
      .mockResolvedValueOnce([{ total: "2048" }])
      .mockResolvedValueOnce([{ payload: { id: "job-101" } }]);

    await expect(
      repository.getAdminJobPayloadPage({
        page: 2,
        limit: 100,
        online: false,
      }),
    ).resolves.toEqual({
      page: 2,
      count: 1,
      total: 2048,
      data: [{ id: "job-101" }],
    });

    const [countSql, countParameters] = query.mock.calls[0];
    expect(countSql).toContain("job.online = $1::boolean");
    expect(countSql).toContain("job.legacy_list_eligible");
    expect(countSql).toContain("cardinality(job.tags) > 0");
    expect(countParameters).toEqual([false]);

    const [pageSql, pageParameters] = query.mock.calls[1];
    expect(pageSql).toContain("'online', job.online");
    expect(pageSql).toContain("'blocked', job.blocked");
    expect(pageSql).toContain("application.type = 'APPLIED_TO'");
    expect(pageSql).toContain("view_event.type = 'VIEWED_DETAILS'");
    expect(pageSql).toContain("LIMIT $2 OFFSET $3");
    expect(pageParameters).toEqual([false, 100, 100]);
  });

  it.each([
    ["list", (): Promise<unknown> => repository.getJobPayloads()],
    [
      "ecosystem",
      (): Promise<unknown> => repository.getEcosystemJobPayloads(["Ethereum"]),
    ],
    ["all", (): Promise<unknown> => repository.getAllJobPayloads()],
    ["public", (): Promise<unknown> => repository.getPublicJobPayloads(false)],
    [
      "archive",
      (): Promise<unknown> => repository.getArchiveJobPayloads(1, 10),
    ],
    ["detail", (): Promise<unknown> => repository.getJobByShortUuid("job-1")],
  ])(
    "hydrates the exact Organization-or-Project employer for %s jobs",
    async (_name, invoke) => {
      await invoke();

      const [sql] = query.mock.calls[0];
      expect(sql).toContain(
        "LEFT JOIN organization_search_documents organization",
      );
      expect(sql).toContain("LEFT JOIN project_search_documents project");
      expect(sql).toContain("job.organization_id IS NOT NULL");
      expect(sql).toContain("job.project_id IS NOT NULL");
      expect(sql).toContain("'organization', NULL");
      expect(sql).toContain("'project', project.payload - 'tags' - 'jobs'");
      expect(sql).toContain(
        "num_nonnulls(job.organization_id, job.project_id) = 1",
      );
    },
  );

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

  it("returns a Unicode-aware organization directory ranked by match quality", async () => {
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
        query: "  ＡcMe  ",
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
    expect(sql).toContain("filtered AS NOT MATERIALIZED");
    expect(sql).toContain("organization.search_text");
    expect(sql).toContain("organization.payload ->> 'summary'");
    expect(sql).not.toContain("AS summary_key");
    expect(sql).toContain("unaccent(casefold(normalize(");
    expect(sql).toContain("WHEN query_key = name_key");
    expect(sql).toContain(
      "ORDER BY match_rank, match_distance, sort_name, org_id",
    );
    expect(sql).not.toContain("ORDER BY lower(name)");
    expect(sql).toContain("LIMIT $2 OFFSET $3");
    expect(sql).toContain("entity_property_is_banned(node.properties)");
    expect(sql).toContain("'vertical', page.vertical");
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("FROM graph_nodes banned");
    expect(sql).toContain("banned.label = 'Organization'");
    expect(sql).toContain("'banned', page.banned");
    expect(parameters).toEqual(["AcMe", 25, 5]);
  });

  it("keeps malformed organization links out of the admin grid payload", async () => {
    query.mockResolvedValue([
      {
        payload: { orgId: "org-1", name: "Acme", telegrams: [] },
        total_count: "1",
      },
    ]);

    await expect(
      repository.getOrganizationsForAdminGrid({
        limit: 500,
        offset: 0,
        query: "Acme",
        reviewOnly: true,
        bannedOnly: false,
      }),
    ).resolves.toEqual({
      data: [{ orgId: "org-1", name: "Acme", telegrams: [] }],
      total: 1,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("related.properties ->> 'username' IS NOT NULL");
    expect(sql).toContain("related.properties ->> 'invite' IS NOT NULL");
    expect(sql).toContain("related.properties ->> 'id' IS NOT NULL");
    expect(sql).toContain("'lastImportAttemptTimestamp'");
    expect(sql).toContain("'lastSuccessfulImportTimestamp'");
    expect(sql).toContain("'lastNewJobTimestamp'");
    expect(sql).toContain(
      "jsonb_typeof(organization.payload -> 'projects') = 'array'",
    );
    expect(sql).toContain("'needsManualReview'");
    expect(sql).toContain("'vertical', node.properties -> 'vertical'");
    expect(sql).toContain("'verticalClassificationReason'");
    expect(sql).toContain(
      "'banned', entity_property_is_banned(node.properties)",
    );
    expect(sql).toContain("'banned', true");
    expect(sql).toContain("organization.graph_properties -> 'orgId'");
    expect(sql).toContain("organization.graph_properties -> 'id'");
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("banned.label = 'Organization'");
    expect(sql).toContain("LIKE '%' || lower($3) || '%'");
    expect(parameters).toEqual([500, 0, "Acme", true, false]);
  });

  it("filters and pages the complete admin project grid in PostgreSQL", async () => {
    query.mockResolvedValue([
      {
        payload: {
          id: "project-1",
          name: "Acme Protocol",
          logoUrl: null,
          needsManualReview: true,
        },
        total_count: "3",
      },
    ]);

    await expect(
      repository.getProjectsForAdminGrid({
        limit: 250,
        offset: 500,
        query: "Acme",
        reviewOnly: true,
        bannedOnly: false,
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "project-1",
          name: "Acme Protocol",
          logoUrl: null,
          needsManualReview: true,
        },
      ],
      total: 3,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("WITH selected_projects AS");
    expect(sql).toContain("FROM project_search_documents project");
    expect(sql).toContain("banned.label = 'Project'");
    expect(sql).toContain("candidate.label = 'ChildProjectCandidate'");
    expect(sql).toContain("LIKE '%' || lower($3) || '%'");
    expect(sql).toContain("LIMIT $1 OFFSET $2");
    expect(parameters).toEqual([250, 500, "Acme", true, false]);
  });

  it("returns a Unicode-aware project directory ranked by match quality", async () => {
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
        query: "ＤeFi",
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
    expect(sql).toContain("project.search_text");
    expect(sql).toContain("project.organization_ids");
    expect(sql).not.toContain("->> 'summary'");
    expect(sql).toContain("->> 'category'");
    expect(sql).toContain("->> 'website'");
    expect(sql).toContain("unaccent(casefold(normalize(");
    expect(sql).toContain("WHEN query_key = name_key");
    expect(sql).toContain("ORDER BY match_rank, match_distance, sort_name, id");
    expect(sql).not.toContain("ORDER BY lower(name)");
    expect(sql).toContain("entity_property_is_banned(node.properties)");
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("FROM graph_nodes banned");
    expect(sql).toContain("banned.label = 'Project'");
    expect(sql).toContain("'banned', page.banned");
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
      workModes: ["Remote"],
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
    ]) {
      expect(sql).toContain(`(${column}) &&`);
    }
    expect(sql).toContain("(funding_round_names) &&");
    expect(sql).toContain("'remote' = ANY(COALESCE(location_types");
    expect(sql).toContain("FROM graph_relationships structured_job");
    expect(sql).toContain("JOIN job_availability_extractions extraction");
    expect(sql).toContain("JOIN job_work_location_options remote_option");
    expect(sql).toContain("remote_option.scope = 'global'");
    expect(sql).toContain(
      "remote_option.arrangement_confidence IN ('source_stated', 'parsed')",
    );
    expect(sql).toContain("remote_option.employer_authored_remote_evidence");
    expect(sql).toContain(
      "work_arrangement ->> 'version' = 'WorkArrangementV1'",
    );
    expect(sql).toContain(
      "work_arrangement ->> 'classification' = 'verified_remote'",
    );
    expect(sql).toContain("work_arrangement ->> 'fullyRemote' = 'true'");
    expect(sql).not.toContain("required_availability_keys");
    expect(sql).toContain("payload -> 'availability'");
    expect(sql).toContain("required_remote_availability.item ->> 'workMode'");
    expect(sql).toContain(
      "required_remote_availability.item ->> 'requirement'",
    );
    expect(sql).toContain("jsonb_typeof(payload -> 'availability') = 'array'");
    expect(sql).toContain("jsonb_typeof(availability_item.item) <> 'object'");
    expect(sql).toContain("'remote-any-location', 'remote-worldwide'");
    expect(sql).not.toContain("lower(COALESCE(location, ''))");
    expect(sql).not.toContain("lower(COALESCE(title, ''))");
    expect(sql).toContain("NOT COALESCE(bool_or");
    expect(sql).toContain("remote_option.scope IN ('region', 'country_list')");
    expect(sql).toContain(
      "remote_option.required_minimum_utc_offset_minutes IS NULL",
    );
    expect(sql).toContain(
      "remote_option.timezone_preference_strength <> 'required'",
    );
    expect(sql).toContain(
      "cardinality(remote_option.residency_requirements) = 0",
    );
    expect(sql).toContain("cardinality(remote_option.work_authorizations) = 0");
    expect(sql).toContain(
      "NULLIF(btrim(remote_option.attendance_cadence), '') IS NULL",
    );
    expect(sql).toContain(
      "NULLIF(btrim(remote_option.travel_requirement), '') IS NULL",
    );
    expect(sql).not.toContain("structured_job_refresh_staging");
    expect(sql).not.toContain("job_has_work_location_mode");
    expect(sql).toContain("FROM unnest(classifications) facet_key");
    expect(sql).toContain("replace(facet_key, '-', '')");
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

  it("accepts legacy compact facet URLs without losing canonical matches", async () => {
    await repository.searchJobs({
      classifications: ["engineeringmanagement"],
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM unnest(classifications) facet_key");
    expect(sql).toContain("replace(facet_key, '-', '')");
    expect(parameters).toEqual(
      expect.arrayContaining([
        ["engineeringmanagement"],
        ["engineeringmanagement"],
      ]),
    );
  });

  it("accepts SEO geography slugs and legacy internal keys", async () => {
    await repository.searchJobs({
      availability: ["berlin"],
      cities: ["amsterdam"],
      regions: ["north-holland"],
      countries: ["netherlands"],
      continents: ["europe"],
      timezones: ["tz:Europe/Amsterdam"],
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql.match(/availability_keys &&/g)).toHaveLength(6);
    expect(sql.match(/jsonb_each_text/g)).toHaveLength(6);
    expect(sql).toContain("filter_labels -> 'availability'");
    expect(sql).toContain("filter_labels -> 'cities'");
    expect(sql).toContain("filter_labels -> 'regions'");
    expect(sql).toContain("filter_labels -> 'countries'");
    expect(sql).toContain("filter_labels -> 'continents'");
    expect(sql).toContain("filter_labels -> 'timezones'");
    expect(sql).toContain("geography.internal_key = ANY");
    expect(sql).toContain("slugify_text(geography.public_label) = ANY");
    expect(parameters).toEqual(
      expect.arrayContaining([
        ["berlin"],
        ["amsterdam"],
        ["north-holland"],
        ["netherlands"],
        ["europe"],
        ["tz:Europe/Amsterdam"],
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

  it("filters by explicitly selected inferred collaboration hours", async () => {
    await repository.searchJobs({
      collaborationHours: ["utc-08", "utc-17"],
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("job_team_collaboration_hour_keys(");
    expect(sql).toContain("organization_id");
    expect(sql).toContain("project_id");
    expect(parameters).toContainEqual(["utc-08", "utc-17"]);
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

  it("filters the complete job list by title with the suggestion matching rules", async () => {
    await repository.searchJobs({ titleQuery: "  technical clerk  " });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("lower(title) LIKE '%' || lower($1) || '%'");
    expect(sql).toContain("lower(title) % lower($1)");
    expect(sql).toContain("NULL::text[] AS search_values");
    expect(parameters).toEqual(["technical clerk"]);
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
    expect(query.mock.calls[1][0]).toContain(
      "LEFT JOIN project_search_documents project",
    );
    expect(query.mock.calls[1][0]).toContain(
      "'project', project.payload - 'tags' - 'jobs'",
    );
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
    expect(sql).toContain("NOT job.blocked");
    expect(sql).toContain("organization_has_expert_jobs");
    expect(sql).toContain("CROSS JOIN LATERAL jsonb_each(");
    expect(sql).toContain('AS "tagLabels"');
    expect(sql).toContain('AS "projectLabels"');
    expect(sql).toContain('AS "organizationLabels"');
    expect(sql).toContain('AS "fundingRoundLabels"');
    expect(sql).toContain('AS "classificationLabels"');
    expect(sql).toContain('AS "workModeLabels"');
    expect(sql).toContain("scoped_filter_keys AS MATERIALIZED");
    expect(sql).toContain("scoped_filter_label_maps AS MATERIALIZED");
    expect(sql).toContain("scoped_collaboration_hours AS MATERIALIZED");
    expect(sql).toContain("FROM team_collaboration_bands band");
    expect(sql).not.toContain("job_team_collaboration_hour_keys(");
    expect(sql).not.toContain("structured_job_work_location_modes(");
    expect(sql).toContain('AS "availabilityLabels"');
    expect(sql).toContain("('cities', filter_doc.filter_labels -> 'cities')");
    expect(sql).toContain('AS "cityLabels"');
    expect(sql).toContain(
      "('countries', filter_doc.filter_labels -> 'countries')",
    );
    expect(sql).toContain('AS "countryLabels"');
    expect(sql).toContain(
      "('continents', filter_doc.filter_labels -> 'continents')",
    );
    expect(sql).toContain('AS "continentLabels"');
    expect(sql).toContain(
      "('timezones', filter_doc.filter_labels -> 'timezones')",
    );
    expect(sql).toContain('AS "timezoneLabels"');
    expect(sql).toContain('AS "collaborationHours"');
    expect(sql).toContain('AS "collaborationHourLabels"');
    expect(sql).toContain("jsonb_object_agg(slug, label ORDER BY slug)");
    expect(sql).toContain("job.project_id AS job_project_id");
    expect(sql).toContain("project.project_id IN (");
    expect(sql).toContain("FROM scoped_job_documents scoped");
    expect(sql).toContain('AS "minSalaryRange"');
    expect(sql).toContain("salary_currency ILIKE '%USD%'");
    expect(sql).toContain("managed_ecosystems && $1::text[]");
    expect(sql).toContain("job.published_timestamp >= $2::bigint");
    expect(sql).toContain("job.published_timestamp < $3::bigint");
    expect(parameters).toEqual([
      ["ethereum"],
      expect.any(Number),
      expect.any(Number),
    ]);
    expect(parameters[1]).toBeLessThan(parameters[2]);
  });

  it("scopes job filter aggregates to one organization", async () => {
    await repository.getJobFilterValues(undefined, "org-1' OR true --");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("organization_id = $1");
    expect(sql).toContain("job.published_timestamp >= $2::bigint");
    expect(sql).toContain("job.published_timestamp < $3::bigint");
    expect(sql).not.toContain("org-1' OR true --");
    expect(parameters).toEqual([
      "org-1' OR true --",
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("derives all-jobs filters from the shared aggregate", async () => {
    query.mockResolvedValue([
      {
        classifications: ["engineering"],
        classificationLabels: { engineering: "ENGINEERING" },
        organizations: ["acme"],
        organizationLabels: { acme: "Acme" },
      },
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
    expect(sql).not.toContain("UNION ALL");
    expect(sql).not.toContain("entity_property_is_banned");
    expect(parameters).toEqual(["dexes", "DEXes"]);
  });

  it("unions banned graph projects into the admin grid projection only when requested", async () => {
    await repository.getProjectPayloads({ includeBanned: true });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain(
      "'banned', entity_property_is_banned(node.properties)",
    );
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("banned.label = 'Project'");
    expect(sql).toContain("entity_property_is_banned(banned.properties)");
    expect(sql).toContain("FROM project_search_documents existing");
    expect(sql).toContain("'banned', true");
    expect(parameters).toEqual([]);
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
    expect(sql).toContain(
      "COALESCE(job.detail_payload, '{}'::jsonb) || job.payload",
    );
    expect(sql).toContain("'hiringProcess', COALESCE(");
    expect(sql).toContain("employer_hiring_process.hiring_process");
    expect(sql).toContain("ownership.type = 'HAS_JOBSITE'");
    expect(sql).toContain("jobsite.label = 'Jobsite'");
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

  it("intersects authoritative team matches with Postgres organization filters", async () => {
    await repository.searchOrganizations({
      fundingStages: ["Series A"],
      teamOrganizationIds: ["org-acme", "org-beta"],
      recentlyFunded: false,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("slugify_text(current_funding_stage)");
    expect(sql).toContain("organization_id = ANY(");
    expect(sql).not.toContain("current_maintainer_count");
    expect(sql).not.toContain("growing_team");
    expect(sql).toContain("recently_funded =");
    expect(parameters).toEqual(
      expect.arrayContaining([["series-a"], ["org-acme", "org-beta"], false]),
    );
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
    expect(sql).toContain("normalized_url_host(domain)");
    expect(sql).toContain("right(");
    expect(sql).not.toContain("LIKE '%' || lower(domain)");
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
    expect(sql).toContain("normalized_url_host(domain)");
    expect(sql).toContain("right(");
    expect(sql).not.toContain("LIKE '%' || lower(domain)");
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
    expect(query.mock.calls[0][0]).toContain(
      "num_nonnulls(job.organization_id, job.project_id) = 1",
    );
    expect(query.mock.calls[0][0]).toContain("project.project_id IN (");
    expect(query.mock.calls[0][0]).toContain("job_project_id IS NOT NULL");
    expect(query.mock.calls[0][0]).toContain("filter_labels -> 'categories'");
  });
});
