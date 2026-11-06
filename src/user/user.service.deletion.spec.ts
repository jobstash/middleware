/// <reference lib="es2024.promise" />
import { NotFoundError } from "@privy-io/node";
import { PrivyService } from "src/auth/privy/privy.service";
import { UserService } from "./user.service";

const setup = (): {
  service: UserService;
  providerDelete: jest.Mock;
  localDelete: jest.Mock;
} => {
  const providerDelete = jest.fn().mockResolvedValue(undefined);
  const localDelete = jest.fn().mockResolvedValue(undefined);
  const logger = { log: jest.fn(), error: jest.fn() };
  const privyService = Object.assign(Object.create(PrivyService.prototype), {
    privy: { users: () => ({ delete: providerDelete }) },
    logger,
  }) as PrivyService;
  const service = Object.assign(Object.create(UserService.prototype), {
    privyService,
    users: { deleteUser: localDelete },
    getPrivyId: jest.fn().mockResolvedValue("did:privy:old-account"),
    logger,
  }) as UserService;
  return { service, providerDelete, localDelete };
};

const absentProviderUser = (): Error => {
  const missing = new Error("Synthetic provider account already absent");
  Object.setPrototypeOf(missing, NotFoundError.prototype);
  return missing;
};

describe("provider-first account deletion", () => {
  it("does not delete local identity until provider deletion completes", async () => {
    const { service, providerDelete, localDelete } = setup();
    const { promise: started, resolve: markStarted } =
      Promise.withResolvers<void>();
    const { promise: pending, resolve: finish } = Promise.withResolvers<void>();
    providerDelete.mockImplementation(() => {
      markStarted();
      return pending;
    });
    const deletion = service.deletePrivyUser("fixture-wallet");
    await started;
    expect(localDelete).not.toHaveBeenCalled();
    finish();
    await expect(deletion).resolves.toMatchObject({ success: true });
    expect(providerDelete).toHaveBeenCalledWith("did:privy:old-account");
    expect(localDelete).toHaveBeenCalledWith("fixture-wallet");
  });

  it("preserves local identity when provider deletion rejects", async () => {
    const { service, providerDelete, localDelete } = setup();
    providerDelete.mockRejectedValue(
      new Error("Synthetic provider unavailable"),
    );
    await expect(service.deletePrivyUser("fixture-wallet")).resolves.toEqual({
      success: false,
      message: "Error deleting user account",
    });
    expect(localDelete).not.toHaveBeenCalled();
  });

  it("finishes local cleanup when the provider account is already absent", async () => {
    const { service, providerDelete, localDelete } = setup();
    providerDelete.mockRejectedValue(absentProviderUser());
    await expect(
      service.deletePrivyUser("fixture-wallet"),
    ).resolves.toMatchObject({
      success: true,
    });
    expect(localDelete).toHaveBeenCalledWith("fixture-wallet");
  });

  it("preserves the deleted-user linked-account transfer contract", async () => {
    const { service, providerDelete, localDelete } = setup();
    providerDelete.mockRejectedValue(absentProviderUser());
    const permissions = jest
      .fn()
      .mockResolvedValueOnce([{ name: "USER" }, { name: "ECOSYSTEM_MANAGER" }])
      .mockResolvedValueOnce([{ name: "USER" }]);
    const syncPermissions = jest.fn().mockResolvedValue(undefined);
    const updateLinkedAccounts = jest.fn().mockResolvedValue(undefined);
    Object.assign(service, {
      getUserPermissions: permissions,
      syncUserPermissions: syncPermissions,
      updateLinkedAccounts,
    });
    const event = {
      deletedUser: true,
      account: { type: "github_oauth" },
      fromUser: { id: "did:privy:old-account" },
      toUser: { id: "did:privy:new-account" },
    } as Parameters<UserService["transferLinkedAccount"]>[0];
    await service.transferLinkedAccount(event, "old-wallet", "new-wallet");
    expect(localDelete).toHaveBeenCalledWith("old-wallet");
    expect(syncPermissions).toHaveBeenCalledWith("new-wallet", [
      "ECOSYSTEM_MANAGER",
      "USER",
    ]);
    expect(updateLinkedAccounts).toHaveBeenCalledWith(
      {
        type: "user.linked_account",
        account: event.account,
        user: event.toUser,
      },
      "new-wallet",
    );
  });
});
