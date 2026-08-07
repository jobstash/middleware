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
});
