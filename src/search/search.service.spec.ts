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
    const getSummariesById = jest.fn().mockResolvedValue(
      new Map([
        [
          "org-1",
          {
            organizationId: "org-1",
            currentMaintainerCount: 3,
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
            growingTeam: false,
            shrinkingTeam: true,
            earlyTeamShrinkage: true,
          },
        ],
      ]),
    );
    const service = new SearchService(
      {
        getPillarConfigs,
      } as unknown as SearchRepository,
      {
        hasFilters: jest.fn().mockReturnValue(false),
        getSummariesById,
      } as never,
    );

    const result = await service.searchPillarFilters(
      {
        nav: "organizations",
      } as never,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(getSummariesById).toHaveBeenCalledWith(["org-1", "org-2"]);
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
          label: "Growing Maintainer Team",
          paramKey: "growingTeam",
        }),
        expect.objectContaining({
          label: "Maintainer Moves",
          paramKey: "shrinkingTeam",
        }),
        expect.objectContaining({
          label: "Early-Team Moves",
          paramKey: "earlyTeamShrinkage",
        }),
        expect.objectContaining({
          label: "Recently Funded",
          paramKey: "recentlyFunded",
        }),
      ]),
    );
  });
});
