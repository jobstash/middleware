import { PrivyController } from "../auth/privy/privy.controller";
import { UserService } from "./user.service";

const setup = () => {
  const users = { getCryptoNative: jest.fn() };
  const profileService = {
    getUserWorkHistory: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const service = Object.assign(Object.create(UserService.prototype), {
    users,
    profileService,
    logger,
  }) as UserService;
  return { users, profileService, logger, service };
};
describe("login crypto-native status", () => {
  it.each([false, true])(
    "returns stored %s without refreshing",
    async value => {
      const { users, profileService, service } = setup();
      users.getCryptoNative.mockResolvedValue(value);
      await expect(service.getCryptoNativeStatus("0xUser")).resolves.toBe(
        value,
      );
      expect(profileService.getUserWorkHistory).not.toHaveBeenCalled();
      expect(users.getCryptoNative).toHaveBeenCalledTimes(1);
    },
  );
  it("refreshes once despite a current but incomplete cache and reads the saved result", async () => {
    const { users, profileService, service } = setup();
    users.getCryptoNative
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false);
    await expect(service.getCryptoNativeStatus("0xUser")).resolves.toBe(false);
    expect(profileService.getUserWorkHistory).toHaveBeenCalledWith(
      "0xUser",
      true,
    );
    expect(users.getCryptoNative).toHaveBeenCalledTimes(2);
  });
  it("stops when refresh leaves the status missing instead of retrying forever", async () => {
    const { users, profileService, service, logger } = setup();
    users.getCryptoNative.mockResolvedValue(undefined);
    profileService.getUserWorkHistory
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("Unexpected repeated refresh"));
    await expect(
      service.getCryptoNativeStatus("0xUser"),
    ).resolves.toBeUndefined();
    expect(users.getCryptoNative).toHaveBeenCalledTimes(2);
    expect(profileService.getUserWorkHistory).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
  it("does not turn a database failure into a refresh loop", async () => {
    const { users, profileService, service } = setup();
    users.getCryptoNative.mockRejectedValue(new Error("Database unavailable"));
    await expect(
      service.getCryptoNativeStatus("0xUser"),
    ).resolves.toBeUndefined();
    expect(users.getCryptoNative).toHaveBeenCalledTimes(1);
    expect(profileService.getUserWorkHistory).not.toHaveBeenCalled();
  });
  it("allows the existing login fallback when enrichment fails", async () => {
    const { users, profileService, service } = setup();
    users.getCryptoNative.mockResolvedValue(undefined);
    profileService.getUserWorkHistory.mockRejectedValue(
      new Error("Scorer unavailable"),
    );
    await expect(
      service.getCryptoNativeStatus("0xUser"),
    ).resolves.toBeUndefined();
    expect(profileService.getUserWorkHistory).toHaveBeenCalledTimes(1);
  });
});

it("issues a login token even if one refresh cannot determine crypto-native status", async () => {
  const { users, profileService, service } = setup();
  users.getCryptoNative.mockResolvedValue(undefined);
  Object.assign(service, {
    upsertPrivyUser: jest.fn().mockResolvedValue({ success: true }),
    syncPrivyEmails: jest.fn().mockResolvedValue(undefined),
    updateLinkedAccounts: jest.fn().mockResolvedValue(undefined),
    syncUserLinkedWallets: jest.fn().mockResolvedValue(undefined),
    hasVerifiedEmail: jest.fn().mockResolvedValue(true),
  });
  const createToken = jest.fn().mockReturnValue("test-session");
  const controller = Object.assign(Object.create(PrivyController.prototype), {
    userService: service,
    authService: { createToken },
    privyService: {
      getOrCreateUserEmbeddedWallet: jest.fn().mockResolvedValue("0xUser"),
    },
    permissionService: {
      getPermissionsForWallet: jest.fn().mockResolvedValue([{ name: "user" }]),
    },
    threatSync: { syncUser: jest.fn().mockResolvedValue(undefined) },
    logger: { log: jest.fn() },
  }) as PrivyController;
  await expect(
    controller.checkWallet({ id: "test-user" } as Parameters<
      PrivyController["checkWallet"]
    >[0]),
  ).resolves.toEqual({
    token: "test-session",
    cryptoNative: false,
    permissions: ["user"],
    hasVerifiedEmail: true,
  });
  expect(profileService.getUserWorkHistory).toHaveBeenCalledTimes(1);
  expect(createToken).toHaveBeenCalledTimes(1);
});
