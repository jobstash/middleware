import { GraphRepository } from "./graph.repository";
import { createProfileMemberFixture } from "./postgres.integration-fixtures";
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
    await createProfileMemberFixture(postgres, "Organization", "org-1", {
      orgId: "org-1",
    });
    await createProfileMemberFixture(postgres, "Project", "project-1", {
      id: "project-1",
      name: "One",
    });
    await createProfileMemberFixture(postgres, "Project", "project-2", {
      id: "project-2",
      name: "Two",
    });

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
    await createProfileMemberFixture(postgres, "Organization", "org-1", {
      id: "org-1-stable",
      orgId: "org-1",
      name: "Blocked Organization",
      normalizedName: "blocked-organization",
    });

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

  it("resolves an entity review without deleting its audit record", async () => {
    await createProfileMemberFixture(postgres, "Organization", "org-review", {
      id: "org-review-id",
      orgId: "org-review",
      name: "Review Organization",
      normalizedName: "review-organization",
      summary: "Summary",
      description: "Description",
      location: "Distributed",
      needsManualReview: true,
      manualReviewStatus: "open",
      manualReviewReason: "Conflicting ownership evidence",
      manualReviewSeverity: "high",
      manualReviewEvidence: ["Evidence"],
      manualReviewProposedActions: [{ kind: "merge_organizations" }],
    });
    await graph.createNode(
      "EntityReview",
      {
        id: "review-id",
        entityLabel: "Organization",
        entityId: "org-review",
        status: "open",
        source: "agentic_reconciliation",
      },
      "review-id",
    );
    await graph.setRelationshipsToNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-review" },
      type: "HAS_ENTITY_REVIEW",
      targetLabel: "EntityReview",
      targetProperty: "id",
      targetValues: ["review-id"],
    });

    await expect(
      graph.resolveEntityManualReview({
        label: "Organization",
        publicId: "org-review",
        note: "Reviewed in org-admin",
        actor: "0xadmin",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        needsManualReview: false,
        manualReviewStatus: "resolved",
        manualReviewResolutionNote: "Reviewed in org-admin",
        manualReviewResolvedBy: "0xadmin",
      }),
    );
    await expect(
      graph.findNode("EntityReview", { id: "review-id" }),
    ).resolves.toMatchObject({
      properties: {
        status: "resolved",
        resolutionNote: "Reviewed in org-admin",
        resolvedBy: "0xadmin",
      },
    });
  });

  it("resolves a child-project candidate through the Project admin surface", async () => {
    await graph.createNode(
      "ChildProjectCandidate",
      {
        id: "candidate-review-id",
        name: "Delicate Candidate",
        needsManualReview: true,
        manualReviewStatus: "open",
        manualReviewReason: "Conflicting project identity evidence",
      },
      "candidate-review-id",
    );
    await graph.createNode(
      "EntityReview",
      {
        id: "candidate-entity-review",
        entityLabel: "ProjectCandidate",
        entityId: "candidate-review-id",
        status: "open",
      },
      "candidate-entity-review",
    );
    await graph.setRelationshipsToNodes({
      sourceLabel: "ChildProjectCandidate",
      sourceWhere: { id: "candidate-review-id" },
      type: "HAS_ENTITY_REVIEW",
      targetLabel: "EntityReview",
      targetProperty: "id",
      targetValues: ["candidate-entity-review"],
    });

    await expect(
      graph.resolveEntityManualReview({
        label: "Project",
        publicId: "candidate-review-id",
        note: "Reviewed as delicate",
        actor: "0xadmin",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        needsManualReview: false,
        manualReviewStatus: "resolved",
      }),
    );
    await expect(
      graph.findNode("EntityReview", { id: "candidate-entity-review" }),
    ).resolves.toMatchObject({
      properties: {
        status: "resolved",
        resolutionNote: "Reviewed as delicate",
      },
    });
  });

  it("preserves shared value nodes until their final relationship is removed", async () => {
    await createProfileMemberFixture(postgres, "Organization", "org-1", {
      orgId: "org-1",
    });
    await createProfileMemberFixture(postgres, "Organization", "org-2", {
      orgId: "org-2",
    });

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
    const ownerNodeId = await createProfileMemberFixture(
      postgres,
      "Organization",
      "org-1",
      { orgId: "org-1" },
    );
    await graph.replaceOwnedRelatedNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org-1" },
      relationshipType: "HAS_DETECTED_JOBSITE",
      targetLabel: "DetectedJobsite",
      nodeKeyProperty: "id",
      nodes: [
        { id: "site-1", url: "https://old.example", type: "custom" },
        { id: "site-2", url: "https://two.example", type: "custom" },
      ],
    });

    const activated = await graph.transaction(async manager => {
      const nodes = await graph.relabelRelatedNodes({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        relationshipType: "HAS_DETECTED_JOBSITE",
        targetLabel: "DetectedJobsite",
        targetProperty: "id",
        targetValues: ["site-1"],
        newLabel: "Jobsite",
        executor: manager,
      });
      for (const node of nodes) {
        await graph.upsertRelationship({
          sourceNodeId: ownerNodeId,
          targetNodeId: node.nodeId,
          type: "HAS_JOBSITE",
          executor: manager,
        });
        await graph.deleteRelationships({
          sourceNodeId: ownerNodeId,
          type: "HAS_DETECTED_JOBSITE",
          targetNodeIds: [node.nodeId],
          executor: manager,
        });
      }
      return nodes;
    });
    expect(activated).toHaveLength(1);
    await expect(
      graph.hasRelationship({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        type: "HAS_JOBSITE",
        targetLabel: "Jobsite",
        targetWhere: { id: "site-1" },
      }),
    ).resolves.toBe(true);
    await expect(
      graph.hasRelationship({
        sourceLabel: "Organization",
        sourceWhere: { orgId: "org-1" },
        type: "HAS_DETECTED_JOBSITE",
        targetLabel: "Jobsite",
        targetWhere: { id: "site-1" },
      }),
    ).resolves.toBe(false);

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
      relationshipType: "HAS_DETECTED_JOBSITE",
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
      "Tag",
      { id: "tag-1", name: "Acme", legacyName: "Acme legacy", legacyRank: 10 },
      "tag-1",
    );
    await graph.createNode(
      "Skill",
      { id: "skill-existing", name: "Existing" },
      "skill-existing",
    );

    await expect(
      graph.changeNodeLabel({
        sourceLabel: "Tag",
        sourceWhere: { id: "tag-1" },
        newLabel: "Skill",
        conflictWhere: { name: "Existing" },
      }),
    ).resolves.toMatchObject({ status: "conflict" });
    await expect(graph.findNode("Tag", { id: "tag-1" })).resolves.toMatchObject(
      {
        properties: { name: "Acme", legacyName: "Acme legacy", legacyRank: 10 },
      },
    );

    await expect(
      graph.changeNodeLabel({
        sourceLabel: "Tag",
        sourceWhere: { id: "tag-1" },
        newLabel: "Skill",
        conflictWhere: { name: "Acme" },
        removeProperties: ["legacyName", "legacyRank"],
      }),
    ).resolves.toEqual({
      status: "updated",
      node: {
        nodeId: expect.any(String),
        properties: { id: "tag-1", name: "Acme" },
      },
    });
    await expect(
      graph.findNode("Tag", { id: "tag-1" }),
    ).resolves.toBeUndefined();
    await expect(
      graph.findNode("Skill", { id: "tag-1" }),
    ).resolves.toMatchObject({ properties: { id: "tag-1", name: "Acme" } });
  });

  it("deletes an owned subgraph while retaining shared descendants", async () => {
    const org1NodeId = await createProfileMemberFixture(
      postgres,
      "Organization",
      "org-1",
      { orgId: "org-1" },
    );
    const org2NodeId = await createProfileMemberFixture(
      postgres,
      "Organization",
      "org-2",
      { orgId: "org-2" },
    );
    const sharedNodeId = await createProfileMemberFixture(
      postgres,
      "Project",
      "shared",
      { id: "shared" },
    );
    const profileOwnedNodeId = await createProfileMemberFixture(
      postgres,
      "Project",
      "owned",
      { id: "owned" },
    );
    const sharedReview = await graph.createNode(
      "EntityReview",
      { id: "shared-review" },
      "shared-review",
    );
    const ownedReview = await graph.createNode(
      "EntityReview",
      { id: "owned-review" },
      "owned-review",
    );
    const website = await graph.createNode(
      "Website",
      { id: "website-1", url: "https://owned.example" },
      "website-1",
    );
    for (const relationship of [
      [org1NodeId, sharedNodeId, "HAS_PROJECT"],
      [org2NodeId, sharedNodeId, "HAS_PROJECT"],
      [org1NodeId, profileOwnedNodeId, "HAS_PROJECT"],
      [org1NodeId, sharedReview.nodeId, "HAS_ENTITY_REVIEW"],
      [org2NodeId, sharedReview.nodeId, "HAS_ENTITY_REVIEW"],
      [org1NodeId, ownedReview.nodeId, "HAS_ENTITY_REVIEW"],
      [ownedReview.nodeId, website.nodeId, "HAS_WEBSITE"],
    ] as const) {
      await graph.upsertRelationship({
        sourceNodeId: relationship[0],
        targetNodeId: relationship[1],
        type: relationship[2],
      });
    }

    await expect(
      graph.deleteNodeWithOwnedDescendants({
        rootLabel: "Organization",
        rootWhere: { orgId: "org-1" },
        relationshipTypes: ["HAS_PROJECT", "HAS_ENTITY_REVIEW", "HAS_WEBSITE"],
        ownedLabels: ["Project", "EntityReview", "Website"],
      }),
    ).resolves.toEqual({ rootDeleted: true, descendantsDeleted: 2 });

    await expect(
      graph.findNode("Project", { id: "shared" }),
    ).resolves.toBeDefined();
    await expect(
      graph.findNode("Project", { id: "owned" }),
    ).resolves.toBeDefined();
    await expect(
      graph.findNode("EntityReview", { id: "shared-review" }),
    ).resolves.toBeDefined();
    await expect(
      graph.findNode("EntityReview", { id: "owned-review" }),
    ).resolves.toBeUndefined();
    await expect(
      graph.findNode("Website", { id: "website-1" }),
    ).resolves.toBeUndefined();
  });
});
