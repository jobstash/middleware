import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { of, throwError } from "rxjs";
import { PeopleIntelligenceService } from "./people-intelligence.service";
import type { DeveloperReport } from "./people-intelligence.types";

const reportResponse = (
  scope: {
    type: "overall" | "vertical" | "chain" | "vertical_chain";
    vertical: string | null;
    chain: string | null;
    label: string;
  } = {
    type: "overall",
    vertical: null,
    chain: null,
    label: "All developers",
  },
): DeveloperReport => ({
  available: true,
  asOf: "2026-07-01T00:00:00.000Z",
  completeThrough: "2026-07-01",
  methodologyVersion: "developer-report-v2" as const,
  range: {
    key: "max" as const,
    label: "Since inception",
    from: "2008-01-01",
    to: "2026-07-01",
  },
  summary: {
    allTimeIngestedCommitRows: 0,
    reportCommitRecords: 0,
    rawIndexedCommitRecords: 0,
    commitsWritten: 0,
    creditedOriginalCommits: 0,
    inheritedForkCommits: 0,
    inheritedUnattributedCopyCommits: 0,
    allContributors: 0,
    activeDevelopers: 0,
    internalDevelopers: 0,
    canonicalInternalPeople: 0,
    maintainers: 0,
    activeLeads: 0,
    organizations: 0,
    activeRepositories: 0,
    newDevelopers: 0,
    newRepositories: 0,
    newForkRepositories: 0,
    newUnattributedCopyRepositories: 0,
    internalDeveloperShare: 0,
  },
  scope: {
    ...scope,
    logoUrl: null,
    verticalsAreExclusive: true as const,
    chainsOverlap: Boolean(scope.chain),
  },
  scopes: {
    overall: {
      slug: "overall",
      label: "Overall",
      logoUrl: null,
      allContributors: 0,
      activeDevelopers: 0,
      internalDevelopers: 0,
      activeMaintainers: 0,
      activeLeads: 0,
      activeOrganizations: 0,
      activeRepositories: 0,
    },
    verticals: [],
    chains: [],
  },
  coverage: {
    organizationsTotal: 0,
    categorizedOrganizations: 0,
    unclassifiedOrganizations: 0,
    organizationPercent: 0,
    developersTotal: 0,
    categorizedDevelopers: 0,
    unclassifiedDevelopers: 0,
    developerPercent: 0,
    note: "Verticals are exclusive.",
  },
  population: {
    label: "Original-work developers",
    definition: "Canonical numeric GitHub authors",
    excludes: ["bots", "banned presentation organizations"],
  },
  current: null,
  history: [],
  top: { verticals: [], chains: [], organizations: [] },
  organizations: [],
});

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
    const response = reportResponse({
      type: "vertical",
      vertical: "fintech",
      chain: null,
      label: "Fintech",
    });
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReport({ vertical: "fintech" }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { vertical: "fintech", range: "max" },
    });
  });

  it("proxies combined vertical and chain scopes", async () => {
    const response = reportResponse({
      type: "vertical_chain",
      vertical: "crypto",
      chain: "ethereum",
      label: "Crypto · Ethereum",
    });
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.developerReport({ vertical: "crypto", chain: "ethereum" }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { vertical: "crypto", chain: "ethereum", range: "max" },
    });
  });

  it("uses slugify for chain aliases and prefers canonical duplicates", async () => {
    const response = reportResponse();
    const chain = (
      slug: string,
      activeDevelopers: number,
    ): DeveloperReport["scopes"]["chains"][number] => ({
      slug,
      label: slug,
      logoUrl: null,
      allContributors: activeDevelopers,
      activeDevelopers,
      internalDevelopers: 0,
      activeMaintainers: 0,
      activeLeads: 0,
      activeOrganizations: 1,
      activeRepositories: 1,
    });
    response.scopes.chains = [
      chain("opbnb", 315),
      chain("op_bnb", 203),
      chain("re.al", 78),
      chain("real", 78),
    ];
    response.top.chains = response.scopes.chains;
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({ get } as never);

    const report = await service.developerReport();

    expect(report.scopes.chains.map(scope => scope.slug)).toEqual([
      "opbnb",
      "real",
    ]);
    expect(report.scopes.chains[0].activeDevelopers).toBe(315);
    expect(report.top.chains.map(scope => scope.slug)).toEqual([
      "opbnb",
      "real",
    ]);
  });

  it("defaults the report to the complete all-sector corpus", async () => {
    const response = reportResponse();
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.developerReport()).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/developer-report", {
      params: { range: "max" },
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
      service.developerReport({ vertical: "ai" }),
    ).resolves.toMatchObject({
      available: false,
      methodologyVersion: "developer-report-v2",
      range: { key: "max", label: "Since inception" },
      scope: { type: "vertical", vertical: "ai" },
      summary: {
        rawIndexedCommitRecords: 0,
        creditedOriginalCommits: 0,
        activeDevelopers: 0,
      },
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
