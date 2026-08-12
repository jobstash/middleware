import { PostgresService } from "./postgres.service";
import { JobMarketRepository } from "./job-market.repository";

describe("JobMarketRepository", () => {
  it("keeps the market sample calendar while filling absent pillar dates", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobMarketRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarHistory("l-berlin", 90);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN job_market_daily_metrics metric"),
      ["l-berlin", 90],
    );
    expect(query.mock.calls[0][0]).toContain("JOIN market_pillar");
  });
});
