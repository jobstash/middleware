import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/types";
import { JobsController } from "./jobs.controller";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

const success = { success: true, message: "ok" };
const session = (permissions: string[] = []): SessionObject => ({
  address: "wallet",
  permissions,
  cryptoNative: false,
});

function fixture(): {
  controller: JobsController;
  jobs: Record<string, jest.Mock>;
  user: Record<string, jest.Mock>;
  subscriptions: Record<string, jest.Mock>;
  isActive: jest.Mock;
  account: Record<string, jest.Mock>;
} {
  const jobs = {
    getJobCount: jest.fn().mockResolvedValue({ totalJobs: 53122 }),
    getFeaturedJobs: jest.fn().mockResolvedValue(success),
    getFeaturedJobsByOrgId: jest.fn().mockResolvedValue(success),
    getJobsByOrgIdWithApplicants: jest.fn().mockResolvedValue(success),
    getAllJobsByOrgId: jest.fn().mockResolvedValue(success),
    getOrgAllJobsListFilters: jest.fn().mockResolvedValue(success),
    getJobDetailsByUuidForUpdate: jest.fn(),
    blockJobs: jest.fn().mockResolvedValue(success),
    unblockJobs: jest.fn().mockResolvedValue(success),
    makeJobsOnline: jest.fn().mockResolvedValue(success),
    makeJobsOffline: jest.fn().mockResolvedValue(success),
    changeJobCommitment: jest.fn().mockResolvedValue(success),
    changeJobClassification: jest.fn().mockResolvedValue(success),
    changeJobLocationType: jest.fn().mockResolvedValue(success),
    changeJobProject: jest.fn().mockResolvedValue(success),
    update: jest.fn().mockResolvedValue(true),
  };
  const user = {
    findOrgIdByMemberUserWallet: jest.fn().mockResolvedValue("org"),
    findOrgIdByJobShortUUID: jest.fn().mockResolvedValue("org"),
    isOrgMember: jest.fn().mockResolvedValue(false),
    isOrgOwner: jest.fn().mockResolvedValue(false),
  };
  const isActive = jest.fn().mockReturnValue(true);
  const subscriptions = {
    getSubscriptionInfoByOrgId: jest.fn().mockResolvedValue({
      success: true,
      data: { isActive },
    }),
  };
  const account = {
    getDelegateAccess: jest
      .fn()
      .mockResolvedValue({ success: true, data: "accepted" }),
  };
  const controller = new JobsController(
    jobs as never,
    {} as never,
    user as never,
    {} as never,
    account as never,
    {} as never,
    subscriptions as never,
  );
  return { controller, jobs, user, subscriptions, isActive, account };
}

function metadata(): UpdateJobMetadataInput {
  return Object.assign(new UpdateJobMetadataInput(), {
    url: "https://example.com/job",
    benefits: [],
    requirements: [],
    responsibilities: [],
    title: "Engineer",
    summary: "Summary",
    description: "Description",
    location: "Remote",
    seniority: "Senior",
    protected: false,
    commitment: "Full time",
    classification: "Engineering",
    locationType: "Remote",
    isBlocked: true,
    isOnline: true,
    tags: [],
  });
}

