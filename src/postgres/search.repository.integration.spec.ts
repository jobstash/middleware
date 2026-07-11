import { PostgresService } from "./postgres.service";
import { SearchRepository } from "./search.repository";
import { SearchService } from "src/search/search.service";
import { SearchPillarParams } from "src/search/dto/search-pillar.input";
import { SearchPillarItemParams } from "src/search/dto/search-pillar-items.input";
import { SearchPillarFiltersParams } from "src/search/dto/search-pillar-filters-params.input";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("SearchRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: SearchRepository;
  let service: SearchService;
  let now: number;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-search-integration-test",
    });
    await postgres.onModuleInit();
    repository = new SearchRepository(postgres);
    service = new SearchService(repository);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    now = Date.now();
    await seedProjectionData();
  });

  it("searches projection and grant navigation facets", async () => {
    await expect(
      repository.getNavigationFacets("projects", "type"),
    ).resolves.toEqual(
      expect.arrayContaining([{ pillar: "tags", label: "TypeScript" }]),
    );
    await expect(
      repository.getNavigationFacets("organizations"),
    ).resolves.toEqual(
      expect.arrayContaining([
        { pillar: "names", label: "Acme" },
        { pillar: "investors", label: "Sequoia" },
      ]),
    );
    await expect(repository.getNavigationFacets("vcs", "seq")).resolves.toEqual(
      [{ pillar: "names", label: "Sequoia" }],
    );
    await expect(
      repository.getNavigationFacets("grants", "grant"),
    ).resolves.toEqual(
      expect.arrayContaining([{ pillar: "names", label: "Test Grant" }]),
    );
    await expect(repository.getNavigationFacets("impact")).resolves.toEqual([]);
  });

  it("builds compact pillar configs from each projection", async () => {
    const [job] = await repository.getPillarConfigs("jobs", "ethereum");
    expect(job).toMatchObject({
      tags: ["TypeScript"],
      locations: ["Amsterdam"],
      organizations: ["Acme"],
      seniority: ["senior"],
    });
    const [project] = await repository.getPillarConfigs("projects");
    expect(project).toMatchObject({
      names: ["Acme Protocol"],
      categories: ["DeFi"],
      audits: true,
      token: true,
    });
    const [organization] = await repository.getPillarConfigs("organizations");
    expect(organization).toMatchObject({
      names: ["Acme"],
      projects: ["Acme Protocol"],
      hasProjects: true,
      hasJobs: true,
    });
    const [grant] = await repository.getPillarConfigs("grants");
    expect(grant).toMatchObject({
      names: ["Test Grant"],
      categories: ["Infrastructure"],
      programBudget: 100000,
    });
  });

  it("reads stored pillar copy and organization summaries", async () => {
    await expect(
      repository.getStoredPillarText("projects", "categories"),
    ).resolves.toEqual({
      title: "Project Categories",
      description: "Projects grouped by category",
    });
    await expect(
      repository.getStoredPillarText("projects", "categories", "defi"),
    ).resolves.toEqual({
      title: "DeFi Projects",
      description: "Projects in decentralized finance",
    });
    await expect(
      repository.getOrganizationPillar("acme"),
    ).resolves.toMatchObject({
      name: "Acme",
      normalizedName: "acme",
      projects: [{ name: "Acme Protocol" }],
    });
  });

  it("filters recent pillar jobs entirely in PostgreSQL", async () => {
    const base = {
      startDate: now - 86_400_000,
      endDate: now + 86_400_000,
    };
    await expect(
      repository.getPillarJobs({
        ...base,
        pillarType: "tags",
        value: "typescript",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "job-id",
        organization: expect.objectContaining({ name: "Acme" }),
      }),
    ]);
    await expect(
      repository.getPillarJobs({
        ...base,
        pillarType: "locations",
        value: "amsterdam",
        ecosystem: "Ethereum",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      repository.getPillarJobs({
        ...base,
        pillarType: "booleans",
        value: "expertJobs",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      repository.getPillarJobs({
        ...base,
        pillarType: "tags",
        value: "rust",
      }),
    ).resolves.toEqual([]);
  });

  it("aggregates job pillar sitemap entries with counts and timestamps", async () => {
    const entries = await repository.getJobPillarSitemap();
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tags",
          key: "typescript",
          jobCount: 1,
          lastModified: now,
        }),
        expect.objectContaining({
          type: "booleans",
          key: "expertJobs",
        }),
        expect.objectContaining({
          type: "organizations",
          key: "acme",
        }),
      ]),
    );
  });

  it("serves grouped and skill suggestions from recent job facets", async () => {
    const startDate = now - 86_400_000;
    const endDate = now + 86_400_000;
    await expect(
      repository.getSuggestionGroups("type", startDate, endDate),
    ).resolves.toEqual(expect.arrayContaining(["jobs", "tags"]));
    await expect(
      repository.getSuggestionItems({
        group: "jobs",
        query: "type",
        startDate,
        endDate,
        offset: 0,
        limit: 2,
      }),
    ).resolves.toEqual([
      {
        id: "job-short",
        label: "TypeScript Engineer at Acme",
        href: "/typescript-engineer/job-short",
      },
    ]);
    await expect(
      repository.getSuggestionItems({
        group: "tags",
        query: "type",
        startDate,
        endDate,
        offset: 0,
        limit: 2,
      }),
    ).resolves.toEqual([
      {
        id: "typescript",
        label: "TypeScript",
        href: "/t-typescript",
      },
    ]);
    await expect(
      repository.getSkillSuggestions({
        query: "type",
        startDate,
        endDate,
        offset: 0,
        limit: 2,
      }),
    ).resolves.toEqual([
      {
        id: "tag-id",
        name: "TypeScript",
        normalizedName: "typescript",
      },
    ]);
  });

  it("returns sitemap jobs without epoch-zero dates", async () => {
    await expect(repository.getSitemapJobs()).resolves.toEqual([
      {
        shortUUID: "job-short",
        title: "TypeScript Engineer",
        organizationName: "Acme",
        timestamp: now,
      },
    ]);
  });

  it("has the projection indexes used by search paths", async () => {
    const names = [
      "job_search_text_trgm_idx",
      "job_search_tags_gin_idx",
      "job_search_investor_names_gin_idx",
      "job_search_filter_labels_gin_idx",
      "organization_search_filter_labels_gin_idx",
      "project_search_filter_labels_gin_idx",
    ];
    const rows = await postgres.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [names],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(names.sort());
  });

  it("serves navigation search and applies exclusions", async () => {
    await expect(
      service.search({ nav: "projects", query: "type" }),
    ).resolves.toMatchObject({
      projects: {
        tags: [
          {
            value: "TypeScript",
            link: "/projects/tags/typescript",
          },
        ],
      },
    });
    await expect(
      service.search({
        nav: "projects",
        query: "type",
        excluded: ["typescript"],
      }),
    ).resolves.toMatchObject({ projects: { tags: [] } });
    await expect(
      service.search({ nav: "grants", query: "grant" }),
    ).resolves.toMatchObject({
      grants: {
        names: [{ value: "Test Grant", link: "/grants/names/test-grant" }],
      },
    });
  });

  it("builds active and alternate pillars with filtered items", async () => {
    const result = await service.searchPillar(
      Object.assign(new SearchPillarParams(), {
        nav: "jobs",
        pillar: "tags",
        item: "typescript",
      }),
      "ethereum",
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        title: "Typescript Jobs - Web3 & Crypto Careers",
        activePillar: {
          slug: "tags",
          items: ["TypeScript"],
        },
      },
    });
    await expect(
      service.searchPillarItems(
        Object.assign(new SearchPillarItemParams(), {
          nav: "jobs",
          pillar: "tags",
          query: "type",
          page: 1,
          limit: 10,
        }),
        undefined,
      ),
    ).resolves.toMatchObject({ count: 1, total: 1, data: ["TypeScript"] });
  });

  it("produces pillar slugs, labels, and stored copy", async () => {
    await expect(
      service.searchPillarSlugs("projects", undefined),
    ).resolves.toEqual(
      expect.arrayContaining(["c-defi", "p-acme-protocol", "t-typescript"]),
    );
    await expect(service.searchJobPillarSlugs()).resolves.toEqual(
      expect.arrayContaining([
        "t-typescript",
        "o-acme",
        "b-expertJobs",
        "b-onboardIntoWeb3",
      ]),
    );
    await expect(
      service.fetchPillarItemLabels({
        nav: "projects",
        pillars: ["categories", "tags"],
        slugs: ["defi", "typescript"],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.arrayContaining([
        { slug: "defi", label: "DeFi" },
        { slug: "typescript", label: "TypeScript" },
      ]),
    });
    await expect(
      service.searchPillarDetailsBySlug("projects", "c-defi"),
    ).resolves.toMatchObject({
      data: { title: "DeFi Projects" },
    });
  });

  it("returns typed range, select, and order filter configurations", async () => {
    const response = await service.searchPillarFilters(
      Object.assign(new SearchPillarFiltersParams(), { nav: "projects" }),
      undefined,
    );
    expect(response.success).toBe(true);
    if (!("data" in response) || !response.data) {
      throw new Error("missing filter data");
    }
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "TVL",
          min: { value: 1000, paramKey: "minTvl" },
          max: { value: 1000, paramKey: "maxTvl" },
        }),
        expect.objectContaining({
          label: "Audits",
          options: expect.any(Array),
        }),
        expect.objectContaining({ label: "Order", options: expect.any(Array) }),
      ]),
    );
  });

  it("returns static pillar pages with normalized jobs and organization copy", async () => {
    const tagPage = await service.getPillarPageData("t-typescript", "ethereum");
    expect(tagPage).toMatchObject({
      success: true,
      data: {
        jobs: [
          expect.objectContaining({
            id: "job-id",
            seniority: "Senior",
            access: "protected",
            organization: expect.objectContaining({ name: "Acme" }),
          }),
        ],
      },
    });
    await expect(service.getPillarPageData("o-acme")).resolves.toMatchObject({
      success: true,
      data: {
        organization: expect.objectContaining({
          name: "Acme",
          headcountEstimate: 25,
        }),
      },
    });
  });

  it("serves grouped job and skill suggestions", async () => {
    await expect(
      service.getJobSuggestions({
        q: "type",
        group: "tags",
        page: 1,
        limit: 5,
      }),
    ).resolves.toMatchObject({
      activeGroup: "tags",
      groups: expect.arrayContaining([{ id: "tags", label: "Tags" }]),
      items: [{ id: "typescript", label: "TypeScript" }],
      hasMore: false,
    });
    await expect(
      service.getSkillSuggestions({ q: "type", page: 1, limit: 5 }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        items: [
          {
            id: "tag-id",
            name: "TypeScript",
            normalizedName: "typescript",
          },
        ],
        hasMore: false,
      },
    });
  });

  it("serves job and pillar sitemap payloads", async () => {
    await expect(service.getSitemapJobs()).resolves.toMatchObject({
      success: true,
      data: [
        {
          shortUUID: "job-short",
          title: "TypeScript Engineer",
          organizationName: "Acme",
          timestamp: now,
        },
      ],
    });
    await expect(service.searchPillarSitemapSlugs()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "t-typescript",
          jobCount: 1,
        }),
      ]),
    );
  });

  async function seedProjectionData(): Promise<void> {
    const organizationNodeId = await createNode("Organization", "org:acme", {
      id: "org-node-id",
      orgId: "acme-org-id",
      name: "Acme",
      normalizedName: "acme",
    });
    const projectNodeId = await createNode("Project", "project:acme", {
      id: "project-id",
      name: "Acme Protocol",
      normalizedName: "acme-protocol",
    });
    const jobNodeId = await createNode("StructuredJobpost", "job:test", {
      id: "job-id",
      shortUUID: "job-short",
      title: "TypeScript Engineer",
    });
    await createNode("Tag", "tag:typescript", {
      id: "tag-id",
      name: "TypeScript",
      normalizedName: "typescript",
      createdTimestamp: now,
    });

    const organizationPayload = {
      id: "org-node-id",
      orgId: "acme-org-id",
      name: "Acme",
      normalizedName: "acme",
      summary: "Builds protocol infrastructure",
      description: "Acme description",
      logoUrl: "https://example.com/logo.png",
      location: "Amsterdam",
      headcountEstimate: 25,
      website: "https://acme.example",
      aliases: [],
      projects: [{ id: "project-id", name: "Acme Protocol" }],
      fundingRounds: [
        {
          id: "round-id",
          date: 1_700_000_000,
          roundName: "Seed",
          raisedAmount: 5,
        },
      ],
      investors: [
        { id: "investor-id", name: "Sequoia", normalizedName: "sequoia" },
      ],
    };
    await postgres.query(
      `
        INSERT INTO organization_search_documents (
          organization_node_id, organization_id, slug, name, normalized_name,
          location, headcount_estimate, ecosystems, project_ids, project_names,
          chains, investors, funding_rounds, tags, recent_job_timestamp,
          has_projects, names, filter_labels, payload, detail_payload
        ) VALUES (
          $1, 'acme-org-id', 'acme', 'Acme', 'acme', 'Amsterdam', 25,
          ARRAY['ethereum'], ARRAY['project-id'], ARRAY['acme-protocol'],
          ARRAY['ethereum'], ARRAY['sequoia'], ARRAY['seed'],
          ARRAY['typescript'], $2, true, ARRAY['acme'], $3::jsonb,
          $4::jsonb, $4::jsonb
        )
      `,
      [
        organizationNodeId,
        now,
        JSON.stringify({
          names: { acme: "Acme" },
          locations: { amsterdam: "Amsterdam" },
          investors: { sequoia: "Sequoia" },
          fundingRounds: { seed: "Seed" },
          chains: { ethereum: "Ethereum" },
          tags: { typescript: "TypeScript" },
          projects: { "acme-protocol": "Acme Protocol" },
          ecosystems: { ethereum: "Ethereum" },
        }),
        JSON.stringify(organizationPayload),
      ],
    );
    await postgres.query(
      `
        INSERT INTO project_search_documents (
          project_node_id, project_id, slug, name, normalized_name,
          organization_ids, organization_names, ecosystems, categories,
          chains, investors, tags, has_hacks, has_audits, has_token, tvl,
          monthly_volume, monthly_fees, monthly_revenue, names, filter_labels,
          payload, detail_payload
        ) VALUES (
          $1, 'project-id', 'acme-protocol', 'Acme Protocol', 'acme-protocol',
          ARRAY['acme-org-id'], ARRAY['acme'], ARRAY['ethereum'], ARRAY['defi'],
          ARRAY['ethereum'], ARRAY['sequoia'], ARRAY['typescript'], false, true,
          true, 1000, 2000, 30, 20, ARRAY['acme-protocol'], $2::jsonb,
          $3::jsonb, $3::jsonb
        )
      `,
      [
        projectNodeId,
        JSON.stringify({
          names: { "acme-protocol": "Acme Protocol" },
          organizations: { acme: "Acme" },
          ecosystems: { ethereum: "Ethereum" },
          categories: { defi: "DeFi" },
          chains: { ethereum: "Ethereum" },
          investors: { sequoia: "Sequoia" },
          tags: { typescript: "TypeScript" },
        }),
        JSON.stringify({
          id: "project-id",
          name: "Acme Protocol",
          normalizedName: "acme-protocol",
        }),
      ],
    );
    const jobPayload = {
      id: "job-id",
      shortUUID: "job-short",
      title: "TypeScript Engineer",
      url: "https://acme.example/jobs/1",
      timestamp: now,
      seniority: "3",
      location: "Amsterdam",
      locationType: "REMOTE",
      commitment: "FULL_TIME",
      classification: "ENGINEERING",
      access: "protected",
      featured: true,
      onboardIntoWeb3: true,
      tags: [
        { id: "tag-id", name: "TypeScript", normalizedName: "typescript" },
      ],
    };
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, organization_name, location, access, online, blocked, featured,
          published_timestamp, seniority, onboard_into_web3, tags,
          classifications, commitments, location_types, ecosystems,
          managed_ecosystems,
          investor_names, funding_round_names, filter_labels, payload,
          detail_payload
        ) VALUES (
          $1, 'job-id', 'job-short', 'acme-org-id', 'TypeScript Engineer',
          'Acme', 'Amsterdam', 'protected', true, false, true, $2, '3', true,
          ARRAY['typescript'], ARRAY['engineering'], ARRAY['full-time'],
          ARRAY['remote'], ARRAY['ethereum'], ARRAY['ethereum'],
          ARRAY['sequoia'], ARRAY['seed'],
          $3::jsonb, $4::jsonb, $4::jsonb
        )
      `,
      [
        jobNodeId,
        now,
        JSON.stringify({
          tags: { typescript: "TypeScript" },
          locations: { amsterdam: "Amsterdam" },
          commitments: { "full-time": "FULL_TIME" },
          locationTypes: { remote: "REMOTE" },
          classifications: { engineering: "ENGINEERING" },
          organizations: { acme: "Acme" },
          investors: { sequoia: "Sequoia" },
          fundingRounds: { seed: "Seed" },
        }),
        JSON.stringify(jobPayload),
      ],
    );

    await createNode("Pillar", "pillar:projects:categories", {
      nav: "projects",
      pillar: "categories",
      title: "Project Categories",
      description: "Projects grouped by category",
    });
    await createNode("PillarItem", "pillar-item:projects:categories:defi", {
      nav: "projects",
      pillar: "categories",
      item: "defi",
      title: "DeFi Projects",
      description: "Projects in decentralized finance",
    });
    await seedGrant();
  }

  async function seedGrant(): Promise<void> {
    const program = await createNode("KarmaGapProgram", "grant:program", {
      id: "grant-id",
      name: "Test Grant",
    });
    const metadata = await createNode(
      "KarmaGapProgramMetadata",
      "grant:metadata",
      { startsAt: now, programBudget: 100000 },
    );
    const status = await createNode("KarmaGapStatus", "grant:status", {
      name: "Active",
    });
    const category = await createNode("KarmaGapCategory", "grant:category", {
      name: "Infrastructure",
    });
    const network = await createNode("KarmaGapNetwork", "grant:network", {
      name: "Ethereum",
    });
    const ecosystem = await createNode("KarmaGapEcosystem", "grant:ecosystem", {
      name: "Ethereum",
    });
    const organization = await createNode(
      "KarmaGapOrganization",
      "grant:organization",
      { name: "Acme Foundation" },
    );
    await createRelationship(program, metadata, "HAS_METADATA");
    await createRelationship(program, status, "HAS_STATUS");
    await createRelationship(metadata, category, "HAS_CATEGORY");
    await createRelationship(metadata, network, "HAS_NETWORK");
    await createRelationship(metadata, ecosystem, "HAS_ECOSYSTEM");
    await createRelationship(metadata, organization, "HAS_ORGANIZATION");
  }

  async function createNode(
    label: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS id
      `,
      [label, key, JSON.stringify(properties)],
    );
    return row.id;
  }

  async function createRelationship(
    sourceId: string,
    targetId: string,
    type: string,
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', '{}'::jsonb)
      `,
      [sourceId, targetId, type],
    );
  }
});
