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
    expect(sql).toContain(
      "ORDER BY metrics.last_investment_date DESC NULLS LAST",
    );
    expect(sql).toContain("'totalInvestedCapital'");
    expect(sql).toContain("'knownRoundCapital'");
    expect(sql).toContain("'socialStaffCount'");
    expect(sql).toContain("FROM fund_analytics_documents document");
    expect(sql).toContain("document.ambiguous_round_count");
    expect(sql).toContain("progression.progression_rate");
    expect(sql).toContain("metrics.solo_round_count");
    expect(sql).toContain("FROM fund_activity_documents activity");
    expect(sql).toContain("activity.round_stage = ANY($13)");
    expect(sql).toContain("'lastInvestmentDate'");
    expect(sql).toContain("'jobCount'");
    expect(parameters).toEqual([
      20,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      expect.any(Number),
      expect.any(Number),
      null,
      "1y",
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("binds filters and selects the requested safe sort expression", async () => {
    await service.getFundList({
      page: 2,
      limit: 10,
      query: "coin' OR true --",
      minInvestedCapital: 10_000_000,
      minPortfolioCount: 5,
      hasJobs: true,
      hasTeamSocials: true,
      hasSoloInvestments: true,
      minProgressionRate: 50,
      sector: "Gaming",
      activityWindow: "custom",
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      rounds: "seed,series-a",
      order: "asc",
      orderBy: "knownRoundCapital",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain(
      "ORDER BY metrics.known_round_capital ASC NULLS LAST",
    );
    expect(sql).not.toContain("coin' OR true --");
    expect(parameters).toEqual([
      10,
      10,
      "coin' OR true --",
      10_000_000,
      5,
      true,
      true,
      50,
      true,
      "Gaming",
      1_735_689_600,
      1_767_225_600,
      ["seed", "series-a"],
      "custom",
      1_735_689_600,
      1_767_225_599,
    ]);
  });

  it("includes staff portraits and related social profiles in fund details", async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: { name: "Example Fund" } }]);

    await service.getFundDetailsBySlug("example-fund");

    const [sql, parameters] = query.mock.calls[1];
    expect(sql).toContain("staff.properties ->> 'photoUrl'");
    expect(sql).toContain("'investedAmount'");
    expect(sql).toContain("'valuation'");
    expect(sql).toContain("'fundParticipated'");
    expect(sql).toContain("'investmentRole'");
    expect(sql).toContain("round.fund_participated");
    expect(sql).toContain("ownership.owner_count = 1");
    expect(sql).toContain("social_edge.type = 'HAS_LINKEDIN'");
    expect(sql).toContain("https://www.linkedin.com/in/");
    expect(sql).toContain("social_edge.type = 'HAS_TWITTER'");
    expect(sql).toContain("https://x.com/");
    expect(parameters).toEqual(["example-fund"]);
  });

  it("loads analyst sector filters from the materialized projection", async () => {
    await service.getFundSectors();

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM fund_activity_documents activity");
    expect(sql).toContain("unnest(activity.sector_names)");
    expect(sql).toContain('AS "companyCount"');
    expect(parameters).toEqual([expect.any(Number), expect.any(Number), null]);
  });

  it("loads round-stage facets from the time-scoped projection", async () => {
    await service.getFundRoundStages({
      activityWindow: "custom",
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      sector: "Infrastructure",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("activity.round_stage AS slug");
    expect(sql).toContain('AS "fundCount"');
    expect(sql).toContain('AS "investmentCount"');
    expect(parameters).toEqual([
      1_735_689_600,
      1_767_225_600,
      "Infrastructure",
    ]);
  });

  it("loads every fund slug for the EV sitemap", async () => {
    await service.getEvSitemapFunds();

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("properties ->> 'normalizedName'");
    expect(sql).toContain("properties ->> 'isFund'");
    expect(parameters).toBeUndefined();
  });
});
