import { ForbiddenException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AccessWorkspacesService } from "src/access-workspaces/access-workspaces.service";
import { CheckWalletPermissions } from "src/shared/constants";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { StripeService } from "src/stripe/stripe.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { PermissionService } from "./permission.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

describe("UserController Agency Signals entitlement", () => {
  const workspaceId = "f9500341-2ccd-4a1b-909a-853f66c41285";
  const build = (
    entitled: boolean,
  ): {
    controller: UserController;
    users: Record<string, jest.Mock>;
    subscriptions: { getSubscriptionInfoByOrgId: jest.Mock };
    access: { requireAgencyEntitlement: jest.Mock };
    scorer: { getCandidateReport: jest.Mock };
  } => {
    const users = {
      getUsersAvailableForWork: jest.fn().mockResolvedValue({
        success: true,
        message: "Users available for work retrieved successfully",
        data: {
          candidates: [{ wallet: "public-opt-in" }],
        },
      }),
      getTopUsers: jest.fn().mockResolvedValue({
        success: true,
        message: "Top users retrieved successfully",
        data: {
          candidates: [{ wallet: "public-opt-in" }],
        },
      }),
      getAgencyCandidateReport: jest.fn().mockResolvedValue({
        success: true,
        message: "Candidate report retrieved successfully",
        data: { candidate: { wallet: "public-opt-in" } },
      }),
    };
    const subscriptions = {
      getSubscriptionInfoByOrgId: jest.fn().mockResolvedValue({
        canAccessService: jest.fn().mockReturnValue(true),
      }),
    };
    const access = {
      requireAgencyEntitlement: entitled
        ? jest.fn().mockResolvedValue({
            workspaceId,
            role: "analyst",
            entitled: true,
          })
        : jest
            .fn()
            .mockRejectedValue(
              new ForbiddenException(
                "An active Agency entitlement is required",
              ),
            ),
    };
    const scorer = {
      getCandidateReport: jest.fn().mockResolvedValue({
        success: true,
        message: "Candidate report generated successfully",
        data: { user: { github: "light-fury" } },
      }),
    };
    const controller = new UserController(
      users as unknown as UserService,
      {} as ProfileService,
      scorer as unknown as ScorerService,
      {} as StripeService,
      subscriptions as unknown as SubscriptionsService,
      {} as PermissionService,
      access as unknown as AccessWorkspacesService,
    );
    return { controller, users, subscriptions, access, scorer };
  };

  it("denies a legacy stashPool subscription without Agency entitlement", async () => {
    const { controller, users, subscriptions } = build(false);

    await expect(
      controller.getUsersAvailableForWork({ address: "analyst" } as never, {
        workspaceId,
        city: null,
        country: null,
        page: null,
        limit: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(subscriptions.getSubscriptionInfoByOrgId).not.toHaveBeenCalled();
    expect(users.getUsersAvailableForWork).not.toHaveBeenCalled();
  });

  it("allows arbitrary GitHub candidate reports only through Agency or superuser access", async () => {
    const { controller, access, scorer } = build(true);

    await expect(
      controller.getCandidateReport(
        { address: "analyst" } as never,
        "light-fury",
        workspaceId,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(access.requireAgencyEntitlement).toHaveBeenCalledWith(
      workspaceId,
      "analyst",
    );
    expect(scorer.getCandidateReport).toHaveBeenCalledWith(
      "light-fury",
      undefined,
    );

    const normalMethod = UserController.prototype.getCandidateReport;
    const superuserMethod =
      UserController.prototype.getCandidateReportAsSuperadmin;
    expect(Reflect.getMetadata(PATH_METADATA, normalMethod)).toBe(
      "candidate-report/:github",
    );
    expect(Reflect.getMetadata(PATH_METADATA, superuserMethod)).toBe(
      "admin/candidate-report/:github",
    );

    const superuser = build(false);
    await expect(
      superuser.controller.getCandidateReportAsSuperadmin("duckdegen"),
    ).resolves.toMatchObject({ success: true });
    expect(superuser.access.requireAgencyEntitlement).not.toHaveBeenCalled();
    expect(superuser.scorer.getCandidateReport).toHaveBeenCalledWith(
      "duckdegen",
      undefined,
    );
  });

  it("allows an entitled workspace member without consulting legacy access", async () => {
    const { controller, users, subscriptions, access } = build(true);
    const params = {
      workspaceId,
      city: null,
      country: null,
      page: null,
      limit: null,
    };

    await expect(
      controller.getUsersAvailableForWork(
        { address: "analyst" } as never,
        params,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(access.requireAgencyEntitlement).toHaveBeenCalledWith(
      workspaceId,
      "analyst",
    );
    expect(users.getUsersAvailableForWork).toHaveBeenCalledWith(params);
    expect(subscriptions.getSubscriptionInfoByOrgId).not.toHaveBeenCalled();

    await expect(
      controller.getTopUsers({ address: "viewer" } as never, workspaceId),
    ).resolves.toMatchObject({ success: true });
    expect(users.getTopUsers).toHaveBeenCalledWith();

    await expect(
      controller.getAgencyCandidateReport(
        { address: "analyst" } as never,
        "public-opt-in",
        workspaceId,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(access.requireAgencyEntitlement).toHaveBeenLastCalledWith(
      workspaceId,
      "analyst",
    );
    expect(users.getAgencyCandidateReport).toHaveBeenCalledWith(
      "public-opt-in",
    );
  });

  it("exposes separate superuser candidate and report routes without an Agency workspace", async () => {
    const { controller, users, access } = build(false);
    const candidatesMethod =
      UserController.prototype.getUsersAvailableForWorkAsSuperadmin;
    const reportMethod =
      UserController.prototype.getAgencyCandidateReportAsSuperadmin;

    expect(Reflect.getMetadata(METHOD_METADATA, candidatesMethod)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, candidatesMethod)).toBe(
      "admin/available",
    );
    expect(Reflect.getMetadata("permissions", candidatesMethod)).toEqual([
      CheckWalletPermissions.SUPER_ADMIN,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, reportMethod)).toBe(
      "admin/available/:wallet/report",
    );
    expect(Reflect.getMetadata("permissions", reportMethod)).toEqual([
      CheckWalletPermissions.SUPER_ADMIN,
    ]);

    const filters = {
      city: null,
      country: null,
      page: null,
      limit: null,
    };
    await expect(
      controller.getUsersAvailableForWorkAsSuperadmin(filters),
    ).resolves.toMatchObject({ success: true });
    await expect(
      controller.getAgencyCandidateReportAsSuperadmin("public-opt-in"),
    ).resolves.toMatchObject({ success: true });

    expect(access.requireAgencyEntitlement).not.toHaveBeenCalled();
    expect(users.getUsersAvailableForWork).toHaveBeenCalledWith(filters);
    expect(users.getAgencyCandidateReport).toHaveBeenCalledWith(
      "public-opt-in",
    );
  });
});
