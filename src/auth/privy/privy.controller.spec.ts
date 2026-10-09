import { ConfigService } from "@nestjs/config";
import { User } from "@privy-io/server-auth";
import { AuthService } from "../auth.service";
import { UserService } from "src/user/user.service";
import { PermissionService } from "src/user/permission.service";
import { TelemetryService } from "src/telemetry/telemetry.service";
import { PrivyService } from "./privy.service";
import { PrivyThreatSyncService } from "./privy-threat-sync.service";
import { PrivyController } from "./privy.controller";

describe("Privy verified backend-session identity", () => {
  it.each(["0x0000000000000000000000000000000000000001", null])(
    "returns the guard-verified DID for wallet %s",
    async wallet => {
      // These DI doubles cover only the check-wallet route; no provider is called.
      const auth = {
        createToken: jest.fn().mockReturnValue("signed-backend-token"),
      } as unknown as AuthService;
      const users = {
        upsertPrivyUser: jest.fn().mockResolvedValue({ success: true }),
        syncPrivyEmails: jest.fn().mockResolvedValue(undefined),
        updateLinkedAccounts: jest.fn(),
        syncUserLinkedWallets: jest.fn(),
        getCryptoNativeStatus: jest.fn().mockResolvedValue(false),
        hasVerifiedEmail: jest.fn().mockResolvedValue(true),
      } as unknown as UserService;
      const privy = {
        getOrCreateUserEmbeddedWallet: jest.fn().mockResolvedValue(wallet),
      } as unknown as PrivyService;
      const telemetry = {} as unknown as TelemetryService;
      const permissions = {
        getPermissionsForWallet: jest
          .fn()
          .mockResolvedValue([{ name: "USER" }]),
      } as unknown as PermissionService;
      const threatSync = {
        syncUser: jest.fn().mockResolvedValue(undefined),
      } as unknown as PrivyThreatSyncService;
      const controller = new PrivyController(
        auth,
        users,
        privy,
        new ConfigService(),
        telemetry,
        permissions,
        threatSync,
      );
      // The guard supplies a provider User; unrelated fields are unused here.
      const user = { id: "did:privy:verified-account" } as User;
      expect(await controller.checkWallet(user)).toMatchObject({
        privyDid: user.id,
        token: "signed-backend-token",
      });
      expect(privy.getOrCreateUserEmbeddedWallet).toHaveBeenCalledWith(user);
    },
  );
});
