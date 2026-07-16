import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("GraphRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let graph: GraphRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-graph-integration-test",
    });
    await postgres.onModuleInit();
    graph = new GraphRepository(postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("batches relationship creation, lookup, and deletion", async () => {
    await graph.createNode("Organization", { orgId: "org-1" }, "org-1");
    await graph.createNode(
      "Project",
      { id: "project-1", name: "One" },
      "project-1",
    );
    await graph.createNode(
      "Project",
      { id: "project-2", name: "Two" },
      "project-2",
    );

    const linked = await graph.setRelationshipsToNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      type: "HAS_PROJECT",
      targetLabel: "Project",
      targetProperty: "id",
      targetValues: ["project-1", "project-2", "project-2"],
    });
    expect(linked.map(node => node.properties.id)).toEqual([
      "project-1",
      "project-2",
    ]);

    const incoming = await graph.findRelatedNodes({
      sourceLabel: "Project",
      sourceWhere: { id: "project-1" },
      relationshipType: "HAS_PROJECT",
      targetLabel: "Organization",
      targetWhere: { orgId: "org-1" },
      direction: "incoming",
    });
    expect(incoming).toHaveLength(1);

    await expect(
      graph.deleteRelationshipsToNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        type: "HAS_PROJECT",
        targetLabel: "Project",
        targetProperty: "id",
        targetValues: ["project-2"],
      }),
    ).resolves.toBe(1);
  });

  it("sets and clears a durable ban without deleting the entity", async () => {
    await graph.createNode(
      "Organization",
      {
        id: "org-1-stable",
        orgId: "org-1",
        name: "Blocked Organization",
        normalizedName: "blocked-organization",
      },
      "org-1",
    );

    await expect(
      graph.setEntityBanned({
        label: "Organization",
        publicId: "org-1",
        banned: true,
        reason: "manual review",
        actor: "integration-test",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        banned: true,
        bannedReason: "manual review",
        bannedBy: "integration-test",
      }),
    );
    await expect(
      graph.findNode("Organization", { orgId: "org-1" }),
    ).resolves.toMatchObject({ properties: { banned: true } });

    await expect(
      graph.setEntityBanned({
        label: "Organization",
        publicId: "org-1",
        banned: false,
        actor: "integration-test",
      }),
    ).resolves.toEqual(expect.objectContaining({ banned: false }));
  });

  it("preserves shared value nodes until their final relationship is removed", async () => {
    await graph.createNode("Organization", { orgId: "org-1" }, "org-1");
    await graph.createNode("Organization", { orgId: "org-2" }, "org-2");

    for (const orgId of ["org-1", "org-2"]) {
      await graph.replaceRelatedValueNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        type: "HAS_WEBSITE",
        targetLabel: "Website",
        targetProperty: "url",
        values: ["https://example.com"],
      });
    }

    await graph.replaceRelatedValueNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      type: "HAS_WEBSITE",
      targetLabel: "Website",
      targetProperty: "url",
      values: [],
    });
    await expect(
      graph.findNode("Website", { url: "https://example.com" }),
    ).resolves.toBeDefined();

    await graph.replaceRelatedValueNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-2" },
      type: "HAS_WEBSITE",
      targetLabel: "Website",
      targetProperty: "url",
      values: [],
    });
    await expect(
      graph.findNode("Website", { url: "https://example.com" }),
    ).resolves.toBeUndefined();
  });

  it("replaces, activates, and patches owned jobsites transactionally", async () => {
    await graph.createNode("Organization", { orgId: "org-1" }, "org-1");
    await graph.replaceOwnedRelatedNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      relationshipType: "HAS_JOBSITE",
      targetLabel: "DetectedJobsite",
      nodeKeyProperty: "id",
      nodes: [
        { id: "site-1", url: "https://old.example", type: "custom" },
        { id: "site-2", url: "https://two.example", type: "custom" },
      ],
    });

    const activated = await graph.relabelRelatedNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      relationshipType: "HAS_JOBSITE",
      targetLabel: "DetectedJobsite",
      targetProperty: "id",
      targetValues: ["site-1"],
      newLabel: "Jobsite",
    });
    expect(activated).toHaveLength(1);

    await graph.updateNodesFromPatches({
      label: "Jobsite",
      identityProperty: "id",
      patches: [
        {
          identity: "site-1",
          patch: { url: "https://new.example", type: "greenhouse" },
        },
      ],
    });
    await expect(
      graph.findNode("Jobsite", { id: "site-1" }),
    ).resolves.toMatchObject({
      properties: { url: "https://new.example", type: "greenhouse" },
    });

    await graph.replaceOwnedRelatedNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      relationshipType: "HAS_JOBSITE",
      targetLabel: "DetectedJobsite",
      nodeKeyProperty: "id",
      nodes: [{ id: "site-3", url: "https://three.example", type: "lever" }],
    });
    await expect(
      graph.findNode("DetectedJobsite", { id: "site-2" }),
    ).resolves.toBeUndefined();
    await expect(
      graph.findNode("Jobsite", { id: "site-1" }),
    ).resolves.toBeDefined();
  });

  it("changes labels atomically and enforces target-label conflicts", async () => {
    await graph.createNode(
      "Organization",
      { orgId: "org-1", name: "Acme", headcountEstimate: 10 },
      "org-1",
    );
    await graph.createNode(
      "Project",
      { id: "project-existing", name: "Existing" },
      "project-existing",
    );

    await expect(
      graph.changeNodeLabel({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        newLabel: "Project",
        conflictWhere: { name: "Existing" },
      }),
    ).resolves.toMatchObject({ status: "conflict" });

    await expect(
      graph.changeNodeLabel({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        newLabel: "Project",
        conflictWhere: { name: "Acme" },
        removeProperties: ["orgId", "headcountEstimate"],
      }),
    ).resolves.toMatchObject({
      status: "updated",
      node: { properties: { name: "Acme" } },
    });
    await expect(
      graph.findNode("Organization", { orgId: "org-1" }),
    ).resolves.toBeUndefined();
  });

  it("deletes an owned subgraph while retaining shared descendants", async () => {
    const org1 = await graph.createNode(
      "Organization",
      { orgId: "org-1" },
      "org-1",
    );
    const org2 = await graph.createNode(
      "Organization",
      { orgId: "org-2" },
      "org-2",
    );
    const shared = await graph.createNode(
      "Project",
      { id: "shared" },
      "shared",
    );
    const owned = await graph.createNode("Project", { id: "owned" }, "owned");
    const website = await graph.createNode(
      "Website",
      { id: "website-1", url: "https://owned.example" },
      "website-1",
    );
    for (const relationship of [
      [org1.nodeId, shared.nodeId, "HAS_PROJECT"],
      [org2.nodeId, shared.nodeId, "HAS_PROJECT"],
      [org1.nodeId, owned.nodeId, "HAS_PROJECT"],
      [owned.nodeId, website.nodeId, "HAS_WEBSITE"],
    ] as const) {
      await graph.upsertRelationship({
        sourceNodeId: relationship[0],
        targetNodeId: relationship[1],
        type: relationship[2],
      });
    }

    await graph.deleteNodeWithOwnedDescendants({
      rootLabel: "Organization",
      rootWhere: { orgId: "org-1" },
      relationshipTypes: ["HAS_PROJECT", "HAS_WEBSITE"],
      ownedLabels: ["Project", "Website"],
    });

    await expect(
      graph.findNode("Project", { id: "shared" }),
    ).resolves.toBeDefined();
    await expect(
      graph.findNode("Project", { id: "owned" }),
    ).resolves.toBeUndefined();
    await expect(
      graph.findNode("Website", { id: "website-1" }),
    ).resolves.toBeUndefined();
  });
});
