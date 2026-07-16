import { GrantsService } from "src/grants/grants.service";
import { GoogleBigQueryService } from "src/google-bigquery/google-bigquery.service";
import { GraphRepository } from "./graph.repository";
import { GrantRepository } from "./grant.repository";
import { PostgresService } from "./postgres.service";

jest.mock("src/google-bigquery/google-bigquery.service", () => ({
  GoogleBigQueryService: class GoogleBigQueryService {},
}));

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("GrantRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let graph: GraphRepository;
  let repository: GrantRepository;
  let service: GrantsService;
  let bigQuery: {
    getGrantProjectsCodeMetrics: jest.Mock;
    getGrantProjectsOnchainMetrics: jest.Mock;
    getGrantProjectsContractMetrics: jest.Mock;
  };
  let chunkNodeId: string;
  let now: number;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-grant-integration-test",
    });
    await postgres.onModuleInit();
    graph = new GraphRepository(postgres);
    repository = new GrantRepository(postgres);
    bigQuery = {
      getGrantProjectsCodeMetrics: jest.fn(),
      getGrantProjectsOnchainMetrics: jest.fn(),
      getGrantProjectsContractMetrics: jest.fn(),
    };
    service = new GrantsService(
      repository,
      bigQuery as unknown as GoogleBigQueryService,
    );
    (
      service as unknown as {
        embeddings: { embedQuery: (query: string) => Promise<number[]> };
      }
    ).embeddings = { embedQuery: jest.fn().mockResolvedValue(vector(0)) };
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    bigQuery.getGrantProjectsCodeMetrics.mockReset().mockResolvedValue([]);
    bigQuery.getGrantProjectsOnchainMetrics.mockReset().mockResolvedValue([]);
    bigQuery.getGrantProjectsContractMetrics.mockReset().mockResolvedValue([]);
    now = Date.now();
    await seedGrantGraph();
  });

  it("hydrates programs with all nested grant metadata", async () => {
    await expect(repository.getPrograms()).resolves.toEqual([
      expect.objectContaining({
        programId: "program-1",
        name: "Open Builders",
        slug: "open-builders",
        status: "Active",
        eligibility: expect.objectContaining({
          requirements: ["Ship open source software"],
        }),
        socialLinks: expect.objectContaining({
          website: "https://grants.example",
        }),
        quadraticFundingConfig: expect.objectContaining({ matchingCap: true }),
        support: expect.objectContaining({ type: "email" }),
        metadata: expect.objectContaining({
          categories: ["Infrastructure"],
          ecosystems: ["Ethereum"],
          organizations: ["Open Foundation"],
          networks: [],
          grantTypes: ["Direct"],
          tags: ["Open Source"],
          platformsUsed: ["Karma Gap"],
        }),
      }),
    ]);
    await expect(repository.getPrograms("open-builders")).resolves.toHaveLength(
      1,
    );
    await expect(repository.getPrograms("missing")).resolves.toEqual([]);
  });

  it("hydrates grantees with grant and VC funding", async () => {
    await expect(repository.getGrantees("open-builders")).resolves.toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Useful Project",
        normalizedName: "useful-project",
        website: "https://project.example",
        grantFundingData: [
          expect.objectContaining({
            id: "grant-funding-1",
            amount: 50000,
            programName: "Open Builders",
          }),
        ],
        vcFundingData: [
          expect.objectContaining({
            id: "funding-round-1",
            raisedAmount: 100000,
          }),
        ],
      }),
    ]);
    await expect(
      repository.getGrantees("open-builders", "useful-project"),
    ).resolves.toHaveLength(1);
    await expect(
      repository.getGrantees("open-builders", "missing"),
    ).resolves.toEqual([]);
  });

  it("does not expose permanently banned grantees", async () => {
    await postgres.query(
      `SELECT set_entity_banned('Project', 'project-1', true, $1, $2)`,
      ["manual review", "integration-test"],
    );

    await expect(repository.getGrantees("open-builders")).resolves.toEqual([]);
    await expect(
      repository.getGrantees("open-builders", "useful-project"),
    ).resolves.toEqual([]);
  });

  it("uses pgvector cosine search for grant chunks", async () => {
    const otherProgram = await graph.createNode("KarmaGapProgram", {
      programId: "program-2",
      name: "Other Program",
      slug: "other-program",
    });
    const otherChunk = await graph.createNode("GrantSiteChunk", {
      id: "chunk-2",
      programId: "program-2",
      text: "Unrelated grants text",
    });
    await graph.upsertRelationship({
      sourceNodeId: otherProgram.nodeId,
      targetNodeId: otherChunk.nodeId,
      type: "HAS_CHUNK",
    });
    const first = vector(0);
    const second = vector(1);
    await postgres.query(
      `
        INSERT INTO grant_chunk_embeddings (
          chunk_node_id, program_id, embedding
        ) VALUES
          ($1, 'program-1', $2::halfvec(1536)),
          ($3, 'program-2', $4::halfvec(1536))
      `,
      [chunkNodeId, literal(first), otherChunk.nodeId, literal(second)],
    );
    await expect(repository.searchProgramIds(first, 1)).resolves.toEqual([
      "program-1",
    ]);
  });

  it("has grant lookup and vector indexes", async () => {
    const names = [
      "graph_nodes_karmagap_program_slug_idx",
      "graph_nodes_project_normalized_name_idx",
      "grant_chunk_embeddings_program_idx",
      "grant_chunk_embeddings_hnsw_cosine_idx",
    ];
    const rows = await postgres.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [names],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(names.sort());
  });

  it("serves grant programs and grantees through GrantsService", async () => {
    await expect(service.getGrantsListResults("active")).resolves.toEqual([
      expect.objectContaining({
        programId: "program-1",
        status: "Active",
      }),
    ]);
    await expect(
      service.getGrantBySlug("open-builders"),
    ).resolves.toMatchObject({
      id: "program-1",
      name: "Open Builders",
      metadata: expect.objectContaining({
        categories: ["Infrastructure"],
      }),
    });
    await expect(service.getGranteesBySlug("open-builders")).resolves.toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Useful Project",
        fundingEvents: expect.arrayContaining([
          expect.objectContaining({ eventType: "grant", amountInUsd: 50000 }),
          expect.objectContaining({ eventType: "round", amountInUsd: 100000 }),
        ]),
      }),
    ]);
    await expect(service.getGrantsList(1, 10, "active")).resolves.toMatchObject(
      {
        total: 1,
        data: [expect.objectContaining({ id: "program-1" })],
      },
    );
  });

  it("combines PostgreSQL grantees with BigQuery metrics", async () => {
    bigQuery.getGrantProjectsCodeMetrics.mockResolvedValueOnce([
      {
        project_name: "useful-project",
        contributors: 4,
        contributors_6_months: 2,
        new_contributors_6_months: 1,
        stars: 50,
        repositories: 2,
      },
    ]);
    await expect(
      service.getGranteeDetailsBySlugs("open-builders", "useful-project"),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        id: "project-1",
        projects: [
          expect.objectContaining({
            name: "Useful Project",
            tabs: expect.any(Array),
          }),
        ],
      }),
    });
  });

  it("runs semantic grant search through PostgreSQL vectors", async () => {
    await postgres.query(
      `
        INSERT INTO grant_chunk_embeddings (
          chunk_node_id, program_id, embedding
        ) VALUES ($1, 'program-1', $2::halfvec(1536))
      `,
      [chunkNodeId, literal(vector(0))],
    );
    await expect(
      service.query("public infrastructure", 1, 10),
    ).resolves.toMatchObject({
      total: 1,
      data: [expect.objectContaining({ id: "program-1" })],
    });
  });

  async function seedGrantGraph(): Promise<void> {
    const program = await graph.createNode("KarmaGapProgram", {
      programId: "program-1",
      profileId: "profile-1",
      chainID: 1,
      name: "Open Builders",
      slug: "open-builders",
      isValid: true,
      createdAtBlock: 1,
      createdByAddress: "0xCreator",
      txHash: "0xTransaction",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    const status = await graph.createNode("KarmaGapStatus", {
      id: "status-active",
      name: "Active",
    });
    const eligibility = await graph.createNode("KarmaGapEligibility", {
      programId: "program-1",
      description: "Open source teams are eligible",
    });
    const requirement = await graph.createNode("KarmaGapRequirement", {
      id: "requirement-1",
      description: "Ship open source software",
    });
    const socials = await graph.createNode("KarmaGapSocials", {
      programId: "program-1",
      twitter: "openbuilders",
      website: "https://grants.example",
      discord: null,
      orgWebsite: null,
      blog: null,
      forum: null,
      grantsSite: "https://grants.example/apply",
    });
    const config = await graph.createNode("KarmaGapQuadraticFundingConfig", {
      programId: "program-1",
      matchingCap: true,
      matchingFundsAvailable: 100000,
    });
    const support = await graph.createNode("KarmaGapSupport", {
      programId: "program-1",
      type: "email",
      info: "support@example.com",
    });
    const metadata = await graph.createNode("KarmaGapProgramMetadata", {
      programId: "program-1",
      title: "Open Builders 2026",
      description: "Funding public infrastructure",
      programBudget: 500000,
      amountDistributedToDate: 100000,
      minGrantSize: 10000,
      maxGrantSize: 100000,
      grantsToDate: 5,
      website: "https://grants.example",
      projectTwitter: null,
      bugBounty: null,
      logoImg: null,
      bannerImg: null,
      createdAt: now,
      startsAt: now,
      type: "direct",
      amount: "500000 USD",
    });
    await relate(program.nodeId, status.nodeId, "HAS_STATUS");
    await relate(program.nodeId, eligibility.nodeId, "HAS_ELIGIBILITY");
    await relate(eligibility.nodeId, requirement.nodeId, "HAS_REQUIREMENT");
    await relate(program.nodeId, socials.nodeId, "HAS_SOCIAL_LINKS");
    await relate(program.nodeId, config.nodeId, "HAS_QUADRATIC_FUNDING_CONFIG");
    await relate(program.nodeId, support.nodeId, "HAS_SUPPORT");
    await relate(program.nodeId, metadata.nodeId, "HAS_METADATA");

    for (const [label, id, name, type] of [
      ["KarmaGapCategory", "category-1", "Infrastructure", "HAS_CATEGORY"],
      ["KarmaGapEcosystem", "ecosystem-1", "Ethereum", "HAS_ECOSYSTEM"],
      [
        "KarmaGapOrganization",
        "grant-organization-1",
        "Open Foundation",
        "HAS_ORGANIZATION",
      ],
      ["KarmaGapNetwork", "network-1", "Mainnet", "HAS_NETWORK"],
      ["KarmaGapGrantType", "grant-type-1", "Direct", "HAS_GRANT_TYPE"],
      ["KarmaGapTag", "tag-1", "Open Source", "HAS_TAG"],
      ["KarmaGapPlatformUsed", "platform-1", "Karma Gap", "HAS_PLATFORM_USED"],
    ]) {
      const node = await graph.createNode(label, { id, name });
      await relate(metadata.nodeId, node.nodeId, type);
    }

    const project = await graph.createNode("Project", {
      id: "project-1",
      name: "Useful Project",
      normalizedName: "useful-project",
      description: "A useful open source project",
      logoUrl: "https://project.example/logo.png",
    });
    const website = await graph.createNode("Website", {
      id: "project-website",
      url: "https://project.example",
    });
    const grantFunding = await graph.createNode("GrantFunding", {
      id: "grant-funding-1",
      tokenAmount: null,
      tokenUnit: null,
      fundingDate: now,
      amount: 50000,
      createdTimestamp: now,
      updatedTimestamp: null,
    });
    const organization = await graph.createNode("Organization", {
      id: "organization-1",
      orgId: "organization-1",
      name: "Useful Organization",
    });
    const fundingRound = await graph.createNode("FundingRound", {
      id: "funding-round-1",
      date: now,
      createdTimestamp: now,
      roundName: "Seed",
      sourceLink: null,
      raisedAmount: 100000,
      updatedTimestamp: null,
    });
    await relate(project.nodeId, website.nodeId, "HAS_WEBSITE");
    await relate(project.nodeId, grantFunding.nodeId, "HAS_GRANT_FUNDING");
    await relate(grantFunding.nodeId, program.nodeId, "FUNDED_BY");
    await relate(organization.nodeId, project.nodeId, "HAS_PROJECT");
    await relate(organization.nodeId, fundingRound.nodeId, "HAS_FUNDING_ROUND");

    const chunk = await graph.createNode("GrantSiteChunk", {
      id: "chunk-1",
      programId: "program-1",
      text: "Open source public infrastructure grants",
    });
    chunkNodeId = chunk.nodeId;
    await relate(program.nodeId, chunk.nodeId, "HAS_CHUNK");
  }

  async function relate(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
  ): Promise<void> {
    await graph.upsertRelationship({ sourceNodeId, targetNodeId, type });
  }

  function vector(dimension: number): number[] {
    return Array.from({ length: 1536 }, (_, index) =>
      index === dimension ? 1 : 0,
    );
  }

  function literal(value: number[]): string {
    return `[${value.join(",")}]`;
  }
});
