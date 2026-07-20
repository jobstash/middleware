import { UnauthorizedException } from "@nestjs/common";
import { ProfileService } from "src/auth/profile/profile.service";
import { StripeService } from "src/stripe/stripe.service";
import { Subscription } from "src/shared/interfaces/org";
import { UserService } from "src/user/user.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

describe("SubscriptionsController", () => {
  const userService = {
    isOrgOwner: jest.fn(),
    findOrgOwnerProfileByOrgId: jest.fn(),
  };
  const stripeService = {
    getPendingSubscriptionChange: jest.fn(),
  };
  const subscriptionsService = {
    getSubscriptionInfoByOrgId: jest.fn(),
  };

  const controller = new SubscriptionsController(
    userService as unknown as UserService,
    stripeService as unknown as StripeService,
    {} as ProfileService,
    subscriptionsService as unknown as SubscriptionsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the local subscription entitlement without calling Stripe", async () => {
    const response = {
      success: true,
      message: "Retrieved subscription info successfully",
      data: { id: "subscription-one" } as Subscription,
    };
    userService.isOrgOwner.mockResolvedValue(true);
    subscriptionsService.getSubscriptionInfoByOrgId.mockResolvedValue(response);

    await expect(
      controller.getOrgSubscriptionEntitlement("org-one", {
        address: "0xOwner",
      } as never),
    ).resolves.toBe(response);

    expect(userService.isOrgOwner).toHaveBeenCalledWith("0xOwner", "org-one");
    expect(
      subscriptionsService.getSubscriptionInfoByOrgId,
    ).toHaveBeenCalledWith("org-one");
    expect(stripeService.getPendingSubscriptionChange).not.toHaveBeenCalled();
    expect(userService.findOrgOwnerProfileByOrgId).not.toHaveBeenCalled();
  });

  it("rejects a non-owner before loading subscription data", async () => {
    userService.isOrgOwner.mockResolvedValue(false);

    await expect(
      controller.getOrgSubscriptionEntitlement("org-one", {
        address: "0xMember",
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(
      subscriptionsService.getSubscriptionInfoByOrgId,
    ).not.toHaveBeenCalled();
    expect(stripeService.getPendingSubscriptionChange).not.toHaveBeenCalled();
  });

  it("uses the indexed owner check for the detailed subscription route", async () => {
    const response = {
      success: false,
      message: "Subscription not found",
    };
    userService.isOrgOwner.mockResolvedValue(true);
    subscriptionsService.getSubscriptionInfoByOrgId.mockResolvedValue(response);

    await expect(
      controller.getOrgSubscription("org-one", {
        address: "0xOwner",
      } as never),
    ).resolves.toBe(response);

    expect(userService.isOrgOwner).toHaveBeenCalledWith("0xOwner", "org-one");
    expect(userService.findOrgOwnerProfileByOrgId).not.toHaveBeenCalled();
  });
});
