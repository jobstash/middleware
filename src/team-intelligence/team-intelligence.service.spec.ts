import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { of, throwError } from "rxjs";
import { TeamIntelligenceService } from "./team-intelligence.service";
import { TeamSnapshot } from "./team-intelligence.types";

const snapshot: TeamSnapshot = {
  snapshotVersion: 2,
  available: true,
  asOf: "2026-08-07T12:00:00.000Z",
  organizations: [
    {
      organizationId: "org-acme",
      organizationName: "Acme",
      organizationSlug: "acme",
      githubOrganizations: ["acme"],
      coverageStatus: "current",
      asOf: "2026-08-07T12:00:00.000Z",
      currentMaintainerCount: 7,
      activeLeadCount: 4,
      newActiveLeadCount: 2,
      steppedDownLeadCount: 0,
      movedLeadCount: 1,
      earlyLeadDepartureCount: 0,
      latestThreeMonthAverageActiveDevelopers: 8,
      priorThreeMonthAverageActiveDevelopers: 6,
      developerGrowth: true,
      growthReasons: ["developer_growth"],
    },
  ],
};

describe("TeamIntelligenceService", () => {
  it("forwards team filters to the authoritative scorer snapshot", async () => {
    const post = jest.fn().mockReturnValue(of({ data: snapshot }));
    const service = new TeamIntelligenceService({
      post,
    } as unknown as HttpService);

    await expect(
      service.matchingOrganizationIds({
        minCurrentMaintainers: 3,
        maxCurrentMaintainers: 10,
        minActiveLeads: 2,
        maxActiveLeads: 8,
        newActiveLeads: true,
        steppedDownLeads: false,
        movedLeads: true,
        earlyLeadDepartures: false,
      }),
    ).resolves.toEqual(["org-acme"]);
    expect(post).toHaveBeenCalledWith(
      "/scorer/organizations/team-signals/snapshot",
      {
        currentMaintainersMin: 3,
        currentMaintainersMax: 10,
        activeLeadsMin: 2,
        activeLeadsMax: 8,
        newActiveLeads: true,
        steppedDownLeads: false,
        movedLeads: true,
        earlyLeadDepartures: false,
      },
    );
  });

  it("does not call scorer when no team filter is active", async () => {
    const post = jest.fn();
    const service = new TeamIntelligenceService({
      post,
    } as unknown as HttpService);

    await expect(
      service.matchingOrganizationIds({
        minCurrentMaintainers: 0,
        maxCurrentMaintainers: null,
      }),
    ).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it("clears any projected team values when ClickHouse has no summary", () => {
    const service = new TeamIntelligenceService({} as HttpService);

    expect(
      service.applySummary({
        orgId: "org-acme",
        teamCoverageStatus: "current",
        currentMaintainerCount: 99,
        newActiveLeadCount: 99,
      }),
    ).toMatchObject({
      teamCoverageStatus: null,
      teamSignalsAsOf: null,
      currentMaintainerCount: null,
      activeLeadCount: null,
      newActiveLeadCount: null,
      steppedDownLeadCount: null,
      movedLeadCount: null,
      earlyLeadDepartureCount: null,
    });
  });

  it("suppresses every nonzero public organization cohort below k=5", () => {
    const service = new TeamIntelligenceService({} as HttpService);

    expect(
      service.applySummary({ orgId: "org-acme" }, snapshot.organizations[0]),
    ).toMatchObject({
      currentMaintainerCount: 7,
      activeLeadCount: null,
      newActiveLeadCount: null,
      steppedDownLeadCount: 0,
      movedLeadCount: null,
      earlyLeadDepartureCount: 0,
      latestThreeMonthAverageActiveDevelopers: 8,
      priorThreeMonthAverageActiveDevelopers: 6,
      developerGrowth: true,
      growingCompanyReasons: ["developer_growth"],
    });
  });

  it("combines aggregate developer growth with PostgreSQL funding state", () => {
    const service = new TeamIntelligenceService({} as HttpService);

    expect(
      service.applySummary(
        { orgId: "org-acme", recentlyFunded: true },
        snapshot.organizations[0],
      ),
    ).toMatchObject({
      growingCompanyReasons: ["developer_growth", "recently_funded"],
    });
    expect(
      service.applySummary({ orgId: "org-funded", recentlyFunded: true }),
    ).toMatchObject({ growingCompanyReasons: ["recently_funded"] });
  });

  it("ignores team filters when the authoritative snapshot is unavailable", async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          snapshotVersion: 2,
          available: false,
          asOf: null,
          organizations: [],
        },
      }),
    );
    const service = new TeamIntelligenceService({
      post,
    } as unknown as HttpService);

    await expect(
      service.matchingOrganizationIds({ newActiveLeads: true }),
    ).resolves.toBeUndefined();
  });

  it("maps scorer 404s to a missing team detail", async () => {
    const error = new AxiosError("not found", undefined, undefined, undefined, {
      status: 404,
    } as never);
    const get = jest.fn().mockReturnValue(throwError(() => error));
    const service = new TeamIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.getDetails("org-missing")).resolves.toBeUndefined();
  });
});
