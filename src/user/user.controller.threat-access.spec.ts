import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { StripeService } from "src/stripe/stripe.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { PermissionService } from "./permission.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

describe("UserController threat-intelligence access", () => {
  const wallet = "0x1111111111111111111111111111111111111111";

  const createController = (alreadyGranted = false, verified = true) => {
    const permissionService = {
      find: jest.fn().mockResolvedValue({ name: "THREAT_INTEL" }),
      create: jest.fn(),
      userHasPermission: jest.fn().mockResolvedValue(alreadyGranted),
      grantUserPermission: jest.fn().mockResolvedValue({
        success: true,
        message: alreadyGranted ? "already granted" : "granted",
      }),
      revokeUserPermission: jest.fn().mockResolvedValue({
        success: true,
        message: "revoked",
      }),
    };
    const profileService = {
      ensureThreatIntelOrganizationVerification: jest.fn().mockResolvedValue({
        success: verified,
        message: verified ? "verified" : "verification failed",
      }),
    };
    const controller = new UserController(
      {} as UserService,
      profileService as unknown as ProfileService,
      {} as ScorerService,
      {} as StripeService,
      {} as SubscriptionsService,
      permissionService as unknown as PermissionService,
    );
    return { controller, permissionService, profileService };
  };

  it("verifies a newly granted analyst for JobStash", async () => {
    const { controller, permissionService, profileService } =
      createController();

    await expect(
      controller.grantThreatIntelAccess({ wallet }),
    ).resolves.toMatchObject({
      success: true,
      message: expect.stringContaining("verified for JobStash"),
    });
    expect(permissionService.grantUserPermission).toHaveBeenCalledWith(
      wallet,
      "THREAT_INTEL",
    );
    expect(
      profileService.ensureThreatIntelOrganizationVerification,
    ).toHaveBeenCalledWith(wallet);
  });

  it("rolls back a new permission when JobStash verification fails", async () => {
    const { controller, permissionService } = createController(false, false);

    await expect(
      controller.grantThreatIntelAccess({ wallet }),
    ).resolves.toEqual({ success: false, message: "verification failed" });
    expect(permissionService.revokeUserPermission).toHaveBeenCalledWith(
      wallet,
      "THREAT_INTEL",
    );
  });

  it("does not revoke an existing permission when repairing verification fails", async () => {
    const { controller, permissionService } = createController(true, false);

    await expect(
      controller.grantThreatIntelAccess({ wallet }),
    ).resolves.toEqual({ success: false, message: "verification failed" });
    expect(permissionService.revokeUserPermission).not.toHaveBeenCalled();
  });
});
