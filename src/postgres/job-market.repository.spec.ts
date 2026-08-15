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

  it("limits demand percentiles to salary-eligible skills", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobMarketRepository({ query } as never);

    await repository.getSkillSummaries("remote", "");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("eligible_geography AS MATERIALIZED");
    expect(sql).toContain("INNER JOIN eligible_geography geography");
    expect(sql).toContain("geography.pillar_id = metric.pillar_id");
    expect(parameters).toEqual(["remote", "remote", ""]);
  });

  it("ranks the normalized top salary decile inside a live geography", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new JobMarketRepository({ query } as never);

    await repository.getTopPayingJobs(
      "cl-backend",
      "local",
      "geonames:2759794",
      "cities",
      "amsterdam",
    );

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("observation.salary_monthly_usd");
    expect(sql).toContain("percentile_cont(0.9)");
    expect(sql).toContain("document.online");
    expect(sql).toContain("NOT document.blocked");
    expect(sql).toContain("target.place_id = regexp_replace($3");
    expect(sql).toContain("document.filter_labels -> $4");
    expect(sql).toContain("item ->> 'workMode'");
    expect(sql).toContain("entity_property_is_banned");
    expect(parameters).toEqual([
      "cl-backend",
      "local",
      "geonames:2759794",
      "cities",
      "amsterdam",
    ]);
  });
});
