import { performance } from "node:perf_hooks";
import { SearchDocumentRepository } from "./search-document.repository";
import { PostgresService } from "./postgres.service";

type JobSearchParams = Parameters<SearchDocumentRepository["searchJobs"]>[0];
type OrganizationSearchParams = Parameters<
  SearchDocumentRepository["searchOrganizations"]
>[0];
type ProjectSearchParams = Parameters<
  SearchDocumentRepository["searchProjects"]
>[0];

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("SearchDocumentRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: SearchDocumentRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-postgres-integration-test",
    });
    await postgres.onModuleInit();
    repository = new SearchDocumentRepository(postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedCoreDocuments();
  });

  it("disables PostgreSQL JIT for latency-sensitive middleware queries", async () => {
    const [settings] = await postgres.query<{ jit: string }>("SHOW jit");

    expect(settings.jit).toBe("off");
  });

  it("returns online jobs and enforces expert-job organization suppression", async () => {
    const jobs = await repository.getJobPayloads("Ethereum");
    const organizationJobs = await repository.getJobPayloads(
      "Ethereum",
      "org-acme",
    );
    const explicitPublicJobs = await repository.searchJobs({
      expertJobs: false,
      limit: 100,
    });

    expect(jobs.map(job => job.id)).toEqual([
      "job-protected",
      "job-public-beta",
    ]);
    expect(organizationJobs.map(job => job.id)).toEqual(["job-protected"]);
    expect(explicitPublicJobs.data.map(job => job.id).sort()).toEqual([
      "job-public-beta",
    ]);

    await expect(repository.getFrontendSitemapJobs()).resolves.toEqual([
      expect.objectContaining({
        shortUUID: "job-protected",
        organizationName: "Acme",
        hasProjects: true,
      }),
      expect.objectContaining({
        shortUUID: "job-public-beta",
        organizationName: "Beta",
        hasProjects: true,
      }),
    ]);

    await expect(repository.getEvSitemapOrganizations()).resolves.toEqual([
      expect.objectContaining({
        normalizedName: "acme",
        projectCount: 1,
      }),
      expect.objectContaining({
        normalizedName: "beta",
        projectCount: 1,
      }),
    ]);
    await expect(repository.getEvSitemapProjects()).resolves.toEqual([
      expect.objectContaining({
        normalizedName: "alpha",
        orgIds: ["org-acme"],
      }),
      expect.objectContaining({
        normalizedName: "beta",
        orgIds: ["org-beta"],
      }),
    ]);
  });

  it("retains legacy-invalid jobs without exposing them through list contracts", async () => {
    const [stored] = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM job_search_documents
      WHERE structured_jobpost_id = 'job-invalid-legacy'
    `);
    expect(stored.count).toBe("1");

    const listed = await repository.getJobPayloads();
    const searched = await repository.searchJobs({
      suppressPublicForExpertOrganizations: false,
    });
    const sitemap = await repository.getFrontendSitemapJobs();
    const archive = await repository.getArchiveJobPayloads(1, 100);
    const all = await repository.getAllJobPayloads();

    expect(listed.map(job => job.id)).not.toContain("job-invalid-legacy");
    expect(searched.data.map(job => job.id)).not.toContain(
      "job-invalid-legacy",
    );
    expect(sitemap.map(job => job.shortUUID)).not.toContain(
      "job-invalid-legacy",
    );
    expect(archive.data.map(job => job.id)).not.toContain("job-invalid-legacy");
    expect(all.map(job => job.id)).toContain("job-invalid-legacy");
  });

  it("filters, sorts, counts, and paginates jobs in PostgreSQL", async () => {
    const page = await repository.searchJobs({
      tags: ["Solidity"],
      minSalaryRange: 100_000,
      ecosystems: ["Ethereum"],
      orderBy: "salary",
      order: "desc",
      page: 1,
      limit: 1,
    });

    expect(page).toMatchObject({ page: 1, count: 1, total: 1 });
    expect(page.data[0].id).toBe("job-protected");
  });

  describe("job filter matrix", () => {
    const allJobIds = ["job-protected", "job-public-acme", "job-public-beta"];
    const filterCases: Array<{
      name: string;
      params: JobSearchParams;
      expected: string[];
    }> = [
      {
        name: "single tag",
        params: { tags: ["Alpha Skill"] },
        expected: ["job-protected"],
      },
      {
        name: "multiple tags use OR semantics",
        params: { tags: ["Alpha Skill", "Beta Skill"] },
        expected: ["job-protected", "job-public-beta"],
      },
      {
        name: "unknown tag",
        params: { tags: ["Missing Skill"] },
        expected: [],
      },
      {
        name: "organization",
        params: { organizations: ["Acme"] },
        expected: ["job-protected", "job-public-acme"],
      },
      {
        name: "chain",
        params: { chains: ["Ethereum"] },
        expected: ["job-protected"],
      },
      {
        name: "ecosystem",
        params: { ecosystems: ["Ethereum"] },
        expected: ["job-protected"],
      },
      {
        name: "project",
        params: { projects: ["Alpha"] },
        expected: ["job-protected"],
      },
      {
        name: "classification",
        params: { classifications: ["Engineering"] },
        expected: ["job-protected"],
      },
      {
        name: "commitment",
        params: { commitments: ["Full Time"] },
        expected: ["job-protected"],
      },
      {
        name: "funding round",
        params: { fundingRounds: ["Series A"] },
        expected: ["job-protected"],
      },
      {
        name: "investor",
        params: { investors: ["Paradigm"] },
        expected: ["job-protected"],
      },
      {
        name: "seniority",
        params: { seniority: ["Senior"] },
        expected: ["job-protected"],
      },
      {
        name: "location",
        params: { locations: ["Remote"] },
        expected: ["job-protected"],
      },
      {
        name: "minimum salary is inclusive",
        params: { minSalaryRange: 150_000 },
        expected: ["job-protected"],
      },
      {
        name: "maximum salary is exclusive",
        params: { maxSalaryRange: 120_000 },
        expected: ["job-public-beta"],
      },
      {
        name: "minimum headcount is inclusive",
        params: { minHeadCount: 120 },
        expected: ["job-protected"],
      },
      {
        name: "maximum headcount is exclusive",
        params: { maxHeadCount: 60 },
        expected: ["job-public-beta"],
      },
      {
        name: "minimum TVL is inclusive",
        params: { minTvl: 1_500_000 },
        expected: ["job-protected"],
      },
      {
        name: "maximum TVL is exclusive",
        params: { maxTvl: 1_000_000 },
        expected: ["job-public-beta"],
      },
      {
        name: "minimum monthly volume is inclusive",
        params: { minMonthlyVolume: 500_000 },
        expected: ["job-protected"],
      },
      {
        name: "maximum monthly volume is exclusive",
        params: { maxMonthlyVolume: 250_000 },
        expected: ["job-public-beta"],
      },
      {
        name: "minimum monthly fees is inclusive",
        params: { minMonthlyFees: 5_000 },
        expected: ["job-protected"],
      },
      {
        name: "maximum monthly fees is exclusive",
        params: { maxMonthlyFees: 2_000 },
        expected: ["job-public-beta"],
      },
      {
        name: "minimum monthly revenue is inclusive",
        params: { minMonthlyRevenue: 2_000 },
        expected: ["job-protected"],
      },
      {
        name: "maximum monthly revenue is exclusive",
        params: { maxMonthlyRevenue: 1_000 },
        expected: ["job-public-beta"],
      },
      {
        name: "audits true",
        params: { audits: true },
        expected: ["job-protected"],
      },
      {
        name: "audits false",
        params: { audits: false },
        expected: allJobIds,
      },
      {
        name: "hacks true",
        params: { hacks: true },
        expected: ["job-public-beta"],
      },
      {
        name: "hacks false",
        params: { hacks: false },
        expected: allJobIds,
      },
      {
        name: "token true",
        params: { token: true },
        expected: ["job-protected"],
      },
      {
        name: "token false",
        params: { token: false },
        expected: allJobIds,
      },
      {
        name: "onboard into web3 true",
        params: { onboardIntoWeb3: true },
        expected: ["job-protected"],
      },
      {
        name: "onboard into web3 false",
        params: { onboardIntoWeb3: false },
        expected: ["job-public-acme", "job-public-beta"],
      },
      {
        name: "expert jobs true",
        params: { expertJobs: true },
        expected: ["job-protected"],
      },
      {
        name: "expert jobs false",
        params: { expertJobs: false },
        expected: ["job-public-acme", "job-public-beta"],
      },
      {
        name: "ecosystem header",
        params: { ecosystemHeader: "Ethereum" },
        expected: ["job-protected"],
      },
      {
        name: "start date is inclusive",
        params: { startDate: 300 },
        expected: ["job-protected"],
      },
      {
        name: "end date is exclusive",
        params: { endDate: 290 },
        expected: ["job-public-beta"],
      },
      {
        name: "public-only access",
        params: { publicAccessOnly: true },
        expected: ["job-public-acme", "job-public-beta"],
      },
      {
        name: "published cutoff is inclusive",
        params: { publishedBeforeOrAt: 290 },
        expected: ["job-public-acme", "job-public-beta"],
      },
      {
        name: "zero minimum is omitted",
        params: { minSalaryRange: 0 },
        expected: allJobIds,
      },
      {
        name: "zero maximum is omitted",
        params: { maxSalaryRange: 0 },
        expected: allJobIds,
      },
    ];

    beforeEach(async () => {
      await configureJobFilterDocuments();
    });

    it.each(filterCases)("applies $name", async ({ params, expected }) => {
      const page = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        limit: 100,
        ...params,
      });

      expect(page.total).toBe(expected.length);
      expect(page.data.map(job => job.id).sort()).toEqual([...expected].sort());
    });

    it("uses OR within a filter and AND across different filters", async () => {
      const matching = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        tags: ["Alpha Skill", "Beta Skill"],
        chains: ["Ethereum"],
      });
      const missing = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        tags: ["Alpha Skill"],
        chains: ["Base"],
      });

      expect(matching.data.map(job => job.id)).toEqual(["job-protected"]);
      expect(missing).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("matches legacy false project-boolean activation in filter pairs", async () => {
      const common = {
        suppressPublicForExpertOrganizations: false,
        minHeadCount: 1,
        limit: 100,
      };
      const withoutAudits = await repository.searchJobs({
        ...common,
        audits: false,
      });
      const withoutHacks = await repository.searchJobs({
        ...common,
        hacks: false,
      });
      const tokenBugCompatibility = await repository.searchJobs({
        ...common,
        token: false,
      });

      expect(withoutAudits.data.map(job => job.id).sort()).toEqual([
        "job-public-acme",
        "job-public-beta",
      ]);
      expect(withoutHacks.data.map(job => job.id).sort()).toEqual([
        "job-protected",
        "job-public-acme",
      ]);
      expect(tokenBugCompatibility.data.map(job => job.id)).toEqual([
        "job-protected",
      ]);
    });

    it("treats an equal lower and upper bound as an empty half-open range", async () => {
      const page = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        minSalaryRange: 120_000,
        maxSalaryRange: 120_000,
      });

      expect(page).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("evaluates lower and upper project bounds across any owner project", async () => {
      await postgres.query(`
        UPDATE job_search_documents
        SET max_tvl = 2000000,
            min_tvl = 500000
        WHERE structured_jobpost_id = 'job-protected'
      `);

      const page = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        minTvl: 1_500_000,
        maxTvl: 1_000_000,
      });

      expect(page.data.map(job => job.id)).toEqual(["job-protected"]);
    });

    it("applies salary bounds only to USD jobs", async () => {
      await postgres.query(`
        UPDATE job_search_documents
        SET salary_currency = 'EUR'
        WHERE structured_jobpost_id = 'job-protected'
      `);

      const page = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        minSalaryRange: 150_000,
      });

      expect(page).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("matches the latest funding round rather than historical rounds", async () => {
      await postgres.query(`
        UPDATE job_search_documents
        SET funding_round_names = ARRAY['seed', 'series-a'],
            latest_funding_round_name = 'series-a'
        WHERE structured_jobpost_id = 'job-protected'
      `);

      const latest = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: true,
        fundingRounds: ["Series A"],
      });
      const historical = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: true,
        fundingRounds: ["Seed"],
      });

      expect(latest.data.map(job => job.id)).toEqual(["job-protected"]);
      expect(historical).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("supports exact, fuzzy, trimmed, and missing text searches", async () => {
      const exact = await repository.searchJobs({ query: "protocol engineer" });
      const fuzzy = await repository.searchJobs({ query: "protcol enginer" });
      const trimmed = await repository.searchJobs({
        query: "  protocol engineer  ",
      });
      const missing = await repository.searchJobs({
        query: "parity-nonexistent",
      });
      const whitespace = await repository.searchJobs({ query: "   " });

      expect(exact.data.map(job => job.id)).toContain("job-protected");
      expect(fuzzy.data.map(job => job.id)).toContain("job-protected");
      expect(trimmed.data.map(job => job.id)).toContain("job-protected");
      expect(missing.total).toBe(0);
      expect(whitespace.total).toBe(0);
    });

    it("handles offline and blocked inclusion modes", async () => {
      await postgres.query(`
        UPDATE job_search_documents
        SET blocked = true
        WHERE structured_jobpost_id = 'job-public-beta'
      `);

      const defaults = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
      });
      const blocked = await repository.searchJobs({
        blocked: true,
        includeBlocked: true,
        suppressPublicForExpertOrganizations: false,
      });
      const withOffline = await repository.searchJobs({
        includeOffline: true,
        includeBlocked: true,
        suppressPublicForExpertOrganizations: false,
        limit: 100,
      });

      expect(defaults.data.map(job => job.id)).not.toContain("job-public-beta");
      expect(blocked.data.map(job => job.id)).toEqual(["job-public-beta"]);
      expect(withOffline.data.map(job => job.id)).toContain("job-offline");
    });

    it.each([
      "publicationDate",
      "salary",
      "headcountEstimate",
      "teamSize",
      "tvl",
      "fundingDate",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
    ] as const)("sorts %s in both directions", async orderBy => {
      await makeFilterJobsPublic();
      const ascending = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        orderBy,
        order: "asc",
        limit: 100,
      });
      const descending = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        orderBy,
        order: "desc",
        limit: 100,
      });
      const rank = jobSortRank(orderBy);
      const ascendingRanks = ascending.data.map(job => rank[String(job.id)]);
      const descendingRanks = descending.data.map(job => rank[String(job.id)]);

      expect(ascendingRanks).toEqual([...ascendingRanks].sort((a, b) => a - b));
      expect(descendingRanks).toEqual(
        [...descendingRanks].sort((a, b) => b - a),
      );
    });

    it("pins an actively featured job ahead of the requested sort", async () => {
      await makeFilterJobsPublic();
      const now = Date.now();
      await postgres.query(
        `
          UPDATE job_search_documents
          SET featured = true,
              feature_start_timestamp = $1,
              feature_end_timestamp = $2
          WHERE structured_jobpost_id = 'job-public-beta'
        `,
        [now - 10_000, now + 10_000],
      );

      const page = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        orderBy: "salary",
        order: "desc",
      });

      expect(page.data[0].id).toBe("job-public-beta");
    });

    it("preserves legacy pagination edge behavior and empty-page totals", async () => {
      await makeFilterJobsPublic();
      const first = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        page: 0,
        limit: 0,
      });
      const second = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        page: 2,
        limit: 1,
      });
      const empty = await repository.searchJobs({
        suppressPublicForExpertOrganizations: false,
        expertJobs: false,
        page: 99,
        limit: 101,
      });

      expect(first).toMatchObject({ page: 0, count: 0, total: 3 });
      expect(second).toMatchObject({ page: 2, count: 1, total: 3 });
      expect(empty).toMatchObject({ page: 99, count: 0, total: 3, data: [] });
    });
  });

  it("keeps public jobs when the candidate set excludes expert jobs", async () => {
    const page = await repository.searchJobs({
      publicAccessOnly: true,
      suppressPublicForExpertOrganizations: false,
    });

    expect(page.data.map(job => job.id).sort()).toEqual([
      "job-public-acme",
      "job-public-beta",
    ]);
  });

  it("does not pin jobs with expired feature windows", async () => {
    await postgres.query(`
      UPDATE job_search_documents
      SET featured = true,
          feature_start_timestamp = 1,
          feature_end_timestamp = 2
      WHERE structured_jobpost_id = 'job-public-beta'
    `);

    const page = await repository.searchJobs({
      publicAccessOnly: true,
      suppressPublicForExpertOrganizations: false,
    });

    expect(page.data.slice(0, 2).map(job => job.id)).toEqual([
      "job-public-acme",
      "job-public-beta",
    ]);
  });

  it("uses projected full-text and trigram search", async () => {
    const fullText = await repository.searchJobs({
      query: "protocol engineer",
    });
    expect(fullText.data.map(job => job.id)).toContain("job-protected");

    const typo = await repository.searchJobs({ query: "protcol enginer" });
    expect(typo.data.map(job => job.id)).toContain("job-protected");
  });

  it("filters organizations without rebuilding graph projections", async () => {
    const page = await repository.searchOrganizations({
      locations: ["Berlin"],
      investors: ["Paradigm"],
      projects: ["Alpha"],
      hasProjects: true,
      query: "acme",
    });

    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({ orgId: "org-acme", name: "Acme" });
  });

  describe("organization filter matrix", () => {
    const allOrganizationIds = ["org-acme", "org-beta"];
    const filterCases: Array<{
      name: string;
      params: OrganizationSearchParams;
      expected: string[];
    }> = [
      {
        name: "minimum headcount is inclusive",
        params: { minHeadCount: 120 },
        expected: ["org-acme"],
      },
      {
        name: "maximum headcount is exclusive",
        params: { maxHeadCount: 120 },
        expected: ["org-beta"],
      },
      {
        name: "funding round",
        params: { fundingRounds: ["Series A"] },
        expected: ["org-acme"],
      },
      {
        name: "investor",
        params: { investors: ["Paradigm"] },
        expected: ["org-acme"],
      },
      {
        name: "location",
        params: { locations: ["Berlin"] },
        expected: ["org-acme"],
      },
      {
        name: "ecosystem",
        params: { ecosystems: ["Ethereum"] },
        expected: ["org-acme"],
      },
      {
        name: "project",
        params: { projects: ["Alpha"] },
        expected: ["org-acme"],
      },
      {
        name: "category",
        params: { categories: ["Company"] },
        expected: ["org-acme"],
      },
      { name: "tag", params: { tags: ["Solidity"] }, expected: ["org-acme"] },
      {
        name: "chain",
        params: { chains: ["Ethereum"] },
        expected: ["org-acme"],
      },
      {
        name: "canonical name",
        params: { names: ["Acme"] },
        expected: ["org-acme"],
      },
      {
        name: "alias",
        params: { names: ["Acme Labs"] },
        expected: ["org-acme"],
      },
      {
        name: "has projects true",
        params: { hasProjects: true },
        expected: ["org-acme"],
      },
      {
        name: "has projects false",
        params: { hasProjects: false },
        expected: ["org-acme", "org-beta"],
      },
      {
        name: "ecosystem header",
        params: { ecosystemHeader: "Ethereum" },
        expected: ["org-acme"],
      },
      {
        name: "unknown value",
        params: { investors: ["Missing Capital"] },
        expected: [],
      },
      {
        name: "zero minimum is omitted",
        params: { minHeadCount: 0 },
        expected: allOrganizationIds,
      },
      {
        name: "zero maximum is omitted",
        params: { maxHeadCount: 0 },
        expected: allOrganizationIds,
      },
    ];

    beforeEach(async () => {
      await configureOrganizationFilterDocuments();
    });

    it.each(filterCases)("applies $name", async ({ params, expected }) => {
      const page = await repository.searchOrganizations({
        limit: 100,
        ...params,
      });

      expect(page.total).toBe(expected.length);
      expect(page.data.map(org => org.orgId).sort()).toEqual(
        [...expected].sort(),
      );
    });

    it("uses OR within a filter and AND across different filters", async () => {
      const matching = await repository.searchOrganizations({
        investors: ["Paradigm", "Variant"],
      });
      const missing = await repository.searchOrganizations({
        locations: ["Berlin"],
        investors: ["Variant"],
      });

      expect(matching.data.map(org => org.orgId).sort()).toEqual(
        allOrganizationIds,
      );
      expect(missing).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("supports exact, fuzzy, trimmed, and missing text searches", async () => {
      const exact = await repository.searchOrganizations({ query: "Acme" });
      const fuzzy = await repository.searchOrganizations({ query: "Acm" });
      const trimmed = await repository.searchOrganizations({
        query: "  Acme  ",
      });
      const missing = await repository.searchOrganizations({
        query: "parity-nonexistent",
      });
      const whitespace = await repository.searchOrganizations({ query: "   " });

      expect(exact.data.map(org => org.orgId)).toEqual(["org-acme"]);
      expect(fuzzy.data.map(org => org.orgId)).toContain("org-acme");
      expect(trimmed.data.map(org => org.orgId)).toEqual(["org-acme"]);
      expect(missing.total).toBe(0);
      expect(whitespace.total).toBe(0);
    });

    it.each([
      "recentFundingDate",
      "recentJobDate",
      "headcountEstimate",
      "rating",
    ] as const)("sorts %s in both directions", async orderBy => {
      const ascending = await repository.searchOrganizations({
        orderBy,
        order: "asc",
        limit: 100,
      });
      const descending = await repository.searchOrganizations({
        orderBy,
        order: "desc",
        limit: 100,
      });
      const rank = organizationSortRank(orderBy);
      const ascendingRanks = ascending.data.map(org => rank[String(org.orgId)]);
      const descendingRanks = descending.data.map(
        org => rank[String(org.orgId)],
      );

      expect(ascendingRanks).toEqual([...ascendingRanks].sort((a, b) => a - b));
      expect(descendingRanks).toEqual(
        [...descendingRanks].sort((a, b) => b - a),
      );
    });

    it("preserves natural ascending name order for either order value", async () => {
      const ascending = await repository.searchOrganizations({
        orderBy: "name",
        order: "asc",
        limit: 100,
      });
      const descending = await repository.searchOrganizations({
        orderBy: "name",
        order: "desc",
        limit: 100,
      });

      expect(ascending.data.map(org => org.orgId)).toEqual([
        "org-acme",
        "org-beta",
      ]);
      expect(descending.data.map(org => org.orgId)).toEqual([
        "org-acme",
        "org-beta",
      ]);
    });

    it("defaults to descending recent funding with legacy pagination", async () => {
      const first = await repository.searchOrganizations({ page: 0, limit: 0 });
      const negative = await repository.searchOrganizations({
        page: -1,
        limit: 1,
      });
      const second = await repository.searchOrganizations({
        page: 2,
        limit: 1,
      });
      const empty = await repository.searchOrganizations({
        page: 99,
        limit: 101,
      });

      expect(first).toMatchObject({ page: 0, count: 0, total: 2, data: [] });
      expect(negative).toMatchObject({ page: -1, count: 1, total: 2 });
      expect(negative.data[0].orgId).toBe("org-acme");
      expect(second).toMatchObject({ page: 2, count: 1, total: 2 });
      expect(empty).toMatchObject({ page: 99, count: 0, total: 2, data: [] });
    });
  });

  it("filters projects by metrics and relationships", async () => {
    const page = await repository.searchProjects({
      minTvl: 1_000_000,
      maxTvl: 2_000_000,
      organizations: ["Acme"],
      categories: ["DeFi"],
      chains: ["Ethereum"],
      token: true,
    });

    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({ id: "project-alpha" });
  });

  describe("project filter matrix", () => {
    const allProjectIds = ["project-alpha", "project-beta"];
    const filterCases: Array<{
      name: string;
      params: ProjectSearchParams;
      expected: string[];
    }> = [
      {
        name: "minimum TVL is inclusive",
        params: { minTvl: 1_500_000 },
        expected: ["project-alpha"],
      },
      {
        name: "maximum TVL is exclusive",
        params: { maxTvl: 1_500_000 },
        expected: ["project-beta"],
      },
      {
        name: "minimum monthly volume is inclusive",
        params: { minMonthlyVolume: 500_000 },
        expected: ["project-alpha"],
      },
      {
        name: "maximum monthly volume is exclusive",
        params: { maxMonthlyVolume: 500_000 },
        expected: ["project-beta"],
      },
      {
        name: "minimum monthly fees is inclusive",
        params: { minMonthlyFees: 5_000 },
        expected: ["project-alpha"],
      },
      {
        name: "maximum monthly fees is exclusive",
        params: { maxMonthlyFees: 5_000 },
        expected: ["project-beta"],
      },
      {
        name: "minimum monthly revenue is inclusive",
        params: { minMonthlyRevenue: 2_000 },
        expected: ["project-alpha"],
      },
      {
        name: "maximum monthly revenue is exclusive",
        params: { maxMonthlyRevenue: 2_000 },
        expected: ["project-beta"],
      },
      {
        name: "audits true",
        params: { audits: true },
        expected: ["project-alpha"],
      },
      {
        name: "audits false",
        params: { audits: false },
        expected: ["project-beta"],
      },
      {
        name: "hacks true",
        params: { hacks: true },
        expected: ["project-beta"],
      },
      {
        name: "hacks false",
        params: { hacks: false },
        expected: ["project-alpha"],
      },
      {
        name: "token true",
        params: { token: true },
        expected: ["project-alpha"],
      },
      {
        name: "token false",
        params: { token: false },
        expected: ["project-beta"],
      },
      {
        name: "organization",
        params: { organizations: ["Acme"] },
        expected: ["project-alpha"],
      },
      {
        name: "investor",
        params: { investors: ["Paradigm"] },
        expected: ["project-alpha"],
      },
      {
        name: "chain",
        params: { chains: ["Ethereum"] },
        expected: ["project-alpha"],
      },
      {
        name: "category",
        params: { categories: ["DeFi"] },
        expected: ["project-alpha"],
      },
      {
        name: "ecosystem",
        params: { ecosystems: ["Ethereum"] },
        expected: ["project-alpha"],
      },
      {
        name: "tag",
        params: { tags: ["Solidity"] },
        expected: ["project-alpha"],
      },
      {
        name: "canonical name",
        params: { names: ["Alpha"] },
        expected: ["project-alpha"],
      },
      {
        name: "alias",
        params: { names: ["Alpha Protocol"] },
        expected: ["project-alpha"],
      },
      {
        name: "ecosystem header",
        params: { ecosystemHeader: "Ethereum" },
        expected: ["project-alpha"],
      },
      {
        name: "unknown value",
        params: { categories: ["Missing"] },
        expected: [],
      },
      {
        name: "zero minimum is omitted",
        params: { minTvl: 0 },
        expected: allProjectIds,
      },
      {
        name: "zero maximum is omitted",
        params: { maxTvl: 0 },
        expected: allProjectIds,
      },
    ];

    beforeEach(async () => {
      await configureProjectFilterDocuments();
    });

    it.each(filterCases)("applies $name", async ({ params, expected }) => {
      const page = await repository.searchProjects({ limit: 100, ...params });

      expect(page.total).toBe(expected.length);
      expect(page.data.map(project => project.id).sort()).toEqual(
        [...expected].sort(),
      );
    });

    it.each([
      {
        name: "audit alias true",
        params: { hasAudits: true },
        expected: ["project-alpha"],
      },
      {
        name: "audit alias false is omitted",
        params: { hasAudits: false },
        expected: allProjectIds,
      },
      {
        name: "hack alias true",
        params: { hasHacks: true },
        expected: ["project-beta"],
      },
      {
        name: "hack alias false is omitted",
        params: { hasHacks: false },
        expected: allProjectIds,
      },
      {
        name: "token alias uses non-null compatibility flag",
        params: { hasToken: true },
        expected: allProjectIds,
      },
      {
        name: "token alias false is omitted",
        params: { hasToken: false },
        expected: allProjectIds,
      },
    ])("applies legacy project-search $name", async ({ params, expected }) => {
      const page = await repository.searchProjects({ limit: 100, ...params });

      expect(page.data.map(project => project.id).sort()).toEqual(
        [...expected].sort(),
      );
    });

    it("uses OR within a filter and AND across different filters", async () => {
      const matching = await repository.searchProjects({
        investors: ["Paradigm", "Variant"],
      });
      const missing = await repository.searchProjects({
        organizations: ["Acme"],
        investors: ["Variant"],
      });

      expect(matching.data.map(project => project.id).sort()).toEqual(
        allProjectIds,
      );
      expect(missing).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("treats an equal lower and upper bound as an empty half-open range", async () => {
      const page = await repository.searchProjects({
        minTvl: 500_000,
        maxTvl: 500_000,
      });

      expect(page).toMatchObject({ count: 0, total: 0, data: [] });
    });

    it("supports exact, fuzzy, trimmed, and missing text searches", async () => {
      const exact = await repository.searchProjects({ query: "Alpha" });
      const fuzzy = await repository.searchProjects({ query: "Alpa" });
      const trimmed = await repository.searchProjects({ query: "  Alpha  " });
      const missing = await repository.searchProjects({
        query: "parity-nonexistent",
      });
      const whitespace = await repository.searchProjects({ query: "   " });

      expect(exact.data.map(project => project.id)).toEqual(["project-alpha"]);
      expect(fuzzy.data.map(project => project.id)).toContain("project-alpha");
      expect(trimmed.data.map(project => project.id)).toEqual([
        "project-alpha",
      ]);
      expect(missing.total).toBe(0);
      expect(whitespace.total).toBe(0);
    });

    it.each([
      "tvl",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
    ] as const)("sorts %s in both directions", async orderBy => {
      const ascending = await repository.searchProjects({
        orderBy,
        order: "asc",
        limit: 100,
      });
      const descending = await repository.searchProjects({
        orderBy,
        order: "desc",
        limit: 100,
      });
      const rank = projectSortRank(orderBy);
      const ascendingRanks = ascending.data.map(
        project => rank[String(project.id)],
      );
      const descendingRanks = descending.data.map(
        project => rank[String(project.id)],
      );

      expect(ascendingRanks).toEqual([...ascendingRanks].sort((a, b) => a - b));
      expect(descendingRanks).toEqual(
        [...descendingRanks].sort((a, b) => b - a),
      );
    });

    it("defaults to ascending name with legacy pagination", async () => {
      const first = await repository.searchProjects({ page: 0, limit: 0 });
      const negative = await repository.searchProjects({ page: -1, limit: 1 });
      const second = await repository.searchProjects({ page: 2, limit: 1 });
      const empty = await repository.searchProjects({ page: 99, limit: 101 });

      expect(first).toMatchObject({ page: 0, count: 0, total: 2, data: [] });
      expect(negative).toMatchObject({ page: -1, count: 1, total: 2 });
      expect(negative.data[0].id).toBe("project-alpha");
      expect(second).toMatchObject({ page: 2, count: 1, total: 2 });
      expect(empty).toMatchObject({ page: 99, count: 0, total: 2, data: [] });
    });

    it("uses numeric, case-insensitive natural name ordering", async () => {
      await postgres.query(`
        UPDATE project_search_documents
        SET name = CASE project_id
              WHEN 'project-alpha' THEN 'BabySwap'
              WHEN 'project-beta' THEN 'B.Protocol'
            END,
            payload = jsonb_set(
              payload,
              '{name}',
              to_jsonb(CASE project_id
                WHEN 'project-alpha' THEN 'BabySwap'
                WHEN 'project-beta' THEN 'B.Protocol'
              END)
            )
        WHERE project_id IN ('project-alpha', 'project-beta')
      `);

      const page = await repository.searchProjects({ limit: 100 });

      expect(page.data.map(project => project.id)).toEqual([
        "project-beta",
        "project-alpha",
      ]);
    });
  });

  it("returns projected organization and project details by stable keys", async () => {
    await expect(
      repository.getOrganizationById("org-acme"),
    ).resolves.toMatchObject({ name: "Acme" });
    await expect(
      repository.getOrganizationBySlug("acme"),
    ).resolves.toMatchObject({ orgId: "org-acme" });
    await expect(
      repository.getProjectById("project-alpha"),
    ).resolves.toMatchObject({ name: "Alpha" });
    await expect(repository.getProjectBySlug("alpha")).resolves.toMatchObject({
      id: "project-alpha",
    });
    await expect(
      repository.getJobByShortUuid("job-protected", {
        ecosystem: "Ethereum",
      }),
    ).resolves.toMatchObject({
      id: "job-protected",
      online: true,
      blocked: false,
      organization: { orgId: "org-acme" },
    });
  });

  it("exposes the careers-page hiring process on organization jobsites", async () => {
    const jobsiteNodeId = await createNode("Jobsite", "jobsite-acme");
    await postgres.query(
      `
        UPDATE graph_nodes
        SET properties = properties || jsonb_build_object(
          'url', 'https://acme.example/jobs',
          'type', 'custom',
          'hiringProcess', 'Screen, technical interview, offer'
        )
        WHERE id = $1
      `,
      [jobsiteNodeId],
    );
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key
        )
        SELECT organization_node_id, $1, 'HAS_JOBSITE', ''
        FROM organization_search_documents
        WHERE organization_id = 'org-acme'
      `,
      [jobsiteNodeId],
    );

    const [organization] =
      await repository.getOrganizationsWithLinks("org-acme");

    expect(organization.jobsites).toEqual([
      expect.objectContaining({
        id: "jobsite-acme",
        hiringProcess: "Screen, technical interview, offer",
      }),
    ]);
  });

  it("aggregates display labels and numeric filter bounds", async () => {
    const jobs = await repository.getJobFilterValues("ethereum");
    expect(jobs).toMatchObject({
      minSalaryRange: 90_000,
      maxSalaryRange: 150_000,
    });
    expect(jobs.tags).toEqual(
      expect.arrayContaining(["Solidity", "TypeScript"]),
    );

    const organizations = await repository.getOrganizationFilterValues();
    expect(organizations.investors).toEqual(
      expect.arrayContaining(["Paradigm", "Variant"]),
    );
    expect(organizations.categories).toEqual(
      expect.arrayContaining(["Company", "Protocol"]),
    );

    const projects = await repository.getProjectFilterValues();
    expect(projects.categories).toEqual(
      expect.arrayContaining(["DeFi", "Infrastructure"]),
    );
  });

  it("uses the GIN tag index and remains fast with 20,000 job documents", async () => {
    await seedPerformanceJobs(20_000);
    await postgres.query("ANALYZE job_search_documents");

    const startedAt = performance.now();
    const page = await repository.searchJobs({
      tags: ["Rare Skill"],
      ecosystems: ["Ethereum"],
      orderBy: "publicationDate",
      limit: 20,
    });
    const elapsedMs = performance.now() - startedAt;

    const [plan] = await postgres.query<{ "QUERY PLAN": unknown }>(
      `
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT count(*)
        FROM job_search_documents
        WHERE online
          AND NOT blocked
          AND tags && ARRAY['rare-skill']::text[]
      `,
    );
    const serializedPlan = JSON.stringify(plan["QUERY PLAN"]);

    expect(page.total).toBe(200);
    expect(page.count).toBe(20);
    expect(serializedPlan).toContain("job_search_tags_gin_idx");
    expect(elapsedMs).toBeLessThan(1_000);
  }, 30_000);

  async function resetDatabase(): Promise<void> {
    await postgres.query(`TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE`);
  }

  async function createNode(label: string, key: string): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          $1::text,
          ARRAY[$1::text],
          $2::text,
          jsonb_build_object('id', $2::text)
        )
        RETURNING id
      `,
      [label, key],
    );
    return row.id;
  }

  async function seedCoreDocuments(): Promise<void> {
    const acmeNodeId = await createNode("Organization", "org-acme");
    const betaNodeId = await createNode("Organization", "org-beta");
    const alphaNodeId = await createNode("Project", "project-alpha");
    const betaProjectNodeId = await createNode("Project", "project-beta");

    await postgres.query(
      `
        INSERT INTO organization_search_documents (
          organization_node_id, organization_id, slug, name, normalized_name,
          location, headcount_estimate, ecosystems, managed_ecosystems,
          project_ids, project_names, categories,
          chains, investors, funding_rounds, tags, recent_funding_timestamp,
          recent_job_timestamp, aggregate_rating, has_projects, search_text,
          search_vector, search_values, names, filter_labels, payload
        ) VALUES
        (
          $1, 'org-acme', 'acme', 'Acme', 'acme', 'berlin', 120,
          ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['project-alpha'], ARRAY['alpha'], ARRAY['company'],
          ARRAY['ethereum'], ARRAY['paradigm'], ARRAY['series-a'],
          ARRAY['solidity'], 200, 300, 4.5, true, 'Acme Berlin Alpha',
          to_tsvector('simple', 'Acme Berlin Alpha'), ARRAY['Acme', 'Acme Labs'],
          ARRAY['acme', 'acme-labs'],
          '{"investors":{"paradigm":"Paradigm"},"fundingRounds":{"series-a":"Series A"},"ecosystems":{"ethereum":"Ethereum"},"categories":{"company":"Company"},"locations":{"berlin":"Berlin"}}',
          '{"orgId":"org-acme","name":"Acme","category":"Company","projects":[],"investors":[],"fundingRounds":[],"ecosystems":["Ethereum"],"aliases":[],"tags":[],"location":"Berlin"}'
        ),
        (
          $2, 'org-beta', 'beta', 'Beta', 'beta', 'lisbon', 20,
          ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['project-beta'], ARRAY['beta'], ARRAY['protocol'],
          ARRAY['base'], ARRAY['variant'], ARRAY['seed'],
          ARRAY['typescript'], 100, 250, 4.0, true, 'Beta Lisbon',
          to_tsvector('simple', 'Beta Lisbon'), ARRAY['Beta', 'Beta Systems'], ARRAY['beta'],
          '{"investors":{"variant":"Variant"},"fundingRounds":{"seed":"Seed"},"ecosystems":{"ethereum":"Ethereum"},"categories":{"protocol":"Protocol"},"locations":{"lisbon":"Lisbon"}}',
          '{"orgId":"org-beta","name":"Beta","category":"Protocol","projects":[],"investors":[],"fundingRounds":[],"ecosystems":["Ethereum"],"aliases":[],"tags":[],"location":"Lisbon"}'
        )
      `,
      [acmeNodeId, betaNodeId],
    );

    await postgres.query(
      `
        INSERT INTO project_search_documents (
          project_node_id, project_id, slug, name, normalized_name,
          organization_ids, organization_names, ecosystems, managed_ecosystems,
          categories, chains,
          investors, tags, has_hacks, has_audits, has_token,
          token_address_not_explicit_null, tvl,
          monthly_volume, monthly_active_users, monthly_fees, monthly_revenue,
          search_text, search_vector, search_values, names, filter_labels, payload
        ) VALUES
        (
          $1, 'project-alpha', 'alpha', 'Alpha', 'alpha', ARRAY['org-acme'],
          ARRAY['acme'], ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['defi'], ARRAY['ethereum'],
          ARRAY['paradigm'], ARRAY['solidity'], false, true, true, true, 1500000,
          500000, 1000, 5000, 2000, 'Alpha DeFi',
          to_tsvector('simple', 'Alpha DeFi'), ARRAY['Alpha', 'Alpha Protocol'], ARRAY['alpha'],
          '{"organizations":{"acme":"Acme"},"chains":{"ethereum":"Ethereum"},"ecosystems":{"ethereum":"Ethereum"},"categories":{"defi":"DeFi"},"investors":{"paradigm":"Paradigm"}}',
          '{"id":"project-alpha","name":"Alpha","audits":[],"hacks":[],"chains":[],"jobs":[],"investors":[],"aliases":[],"orgNames":["Acme"],"ecosystems":["Ethereum"],"category":"DeFi","tvl":1500000,"monthlyVolume":500000,"monthlyFees":5000,"monthlyRevenue":2000}'
        ),
        (
          $2, 'project-beta', 'beta', 'Beta', 'beta', ARRAY['org-beta'],
          ARRAY['beta'], ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['infrastructure'], ARRAY['base'],
          ARRAY['variant'], ARRAY['typescript'], true, false, false, true, 500000,
          100000, 500, 1000, 500, 'Beta Infrastructure',
          to_tsvector('simple', 'Beta Infrastructure'), ARRAY['Beta', 'Beta Network'], ARRAY['beta'],
          '{"organizations":{"beta":"Beta"},"chains":{"base":"Base"},"ecosystems":{"ethereum":"Ethereum"},"categories":{"infrastructure":"Infrastructure"},"investors":{"variant":"Variant"}}',
          '{"id":"project-beta","name":"Beta","audits":[],"hacks":[],"chains":[],"jobs":[],"investors":[],"aliases":[],"orgNames":["Beta"],"ecosystems":["Ethereum"],"category":"Infrastructure","tvl":500000,"monthlyVolume":100000,"monthlyFees":1000,"monthlyRevenue":500}'
        )
      `,
      [alphaNodeId, betaProjectNodeId],
    );

    await insertJob({
      id: "job-protected",
      title: "Protocol Engineer",
      access: "protected",
      organizationId: "org-acme",
      organizationName: "acme",
      organizationHasExpertJobs: true,
      salary: 150_000,
      publishedTimestamp: 300,
      tags: ["solidity"],
      projectNames: ["alpha"],
    });
    await insertJob({
      id: "job-public-acme",
      title: "Frontend Engineer",
      access: "public",
      organizationId: "org-acme",
      organizationName: "acme",
      organizationHasExpertJobs: true,
      salary: 120_000,
      publishedTimestamp: 290,
      tags: ["typescript"],
      projectNames: ["alpha"],
    });
    await insertJob({
      id: "job-public-beta",
      title: "TypeScript Engineer",
      access: "public",
      organizationId: "org-beta",
      organizationName: "beta",
      organizationHasExpertJobs: false,
      salary: 90_000,
      publishedTimestamp: 280,
      tags: ["solidity", "typescript"],
      projectNames: ["beta"],
    });
    await insertJob({
      id: "job-offline",
      title: "Offline Engineer",
      access: "public",
      organizationId: "org-beta",
      organizationName: "beta",
      organizationHasExpertJobs: false,
      salary: 80_000,
      publishedTimestamp: 400,
      tags: ["solidity"],
      projectNames: ["beta"],
      online: false,
    });
    await insertJob({
      id: "job-tagless",
      title: "Unclassified Engineer",
      access: "public",
      organizationId: "org-beta",
      organizationName: "beta",
      organizationHasExpertJobs: false,
      salary: 70_000,
      publishedTimestamp: 270,
      tags: [],
      projectNames: ["beta"],
    });
    await insertJob({
      id: "job-invalid-legacy",
      title: "Preserved Invalid Legacy Job",
      access: "public",
      organizationId: "org-beta",
      organizationName: "beta",
      organizationHasExpertJobs: false,
      legacyListEligible: false,
      salary: 75_000,
      publishedTimestamp: 500,
      tags: ["solidity"],
      projectNames: ["beta"],
    });
  }

  async function insertJob(input: {
    id: string;
    title: string;
    access: "public" | "protected";
    organizationId: string;
    organizationName: string;
    organizationHasExpertJobs: boolean;
    legacyListEligible?: boolean;
    salary: number;
    publishedTimestamp: number;
    tags: string[];
    projectNames: string[];
    online?: boolean;
  }): Promise<void> {
    const nodeId = await createNode("StructuredJobpost", input.id);
    const searchText = `${input.title} ${input.organizationName}`;
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          organization_name, title, access, salary, salary_currency, online,
          blocked, featured, organization_has_expert_jobs, published_timestamp,
          legacy_list_eligible,
          tags, project_names, investor_names, funding_round_names, chain_names,
          classifications, commitments, location_types, ecosystems, seniority,
          managed_ecosystems,
          headcount_estimate, max_tvl, max_monthly_volume, max_monthly_fees,
          max_monthly_revenue, min_tvl, min_monthly_volume, min_monthly_fees,
          min_monthly_revenue, has_token, has_audits, has_hacks,
          onboard_into_web3, search_text, search_values, search_vector,
          filter_labels, payload
        ) VALUES (
          $1, $2, $2, $3, $4, $5, $6, $7, 'USD', $8, false, false, $9, $10,
          $11, $12, $13, ARRAY['paradigm'], ARRAY['series-a'], ARRAY['ethereum'],
          ARRAY['engineering'], ARRAY['fulltime'], ARRAY['remote'],
          ARRAY['ethereum'], 'senior', ARRAY['ethereum'], 120, 1500000, 500000, 5000, 2000,
          1500000, 500000, 5000, 2000, true, true, false, true,
          $14::text, $15::text[], to_tsvector('simple', $14::text),
          '{"tags":{"solidity":"Solidity","typescript":"TypeScript"},"projects":{"alpha":"Alpha","beta":"Beta"},"organizations":{"acme":"Acme","beta":"Beta"},"investors":{"paradigm":"Paradigm"},"fundingRounds":{"series-a":"Series A"},"chains":{"ethereum":"Ethereum"},"ecosystems":{"ethereum":"Ethereum"},"classifications":{"engineering":"Engineering"},"commitments":{"fulltime":"Full Time"},"locations":{"remote":"Remote"}}',
          jsonb_build_object(
            'id', $2::text,
            'shortUUID', $2::text,
            'title', $5::text,
            'access', $6::text,
            'salary', $7::numeric,
            'salaryCurrency', 'USD',
            'timestamp', $10::bigint,
            'organization', jsonb_build_object(
              'orgId', $3::text,
              'name', $4::text
            ),
            'tags', '[]'::jsonb)
        )
      `,
      [
        nodeId,
        input.id,
        input.organizationId,
        input.organizationName,
        input.title,
        input.access,
        input.salary,
        input.online ?? true,
        input.organizationHasExpertJobs,
        input.publishedTimestamp,
        input.legacyListEligible ?? true,
        input.tags,
        input.projectNames,
        searchText,
        [input.title, input.organizationName],
      ],
    );
    await postgres.query(
      `
        INSERT INTO job_search_owners (
          job_node_id, organization_node_id, organization_id
        )
        SELECT $1, organization_node_id, organization_id
        FROM organization_search_documents
        WHERE organization_id = $2
      `,
      [nodeId, input.organizationId],
    );
  }

  async function configureOrganizationFilterDocuments(): Promise<void> {
    await postgres.query(`
      UPDATE organization_search_documents
      SET ecosystems = CASE organization_id
            WHEN 'org-acme' THEN ARRAY['ethereum']
            WHEN 'org-beta' THEN ARRAY['solana']
            ELSE ecosystems
          END,
          managed_ecosystems = CASE organization_id
            WHEN 'org-acme' THEN ARRAY['ethereum']
            WHEN 'org-beta' THEN ARRAY['solana']
            ELSE managed_ecosystems
          END,
          names = CASE organization_id
            WHEN 'org-acme' THEN ARRAY['acme', 'acme-labs']
            WHEN 'org-beta' THEN ARRAY['beta', 'beta-systems']
            ELSE names
          END,
          has_projects = organization_id = 'org-acme'
      WHERE organization_id IN ('org-acme', 'org-beta')
    `);
  }

  function organizationSortRank(
    orderBy: NonNullable<OrganizationSearchParams["orderBy"]>,
  ): Record<string, number> {
    const values: Record<
      NonNullable<OrganizationSearchParams["orderBy"]>,
      Record<string, number>
    > = {
      recentFundingDate: { "org-acme": 200, "org-beta": 100 },
      recentJobDate: { "org-acme": 300, "org-beta": 250 },
      headcountEstimate: { "org-acme": 120, "org-beta": 20 },
      rating: { "org-acme": 4.5, "org-beta": 4 },
      name: { "org-acme": 1, "org-beta": 2 },
    };
    return values[orderBy];
  }

  async function configureProjectFilterDocuments(): Promise<void> {
    await postgres.query(`
      UPDATE project_search_documents
      SET ecosystems = CASE project_id
            WHEN 'project-alpha' THEN ARRAY['ethereum']
            WHEN 'project-beta' THEN ARRAY['solana']
            ELSE ecosystems
          END,
          managed_ecosystems = CASE project_id
            WHEN 'project-alpha' THEN ARRAY['ethereum']
            WHEN 'project-beta' THEN ARRAY['solana']
            ELSE managed_ecosystems
          END,
          names = CASE project_id
            WHEN 'project-alpha' THEN ARRAY['alpha', 'alpha-protocol']
            WHEN 'project-beta' THEN ARRAY['beta', 'beta-network']
            ELSE names
          END,
          chains = CASE project_id
            WHEN 'project-alpha' THEN ARRAY['ethereum', 'arbitrum', 'optimism']
            WHEN 'project-beta' THEN ARRAY['base']
            ELSE chains
          END,
          audit_count = CASE project_id
            WHEN 'project-alpha' THEN 2
            ELSE 0
          END,
          hack_count = CASE project_id
            WHEN 'project-beta' THEN 3
            ELSE 0
          END,
          chain_count = CASE project_id
            WHEN 'project-alpha' THEN 3
            WHEN 'project-beta' THEN 1
            ELSE chain_count
          END
      WHERE project_id IN ('project-alpha', 'project-beta')
    `);
  }

  function projectSortRank(
    orderBy: NonNullable<ProjectSearchParams["orderBy"]>,
  ): Record<string, number> {
    const values: Record<
      NonNullable<ProjectSearchParams["orderBy"]>,
      Record<string, number>
    > = {
      tvl: { "project-alpha": 1500000, "project-beta": 500000 },
      monthlyVolume: { "project-alpha": 500000, "project-beta": 100000 },
      monthlyFees: { "project-alpha": 5000, "project-beta": 1000 },
      monthlyRevenue: { "project-alpha": 2000, "project-beta": 500 },
      audits: { "project-alpha": 1, "project-beta": 0 },
      hacks: { "project-alpha": 0, "project-beta": 1 },
      chains: { "project-alpha": 3, "project-beta": 1 },
    };
    return values[orderBy];
  }

  async function configureJobFilterDocuments(): Promise<void> {
    await postgres.query(`
      UPDATE job_search_documents
      SET salary = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 150000
            WHEN 'job-public-acme' THEN 120000
            WHEN 'job-public-beta' THEN 90000
            ELSE salary
          END,
          published_timestamp = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 300
            WHEN 'job-public-acme' THEN 290
            WHEN 'job-public-beta' THEN 280
            ELSE published_timestamp
          END,
          latest_funding_timestamp = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 300
            WHEN 'job-public-acme' THEN 200
            WHEN 'job-public-beta' THEN 100
            ELSE latest_funding_timestamp
          END,
          latest_funding_round_name = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 'series-a'
            WHEN 'job-public-acme' THEN 'series-b'
            WHEN 'job-public-beta' THEN 'seed'
            ELSE latest_funding_round_name
          END,
          headcount_estimate = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 120
            WHEN 'job-public-acme' THEN 60
            WHEN 'job-public-beta' THEN 20
            ELSE headcount_estimate
          END,
          max_tvl = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 1500000
            WHEN 'job-public-acme' THEN 1000000
            WHEN 'job-public-beta' THEN 500000
            ELSE max_tvl
          END,
          max_monthly_volume = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 500000
            WHEN 'job-public-acme' THEN 250000
            WHEN 'job-public-beta' THEN 100000
            ELSE max_monthly_volume
          END,
          max_monthly_fees = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 5000
            WHEN 'job-public-acme' THEN 2000
            WHEN 'job-public-beta' THEN 1000
            ELSE max_monthly_fees
          END,
          max_monthly_revenue = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 2000
            WHEN 'job-public-acme' THEN 1000
            WHEN 'job-public-beta' THEN 500
            ELSE max_monthly_revenue
          END,
          min_tvl = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 1500000
            WHEN 'job-public-acme' THEN 1000000
            WHEN 'job-public-beta' THEN 500000
            ELSE min_tvl
          END,
          min_monthly_volume = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 500000
            WHEN 'job-public-acme' THEN 250000
            WHEN 'job-public-beta' THEN 100000
            ELSE min_monthly_volume
          END,
          min_monthly_fees = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 5000
            WHEN 'job-public-acme' THEN 2000
            WHEN 'job-public-beta' THEN 1000
            ELSE min_monthly_fees
          END,
          min_monthly_revenue = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 2000
            WHEN 'job-public-acme' THEN 1000
            WHEN 'job-public-beta' THEN 500
            ELSE min_monthly_revenue
          END,
          sort_project_tvl = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 1500000
            WHEN 'job-public-acme' THEN 1000000
            WHEN 'job-public-beta' THEN 500000
            ELSE sort_project_tvl
          END,
          sort_project_monthly_volume = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 500000
            WHEN 'job-public-acme' THEN 250000
            WHEN 'job-public-beta' THEN 100000
            ELSE sort_project_monthly_volume
          END,
          sort_project_monthly_fees = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 5000
            WHEN 'job-public-acme' THEN 2000
            WHEN 'job-public-beta' THEN 1000
            ELSE sort_project_monthly_fees
          END,
          sort_project_monthly_revenue = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 2000
            WHEN 'job-public-acme' THEN 1000
            WHEN 'job-public-beta' THEN 500
            ELSE sort_project_monthly_revenue
          END,
          sort_project_audit_count = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 3
            ELSE 0
          END,
          sort_project_hack_count = CASE structured_jobpost_id
            WHEN 'job-public-beta' THEN 2
            ELSE 0
          END,
          sort_project_chain_count = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 3
            WHEN 'job-public-acme' THEN 2
            WHEN 'job-public-beta' THEN 1
            ELSE sort_project_chain_count
          END,
          tags = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['alpha-skill']
            WHEN 'job-public-acme' THEN ARRAY['middle-skill']
            WHEN 'job-public-beta' THEN ARRAY['beta-skill']
            ELSE tags
          END,
          project_names = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['alpha']
            WHEN 'job-public-acme' THEN ARRAY['middle']
            WHEN 'job-public-beta' THEN ARRAY['beta']
            ELSE project_names
          END,
          investor_names = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['paradigm']
            WHEN 'job-public-acme' THEN ARRAY['middle-capital']
            WHEN 'job-public-beta' THEN ARRAY['variant']
            ELSE investor_names
          END,
          funding_round_names = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['series-a']
            WHEN 'job-public-acme' THEN ARRAY['series-b']
            WHEN 'job-public-beta' THEN ARRAY['seed']
            ELSE funding_round_names
          END,
          chain_names = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['ethereum', 'arbitrum', 'optimism']
            WHEN 'job-public-acme' THEN ARRAY['polygon', 'avalanche']
            WHEN 'job-public-beta' THEN ARRAY['base']
            ELSE chain_names
          END,
          classifications = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['engineering']
            WHEN 'job-public-acme' THEN ARRAY['design']
            WHEN 'job-public-beta' THEN ARRAY['marketing']
            ELSE classifications
          END,
          commitments = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['fulltime']
            WHEN 'job-public-acme' THEN ARRAY['parttime']
            WHEN 'job-public-beta' THEN ARRAY['contract']
            ELSE commitments
          END,
          location_types = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['remote']
            WHEN 'job-public-acme' THEN ARRAY['hybrid']
            WHEN 'job-public-beta' THEN ARRAY['onsite']
            ELSE location_types
          END,
          ecosystems = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['ethereum']
            WHEN 'job-public-acme' THEN ARRAY['polygon']
            WHEN 'job-public-beta' THEN ARRAY['solana']
            ELSE ecosystems
          END,
          managed_ecosystems = CASE structured_jobpost_id
            WHEN 'job-protected' THEN ARRAY['ethereum']
            WHEN 'job-public-acme' THEN ARRAY['polygon']
            WHEN 'job-public-beta' THEN ARRAY['solana']
            ELSE managed_ecosystems
          END,
          seniority = CASE structured_jobpost_id
            WHEN 'job-protected' THEN 'senior'
            WHEN 'job-public-acme' THEN 'mid'
            WHEN 'job-public-beta' THEN 'junior'
            ELSE seniority
          END,
          has_audits = structured_jobpost_id = 'job-protected',
          has_hacks = structured_jobpost_id = 'job-public-beta',
          has_token = structured_jobpost_id = 'job-protected',
          onboard_into_web3 = structured_jobpost_id = 'job-protected'
      WHERE structured_jobpost_id IN (
        'job-protected', 'job-public-acme', 'job-public-beta'
      )
    `);
  }

  async function makeFilterJobsPublic(): Promise<void> {
    await postgres.query(`
      UPDATE job_search_documents
      SET access = 'public',
          organization_has_expert_jobs = false,
          payload = jsonb_set(payload, '{access}', '"public"'::jsonb)
      WHERE structured_jobpost_id IN (
        'job-protected', 'job-public-acme', 'job-public-beta'
      )
    `);
  }

  function jobSortRank(
    orderBy: NonNullable<JobSearchParams["orderBy"]>,
  ): Record<string, number> {
    const values: Record<
      NonNullable<JobSearchParams["orderBy"]>,
      Record<string, number>
    > = {
      publicationDate: {
        "job-protected": 300,
        "job-public-acme": 290,
        "job-public-beta": 280,
      },
      salary: {
        "job-protected": 150000,
        "job-public-acme": 120000,
        "job-public-beta": 90000,
      },
      headcountEstimate: {
        "job-protected": 120,
        "job-public-acme": 60,
        "job-public-beta": 20,
      },
      teamSize: {
        "job-protected": 300,
        "job-public-acme": 290,
        "job-public-beta": 280,
      },
      tvl: {
        "job-protected": 1500000,
        "job-public-acme": 1000000,
        "job-public-beta": 500000,
      },
      fundingDate: {
        "job-protected": 300,
        "job-public-acme": 200,
        "job-public-beta": 100,
      },
      monthlyVolume: {
        "job-protected": 500000,
        "job-public-acme": 250000,
        "job-public-beta": 100000,
      },
      monthlyFees: {
        "job-protected": 5000,
        "job-public-acme": 2000,
        "job-public-beta": 1000,
      },
      monthlyRevenue: {
        "job-protected": 2000,
        "job-public-acme": 1000,
        "job-public-beta": 500,
      },
      audits: {
        "job-protected": 1,
        "job-public-acme": 0,
        "job-public-beta": 0,
      },
      hacks: {
        "job-protected": 0,
        "job-public-acme": 0,
        "job-public-beta": 1,
      },
      chains: {
        "job-protected": 3,
        "job-public-acme": 2,
        "job-public-beta": 1,
      },
    };
    return values[orderBy];
  }

  async function seedPerformanceJobs(count: number): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        SELECT
          'StructuredJobpost', ARRAY['StructuredJobpost']::text[],
          'perf-' || value, jsonb_build_object('id', 'perf-' || value)
        FROM generate_series(1, $1::integer) value
      `,
      [count],
    );
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          organization_name, title, access, salary, salary_currency, online,
          blocked, featured, organization_has_expert_jobs, published_timestamp,
          tags, project_names, investor_names, funding_round_names, chain_names,
          classifications, commitments, location_types, ecosystems, seniority,
          headcount_estimate, max_tvl, max_monthly_volume, max_monthly_fees,
          max_monthly_revenue, min_tvl, min_monthly_volume, min_monthly_fees,
          min_monthly_revenue, search_text, search_values, search_vector,
          filter_labels, payload
        )
        SELECT
          n.id, n.node_key, n.node_key, 'perf-org', 'performance-org',
          'Performance Engineer ' || n.node_key, 'public', 100000, 'USD', true,
          false, false, false, 1000000 + n.id,
          CASE WHEN n.id % 100 = 0 THEN ARRAY['rare-skill'] ELSE ARRAY['common-skill'] END,
          ARRAY['performance-project'], ARRAY['performance-investor'],
          ARRAY['seed'], ARRAY['ethereum'], ARRAY['engineering'],
          ARRAY['fulltime'], ARRAY['remote'], ARRAY['ethereum'], 'senior',
          100, 1000000, 100000, 1000, 500,
          1000000, 100000, 1000, 500,
          'Performance Engineer ' || n.node_key,
          ARRAY['Performance Engineer ' || n.node_key],
          to_tsvector('simple', 'Performance Engineer ' || n.node_key),
          '{}'::jsonb,
          jsonb_build_object('id', n.node_key, 'title', 'Performance Engineer')
        FROM graph_nodes n
        WHERE n.node_key LIKE 'perf-%'
      `,
    );
  }
});
