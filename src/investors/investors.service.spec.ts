import { InvestorsService } from "./investors.service";
import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";

describe("InvestorsService fund list", () => {
  const query = jest.fn();
  const service = new InvestorsService(
    {} as GraphRepository,
    { query } as unknown as PostgresService,
  );

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it("defaults to newest investment order", async () => {
    await service.getFundList({ page: 1, limit: 20 });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY "lastInvestmentDate" DESC NULLS LAST');
    expect(sql).toContain("'totalInvestedCapital'");
    expect(sql).toContain("'lastInvestmentDate'");
    expect(sql).toContain("'jobCount'");
    expect(parameters).toEqual([20, 0, null, null, null, null]);
  });

  it("binds filters and selects the requested safe sort expression", async () => {
    await service.getFundList({
      page: 2,
      limit: 10,
      query: "coin' OR true --",
      minInvestedCapital: 10_000_000,
      minPortfolioCount: 5,
      hasJobs: true,
      order: "asc",
      orderBy: "totalInvestedCapital",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY "totalInvestedCapital" ASC NULLS LAST');
    expect(sql).not.toContain("coin' OR true --");
    expect(parameters).toEqual([
      10,
      10,
      "coin' OR true --",
      10_000_000,
      5,
      true,
    ]);
  });
});
