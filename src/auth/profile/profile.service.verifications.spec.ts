import { data } from "src/shared/types";
import { ProfileService } from "./profile.service";

describe("ecosystem activation verification links", () => {
  it.each([false, true])(
    "preserves HTTPS links and identity on bypassCache=%s",
    async bypassCache => {
      const activation = {
        id: "fixture-activation",
        name: "Fixture Activation",
      };
      const savedVerifications: unknown[][] = [];
      const profiles = {
        getVerifications: jest.fn().mockResolvedValue([]),
        replaceVerifications: jest.fn(async (_wallet, values) => {
          savedVerifications.push([...values]);
        }),
      };
      const getUserWorkHistory = jest.fn().mockResolvedValue({
        workHistory: [],
        wallets: [
          { address: "fixture-wallet", ecosystemActivations: [activation] },
          { address: "second-wallet", ecosystemActivations: [activation] },
        ],
      });
      const service = Object.assign(Object.create(ProfileService.prototype), {
        profiles,
        getUserCacheLock: jest.fn().mockResolvedValue(Date.now() + 1_000_000),
        getUserProfile: jest.fn().mockResolvedValue({
          success: true,
          data: { linkedAccounts: {}, alternateEmails: [] },
        }),
        getUserWorkHistory,
        refreshUserCacheLock: jest.fn().mockResolvedValue(undefined),
        logger: { log: jest.fn(), error: jest.fn() },
      }) as ProfileService;
      const response = await service.getUserVerifications(
        "fixture-wallet",
        bypassCache,
        true,
      );
      expect(response.success).toBe(true);
      expect(data(response)).toHaveLength(1);
      expect(data(response)[0]).toMatchObject({
        id: activation.id,
        name: activation.name,
        url: "https://ethglobal.com/packs",
        logo: "https://ethglobal.com",
        account: "fixture-wallet",
        hasOwner: true,
        isOwner: true,
        isMember: true,
        credential: "ecosystemActivation",
      });
      if (bypassCache) {
        expect(savedVerifications).toEqual([[]]);
        expect(getUserWorkHistory).toHaveBeenCalledWith("fixture-wallet", true);
      } else {
        expect(profiles.getVerifications).toHaveBeenCalledWith(
          "fixture-wallet",
        );
        expect(profiles.replaceVerifications).not.toHaveBeenCalled();
      }
    },
  );
});
