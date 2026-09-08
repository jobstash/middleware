import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";
import { SearchDocumentRepository } from "./search-document.repository";
import {
  createOwnedJobsiteFixture,
  createProfileMemberFixture,
} from "./postgres.integration-fixtures";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("Organization jobsite state PostgreSQL integration", () => {
  let postgres: PostgresService;
  let graph: GraphRepository;
  let search: SearchDocumentRepository;
  let organization: string;
  let jobsite: string;
  const properties = {
    id: "site-1",
    url: "https://boards.greenhouse.io/waku",
    type: "greenhouse",
    lastNewJobTimestamp: 12345,
  };

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_TEST_URL ?? "");
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/jobstash_jobsite_test"
    ) {
      throw new Error(
        "Jobsite tests require the dedicated local jobstash_jobsite_test database",
      );
    }
    postgres = new PostgresService({
      url: url.toString(),
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-jobsite-state-test",
    });
    await postgres.onModuleInit();
    graph = new GraphRepository(postgres);
    search = new SearchDocumentRepository(postgres);
  });
  afterAll(async () => postgres?.onModuleDestroy());
  beforeEach(async () => {
    await postgres.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    organization = await createProfileMemberFixture(
      postgres,
      "Organization",
      "org-1",
      { orgId: "org-1", name: "Waku", normalizedName: "waku" },
    );
    jobsite = await createOwnedJobsiteFixture(
      postgres,
      organization,
      "site-1",
      properties,
    );
    await postgres.query(
      "UPDATE graph_relationships SET properties = '{\"source\":\"operator\"}'::jsonb WHERE target_id = $1::bigint AND type = 'HAS_JOBSITE'",
      [jobsite],
    );
    await graph.refreshOrganizationSearchDocuments([organization]);
  });
  const state = async (): Promise<Record<string, unknown>> =>
    (
      await postgres.query(
        `SELECT site.id::text AS id, site.label, site.properties, edge.type, edge.properties AS metadata
    FROM graph_nodes site JOIN graph_relationships edge ON edge.target_id=site.id
    WHERE site.id=$1::bigint`,
        [jobsite],
      )
    )[0];

  it("disables and re-enables an owned jobsite while preserving identity and history", async () => {
    // This was the production failure: a node-only relabel leaves an active edge behind.
    await expect(
      graph.relabelRelatedNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        relationshipType: "HAS_JOBSITE",
        targetLabel: "Jobsite",
        targetProperty: "id",
        targetValues: ["site-1"],
        newLabel: "DetectedJobsite",
      }),
    ).rejects.toThrow("incompatible endpoint labels");
    await expect(
      graph.setOrganizationJobsitesActive("org-1", ["site-1"], false),
    ).resolves.toEqual([{ nodeId: jobsite, properties }]);
    expect(await state()).toEqual({
      id: jobsite,
      label: "DetectedJobsite",
      properties,
      type: "HAS_DETECTED_JOBSITE",
      metadata: { source: "operator" },
    });
    const grid = await search.getOrganizationsForAdminGrid({
      offset: 0,
      limit: 20,
    });
    expect(grid.data[0]).toMatchObject({
      jobsites: [],
      detectedJobsites: [expect.objectContaining({ id: "site-1" })],
    });
    const [disabled] = await search.getOrganizationsWithLinks("org-1");
    expect(disabled.jobsites).toEqual([]);
    expect(disabled.detectedJobsites).toEqual([
      expect.objectContaining({ id: "site-1", url: properties.url }),
    ]);
    await graph.setOrganizationJobsitesActive("org-1", ["site-1"], true);
    expect(await state()).toEqual({
      id: jobsite,
      label: "Jobsite",
      properties,
      type: "HAS_JOBSITE",
      metadata: { source: "operator" },
    });
    const [enabled] = await search.getOrganizationsWithLinks("org-1");
    expect(enabled.jobsites).toEqual([
      expect.objectContaining({ id: "site-1" }),
    ]);
    expect(enabled.detectedJobsites).toEqual([]);
  });

  it("rejects a batch containing a foreign jobsite without modifying the owned site", async () => {
    const foreign = await createProfileMemberFixture(
      postgres,
      "Organization",
      "org-2",
      { orgId: "org-2" },
    );
    await createOwnedJobsiteFixture(postgres, foreign, "site-2", {
      id: "site-2",
      url: "https://foreign.example/jobs",
      type: "custom",
    });
    await expect(
      graph.setOrganizationJobsitesActive("org-1", ["site-1", "site-2"], false),
    ).rejects.toThrow("do not belong");
    expect(await state()).toMatchObject({
      label: "Jobsite",
      type: "HAS_JOBSITE",
    });
  });

  it("still rejects removing active ownership without a valid detected relationship", async () => {
    await expect(
      postgres.query(
        "DELETE FROM graph_relationships WHERE target_id=$1::bigint AND type='HAS_JOBSITE'",
        [jobsite],
      ),
    ).rejects.toThrow("exactly one");
    await expect(
      postgres.transaction(async manager => {
        await manager.query(
          "DELETE FROM graph_relationships WHERE target_id=$1::bigint AND type='HAS_JOBSITE'",
          [jobsite],
        );
        await manager.query(
          "UPDATE graph_nodes SET label='DetectedJobsite', labels=ARRAY['DetectedJobsite'] WHERE id=$1::bigint",
          [jobsite],
        );
      }),
    ).rejects.toThrow("must target a Jobsite");
    expect(await state()).toMatchObject({
      label: "Jobsite",
      type: "HAS_JOBSITE",
    });
  });

  it("handles concurrent repeated disable requests idempotently", async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        graph.setOrganizationJobsitesActive(
          "org-1",
          ["site-1", "site-1"],
          false,
        ),
      ),
    );
    expect(results.every(result => result.length === 1)).toBe(true);
    expect(await state()).toMatchObject({
      label: "DetectedJobsite",
      type: "HAS_DETECTED_JOBSITE",
    });
  });

  it("rolls back the node and relationship when refreshing the editor data fails", async () => {
    const refresh = jest
      .spyOn(graph, "refreshOrganizationSearchDocuments")
      .mockRejectedValueOnce(new Error("projection failed"));
    await expect(
      graph.setOrganizationJobsitesActive("org-1", ["site-1"], false),
    ).rejects.toThrow("projection failed");
    refresh.mockRestore();
    expect(await state()).toMatchObject({
      label: "Jobsite",
      type: "HAS_JOBSITE",
    });
  });
});
