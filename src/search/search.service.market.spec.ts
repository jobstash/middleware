import {
  JobMarketGeographyRow,
  JobMarketMetricRow,
  JobMarketRepository,
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
  salarySampleCount: "12",
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
  regionSlug: "local",
  regionLabel: "All local markets",
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
        getLatestSkillSignals: jest.fn().mockResolvedValue([]),
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

  it("suppresses salaries below ten samples", async () => {
    const service = createService({
      getPillarHistory: jest
        .fn()
        .mockResolvedValue([metric({ salarySampleCount: "9" })]),
    });
    const result = await service.getPillarMarket("cl-backend");
    expect(result).toMatchObject({
      data: {
        current: {
          salary: {
            reliable: false,
            sampleCount: 9,
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

  it("serves canonical classification labels and withholds sparse geography", async () => {
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
          salarySampleCount: "9",
          employerCount: "8",
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
            reliable: false,
            medianMonthlyUsd: null,
            sampleCount: 9,
            employerCount: 8,
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
});
