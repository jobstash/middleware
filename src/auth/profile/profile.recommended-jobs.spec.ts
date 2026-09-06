import { JobListResultEntity } from "src/shared/entities";
import { EMPTY_RECOMMENDATION_PROFILE } from "src/shared/interfaces";
import { ProfileService } from "./profile.service";
import * as eligibility from "./job-preference-matcher";

describe("ProfileService recommended jobs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps email employers diverse and considers candidates beyond the old nine-row pool", async () => {
    jest
      .spyOn(JobListResultEntity.prototype, "getProperties")
      .mockImplementation(function () {
        return (this as unknown as { raw: unknown }).raw as never;
      });
    const profiles = {
      getRecommendedJobCandidates: jest.fn().mockResolvedValue([
        ...Array.from({ length: 12 }, (_, i) => ({
          job: {
            id: `${i}`,
            shortUUID: `${i}`,
            organization: { orgId: "same" },
          },
          reasonLabels: [],
        })),
        {
          job: { id: "a", shortUUID: "a", organization: { orgId: "second" } },
          reasonLabels: [],
        },
        {
          job: { id: "b", shortUUID: "b", project: { id: "third" } },
          reasonLabels: [],
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
    const result = await service.getRecommendedJobs(
      "wallet",
      3,
      "weekly_email",
    );
    expect(result.jobs.map(row => row.job.shortUUID)).toEqual(["0", "a", "b"]);
    expect(profiles.getRecommendedJobCandidates).toHaveBeenCalledWith(
      "wallet",
      500,
      true,
    );
  });

  it("does not email location near-misses or unresolved eligibility", async () => {
    jest
      .spyOn(JobListResultEntity.prototype, "getProperties")
      .mockImplementation(function () {
        return (this as unknown as { raw: unknown }).raw as never;
      });
    jest
      .spyOn(eligibility, "matchWorkLocationOptions")
      .mockReturnValue({ group: "needsChecking", item: {} as never });
    const profiles = {
      getRecommendedJobCandidates: jest
        .fn()
        .mockResolvedValue([
          { job: { shortUUID: "one", workArrangement: {} }, reasonLabels: [] },
        ]),
      hasJobPreferences: jest.fn().mockResolvedValue(true),
      getJobPreferences: jest.fn().mockResolvedValue({ workModes: ["remote"] }),
    };
    const service = new ProfileService(
      profiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(
      (await service.getRecommendedJobs("wallet", 3, "weekly_email")).jobs,
    ).toEqual([]);
    expect((await service.getRecommendedJobs("wallet", 3)).jobs).toHaveLength(
      1,
    );
  });

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
      rankingVersion: "sentences-v1",
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

  it("keeps stored recommendation fields when an older client updates eligibility", async () => {
    const existing = {
      ...EMPTY_RECOMMENDATION_PROFILE,
      workModes: ["remote"] as const,
      residenceCountry: "NL",
      utcOffset: 1,
      workAuthorization: "EU",
      requiresSponsorship: false,
      attendancePreference: "remote_only",
      travelTolerance: null,
      preferredSkills: ["TypeScript"],
      targetOrganizations: ["Protocol Labs"],
    };
    const profiles = {
      getJobPreferences: jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, utcOffset: 2 }),
      updateJobPreferences: jest.fn().mockResolvedValue(true),
    };
    const service = new ProfileService(
      profiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.updateJobPreferences("wallet", {
      workModes: ["remote"],
      residenceCountry: "NL",
      utcOffset: 2,
      workAuthorization: "EU",
      requiresSponsorship: false,
      attendancePreference: "remote_only",
      travelTolerance: null,
    });

    expect(profiles.updateJobPreferences).toHaveBeenCalledWith(
      "wallet",
      expect.objectContaining({
        utcOffset: 2,
        preferredSkills: ["TypeScript"],
        targetOrganizations: ["Protocol Labs"],
      }),
    );
  });
});
