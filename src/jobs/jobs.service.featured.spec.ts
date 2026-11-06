import { data } from "src/shared/types";
import { doubleZeroEdgeProjection } from "src/projects/fixtures/doublezero-edge.fixture";
import { JobsService } from "./jobs.service";

const instant = 1_794_000_000_000;
const hour = 3_600_000;
const job = (
  id: string,
  start: number,
  end: number,
  orgId = "fixture-org",
  featured = true,
): object => ({
  ...doubleZeroEdgeProjection.jobs[0],
  id,
  shortUUID: id,
  featured,
  featureStartDate: start,
  featureEndDate: end,
  organization: { ...doubleZeroEdgeProjection.organizations[0], orgId },
  project: null,
});

describe("featured organization job filtering", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(instant);
  });
  afterEach(() => jest.useRealTimers());

  it.each([undefined, "fixture-ecosystem"])(
    "preserves organization/date/featured filtering for ecosystem %s",
    async ecosystem => {
      const getJobsListResults = jest
        .fn()
        .mockResolvedValue([
          job("short", instant - hour, instant + hour),
          job("long", instant - 2 * hour, instant + 2 * hour),
          job("other-org", instant - hour, instant + hour, "other-org"),
          job(
            "not-featured",
            instant - hour,
            instant + hour,
            "fixture-org",
            false,
          ),
          job("future", instant + 1, instant + hour),
          job("expired", instant - hour, instant - 1),
          job("starts-now", instant, instant + hour),
          job("ends-now", instant - hour, instant),
        ]);
      const service = Object.assign(Object.create(JobsService.prototype), {
        getJobsListResults,
        logger: { error: jest.fn() },
      }) as JobsService;
      const response = await service.getFeaturedJobsByOrgId(
        ecosystem,
        "fixture-org",
      );
      expect(response.success).toBe(true);
      expect(data(response).map(item => item.id)).toEqual(["long", "short"]);
      expect(data(response).every(item => item.featured)).toBe(true);
      expect(getJobsListResults).toHaveBeenCalledWith(ecosystem);
    },
  );
});
