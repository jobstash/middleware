import { JobsService } from "src/jobs/jobs.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { ProjectsService } from "src/projects/projects.service";
import { DateRange } from "src/shared/types";
import { publicationDateRangeGenerator } from "./helpers";

const emptyPage = { page: 1, count: 0, total: 0, data: [] };

describe("filter service contracts", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    "today",
    "this-week",
    "this-month",
    "past-2-weeks",
    "past-3-months",
    "past-6-months",
  ] as DateRange[])(
    "maps job publication range %s to SQL bounds",
    async publicationDate => {
      jest.useFakeTimers().setSystemTime(new Date("2026-07-12T12:00:00Z"));
      const searchJobs = jest.fn().mockResolvedValue(emptyPage);
      const service = new JobsService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { searchJobs } as never,
        {} as never,
        {} as never,
      );

      await service.getJobsListWithSearch({
        publicationDate,
        tags: ["Solidity"],
        page: 2,
        limit: 20,
        query: null,
      });

      expect(searchJobs).toHaveBeenCalledWith({
        ...publicationDateRangeGenerator(publicationDate),
        publicationDate,
        tags: ["Solidity"],
        page: 2,
        limit: 20,
        query: null,
      });
    },
  );

  it("passes null publication bounds without dropping other job filters", async () => {
    const searchJobs = jest.fn().mockResolvedValue(emptyPage);
    const service = new JobsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { searchJobs } as never,
      {} as never,
      {} as never,
    );

    await service.getJobsListWithSearch({
      publicationDate: null,
      audits: false,
      expertJobs: false,
      query: null,
    });

    expect(searchJobs).toHaveBeenCalledWith({
      startDate: null,
      endDate: null,
      publicationDate: null,
      audits: false,
      expertJobs: false,
      query: null,
    });
  });

  it("scopes organization job lists in PostgreSQL", async () => {
    const getJobPayloads = jest.fn().mockResolvedValue([]);
    const service = new JobsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getJobPayloads } as never,
      {} as never,
      {} as never,
    );

    await service.getJobsByOrgId("org-1", "ethereum");

    expect(getJobPayloads).toHaveBeenCalledWith("ethereum", "org-1");
  });

  it("forwards every organization search argument and ecosystem header", async () => {
    const searchOrganizations = jest.fn().mockResolvedValue(emptyPage);
    const service = new OrganizationsService(
      {} as never,
      {} as never,
      { searchOrganizations } as never,
      {} as never,
      {} as never,
    );
    const params = {
      locations: ["berlin"],
      investors: ["paradigm"],
      fundingRounds: ["series-a"],
      tags: ["solidity"],
      names: ["acme"],
      chains: ["ethereum"],
      projects: ["alpha"],
      ecosystems: ["ethereum"],
      minHeadCount: 10,
      maxHeadCount: 100,
      hasJobs: true,
      hasProjects: false,
      page: 2,
      limit: 20,
      query: "acme",
      order: "desc" as const,
      orderBy: "rating" as const,
    };

    await service.searchOrganizations(params, "bondex");

    expect(searchOrganizations).toHaveBeenCalledWith({
      ...params,
      ecosystemHeader: "bondex",
    });
  });

  it.each([
    { hasAudits: true, hasHacks: true, hasToken: true },
    { hasAudits: false, hasHacks: false, hasToken: false },
  ])("maps project search aliases for $hasAudits booleans", async aliases => {
    const searchProjects = jest.fn().mockResolvedValue(emptyPage);
    const service = new ProjectsService(
      {} as never,
      {} as never,
      { searchProjects } as never,
      {} as never,
    );
    const params = {
      ...aliases,
      categories: ["defi"],
      minTvl: 100,
      page: 2,
      limit: 20,
      query: null,
    };

    await service.searchProjects(params, "bondex");

    expect(searchProjects).toHaveBeenCalledWith({
      ...params,
      audits: aliases.hasAudits,
      hacks: aliases.hasHacks,
      token: aliases.hasToken,
      ecosystemHeader: "bondex",
    });
  });

  it("forwards project list booleans without alias conversion", async () => {
    const searchProjects = jest.fn().mockResolvedValue(emptyPage);
    const service = new ProjectsService(
      {} as never,
      {} as never,
      { searchProjects } as never,
      {} as never,
    );
    const params = {
      audits: false,
      hacks: false,
      token: false,
      minTvl: 0,
      maxTvl: 100,
      query: null,
    };

    await service.getProjectsListWithSearch(params);

    expect(searchProjects).toHaveBeenCalledWith(params);
  });
});
