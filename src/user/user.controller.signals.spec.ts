import { ForbiddenException } from "@nestjs/common";
import { AccessWorkspacesService } from "src/access-workspaces/access-workspaces.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { StripeService } from "src/stripe/stripe.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { PermissionService } from "./permission.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

describe("UserController Agency Signals entitlement", () => {
  const workspaceId = "f9500341-2ccd-4a1b-909a-853f66c41285";
  const build = (entitled: boolean) => {
    const users = {
      getUsersAvailableForWork: jest.fn().mockResolvedValue({
        success: true,
        message: "Users available for work retrieved successfully",
        data: {
          candidates: [{ wallet: "public-opt-in" }],
          aggregateInterests: {
            minimumAggregateSize: 5,
            jobClassifications: [],
            tags: [],
          },
        },
      }),
      getTopUsers: jest.fn().mockResolvedValue({
        success: true,
        message: "Top users retrieved successfully",
        data: {
          candidates: [{ wallet: "public-opt-in" }],
          aggregateInterests: {
            minimumAggregateSize: 5,
            jobClassifications: [],
            tags: [],
          },
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
    const controller = new UserController(
      users as unknown as UserService,
      {} as ProfileService,
      {} as ScorerService,
      {} as StripeService,
      subscriptions as unknown as SubscriptionsService,
      {} as PermissionService,
      access as unknown as AccessWorkspacesService,
    );
    return { controller, users, subscriptions, access };
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
});