describe("JobsController quality refactor contracts", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns the exact count through the same guard as the feed", async () => {
    const { controller, jobs } = fixture();
    await expect(controller.getJobCount()).resolves.toEqual({
      totalJobs: 53122,
    });
    expect(jobs.getJobCount).toHaveBeenCalledWith();
    expect(Reflect.getMetadata(PATH_METADATA, controller.getJobCount)).toBe(
      "count",
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, controller.getJobCount),
    ).toEqual(Reflect.getMetadata(GUARDS_METADATA, controller.getJobFeed));
  });

  it("keeps super-admin featured access independent of subscriptions", async () => {
    const { controller, jobs, user } = fixture();
    await controller.getFeaturedJobsList(
      "all",
      "eco",
      session([CheckWalletPermissions.SUPER_ADMIN]),
    );
    expect(jobs.getFeaturedJobs).toHaveBeenCalledWith("eco");
    await controller.getFeaturedJobsList(
      undefined,
      "eco",
      session([CheckWalletPermissions.SUPER_ADMIN]),
    );
    expect(jobs.getFeaturedJobsByOrgId).toHaveBeenCalledWith("eco", null);
    expect(user.findOrgIdByMemberUserWallet).not.toHaveBeenCalled();
  });

  it("checks subscription before missing-org and membership checks", async () => {
    const { controller, user, isActive } = fixture();
    isActive.mockReturnValue(false);
    await expect(
      controller.getFeaturedJobsList(undefined, undefined, session()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(user.isOrgMember).not.toHaveBeenCalled();
    isActive.mockReturnValue(true);
    await expect(
      controller.getFeaturedJobsList(undefined, undefined, session()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(user.isOrgMember).not.toHaveBeenCalled();
  });

  it("allows active ecosystem managers without a membership lookup", async () => {
    const { controller, jobs, user } = fixture();
    await controller.getFeaturedJobsList(
      undefined,
      "eco",
      session([CheckWalletPermissions.ECOSYSTEM_MANAGER]),
    );
    expect(jobs.getFeaturedJobsByOrgId).toHaveBeenCalledWith("eco", null);
    expect(user.isOrgMember).not.toHaveBeenCalled();
    expect(user.isOrgOwner).not.toHaveBeenCalled();
  });

  it("keeps member-before-owner short circuiting and authorization errors", async () => {
    const { controller, user } = fixture();
    user.isOrgMember.mockResolvedValueOnce(true);
    await controller.getFeaturedJobsList("org", undefined, session());
    expect(user.isOrgOwner).not.toHaveBeenCalled();
    user.isOrgOwner.mockResolvedValueOnce(true);
    await controller.getFeaturedJobsList("org", undefined, session());
    expect(user.isOrgMember.mock.invocationCallOrder[1]).toBeLessThan(
      user.isOrgOwner.mock.invocationCallOrder[0],
    );
    await expect(
      controller.getFeaturedJobsList("org", undefined, session()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const error = new Error("membership unavailable");
    user.isOrgMember.mockRejectedValueOnce(error);
    const ownerCalls = user.isOrgOwner.mock.calls.length;
    await expect(
      controller.getFeaturedJobsList("org", undefined, session()),
    ).rejects.toBe(error);
    expect(user.isOrgOwner).toHaveBeenCalledTimes(ownerCalls);
  });

  it("retains applicant-list defaults in the same positional API", async () => {
    const { controller, jobs, user } = fixture();
    user.isOrgMember.mockResolvedValue(true);
    await controller.getOrgJobApplicantList("org", undefined, session());
    expect(jobs.getJobsByOrgIdWithApplicants).toHaveBeenLastCalledWith(
      "org",
      "all",
    );
    await controller.getOrgJobApplicantList("org", "hired", session());
    expect(jobs.getJobsByOrgIdWithApplicants).toHaveBeenLastCalledWith(
      "org",
      "hired",
    );
  });

  it("keeps privileged all-job access after member and owner checks", async () => {
    const { controller, user, jobs } = fixture();
    const admin = session([CheckWalletPermissions.SUPER_ADMIN]);
    await controller.getOrgAllJobsList(admin, "org", 2, 10);
    expect(jobs.getAllJobsByOrgId).toHaveBeenCalledWith("org", 2, 10);
    expect(user.isOrgMember.mock.invocationCallOrder[0]).toBeLessThan(
      user.isOrgOwner.mock.invocationCallOrder[0],
    );
    await controller.getOrgAllJobsListFilters(admin, "org");
    expect(jobs.getOrgAllJobsListFilters).toHaveBeenCalledWith("org");
    await expect(
      controller.getOrgAllJobsList(session(), "org", 1, 10),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.getOrgAllJobsListFilters(session(), "org"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects metadata writes only after the existing delegate lookup", async () => {
    const { controller, user, account, jobs } = fixture();
    user.findOrgIdByMemberUserWallet.mockResolvedValue("other");
    await expect(
      controller.updateJobMetadata(session(), "job", metadata()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(account.getDelegateAccess).toHaveBeenCalledWith("other", "org");
    expect(jobs.getJobDetailsByUuidForUpdate).not.toHaveBeenCalled();
  });

  it("schedules status operations before metadata and returns the first failure", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { controller, jobs } = fixture();
    const body = metadata();
    jobs.getJobDetailsByUuidForUpdate.mockResolvedValue({
      ...body,
      blocked: false,
      online: false,
    });
    const firstFailure = { success: false, message: "block failed" };
    jobs.blockJobs.mockResolvedValue(firstFailure);
    jobs.makeJobsOnline.mockResolvedValue({
      success: false,
      message: "online failed",
    });
    await expect(
      controller.updateJobMetadata(session(), "job", body),
    ).resolves.toEqual(firstFailure);
    expect(jobs.blockJobs).toHaveBeenCalledWith("wallet", {
      shortUUIDs: ["job"],
    });
    expect(jobs.makeJobsOnline).toHaveBeenCalledWith("wallet", {
      shortUUIDs: ["job"],
    });
    expect(jobs.blockJobs.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.makeJobsOnline.mock.invocationCallOrder[0],
    );
    expect(jobs.makeJobsOnline.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.update.mock.invocationCallOrder[0],
    );
    expect(jobs.changeJobCommitment).not.toHaveBeenCalled();
    expect(jobs.unblockJobs).not.toHaveBeenCalled();
  });

  it("retains false status transitions and unchanged-status no-ops", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { controller, jobs } = fixture();
    const body = Object.assign(metadata(), {
      isBlocked: false,
      isOnline: false,
    });
    jobs.getJobDetailsByUuidForUpdate.mockResolvedValue({
      ...body,
      blocked: true,
      online: true,
    });
    await controller.updateJobMetadata(session(), "job", body);
    expect(jobs.unblockJobs).toHaveBeenCalledTimes(1);
    expect(jobs.makeJobsOffline).toHaveBeenCalledTimes(1);
    jobs.getJobDetailsByUuidForUpdate.mockResolvedValue({
      ...body,
      blocked: false,
      online: false,
    });
    await controller.updateJobMetadata(session(), "job", body);
    expect(jobs.unblockJobs).toHaveBeenCalledTimes(1);
    expect(jobs.makeJobsOffline).toHaveBeenCalledTimes(1);
  });
});
