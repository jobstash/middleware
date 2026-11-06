/// <reference lib="es2024.promise" />
import { ConfigService } from "@nestjs/config";
import { User } from "@privy-io/node";
import { AuthService } from "../auth.service";
import { UserService } from "src/user/user.service";
import { PermissionService } from "src/user/permission.service";
import { TelemetryService } from "src/telemetry/telemetry.service";
import { PrivyService } from "./privy.service";
import { PrivyThreatSyncService } from "./privy-threat-sync.service";
import { PrivyController } from "./privy.controller";

type UserMethods =
  | "upsertPrivyUser"
  | "syncPrivyEmails"
  | "updateLinkedAccounts"
  | "syncUserLinkedWallets"
  | "getCryptoNativeStatus"
  | "hasVerifiedEmail";

const setup = (
  wallet: string | null = "0x0000000000000000000000000000000000000001",
): {
  controller: PrivyController;
  user: User;
  users: Record<UserMethods, jest.Mock>;
  privy: { getOrCreateUserEmbeddedWallet: jest.Mock };
  logger: { log: jest.Mock; error: jest.Mock };
} => {
  const auth = {
    createToken: jest.fn().mockReturnValue("signed-backend-token"),
  } as unknown as AuthService;
  const users = {
    upsertPrivyUser: jest.fn().mockResolvedValue({ success: true }),
    syncPrivyEmails: jest.fn().mockResolvedValue(undefined),
    updateLinkedAccounts: jest.fn().mockResolvedValue(undefined),
    syncUserLinkedWallets: jest.fn().mockResolvedValue(undefined),
    getCryptoNativeStatus: jest.fn().mockResolvedValue(false),
    hasVerifiedEmail: jest.fn().mockResolvedValue(true),
  };
  const privy = {
    getOrCreateUserEmbeddedWallet: jest.fn().mockResolvedValue(wallet),
  };
  const permissions = {
    getPermissionsForWallet: jest.fn().mockResolvedValue([{ name: "USER" }]),
  } as unknown as PermissionService;
  const threatSync = {
    syncUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as PrivyThreatSyncService;
  const controller = new PrivyController(
    auth,
    users as unknown as UserService,
    privy as unknown as PrivyService,
    new ConfigService(),
    {} as TelemetryService,
    permissions,
    threatSync,
  );
  const logger = { log: jest.fn(), error: jest.fn() };
  Object.assign(controller, { logger });
  const user = { id: "did:privy:verified-account" } as User;
  return { controller, user, users, privy, logger };
};

describe("Privy verified backend-session identity", () => {
  it.each(["0x0000000000000000000000000000000000000001", null])(
    "returns the guard-verified DID for wallet %s",
    async wallet => {
      const { controller, user, privy } = setup(wallet);
      expect(await controller.checkWallet(user)).toMatchObject({
        privyDid: user.id,
        token: "signed-backend-token",
      });
      expect(privy.getOrCreateUserEmbeddedWallet).toHaveBeenCalledWith(user);
    },
  );

  it("waits for wallet replacement before starting enrichment", async () => {
    const { controller, user, users } = setup();
    const { promise: started, resolve: startedWallets } =
      Promise.withResolvers<void>();
    const { promise: pending, resolve: finishWallets } =
      Promise.withResolvers<void>();
    users.syncUserLinkedWallets.mockImplementation(() => {
      startedWallets();
      return pending;
    });
    const login = controller.checkWallet(user);
    await started;
    expect(users.updateLinkedAccounts).not.toHaveBeenCalled();
    expect(users.getCryptoNativeStatus).not.toHaveBeenCalled();
    finishWallets();
    await expect(login).resolves.toMatchObject({ permissions: ["USER"] });
    expect(users.updateLinkedAccounts).toHaveBeenCalledTimes(1);
  });

  it("does not hold the login response for expensive enrichment", async () => {
    const { controller, user, users } = setup();
    const { promise, resolve: finishEnrichment } =
      Promise.withResolvers<void>();
    users.updateLinkedAccounts.mockReturnValue(promise);
    await expect(controller.checkWallet(user)).resolves.toMatchObject({
      token: "signed-backend-token",
      permissions: ["USER"],
    });
    finishEnrichment();
  });

  it("owns detached enrichment rejection without leaking its payload", async () => {
    const { controller, user, users, logger } = setup();
    users.updateLinkedAccounts.mockRejectedValue(
      new Error("synthetic private provider payload"),
    );
    await expect(controller.checkWallet(user)).resolves.toMatchObject({
      token: "signed-backend-token",
      permissions: ["USER"],
    });
    expect(logger.error).toHaveBeenCalledWith(
      "PrivyController::checkWallet linked-account synchronization failed",
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      "synthetic private provider payload",
    );
  });
});
