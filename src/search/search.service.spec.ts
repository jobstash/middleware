import { SearchRepository } from "src/postgres/search.repository";
import { publicationDateRangeGenerator } from "src/shared/helpers";
import { SearchService } from "./search.service";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";

describe("SearchService organization intelligence filters", () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    { available: ["tags", "jobs"], requested: "tags", expected: "tags" },
    { available: ["tags", "jobs"], requested: "investors", expected: "jobs" },
    { available: ["tags"], requested: "investors", expected: "tags" },
    { available: [], requested: undefined, expected: "jobs" },
  ])(
    "selects suggestion group $expected for $available and $requested",
    async ({ available, requested, expected }) => {
      const getSuggestionItems = jest.fn().mockResolvedValue([]);
      const service = new SearchService(
        {
          getSuggestionGroups: jest.fn().mockResolvedValue(available),
          getSuggestionItems,
        } as unknown as SearchRepository,
        {} as never,
        {} as never,
      );
      await service.getJobSuggestions({
        q: "rust",
        group: requested,
      } as never);
      expect(getSuggestionItems).toHaveBeenCalledWith(
        expect.objectContaining({ group: expected }),
      );
    },
  );

  it("intersects list, numeric, and false boolean pillar filters without filtering the requested facet", async () => {
    const service = new SearchService(
      {
        getPillarConfigs: jest.fn().mockResolvedValue([
          { names: ["Match"], tags: ["Rust"], tvl: 5, audits: false },
          { names: ["Wrong tag"], tags: ["Solidity"], tvl: 5, audits: false },
          { names: ["Below range"], tags: ["Rust"], tvl: 1, audits: false },
          { names: ["Wrong boolean"], tags: ["Rust"], tvl: 5, audits: true },
          { names: ["Above range"], tags: ["Rust"], tvl: 20, audits: false },
        ]),
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    const pillar = await service.getPillar(
      Object.assign(new SearchPillarFiltersParams(), {
        nav: "projects",
        pillar: "names",
        names: ["ignored-facet"],
        tags: ["rust"],
        minTvl: 2,
        maxTvl: 10,
        hasAudits: false,
      }),
      undefined,
    );
    expect(pillar?.items).toEqual(["Match"]);
  });

  it("names the job suggestion tabs clearly and returns canonical category labels", async () => {
    const getSuggestionGroups = jest
      .fn()
      .mockResolvedValue(["jobs", "classifications"]);
    const getSuggestionItems = jest.fn().mockResolvedValue([
      {
        id: "forward-deployed-engineer",
        label: "FORWARD_DEPLOYED_ENGINEER",
        href: "/cl-forward-deployed-engineer",
      },
    ]);
    const service = new SearchService(
      {
        getSuggestionGroups,
        getSuggestionItems,
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    await expect(
      service.getJobSuggestions({
        q: "forward",
        group: "classifications",
        page: 1,
        limit: 5,
      }),
    ).resolves.toMatchObject({
      groups: [
        { id: "jobs", label: "Job Titles" },
        { id: "classifications", label: "Job Category" },
      ],
      activeGroup: "classifications",
      items: [
        {
          id: "forward-deployed-engineer",
          label: "Forward Deployed Engineer",
          href: "/cl-forward-deployed-engineer",
        },
      ],
    });
  });

  it("keeps the canonical zero-job FDE pillar available but noindex", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-28T12:00:00Z"));
    const getPillarJobs = jest.fn().mockResolvedValue([]);
    const service = new SearchService(
      {
        getPillarJobs,
      } as unknown as SearchRepository,
      { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
    );

    await expect(
      service.getPillarPageData("cl-forward-deployed-engineer"),
    ).resolves.toMatchObject({
      success: true,
      data: {
        title: "Forward Deployed Engineer Jobs - Web3 & Crypto Careers",
        jobs: [],
        indexing: "noindex",
        hasEligibleOpenJobs: false,
      },
    });
    expect(getPillarJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        ...publicationDateRangeGenerator("past-3-months"),
        limit: 100,
      }),
    );
  });

  it("restores required fields on legacy work-arrangement options", async () => {
    const getPillarJobs = jest.fn().mockResolvedValue([
      {
        workArrangement: {
          classification: "verified_onsite",
          fullyRemote: false,
          remoteOptions: [],
          hybridOptions: [],
          onsiteOptions: [
            {
              scope: "unstated",
              includedCountries: [],
              excludedCountries: [],
              includedRegions: [],
              excludedRegions: [],
              requiredUtcBand: {
                minimumMinutes: -180,
                maximumMinutes: 330,
              },
              preferredUtcBand: null,
              residencyRequirements: [],
              workAuthorizationRequirements: [],
              sponsorshipStatus: "unstated",
              officeCity: "Stockholm",
              attendanceCadence: null,
              travelRequirement: null,
              confidence: "source_stated",
            },
          ],
        },
      },
    ]);
    const service = new SearchService(
      { getPillarJobs } as unknown as SearchRepository,
      { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
    );

    await expect(
      service.getPillarPageData("cl-forward-deployed-engineer"),
    ).resolves.toMatchObject({
      success: true,
      data: {
        jobs: [
          {
            workArrangement: {
              onsiteOptions: [
                {
                  classification: "verified_onsite",
                  mode: "onsite",
                  requiredUtcBand: {
                    minimumUtcOffset: -3,
                    maximumUtcOffset: 5.5,
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  it.each([
    ...["Intern", "Junior", "Senior", "Lead", "Head"].flatMap(
      (label, index) => [
        { seniority: index + 1, expected: label },
        { seniority: (index + 1).toString(), expected: label },
        { seniority: label, expected: label },
      ],
    ),
    { seniority: null, expected: null },
    { seniority: undefined, expected: null },
    { seniority: "", expected: "" },
    { seniority: "Staff", expected: "Staff" },
  ])(
    "preserves supported seniority $seniority",
    async ({ seniority, expected }) => {
      const service = new SearchService(
        {
          getPillarJobs: jest.fn().mockResolvedValue([{ seniority }]),
        } as never,
        { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
        {} as never,
      );
      await expect(
        service.getPillarPageData("cl-forward-deployed-engineer"),
      ).resolves.toMatchObject({
        success: true,
        data: { jobs: [expect.objectContaining({ seniority: expected })] },
      });
    },
  );

  it.each(
    [{}, ["3"], true, 0, 6, Number.NaN].map(seniority => ({ seniority })),
  )(
    "rejects malformed seniority $seniority without returning a job",
    async ({ seniority }) => {
      const service = new SearchService(
        {
          getPillarJobs: jest.fn().mockResolvedValue([{ seniority }]),
        } as never,
        { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
        {} as never,
      );
      await expect(
        service.getPillarPageData("cl-forward-deployed-engineer"),
      ).resolves.toEqual({
        success: false,
        message: "Error retrieving pillar page data",
      });
    },
  );

  it.each([
    { aliases: "Acme", expected: ["Acme"] },
    { aliases: ["Acme", "Acme Labs"], expected: ["Acme", "Acme Labs"] },
    { aliases: null, expected: [] },
    { aliases: undefined, expected: [] },
  ])(
    "preserves textual or absent organization aliases $aliases",
    async ({ aliases, expected }) => {
      const service = new SearchService(
        {
          getOrganizationPillar: jest.fn().mockResolvedValue({
            orgId: "acme",
            name: "Acme",
            aliases,
          }),
          getPillarJobs: jest.fn().mockResolvedValue([]),
        } as never,
        { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
        {} as never,
      );
      await expect(service.getPillarPageData("o-acme")).resolves.toMatchObject({
        success: true,
        data: { organization: { aliases: expected } },
      });
    },
  );

  it.each(
    [{}, ["Acme", {}], [["Acme"]], [null], 42].map(aliases => ({ aliases })),
  )("rejects malformed organization aliases $aliases", async ({ aliases }) => {
    const service = new SearchService(
      {
        getOrganizationPillar: jest.fn().mockResolvedValue({
          orgId: "acme",
          name: "Acme",
          aliases,
        }),
        getPillarJobs: jest.fn().mockResolvedValue([]),
      } as never,
      { getSummariesById: jest.fn().mockResolvedValue(new Map()) } as never,
      {} as never,
    );
    await expect(service.getPillarPageData("o-acme")).resolves.toEqual({
      success: false,
      message: "Error retrieving pillar page data",
    });
  });

  it.each(["Solidity", ["Solidity"]].map(tags => ({ tags })))(
    "matches scalar and array facet labels $tags",
    ({ tags }) => {
      const service = new SearchService({} as never, {} as never, {} as never);
      const configs = [{ tags }];
      expect(
        service["filterConfigs"](configs, { tags: ["solidity"] } as never),
      ).toEqual(configs);
      expect(service["collectValues"](configs, "tags")).toEqual(["Solidity"]);
    },
  );

  it.each([{}, ["Solidity", {}], [null]].map(tags => ({ tags })))(
    "rejects malformed facet labels $tags",
    ({ tags }) => {
      const service = new SearchService({} as never, {} as never, {} as never);
      expect(() =>
        service["filterConfigs"]([{ tags }], { tags: ["solidity"] } as never),
      ).toThrow(TypeError);
      expect(() => service["collectValues"]([{ tags }], "tags")).toThrow(
        TypeError,
      );
    },
  );

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

  it("reuses the global pillar snapshot across requests", async () => {
    const getPillarConfigs = jest
      .fn()
      .mockResolvedValue([{ tags: ["solidity"] }]);
    const service = new SearchService(
      { getPillarConfigs } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );

    await service.fetchPillarItemLabels({
      nav: "jobs",
      pillars: ["tags"],
      slugs: ["solidity"],
    } as never);
    await service.searchPillarFilters({ nav: "jobs" } as never, undefined);

    expect(getPillarConfigs).toHaveBeenCalledTimes(1);
  });

  it("uses the single-field index while preserving all pillar facets", async () => {
    const service = new SearchService(
      {
        getPillarConfigs: jest.fn().mockResolvedValue([
          {
            names: ["Alpha"],
            tags: ["Solidity"],
            categories: ["DeFi"],
            chains: ["Ethereum"],
          },
          {
            names: ["Beta"],
            tags: ["Rust"],
            categories: ["Infrastructure"],
            chains: ["Solana"],
          },
        ]),
        getStoredPillarText: jest.fn().mockResolvedValue({
          title: "Solidity projects",
          description: "Projects using Solidity",
        }),
      } as unknown as SearchRepository,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      filterConfigs: (
        configs: Record<string, unknown>[],
        params: unknown,
        excludedField?: string,
      ) => Record<string, unknown>[];
    };
    const filterConfigs = jest.spyOn(internals, "filterConfigs");

    const result = await service.searchPillar(
      {
        nav: "projects",
        pillar: "tags",
        item: "solidity",
        tags: ["solidity"],
      } as never,
      undefined,
    );

    expect(filterConfigs).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      data: {
        activePillar: { slug: "tags", items: ["Solidity", "Rust"] },
        altPillars: expect.arrayContaining([
          expect.objectContaining({ slug: "categories", items: ["DeFi"] }),
          expect.objectContaining({ slug: "chains", items: ["Ethereum"] }),
          expect.objectContaining({ slug: "names", items: ["Alpha"] }),
        ]),
      },
    });
  });
  it("paginates every fuzzy pillar match rather than fuzzysort's default first ten", async () => {
    const service = new SearchService(
      {} as SearchRepository,
      {} as never,
      {} as never,
    );
    const items = Array.from(
      { length: 25 },
      (_, index) => `Match${String(index).padStart(2, "0")}`,
    );
    jest.spyOn(service, "getPillar").mockResolvedValue({
      slug: "names",
      label: "Names",
      items,
    });

    const pages = await Promise.all(
      [1, 2, 3].map(page =>
        service.searchPillarItems(
          Object.assign(new SearchPillarItemParams(), {
            nav: "projects",
            pillar: "names",
            query: "Match",
            page,
            limit: 10,
          }),
          undefined,
        ),
      ),
    );
    expect(pages[2]).toMatchObject({ page: 3, count: 5, total: 25 });
    expect(pages.map(page => page.total)).toEqual([25, 25, 25]);
    expect(pages.flatMap(page => page.data).sort()).toEqual(items.sort());
  });
});
