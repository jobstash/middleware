import { performance } from "node:perf_hooks";
import { SearchDocumentRepository } from "./search-document.repository";
import { PostgresService } from "./postgres.service";

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

    expect(jobs.map(job => job.id)).toEqual([
      "job-protected",
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
          project_ids, project_names,
          chains, investors, funding_rounds, tags, recent_funding_timestamp,
          recent_job_timestamp, aggregate_rating, has_projects, search_text,
          search_vector, names, filter_labels, payload
        ) VALUES
        (
          $1, 'org-acme', 'acme', 'Acme', 'acme', 'berlin', 120,
          ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['project-alpha'], ARRAY['alpha'],
          ARRAY['ethereum'], ARRAY['paradigm'], ARRAY['series-a'],
          ARRAY['solidity'], 200, 300, 4.5, true, 'Acme Berlin Alpha',
          to_tsvector('simple', 'Acme Berlin Alpha'), ARRAY['acme', 'acme-labs'],
          '{"investors":{"paradigm":"Paradigm"},"fundingRounds":{"series-a":"Series A"},"ecosystems":{"ethereum":"Ethereum"},"locations":{"berlin":"Berlin"}}',
          '{"orgId":"org-acme","name":"Acme","projects":[],"investors":[],"fundingRounds":[],"ecosystems":["Ethereum"],"aliases":[],"tags":[],"location":"Berlin"}'
        ),
        (
          $2, 'org-beta', 'beta', 'Beta', 'beta', 'lisbon', 20,
          ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['project-beta'], ARRAY['beta'],
          ARRAY['base'], ARRAY['variant'], ARRAY['seed'],
          ARRAY['typescript'], 100, 250, 4.0, true, 'Beta Lisbon',
          to_tsvector('simple', 'Beta Lisbon'), ARRAY['beta'],
          '{"investors":{"variant":"Variant"},"fundingRounds":{"seed":"Seed"},"ecosystems":{"ethereum":"Ethereum"},"locations":{"lisbon":"Lisbon"}}',
          '{"orgId":"org-beta","name":"Beta","projects":[],"investors":[],"fundingRounds":[],"ecosystems":["Ethereum"],"aliases":[],"tags":[],"location":"Lisbon"}'
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
          investors, tags, has_hacks, has_audits, has_token, tvl,
          monthly_volume, monthly_active_users, monthly_fees, monthly_revenue,
          search_text, search_vector, names, filter_labels, payload
        ) VALUES
        (
          $1, 'project-alpha', 'alpha', 'Alpha', 'alpha', ARRAY['org-acme'],
          ARRAY['acme'], ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['defi'], ARRAY['ethereum'],
          ARRAY['paradigm'], ARRAY['solidity'], false, true, true, 1500000,
          500000, 1000, 5000, 2000, 'Alpha DeFi',
          to_tsvector('simple', 'Alpha DeFi'), ARRAY['alpha'],
          '{"organizations":{"acme":"Acme"},"chains":{"ethereum":"Ethereum"},"ecosystems":{"ethereum":"Ethereum"},"categories":{"defi":"DeFi"},"investors":{"paradigm":"Paradigm"}}',
          '{"id":"project-alpha","name":"Alpha","audits":[],"hacks":[],"chains":[],"jobs":[],"investors":[],"aliases":[],"orgNames":["Acme"],"ecosystems":["Ethereum"],"category":"DeFi","tvl":1500000,"monthlyVolume":500000,"monthlyFees":5000,"monthlyRevenue":2000}'
        ),
        (
          $2, 'project-beta', 'beta', 'Beta', 'beta', ARRAY['org-beta'],
          ARRAY['beta'], ARRAY['ethereum'], ARRAY['ethereum'], ARRAY['infrastructure'], ARRAY['base'],
          ARRAY['variant'], ARRAY['typescript'], true, false, false, 500000,
          100000, 500, 1000, 500, 'Beta Infrastructure',
          to_tsvector('simple', 'Beta Infrastructure'), ARRAY['beta'],
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
          max_monthly_revenue, has_token, has_audits, has_hacks,
          onboard_into_web3, search_text, search_vector, filter_labels, payload
        ) VALUES (
          $1, $2, $2, $3, $4, $5, $6, $7, 'USD', $8, false, false, $9, $10,
          $11, $12, $13, ARRAY['paradigm'], ARRAY['series-a'], ARRAY['ethereum'],
          ARRAY['engineering'], ARRAY['full-time'], ARRAY['remote'],
          ARRAY['ethereum'], 'senior', ARRAY['ethereum'], 120, 1500000, 500000, 5000, 2000,
          true, true, false, true, $14::text, to_tsvector('simple', $14::text),
          '{"tags":{"solidity":"Solidity","typescript":"TypeScript"},"projects":{"alpha":"Alpha","beta":"Beta"},"organizations":{"acme":"Acme","beta":"Beta"},"investors":{"paradigm":"Paradigm"},"fundingRounds":{"series-a":"Series A"},"chains":{"ethereum":"Ethereum"},"ecosystems":{"ethereum":"Ethereum"},"classifications":{"engineering":"Engineering"},"commitments":{"full-time":"Full Time"},"locations":{"remote":"Remote"}}',
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
          max_monthly_revenue, search_text, search_vector, filter_labels, payload
        )
        SELECT
          n.id, n.node_key, n.node_key, 'perf-org', 'performance-org',
          'Performance Engineer ' || n.node_key, 'public', 100000, 'USD', true,
          false, false, false, 1000000 + n.id,
          CASE WHEN n.id % 100 = 0 THEN ARRAY['rare-skill'] ELSE ARRAY['common-skill'] END,
          ARRAY['performance-project'], ARRAY['performance-investor'],
          ARRAY['seed'], ARRAY['ethereum'], ARRAY['engineering'],
          ARRAY['full-time'], ARRAY['remote'], ARRAY['ethereum'], 'senior',
          100, 1000000, 100000, 1000, 500,
          'Performance Engineer ' || n.node_key,
          to_tsvector('simple', 'Performance Engineer ' || n.node_key),
          '{}'::jsonb,
          jsonb_build_object('id', n.node_key, 'title', 'Performance Engineer')
        FROM graph_nodes n
        WHERE n.node_key LIKE 'perf-%'
      `,
    );
  }
});
