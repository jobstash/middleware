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
      "ORDER BY document.last_investment_date DESC NULLS LAST",
    );
    expect(sql).toContain("'totalInvestedCapital'");
    expect(sql).toContain("'knownRoundCapital'");
    expect(sql).toContain("'socialStaffCount'");
    expect(sql).toContain("FROM fund_analytics_documents document");
    expect(sql).toContain("document.ambiguous_round_count");
    expect(sql).toContain("document.progression_rate");
    expect(sql).toContain("document.solo_round_count");
    expect(sql).toContain("ANY(document.sector_names)");
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
      order: "asc",
      orderBy: "knownRoundCapital",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain(
      "ORDER BY document.known_round_capital ASC NULLS LAST",
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
    expect(sql).toContain("FROM fund_analytics_documents document");
    expect(sql).toContain("jsonb_array_elements(document.sector_breakdown)");
    expect(sql).toContain('AS "companyCount"');
    expect(parameters).toBeUndefined();
  });

  it("loads every fund slug for the EV sitemap", async () => {
    await service.getEvSitemapFunds();

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("properties ->> 'normalizedName'");
    expect(sql).toContain("properties ->> 'isFund'");
    expect(parameters).toBeUndefined();
  });
});
