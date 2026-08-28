import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Auth0Service } from "src/auth0/auth0.service";
import { PostgresService } from "src/postgres/postgres.service";
import { OrganizationsService } from "./organizations.service";

describe("OrganizationsService ingestion status isolation", () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === "GITHUB_INDEXER_STATUS_URL") {
        return "https://indexer.example/observability";
      }
      if (key === "GITHUB_INDEXER_STATUS_TOKEN") return "indexer-token";
      if (key === "ETL_DOMAIN") return "https://etl.example";
      return undefined;
    }),
  } as unknown as ConfigService;
  const auth0 = {
    getETLToken: jest.fn().mockResolvedValue("etl-token"),
  } as unknown as Auth0Service;
  const postgres = { query: jest.fn() } as unknown as PostgresService;

  const service = (): OrganizationsService =>
    new OrganizationsService(
      config,
      auth0,
      {} as never,
      {} as never,
      postgres,
      {} as never,
    );

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("returns live GitHub runtime metrics when lifecycle storage is unavailable", async () => {
    (postgres.query as jest.Mock).mockRejectedValueOnce(
      new Error("lifecycle table unavailable"),
    );
    jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        generatedAt: "2026-08-27T19:00:00.000Z",
        clickhouse: { totalRows: 10 },
      },
    });

    await expect(service().getGithubIngestionStatus()).resolves.toMatchObject({
      lifecycleAvailable: false,
      lifecycleError: "lifecycle table unavailable",
      runtimeAvailable: true,
      runtime: { clickhouse: { totalRows: 10 } },
    });
  });

  it("returns catalog counters when ETL job metrics are unavailable", async () => {
    (postgres.query as jest.Mock).mockResolvedValueOnce([
      { activeJobsites: 7, totalJobs: 11, dailyJobViewers: 3 },
    ]);
    jest.spyOn(axios, "get").mockRejectedValueOnce(new Error("ETL offline"));

    await expect(service().getJobIngestionStatus()).resolves.toMatchObject({
      catalogAvailable: true,
      available: false,
      activeJobsites: 7,
      totalJobs: 11,
      dailyJobViewers: 3,
    });
  });
});
