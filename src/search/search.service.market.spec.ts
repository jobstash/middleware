import { JobMarketRepository } from "src/postgres/job-market.repository";
import { SearchRepository } from "src/postgres/search.repository";
import { SearchService } from "./search.service";

const metric = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

describe("SearchService job-market intelligence", () => {
  const createService = (repository: Partial<JobMarketRepository>) =>
    new SearchService(
      {} as SearchRepository,
      {} as never,
      repository as JobMarketRepository,
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
        }),
        metric({ currentWindowJobs: "21", previousWindowJobs: "14" }),
        metric({
          slug: "cl-frontend",
          label: "Frontend",
          currentWindowJobs: "7",
          previousWindowJobs: "21",
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
});
