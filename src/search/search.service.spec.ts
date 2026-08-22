import { SearchRepository } from "src/postgres/search.repository";
import { SearchService } from "./search.service";

describe("SearchService organization intelligence filters", () => {
  it("links current-stage navigation to the working organization filter route", async () => {
    const service = new SearchService(
      {
        getNavigationFacets: jest
          .fn()
          .mockResolvedValue([{ pillar: "fundingStages", label: "Series A" }]),
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    await expect(
      service.search({ nav: "organizations" } as never),
    ).resolves.toMatchObject({
      organizations: {
        fundingStages: [
          {
            value: "Series A",
            link: "/organizations/fundingStages/series-a",
          },
        ],
      },
    });
  });

  it("returns current-stage and independent maintainer filters", async () => {
    const getPillarConfigs = jest.fn().mockResolvedValue([
      {
        organizationId: "org-1",
        fundingStages: ["Seed"],
        recentlyFunded: true,
      },
      {
        organizationId: "org-2",
        fundingStages: ["Series A"],
        recentlyFunded: false,
      },
    ]);
    const getSummaryStateById = jest.fn().mockResolvedValue({
      available: true,
      summaries: new Map([
        [
          "org-1",
          {
            organizationId: "org-1",
            currentMaintainerCount: 3,
            activeLeadCount: 2,
            newActiveLeadCount: 1,
            steppedDownLeadCount: 0,
            movedLeadCount: 1,
            earlyLeadDepartureCount: 0,
            growingTeam: true,
            shrinkingTeam: false,
            earlyTeamShrinkage: false,
          },
        ],
        [
          "org-2",
          {
            organizationId: "org-2",
            currentMaintainerCount: 12,
            activeLeadCount: 5,
            newActiveLeadCount: 0,
            steppedDownLeadCount: 1,
            movedLeadCount: 0,
            earlyLeadDepartureCount: 1,
            growingTeam: false,
            shrinkingTeam: true,
            earlyTeamShrinkage: true,
          },
        ],
      ]),
    });
    const service = new SearchService(
      {
        getPillarConfigs,
      } as unknown as SearchRepository,
      {
        getSummaryStateById,
      } as never,
      {} as never,
    );

    const result = await service.searchPillarFilters(
      {
        nav: "organizations",
      } as never,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(getSummaryStateById).toHaveBeenCalledWith(["org-1", "org-2"]);
    if (!("data" in result)) throw new Error("Expected filter data");
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Current Funding Stage",
          paramKey: "fundingStages",
          options: [
            { label: "Seed", value: "seed" },
            { label: "Series A", value: "series-a" },
          ],
        }),
        expect.objectContaining({
          label: "Current Maintainers",
          min: { value: 3, paramKey: "minCurrentMaintainers" },
          max: { value: 12, paramKey: "maxCurrentMaintainers" },
        }),
        expect.objectContaining({
          label: "Active Leads",
          min: { value: 2, paramKey: "minActiveLeads" },
          max: { value: 5, paramKey: "maxActiveLeads" },
        }),
        expect.objectContaining({
          label: "New Active Leads",
          paramKey: "newActiveLeads",
        }),
        expect.objectContaining({
          label: "Lead Step-Downs",
          paramKey: "steppedDownLeads",
        }),
        expect.objectContaining({
          label: "Lead Movements",
          paramKey: "movedLeads",
        }),
        expect.objectContaining({
          label: "Early Lead Departures",
          paramKey: "earlyLeadDepartures",
        }),
        expect.objectContaining({
          label: "Recently Funded",
          paramKey: "recentlyFunded",
        }),
      ]),
    );
  });

  it("keeps collaboration-hour keys stable while exposing plain UTC labels", async () => {
    const service = new SearchService(
      {
        getPillarConfigs: jest
          .fn()
          .mockResolvedValue([{ collaborationHours: ["utc-08", "utc-17"] }]),
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    const result = await service.searchPillarFilters(
      { nav: "jobs" } as never,
      undefined,
    );

    expect(result.success).toBe(true);
    if (!("data" in result)) throw new Error("Expected filter data");
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Likely Team Collaboration Hours (UTC)",
          paramKey: "collaborationHours",
          options: [
            { label: "08:00 UTC", value: "utc-08" },
            { label: "17:00 UTC", value: "utc-17" },
          ],
        }),
      ]),
    );
  });

  it("resolves collaboration-hour pillar slugs to plain UTC labels", async () => {
    const service = new SearchService(
      {
        getPillarConfigs: jest
          .fn()
          .mockResolvedValue([{ collaborationHours: ["utc-08"] }]),
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    await expect(
      service.fetchPillarItemLabels({
        nav: "jobs",
        pillars: ["collaborationHours"],
        slugs: ["utc-08"],
      } as never),
    ).resolves.toMatchObject({
      success: true,
      data: [{ slug: "utc-08", label: "08:00 UTC" }],
    });
  });
});
