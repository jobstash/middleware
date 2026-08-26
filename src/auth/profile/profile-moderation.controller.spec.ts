import { NotFoundException } from "@nestjs/common";
import { ProfileRepository } from "src/postgres/profile.repository";
import { ProfileModerationController } from "./profile-moderation.controller";

describe("ProfileModerationController", () => {
  it("returns the bounded super-admin moderation queue", async () => {
    const data = {
      reviews: [],
      cases: [],
      appeals: [],
      counts: {
        pendingReviews: 0,
        activeCases: 0,
        pendingAppeals: 0,
        decidedNotices: 0,
      },
    };
    const repository = {
      getProfileModerationQueue: jest.fn().mockResolvedValue(data),
    };
    const controller = new ProfileModerationController(
      repository as unknown as ProfileRepository,
    );

    await expect(controller.getQueue("5000")).resolves.toEqual({
      success: true,
      message: "Profile moderation queue retrieved successfully",
      data,
    });
    expect(repository.getProfileModerationQueue).toHaveBeenCalledWith(250);
    expect(
      Reflect.getMetadata("permissions", ProfileModerationController),
    ).toEqual(["SUPER_ADMIN"]);
  });

  it("publishes only the redacted warning created by a decided case", async () => {
    const repository = {
      moderateRecruiterCase: jest.fn().mockResolvedValue({
        id: "case",
        status: "decided",
        notice: { id: "notice", status: "decided" },
      }),
    };
    const controller = new ProfileModerationController(
      repository as unknown as ProfileRepository,
    );
    const input = {
      status: "decided" as const,
      decisionText: "The submitted evidence was confirmed.",
      publishWarning: true,
      warningText: "Recruiter impersonation has been confirmed.",
    };

    await expect(
      controller.moderateCase(
        { address: "super-admin" } as never,
        "case",
        input,
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { status: "decided", notice: { status: "decided" } },
    });
    expect(repository.moderateRecruiterCase).toHaveBeenCalledWith(
      "case",
      "super-admin",
      input,
    );
  });

  it("rejects an appeal decision when the pending appeal no longer exists", async () => {
    const repository = {
      moderateProfileAppeal: jest.fn().mockResolvedValue(null),
    };
    const controller = new ProfileModerationController(
      repository as unknown as ProfileRepository,
    );

    await expect(
      controller.moderateAppeal({ address: "super-admin" } as never, "appeal", {
        status: "granted",
        decisionText: "Evidence corrected.",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
