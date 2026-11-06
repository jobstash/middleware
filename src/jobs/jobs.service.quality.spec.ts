import { data } from "src/shared/types";
import { JobsService } from "./jobs.service";
import { AllJobListResultEntity, JobMatchCategory } from "src/shared/entities";
import { AllJobsParams } from "./dto/all-jobs.input";

function fixture(): {
  service: JobsService;
  jobGraph: { getJobTagMatchData: jest.Mock };
} {
  const jobGraph = { getJobTagMatchData: jest.fn() };
  const service = new JobsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    jobGraph as never,
    {} as never,
    {} as never,
  );
  return { service, jobGraph };
}

describe("JobsService query and match score contracts", () => {
  afterEach(() => jest.restoreAllMocks());

  it("matches case-insensitive regexes across organization, title, and tags", async () => {
    const { service } = fixture();
    const records = [
      { organization: { name: "BUILD" }, title: "other", tags: [] },
      { organization: { name: "BUILD" }, title: "other", tags: [] },
      { organization: { name: "other" }, title: "Builder", tags: [] },
      {
        organization: { name: "other" },
        title: "other",
        tags: [{ name: "no" }, { name: "building" }],
      },
      { organization: { name: "other" }, title: "other", tags: [] },
      { organization: null, title: "BUILD", tags: [] },
    ];
    jest
      .spyOn(service, "getAllJobsListResults")
      .mockResolvedValue(records as never);
    const hydrate = jest
      .spyOn(AllJobListResultEntity.prototype, "getProperties")
      .mockReturnValue({} as never);
    const result = await service.getAllJobsWithSearch(
      Object.assign(new AllJobsParams(), { query: "^build" }),
    );
    expect(result.data).toHaveLength(4);
    expect(hydrate).toHaveBeenCalledTimes(4);
  });

  it("does not turn malformed regex input into an empty successful search", async () => {
    const { service } = fixture();
    const load = jest.spyOn(service, "getAllJobsListResults");
    await expect(
      service.getAllJobsWithSearch(
        Object.assign(new AllJobsParams(), { query: "[" }),
      ),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(load).not.toHaveBeenCalled();
  });

  it.each<[number, number, JobMatchCategory]>([
    [11, 0.55, JobMatchCategory.STRONG_FIT],
    [10, 0.5, JobMatchCategory.PARTIAL_FIT],
    [5, 0.25, JobMatchCategory.PARTIAL_FIT],
    [4, 0.2, JobMatchCategory.UNLIKELY_FIT],
    [0, 0, JobMatchCategory.UNLIKELY_FIT],
  ])(
    "retains rounded category thresholds for %s matches",
    async (matched, score, category) => {
      const { service, jobGraph } = fixture();
      const tags = Array.from({ length: 20 }, (_, index) => `tag-${index}`);
      jobGraph.getJobTagMatchData.mockResolvedValue({
        jobTags: tags,
        tagMappings: [],
        allTags: tags.map(name => ({ id: name, name, normalizedName: name })),
      });
      const skills = [
        ...tags.slice(0, matched),
        ...Array.from(
          { length: 20 - matched },
          (_, index) => `unrelated-${index}`,
        ),
      ];
      const ordinary = await service.getJobMatchScore("job", skills, false);
      const expert = await service.getJobMatchScore("job", skills, true);
      expect(data(ordinary)).toMatchObject({ score, category });
      expect(data(ordinary).matchedSkills).toHaveLength(matched);
      expect(expert).toEqual(ordinary);
    },
  );
});
