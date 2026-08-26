import { JobListResultEntity } from "src/shared/entities";
import { ProfileService } from "./profile.service";

describe("ProfileService recommended jobs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("skips an invalid job instead of failing the feed", async () => {
    jest
      .spyOn(JobListResultEntity.prototype, "getProperties")
      .mockImplementation(function () {
        const raw = (
          this as unknown as { raw: { shortUUID: string; id: string } }
        ).raw;
        if (raw.shortUUID === "bad") throw new Error("invalid job");
        return raw as never;
      });
    const profiles = {
      getRecommendedJobCandidates: jest.fn().mockResolvedValue([
        {
          job: { id: "bad", shortUUID: "bad" },
          score: 20,
          reasonLabels: ["Engineering"],
        },
        {
          job: { id: "good", shortUUID: "good" },
          score: 10,
          reasonLabels: ["Engineering Management", "architecture"],
        },
      ]),
      hasJobPreferences: jest.fn().mockResolvedValue(false),
      getJobPreferences: jest.fn().mockResolvedValue(null),
    };
    const service = new ProfileService(
      profiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getRecommendedJobs("wallet", 10)).resolves.toEqual({
      jobs: [
        {
          job: { id: "good", shortUUID: "good" },
          reason: "Engineering Management · Architecture",
        },
      ],
      total: 1,
    });
  });

  it("records a hide action with the supplied event id", async () => {
    const profiles = {
      recordJobActivity: jest.fn().mockResolvedValue(true),
    };
    const service = new ProfileService(
      profiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.recordJobActivity("wallet", {
        shortUUID: "job",
        eventType: "job_dismiss",
        eventId: "event-id",
        surface: "jobs_for_me",
      }),
    ).resolves.toEqual({ success: true, message: "Activity recorded" });
    expect(profiles.recordJobActivity).toHaveBeenCalledWith("wallet", "job", {
      eventType: "job_dismiss",
      eventKey: "event-id",
      surface: "jobs_for_me",
      position: undefined,
      dwellMs: undefined,
      metadata: undefined,
    });
  });
});
