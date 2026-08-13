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

  it("scopes relevant skills to open jobs in the selected classification", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobMarketRepository({ query } as never);

    await repository.getClassificationSkillSummaries(
      "cl-sales",
      "remote",
      "negotiation",
    );

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("classification.slug = $1");
    expect(sql).toContain("classification.kind = 'classifications'");
    expect(sql).toContain("tag.kind = 'tags'");
    expect(sql).toContain("document.online");
    expect(sql).toContain("document.legacy_list_eligible");
    expect(sql).toContain("job_market_salary_observations");
    expect(sql).toContain("open.active_jobs >= 10");
    expect(sql).toContain("open.hiring_companies >= 5");
    expect(parameters).toEqual(["cl-sales", true, "remote", "negotiation"]);
  });

  it("derives seniority pay bands from open and offline salary observations", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobMarketRepository({ query } as never);

    await repository.getClassificationCompensationBands("cl-sales", "max");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM job_market_salary_observations observation");
    expect(sql).toContain("percentile_cont(0.5)");
    expect(sql).toContain("max_employer_share");
    expect(sql).toContain("observedMonthCount");
    expect(parameters).toEqual(["cl-sales", "max"]);
  });
});
