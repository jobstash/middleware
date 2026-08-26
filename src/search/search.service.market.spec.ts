import {
  JobMarketGeographyRow,
  JobMarketMetricRow,
  JobMarketRepository,
  JobMarketSkillWeeklyRow,
  JobMarketTopPayingRow,
} from "src/postgres/job-market.repository";
import { SearchRepository } from "src/postgres/search.repository";
import { SearchService } from "./search.service";

const metric = (
  overrides: Partial<JobMarketMetricRow> = {},
): JobMarketMetricRow => ({
  kind: "classifications",
  slug: "cl-backend",
  label: "Backend",
  sampleDate: "2026-08-12",
  activeJobs: "120",
  hiringCompanies: "45",
  newJobs: "4",
  salaryMedianMonthlyUsd: "10000",
  salaryMeanMonthlyUsd: "10500",
  salaryP25MonthlyUsd: "8000",
  salaryP75MonthlyUsd: "12500",
  salarySampleCount: "20",
  salaryEmployerCount: "10",
  salaryCoverage: "0.1",
  source: "snapshot" as const,
  sampledAt: "2026-08-12T00:15:00.000Z",
  currentWindowJobs: "21",
  previousWindowJobs: "14",
  currentActiveJobs: "120",
  baselineActiveJobs: "100",
  currentHiringCompanies: "50",
  baselineHiringCompanies: "50",
  ...overrides,
});

const geography = (
  overrides: Partial<JobMarketGeographyRow> = {},
): JobMarketGeographyRow => ({
  asOfDate: "2026-08-12",
  rangeKey: "max" as const,
  dimensionKind: "market",
  dimensionSlug: "market",
  regionKey: "synthetic:local",
  regionSlug: "local",
  regionLabel: "All local markets",
  regionType: "aggregate",
  filterKey: null,
  filterValue: null,
  countryCode: null,
  segment: "local" as const,
  salaryMedianMonthlyUsd: "9000",
  salaryP25MonthlyUsd: "7000",
  salaryP75MonthlyUsd: "11000",
  adjustedPremiumPercent: "2.5",
  salarySampleCount: "20",
  employerCount: "10",
  onsiteCount: "12",
  hybridCount: "8",
  remoteCount: "0",
  regionalActiveJobs: "42",
  regionalHiringCompanies: "25",
  regionalActiveOnsiteJobs: "30",
  regionalActiveHybridJobs: "12",
  regionalActiveRemoteJobs: "0",
  ...overrides,
});

const weekly = (
  overrides: Partial<JobMarketSkillWeeklyRow> = {},
): JobMarketSkillWeeklyRow => ({
  weekStart: "2026-08-10",
  slug: "t-typescript",
  label: "TypeScript",
  segment: "remote",
  regionSlug: "all",
  regionLabel: "Remote",
  salaryMedianMonthlyUsd: "10750",
  salaryP25MonthlyUsd: "9412.5",
  salaryP75MonthlyUsd: "14314.58",
  adjustedPremiumPercent: "2.77",
  salarySampleCount: "3",
  employerCount: "2",
  onsiteCount: "0",
  hybridCount: "0",
  remoteCount: "3",
  ...overrides,
});

const topPaying = (
  overrides: Partial<JobMarketTopPayingRow> = {},
): JobMarketTopPayingRow => ({
  asOfDate: "2026-08-12",
  salaryJobCount: "20",
  topDecileThresholdMonthlyUsd: "15000",
  topDecileJobCount: "2",
  jobNodeId: "101",
  shortUuid: "abc123",
  title: "Staff Engineer",
  organizationName: "Acme",
  organizationLogoUrl: null,
  classificationSlug: "cl-backend",
  classificationLabel: "BACKEND",
  seniority: "4",
  location: "Amsterdam",
  locationTypes: ["hybrid"],
  onsite: false,
  hybrid: true,
  remote: false,
  publishedAt: "2026-08-11T00:00:00.000Z",
  salaryMonthlyUsd: "20000",
  tags: [
    { slug: "t-typescript", label: "TypeScript" },
    { slug: "t-rust", label: "Rust" },
  ],
  ...overrides,
});

