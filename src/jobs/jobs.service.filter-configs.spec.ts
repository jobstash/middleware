import { JobsService } from "./jobs.service";

describe("JobsService filter configuration cache", () => {
  it("coalesces cold loads and serves the complete warm result", async () => {
    const getJobFilterValues = jest.fn().mockResolvedValue({
      workModes: ["remote", "hybrid", "onsite"],
      workModeLabels: {
        remote: "Remote",
        hybrid: "Hybrid",
        onsite: "Onsite",
      },
      teamOrganizationIds: [],
    });
    const getPopularTags = jest.fn().mockResolvedValue([{ name: "Solidity" }]);
    const cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new JobsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getJobFilterValues } as never,
      {} as never,
      { getPopularTags } as never,
      {
        getMaintainerRanges: jest.fn().mockResolvedValue({
          available: false,
          current: { minimum: null, maximum: null },
          active: { minimum: null, maximum: null },
        }),
      } as never,
      cache as never,
    );

    const [first, concurrent] = await Promise.all([
      service.getFilterConfigs(),
      service.getFilterConfigs(),
    ]);

    expect(concurrent).toEqual(first);
    expect(getJobFilterValues).toHaveBeenCalledTimes(1);
    expect(getPopularTags).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      "jobs:filter-configs:global",
      first,
      900_000,
    );

    cache.get.mockResolvedValue(first);
    await expect(service.getFilterConfigs()).resolves.toEqual(first);
    expect(getJobFilterValues).toHaveBeenCalledTimes(1);
    expect(first.workModes.options).toEqual([
      { label: "100% Remote", value: "fully-remote" },
      { label: "Hybrid", value: "hybrid" },
      { label: "Onsite", value: "onsite" },
      { label: "Remote", value: "remote" },
    ]);
  });
});
