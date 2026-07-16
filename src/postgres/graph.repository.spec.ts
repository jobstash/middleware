import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";

describe("GraphRepository", () => {
  let query: jest.Mock;
  let repository: GraphRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    repository = new GraphRepository({
      query,
      transaction: jest.fn(),
    } as unknown as PostgresService);
  });

  it("parameterizes JSON node lookup criteria", async () => {
    const malicious = "x' OR true --";
    await repository.findNode("Organization", { name: malicious });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("properties @> $2::jsonb");
    expect(sql).toContain("LIMIT $3");
    expect(sql).not.toContain(malicious);
    expect(parameters).toEqual([
      "Organization",
      JSON.stringify({ name: malicious }),
      1,
    ]);
  });

  it("parameterizes durable entity ban changes", async () => {
    query.mockResolvedValue([{ properties: { banned: true } }]);

    await expect(
      repository.setEntityBanned({
        label: "Organization",
        publicId: "org-1",
        banned: true,
        reason: "out of scope",
        actor: "0xadmin",
      }),
    ).resolves.toEqual({ banned: true });
    expect(query.mock.calls[0][0]).toContain(
      "SELECT set_entity_banned($1, $2, $3, $4, $5)",
    );
    expect(query.mock.calls[0][1]).toEqual([
      "Organization",
      "org-1",
      true,
      "out of scope",
      "0xadmin",
    ]);
  });

  it("supports indexed outgoing and incoming relationship reads", async () => {
    await repository.findRelatedNodes({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "1" },
      relationshipType: "HAS_PROJECT",
      targetLabel: "Project",
    });
    expect(query.mock.calls[0][0]).toContain(
      "relationship.source_id = source.id",
    );

    query.mockClear();
    await repository.findRelatedNodes({
      sourceLabel: "Project",
      sourceWhere: { id: "project-1" },
      relationshipType: "HAS_PROJECT",
      direction: "incoming",
    });
    expect(query.mock.calls[0][0]).toContain(
      "relationship.target_id = source.id",
    );
  });

  it("upserts nodes without interpolating properties", async () => {
    query.mockResolvedValue([
      { nodeId: "1", properties: { id: "org-1", name: "Acme" } },
    ]);

    await expect(
      repository.createNode("Organization", { id: "org-1", name: "Acme" }),
    ).resolves.toMatchObject({ nodeId: "1" });
    expect(query.mock.calls[0][0]).toContain(
      "ON CONFLICT (label, node_key) DO UPDATE",
    );
    expect(query.mock.calls[0][1]).toEqual([
      "Organization",
      "org-1",
      JSON.stringify({ id: "org-1", name: "Acme" }),
    ]);
  });

  it("patches and deletes matched nodes with JSON containment", async () => {
    await repository.updateNodes<{ orgId: string; name?: string }>(
      "Organization",
      { orgId: "1" },
      { name: "Updated" },
    );
    expect(query.mock.calls[0][0]).toContain(
      "properties = properties || $3::jsonb",
    );

    query.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    await expect(
      repository.deleteNodes("Organization", { orgId: "1" }),
    ).resolves.toBe(2);
  });

  it("upserts and selectively deletes relationships", async () => {
    await repository.upsertRelationship({
      sourceNodeId: "1",
      targetNodeId: "2",
      type: "HAS_PROJECT",
    });
    expect(query.mock.calls[0][0]).toContain(
      "ON CONFLICT (source_id, target_id, type, relationship_key)",
    );

    query.mockResolvedValue([{ id: "3" }]);
    await expect(
      repository.deleteRelationships({
        sourceNodeId: "1",
        type: "HAS_PROJECT",
        targetNodeIds: ["2"],
      }),
    ).resolves.toBe(1);
    expect(query.mock.calls[1][1]).toEqual(["1", "HAS_PROJECT", ["2"]]);
  });
});
