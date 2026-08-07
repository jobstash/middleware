import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { of, throwError } from "rxjs";
import { TeamIntelligenceService } from "./team-intelligence.service";
import { TeamSnapshot } from "./team-intelligence.types";

const snapshot: TeamSnapshot = {
  snapshotVersion: 1,
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
      newMaintainerCount: 2,
      movedMaintainerCount: 1,
      earlyMovedMaintainerCount: 0,
      growingTeam: true,
      shrinkingTeam: false,
      earlyTeamShrinkage: false,
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
        growingTeam: true,
        shrinkingTeam: false,
      }),
    ).resolves.toEqual(["org-acme"]);
    expect(post).toHaveBeenCalledWith(
      "/scorer/organizations/team-signals/snapshot",
      {
        currentMaintainersMin: 3,
        currentMaintainersMax: 10,
        growingTeam: true,
        shrinkingTeam: false,
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
        growingTeam: true,
      }),
    ).toMatchObject({
      teamCoverageStatus: null,
      teamSignalsAsOf: null,
      currentMaintainerCount: null,
      growingTeam: null,
      shrinkingTeam: null,
      earlyTeamShrinkage: null,
    });
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
