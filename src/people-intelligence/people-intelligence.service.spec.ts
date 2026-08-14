import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { of, throwError } from "rxjs";
import { PeopleIntelligenceService } from "./people-intelligence.service";

describe("PeopleIntelligenceService", () => {
  it("forwards public activity-map parameters to scorer", async () => {
    const response = {
      available: true,
      asOf: "2026-08-01T00:00:00.000Z",
      metric: "commits" as const,
      page: 2,
      limit: 250,
      total: 7000,
      rows: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.activityMap({ metric: "commits", page: 2, limit: 250 }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/activity-map", {
      params: { metric: "commits", page: 2, limit: 250 },
    });
  });

  it("returns an unavailable contract while a scorer model is absent", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.overview({ bucket: "quarter" })).resolves.toEqual({
      available: false,
      asOf: null,
      bucket: "quarter",
      points: [],
    });
  });

  it("proxies the complete-period developer report", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report-v1" as const,
      selectedCohort: "fintech" as const,
      cohorts: [],
      population: {
        label: "Verified internal contributors",
        definition: "Canonical internal employees",
        excludes: ["external contributors"],
      },
      current: null,
      history: [],
      retention: [],
      maintainerLeverage: {
        period: null,
        maintainerCount: 0,
        mergedPrCount: 0,
        medianAuthorsSupported: null,
        p25AuthorsSupported: null,
        p75AuthorsSupported: null,
      },
      organizations: [],
      movements: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReport({ cohort: "fintech" }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { cohort: "fintech" },
    });
  });

  it("proxies a chain-scoped v2 developer report without adding a cohort", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report-v2" as const,
      scope: {
        type: "chain" as const,
        key: "ethereum",
        label: "Ethereum",
        slug: "ethereum",
        logoUrl: null,
        overlapping: true,
      },
      scopes: { cohorts: [], chains: [] },
      coverage: {
        githubOrganizations: 100,
        chainMappedGithubOrganizations: 75,
        chainMappedPercent: 75,
        note: "Chain cohorts overlap.",
      },
      population: {
        label: "Verified internal contributors",
        definition: "Canonical internal employees",
        excludes: ["external contributors", "bots", "banned organizations"],
      },
      current: null,
      history: [],
      totals: { repositoryCount: 0, commitCount: 0 },
      repositoryHistory: [],
      breakdown: [],
      organizations: [],
      movements: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReportV2({ chain: "ethereum" }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report-v2", {
      params: { chain: "ethereum" },
    });
  });

  it("defaults the v2 report to the complete all-sector corpus", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report-v2" as const,
      scope: {
        type: "cohort" as const,
        key: "all",
        label: "All sectors",
        slug: null,
        logoUrl: null,
        overlapping: false,
      },
      scopes: { cohorts: [], chains: [] },
      coverage: {
        githubOrganizations: 0,
        chainMappedGithubOrganizations: 0,
        chainMappedPercent: 0,
        note: "",
      },
      population: {
        label: "Verified internal contributors",
        definition: "Canonical internal employees",
        excludes: ["external contributors", "bots", "banned organizations"],
      },
      current: null,
      history: [],
      totals: { repositoryCount: 0, commitCount: 0 },
      repositoryHistory: [],
      breakdown: [],
      organizations: [],
      movements: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.developerReportV2()).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report-v2", {
      params: { cohort: "all" },
    });
  });

  it("returns a complete v2 fallback while scorer materializations refresh", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReportV2({ cohort: "ai" }),
    ).resolves.toMatchObject({
      available: false,
      methodologyVersion: "developer-report-v2",
      scope: { type: "cohort", key: "ai" },
      corpus: {
        indexedCommitRecords: 0,
        historicalInternalPeople: 0,
        currentInternalPeople: 0,
      },
      totals: { repositoryCount: 0, commitCount: 0 },
      repositoryHistory: [],
    });
  });

  it("returns the movement-flow contract while scorer is unavailable", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.atlas({ organizationKey: "github:example", windowMonths: 36 }),
    ).resolves.toEqual({
      available: false,
      asOf: null,
      fromPeriod: null,
      toPeriod: null,
      focusOrganizationKey: "github:example",
      totalMovements: 0,
      visibleMovements: 0,
      organizations: [],
      flows: [],
    });
    expect(get).toHaveBeenCalledWith("/scorer/people/atlas", {
      params: { organizationKey: "github:example", windowMonths: 36 },
    });
  });

  it("preserves requested activity-map metadata in an unavailable response", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.activityMap({ metric: "commits", page: "2", limit: "250" }),
    ).resolves.toMatchObject({
      available: false,
      metric: "commits",
      page: 2,
      limit: 250,
    });
  });

  it("maps a missing scorer profile to a public 404 result", async () => {
    const error = new AxiosError("not found", undefined, undefined, undefined, {
      status: 404,
    } as never);
    const get = jest.fn().mockReturnValue(throwError(() => error));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.profile("missing-user")).resolves.toBeUndefined();
  });
});
