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

  it("proxies the canonical developer report with an all-history default", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report" as const,
      population: {
        label: "Verified internal contributors",
        definition: "Canonical internal employees",
        excludes: ["external contributors"],
      },
      current: null,
      history: [],
      range: {
        key: "all" as const,
        label: "Since inception",
        from: "2008-01-01",
        to: "2026-07-01",
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
      params: { cohort: "fintech", range: "all" },
    });
  });

  it("proxies a chain-scoped report without adding a cohort", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report" as const,
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
      repositoryHistory: [],
      organizations: [],
      movements: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReport({ chain: "ethereum" }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { chain: "ethereum", range: "all" },
    });
  });

  it("defaults the report to the complete all-sector corpus", async () => {
    const response = {
      available: true,
      asOf: "2026-07-01T00:00:00.000Z",
      completeThrough: "2026-07-01",
      methodologyVersion: "developer-report" as const,
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
      repositoryHistory: [],
      organizations: [],
      movements: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.developerReport()).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { cohort: "all", range: "all" },
    });
  });

  it("returns a complete fallback while scorer materializations refresh", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReport({ cohort: "ai" }),
    ).resolves.toMatchObject({
      available: false,
      methodologyVersion: "developer-report",
      range: { key: "all", label: "Since inception" },
      scope: { type: "cohort", key: "ai" },
      corpus: {
        indexedCommitRecords: 0,
        historicalInternalPeople: 0,
        currentInternalPeople: 0,
      },
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
