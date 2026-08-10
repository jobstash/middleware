import { PostgresService } from "./postgres.service";
import { SearchRepository } from "./search.repository";

describe("SearchRepository", () => {
  it("projects organization identity without persisting ClickHouse team data", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarConfigs("organizations");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("'organizationId', source.organization_id");
    expect(sql).not.toContain("source.current_maintainer_count");
    expect(sql).not.toContain("source.growing_team");
    expect(sql).toContain("source.recently_funded");
    expect(sql).toContain("'fundingStages'");
    expect(parameters).toEqual([null]);
  });

  it("builds geographic and timezone job pillars from projected availability", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarConfigs("jobs");

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("entry.key LIKE 'place:%'");
    expect(sql).toContain("entry.key LIKE 'raw:%'");
    expect(sql).toContain("'timezones'");
    expect(sql).toContain("filter_labels -> 'timezones'");
  });

  it("matches work-mode pillars against both projected keys and stable columns", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarJobs({
      pillarType: "locationTypes",
      value: "remote",
      startDate: 1,
      endDate: 2,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("(job.location_types) &&");
    expect(sql).toContain("job.legacy_list_eligible");
    expect(sql).toContain("cardinality(job.tags) > 0");
    expect(sql).toContain("organization_has_expert_jobs");
    expect(parameters).toEqual([1, 2, "remote", 60]);
  });

  it("keeps compact legacy pillar slugs compatible with canonical facet keys", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarJobs({
      pillarType: "classifications",
      value: "engineeringmanagement",
      startDate: 1,
      endDate: 2,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM unnest(job.classifications) facet_key");
    expect(sql).toContain("replace(slugify_text(facet_key), '-', '')");
    expect(sql).toContain("(job.classifications) &&");
    expect(parameters).toEqual([
      1,
      2,
      "engineeringmanagement",
      "engineeringmanagement",
      60,
    ]);
  });
});