describe("SearchService job-market intelligence", () => {
  const createService = (
    repository: Partial<JobMarketRepository>,
  ): SearchService =>
    new SearchService(
      {} as SearchRepository,
      {} as never,
      {
        getGeography: jest.fn().mockResolvedValue([]),
        getClassificationCompensationBands: jest.fn().mockResolvedValue([]),
        getLatestSkillSignals: jest.fn().mockResolvedValue([]),
        getOverviewHistory: jest.fn().mockResolvedValue([]),
        ...repository,
      } as JobMarketRepository,
    );

  it("returns reliable salary and seven-day momentum for a pillar", async () => {
    const getPillarHistory = jest.fn().mockResolvedValue([
      metric({ sampleDate: "2026-07-30", newJobs: "2" }),
      ...Array.from({ length: 6 }, (_, index) =>
        metric({
          sampleDate: `2026-08-0${index + 1}`,
          newJobs: "1",
        }),
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        metric({
          sampleDate: `2026-08-${String(index + 6).padStart(2, "0")}`,
          newJobs: "3",
        }),
      ),
    ]);
    const service = createService({ getPillarHistory } as never);

    await expect(service.getPillarMarket("cl-backend", "90")).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          current: expect.objectContaining({
            activeJobs: 120,
            salary: expect.objectContaining({
              reliable: true,
              medianMonthlyUsd: 10000,
            }),
          }),
          momentum: expect.objectContaining({
            currentJobs: 21,
            previousJobs: 8,
            direction: "up",
          }),
        }),
      }),
    );
    expect(getPillarHistory).toHaveBeenCalledWith("cl-backend", 90);
  });

  it("publishes limited broad evidence from three jobs and two employers", async () => {
    const service = createService({
      getPillarHistory: jest
        .fn()
        .mockResolvedValue([
          metric({ salarySampleCount: "3", salaryEmployerCount: "2" }),
        ]),
    });
    const result = await service.getPillarMarket("cl-backend");
    expect(result).toMatchObject({
      data: {
        current: {
          salary: {
            reliable: false,
            evidenceLevel: "limited",
            sampleCount: 3,
            medianMonthlyUsd: 10000,
          },
        },
      },
    });
  });

  it("publishes a company benchmark without employer diversity", async () => {
    const service = createService({
      getPillarHistory: jest.fn().mockResolvedValue([
        metric({
          kind: "organizations",
          slug: "o-uniswap",
          label: "Uniswap",
          salarySampleCount: "3",
          salaryEmployerCount: "1",
        }),
      ]),
    });
    const result = await service.getPillarMarket("o-uniswap");
    expect(result).toMatchObject({
      data: {
        pillar: {
          filter: { paramKey: "organizations", value: "uniswap" },
        },
        current: {
          salary: {
            evidenceLevel: "limited",
            medianMonthlyUsd: 10000,
          },
        },
      },
    });
  });

  it("returns sparse weekly estimates while retaining their reliability flag", async () => {
    const service = createService({
      getSkillWeeklyHistory: jest.fn().mockResolvedValue([weekly()]),
      getGeography: jest.fn().mockResolvedValue([
        geography({
          dimensionKind: "tags",
          dimensionSlug: "t-typescript",
          regionSlug: "remote",
          regionLabel: "Remote",
          segment: "remote",
          salarySampleCount: "3",
          employerCount: "2",
        }),
      ]),
    });

    const result = await service.getMarketSkillDetail("t-typescript");

    expect(result).toMatchObject({
      data: {
        history: [
          {
            medianMonthlyUsd: 10750,
            p25MonthlyUsd: 9412.5,
            p75MonthlyUsd: 14314.58,
            adjustedPremiumPercent: 2.77,
            sampleCount: 3,
            employerCount: 2,
            reliable: false,
          },
        ],
      },
    });
  });

  it("withholds a broad cohort dominated by one employer", async () => {
    const service = createService({
      getPillarHistory: jest
        .fn()
        .mockResolvedValue([
          metric({ salarySampleCount: "8", salaryEmployerCount: "1" }),
        ]),
    });
    const result = await service.getPillarMarket("cl-backend");
    expect(result).toMatchObject({
      data: {
        current: {
          salary: {
            evidenceLevel: "insufficient",
            medianMonthlyUsd: null,
          },
        },
      },
    });
  });

  it("ranks qualified bullish and cooling classification outliers", async () => {
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
          currentWindowJobs: "100",
          previousWindowJobs: "80",
          currentActiveJobs: "100",
          baselineActiveJobs: "100",
          currentHiringCompanies: "50",
          baselineHiringCompanies: "50",
        }),
        metric({ currentWindowJobs: "21", previousWindowJobs: "14" }),
        metric({
          slug: "cl-frontend",
          label: "Frontend",
          currentWindowJobs: "7",
          previousWindowJobs: "21",
          currentActiveJobs: "80",
          baselineActiveJobs: "100",
        }),
        metric({
          slug: "cl-tiny",
          label: "Tiny",
          activeJobs: "5",
          currentWindowJobs: "10",
          previousWindowJobs: "1",
        }),
      ]),
    });

    const result = await service.getMarketOverview();
    expect(result).toMatchObject({
      data: {
        movers: {
          bullish: [{ slug: "cl-backend" }],
          cooling: [{ slug: "cl-frontend" }],
        },
      },
    });
  });

  it("includes recent open-vacancy history in overview tickers", async () => {
    const history = [
      metric({ sampleDate: "2026-08-11", activeJobs: "110" }),
      metric({ sampleDate: "2026-08-12", activeJobs: "120" }),
    ];
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
        }),
        metric(),
      ]),
      getOverviewHistory: jest.fn().mockResolvedValue(history),
    });

    const result = await service.getMarketOverview();

    expect(result).toMatchObject({
      data: {
        classifications: [
          {
            slug: "cl-backend",
            history: [
              { date: "2026-08-11", activeJobs: 110 },
              { date: "2026-08-12", activeJobs: 120 },
            ],
          },
        ],
      },
    });
  });

  it("serves canonical labels and marks smaller geography as limited", async () => {
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
          currentActiveJobs: "100",
          baselineActiveJobs: "100",
          currentHiringCompanies: "50",
          baselineHiringCompanies: "50",
        }),
        metric({
          slug: "cl-engineering-management",
          label: "ENGINEERING_MANAGEMENT",
        }),
        metric({ slug: "cl-ai", label: "AI" }),
      ]),
      getGeography: jest.fn().mockResolvedValue([
        geography({
          dimensionKind: "classifications",
          dimensionSlug: "cl-engineering-management",
          regionSlug: "europe",
          regionLabel: "Europe",
          regionType: "continent",
          regionKey: "continent:europe",
          filterKey: "continents",
          filterValue: "europe",
          salarySampleCount: "9",
          employerCount: "8",
        }),
        geography({
          dimensionKind: "classifications",
          dimensionSlug: "cl-engineering-management",
          regionSlug: "germany",
          regionLabel: "Germany",
          regionType: "country",
          regionKey: "geonames:2921044",
          filterKey: "countries",
          filterValue: "germany",
          countryCode: "DEU",
          salarySampleCount: "20",
          employerCount: "10",
        }),
      ]),
    });

    const result = await service.getMarketState(
      "max",
      "engineering-management",
    );
    expect(result).toMatchObject({
      data: {
        selectedClassification: "cl-engineering-management",
        classifications: [
          {
            slug: "cl-engineering-management",
            label: "Engineering Management",
          },
          { slug: "cl-ai", label: "AI" },
        ],
        geography: [
          {
            regionSlug: "europe",
            regionType: "continent",
            reliable: false,
            evidenceLevel: "limited",
            medianMonthlyUsd: 9000,
            filter: { paramKey: "continents", value: "europe" },
            sampleCount: 9,
            employerCount: 8,
            activeJobs: 42,
            hiringCompanies: 25,
          },
          {
            regionSlug: "germany",
            regionType: "country",
            countryCode: "DEU",
            reliable: true,
            medianMonthlyUsd: 9000,
          },
        ],
      },
    });
  });

  it("falls back to the whole market for an unknown classification", async () => {
    const getGeography = jest.fn().mockResolvedValue([
      geography({
        dimensionKind: "market",
        dimensionSlug: "market",
        regionSlug: "remote",
        regionLabel: "Remote",
      }),
    ]);
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
        }),
        metric({ slug: "cl-engineering", label: "Engineering" }),
      ]),
      getGeography,
    });

    const result = await service.getMarketState("max", "not-a-class");

    expect(result).toMatchObject({
      data: {
        selectedClassification: "market",
        geography: [{ regionSlug: "remote" }],
      },
    });
    expect(getGeography).toHaveBeenCalledWith("market", "max");
  });

  it("describes and links the top salary decile for a selected city", async () => {
    const getTopPayingJobs = jest.fn().mockResolvedValue([
      topPaying(),
      topPaying({
        jobNodeId: "102",
        shortUuid: "def456",
        title: "Lead Backend Engineer",
        salaryMonthlyUsd: "18000",
        tags: [{ slug: "t-typescript", label: "TypeScript" }],
      }),
    ]);
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
        }),
        metric({ slug: "cl-backend", label: "BACKEND" }),
      ]),
      getGeography: jest.fn().mockResolvedValue([
        geography({
          dimensionKind: "classifications",
          dimensionSlug: "cl-backend",
          regionSlug: "local",
          regionLabel: "All local markets",
          regionType: "aggregate",
          filterKey: null,
          filterValue: null,
        }),
        geography({
          dimensionKind: "classifications",
          dimensionSlug: "cl-backend",
          regionSlug: "amsterdam",
          regionLabel: "Amsterdam",
          regionType: "city",
          regionKey: "geonames:2759794",
          filterKey: "cities",
          filterValue: "amsterdam",
          regionalActiveJobs: "42",
        }),
      ]),
      getTopPayingJobs,
    });

    const result = await service.getMarketTopPaying(
      "local",
      "backend",
      "city",
      "amsterdam",
    );

    expect(getTopPayingJobs).toHaveBeenCalledWith(
      "cl-backend",
      "local",
      "geonames:2759794",
      "cities",
      "amsterdam",
    );
    expect(result).toMatchObject({
      data: {
        methodologyVersion: "market-top-pay-v2",
        scope: {
          classification: "cl-backend",
          classificationLabel: "Backend",
          segment: "local",
          regionSlug: "amsterdam",
          regionLabel: "Amsterdam",
          regionType: "city",
        },
        openJobsInScope: 42,
        salaryJobCount: 20,
        salaryCoveragePercent: 47.6,
        topDecileThresholdMonthlyUsd: 15000,
        topDecileJobCount: 2,
        medianTopDecileMonthlyUsd: 19000,
        breakdowns: {
          classifications: [
            { slug: "cl-backend", label: "Backend", jobCount: 2 },
          ],
          seniorities: [{ slug: "s-lead", label: "Lead", jobCount: 2 }],
          tags: [
            { slug: "t-typescript", label: "TypeScript", jobCount: 2 },
            { slug: "t-rust", label: "Rust", jobCount: 1 },
          ],
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          jobs: expect.arrayContaining([
            expect.objectContaining({
              href: "/staff-engineer-acme/abc123",
              salaryMonthlyUsd: 20000,
            }),
          ]),
        }),
      }),
    );
  });

  it("ranks statistically rising skills and preserves their evidence", async () => {
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
          currentActiveJobs: "100",
          baselineActiveJobs: "100",
          currentHiringCompanies: "50",
          baselineHiringCompanies: "50",
        }),
      ]),
      getSkillSummaries: jest.fn().mockResolvedValue([
        {
          ...geography({
            dimensionKind: "tags",
            dimensionSlug: "t-typescript",
            regionSlug: "remote",
            regionLabel: "Remote",
            segment: "remote",
            remoteCount: "30",
          }),
          label: "TypeScript",
          activeJobs: "80",
          hiringCompanies: "30",
          currentWindowJobs: "20",
          previousWindowJobs: "12",
          currentActiveJobs: "120",
          baselineActiveJobs: "100",
          currentHiringCompanies: "60",
          baselineHiringCompanies: "50",
          signalAsOf: "2026-08-12",
          signalStatus: "rising",
          currentMedianMonthlyUsd: "11000",
          baselineMedianMonthlyUsd: "9000",
          rawChangePercent: "22.2",
          adjustedChangePercent: "14.5",
          confidenceLowPercent: "7.1",
          confidenceHighPercent: "21.9",
          qValue: "0.01",
          recentJobCount: "40",
          baselineJobCount: "50",
          recentEmployerCount: "20",
          baselineEmployerCount: "25",
          signalSince: "2026-08-10",
        },
      ]),
    });

    const result = await service.getMarketSkills("remote", "repricing", "type");
    expect(result).toMatchObject({
      data: {
        segment: "remote",
        sort: "repricing",
        query: "type",
        skills: [
          {
            slug: "t-typescript",
            strongBreakout: true,
            current: {
              reliable: true,
              medianMonthlyUsd: 9000,
              sampleCount: 20,
            },
            signal: {
              status: "rising",
              adjustedChangePercent: 14.5,
              qValue: 0.01,
              recentEmployerCount: 20,
            },
          },
        ],
      },
    });
  });

  it("returns only skills observed on open jobs in a selected classification", async () => {
    const getSkillSummaries = jest.fn();
    const getClassificationSkillSummaries = jest.fn().mockResolvedValue([
      {
        ...geography({
          dimensionKind: "tags",
          dimensionSlug: "t-negotiation",
          regionSlug: "remote",
          regionLabel: "Remote",
          segment: "remote",
          remoteCount: "47",
        }),
        label: "negotiation",
        activeJobs: "47",
        hiringCompanies: "33",
        openJobShare: "28.7",
        currentWindowJobs: "10",
        previousWindowJobs: "8",
        currentActiveJobs: null,
        baselineActiveJobs: null,
        currentHiringCompanies: null,
        baselineHiringCompanies: null,
        signalAsOf: null,
        signalStatus: null,
        currentMedianMonthlyUsd: null,
        baselineMedianMonthlyUsd: null,
        rawChangePercent: null,
        adjustedChangePercent: null,
        confidenceLowPercent: null,
        confidenceHighPercent: null,
        qValue: null,
        recentJobCount: null,
        baselineJobCount: null,
        recentEmployerCount: null,
        baselineEmployerCount: null,
        signalSince: null,
      },
    ]);
    const service = createService({
      getOverview: jest.fn().mockResolvedValue([
        metric({
          kind: "market",
          slug: "market",
          label: "Crypto Job Market",
        }),
        metric({ slug: "cl-sales", label: "SALES", activeJobs: "164" }),
      ]),
      getSkillSummaries,
      getClassificationSkillSummaries,
    });

    const result = await service.getMarketSkills(
      "remote",
      "breakout",
      "",
      "cl-sales",
    );

    expect(getClassificationSkillSummaries).toHaveBeenCalledWith(
      "cl-sales",
      "remote",
      "",
    );
    expect(getSkillSummaries).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: {
        methodologyVersion: "market-state-v3",
        classification: "cl-sales",
        classificationLabel: "Sales",
        skills: [
          {
            slug: "t-negotiation",
            activeJobs: 47,
            hiringCompanies: 33,
            openJobShare: 28.7,
            signal: null,
          },
        ],
      },
    });
  });
});
