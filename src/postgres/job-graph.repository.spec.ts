import { JobGraphRepository } from "./job-graph.repository";
import { PostgresService } from "./postgres.service";

describe("JobGraphRepository employer unions", () => {
  it("loads similar jobs for Organization- or Project-owned sources and candidates", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobGraphRepository({
      query,
    } as unknown as PostgresService);

    await repository.getSimilarJobs("job-short");

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("organization_id IS NULL AND project_id IS NOT NULL");
    expect(sql).toContain("'organization:' || candidate.organization_id");
    expect(sql).toContain("'project:' || candidate.project_id");
    expect(sql).toContain("project_search_documents project");
    expect(sql).toContain("'project', CASE");
    expect(sql).toContain("project_payload -> 'name'");
  });

  it("emits the exact employer union for suggested jobs", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobGraphRepository({
      query,
    } as unknown as PostgresService);

    await repository.getSuggestedJobPayloads({
      skills: ["typescript"],
      minimumOverlapRatio: 0.25,
      minimumMatchCount: 1,
      limit: 10,
      offset: 0,
    });

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "job.organization_id IS NULL AND job.project_id IS NOT NULL",
    );
    expect(sql).toContain("project_search_documents project");
    expect(sql).toContain("'project', CASE");
    expect(sql).toContain("project.payload - 'tags' - 'jobs'");
  });
});

describe("JobGraphRepository manual replacement safety", () => {
  it("resolves the new target before deletion and preserves the old value when absent", async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ node_id: "10" }])
        .mockResolvedValueOnce([]),
    };
    const postgres = {
      transaction: jest.fn(async callback => callback(manager)),
    };
    const repository = new JobGraphRepository(
      postgres as unknown as PostgresService,
    );

    await expect(
      repository.replaceJobRelationships({
        shortUuids: ["job"],
        relationshipType: "HAS_CLASSIFICATION",
        targetLabel: "JobpostClassification",
        targetProperty: "name",
        targetValues: ["FORWARD_DEPLOYED_ENGINEER"],
        requireSingleTarget: true,
        ownership: "manual",
        reviewed: true,
      }),
    ).resolves.toBe(0);

    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(
      manager.query.mock.calls.some(([sql]) => /DELETE FROM/.test(sql)),
    ).toBe(false);
    expect(manager.query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(manager.query.mock.calls[1][0]).toContain("FOR SHARE");
  });
});
