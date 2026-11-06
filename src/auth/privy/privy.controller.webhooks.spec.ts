import { BadRequestException } from "@nestjs/common";
import { LinkedAccount, User } from "@privy-io/node";
import { CheckWalletPermissions } from "src/shared/constants";
import { PrivyController } from "./privy.controller";
import {
  PrivyUpdateEventPayload,
  PrivyTransferEventPayload,
} from "./dto/webhook.payload";

const user = { id: "did:privy:verified" } as User;
const account = {
  type: "email",
  address: "person@example.com",
} as LinkedAccount;
function setup(): {
  controller: PrivyController;
  verify: jest.Mock;
  users: Record<string, jest.Mock>;
  login: jest.Mock;
  threat: jest.Mock;
  permissions: Record<string, jest.Mock>;
} {
  const verify = jest.fn(({ payload }) => payload);
  const users = {
    getEmbeddedWallet: jest.fn().mockResolvedValue("wallet"),
    syncUserLinkedWallets: jest.fn().mockResolvedValue(undefined),
    updateLinkedAccounts: jest.fn().mockResolvedValue(undefined),
    transferLinkedAccount: jest.fn().mockResolvedValue(undefined),
  };
  const login = jest.fn().mockResolvedValue(undefined);
  const threat = jest.fn().mockResolvedValue(undefined);
  const permissions = {
    getPermissionsForWallet: jest.fn().mockResolvedValue([]),
    syncUserPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const controller = Object.assign(Object.create(PrivyController.prototype), {
    userService: users,
    privyService: {
      getClient: jest.fn().mockResolvedValue({ webhooks: () => ({ verify }) }),
    },
    configService: { getOrThrow: () => "test-secret" },
    telemetryService: { logUserLoginEvent: login },
    threatSync: { syncUser: threat },
    permissionService: permissions,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }) as PrivyController;
  return { controller, verify, users, login, threat, permissions };
}

describe("verified Privy webhook dispatch", () => {
  it.each([
    "user.linked_account",
    "user.updated_account",
    "user.unlinked_account",
  ] as const)("preserves ordered account updates for %s", async type => {
    const h = setup();
    const payload: PrivyUpdateEventPayload = { type, user, account };
    await h.controller.handleWebhook(payload, "id", "time", "signature");
    expect(h.verify).toHaveBeenCalledWith({
      payload,
      headers: {
        "svix-id": "id",
        "svix-timestamp": "time",
        "svix-signature": "signature",
      },
      signing_secret: "test-secret",
    });
    expect(h.users.syncUserLinkedWallets).toHaveBeenCalledWith("wallet", user);
    expect(h.users.updateLinkedAccounts).toHaveBeenCalledWith(
      payload,
      "wallet",
    );
    expect(
      h.users.syncUserLinkedWallets.mock.invocationCallOrder[0],
    ).toBeLessThan(h.users.updateLinkedAccounts.mock.invocationCallOrder[0]);
    expect(
      h.users.updateLinkedAccounts.mock.invocationCallOrder[0],
    ).toBeLessThan(h.threat.mock.invocationCallOrder[0]);
  });
  it("does not create login telemetry or permissions without an embedded wallet", async () => {
    const h = setup();
    h.users.getEmbeddedWallet.mockResolvedValue(null);
    await h.controller.handleWebhook(
      { type: "user.authenticated", user, account },
      "id",
      "time",
      "signature",
    );
    expect(h.login).not.toHaveBeenCalled();
    expect(h.threat).not.toHaveBeenCalled();
    expect(h.permissions.getPermissionsForWallet).not.toHaveBeenCalled();
  });
  it("retains authenticated telemetry and server-owned permission initialization", async () => {
    const h = setup();
    await h.controller.handleWebhook(
      { type: "user.authenticated", user, account },
      "id",
      "time",
      "signature",
    );
    expect(h.login).toHaveBeenCalledWith(user.id, { method: "email" });
    expect(h.permissions.syncUserPermissions).toHaveBeenCalledWith("wallet", [
      CheckWalletPermissions.USER,
    ]);
    expect(h.login.mock.invocationCallOrder[0]).toBeLessThan(
      h.threat.mock.invocationCallOrder[0],
    );
  });
  it("requires both provider-linked wallets before transferring an account", async () => {
    const h = setup();
    const payload: PrivyTransferEventPayload = {
      type: "user.transferred_account",
      fromUser: { id: "from" },
      toUser: user,
      account,
      deletedUser: false,
    };
    h.users.getEmbeddedWallet
      .mockResolvedValueOnce("from-wallet")
      .mockResolvedValueOnce(null);
    await h.controller.handleWebhook(payload, "id", "time", "signature");
    expect(h.users.transferLinkedAccount).not.toHaveBeenCalled();
    h.users.getEmbeddedWallet
      .mockResolvedValueOnce("from-wallet")
      .mockResolvedValueOnce("to-wallet");
    await h.controller.handleWebhook(payload, "id", "time", "signature");
    expect(h.users.transferLinkedAccount).toHaveBeenCalledWith(
      payload,
      "from-wallet",
      "to-wallet",
    );
  });
  it("keeps verification and handler failures inside the webhook error boundary", async () => {
    const h = setup();
    h.users.updateLinkedAccounts.mockRejectedValue(
      new Error("provider unavailable"),
    );
    await expect(
      h.controller.handleWebhook(
        { type: "user.linked_account", user, account },
        "id",
        "time",
        "signature",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.threat).not.toHaveBeenCalled();
  });
});
