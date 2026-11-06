import { ConfigService } from "@nestjs/config";
import { PrivyClient } from "@privy-io/node";
import { PrivyService } from "./privy.service";

jest.mock("@privy-io/node", () => ({
  PrivyClient: jest.fn(),
  NotFoundError: class extends Error {},
}));

describe("Privy supported SDK migration", () => {
  const user = {
    id: "did:privy:test",
    created_at: 1_800_000_000,
    linked_accounts: [
      {
        type: "wallet",
        address: "0xEmbedded",
        wallet_client_type: "privy",
        chain_type: "ethereum",
      },
      {
        type: "wallet",
        address: "0xExternal",
        wallet_client_type: "rainbow",
        chain_type: "ethereum",
      },
    ],
  };

  function setup(): {
    service: PrivyService;
    users: Record<
      "create" | "_get" | "getByEmailAddress" | "delete" | "list",
      jest.Mock
    >;
    wallets: { create: jest.Mock };
  } {
    const users = {
      create: jest.fn().mockResolvedValue(user),
      _get: jest.fn().mockResolvedValue(user),
      getByEmailAddress: jest.fn().mockResolvedValue(user),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(async function* () {
        yield user;
        yield { ...user, id: "did:privy:second-page" };
      }),
    };
    const wallets = {
      create: jest.fn().mockResolvedValue({ address: "0xNew" }),
    };
    jest.mocked(PrivyClient).mockImplementation(
      () =>
        ({
          users: () => users,
          wallets: () => wallets,
        }) as unknown as PrivyClient,
    );
    const service = new PrivyService(
      new ConfigService({
        PRIVY_APP_ID: "test-app",
        PRIVY_APP_SECRET: "test-secret",
      }),
    );
    return { service, users, wallets };
  }

  it("creates linked accounts with the supported snake-case API", async () => {
    const { service, users } = setup();
    await service.createUser({
      wallets: ["0xExternal"],
      email: "test@example.com",
      github: "test-user",
      name: "Test",
    });
    expect(users.create).toHaveBeenCalledWith({
      linked_accounts: [
        {
          type: "wallet",
          wallet_client_type: "rainbow",
          address: "0xExternal",
          chain_type: "ethereum",
          connector_type: "wallet_connect",
        },
        { type: "email", address: "test@example.com" },
        {
          type: "github_oauth",
          username: "test-user",
          subject: "-1",
          email: "test@example.com",
          name: "Test",
        },
      ],
      wallets: [{ chain_type: "ethereum" }],
    });
  });

  it("reads provider wallets without exposing embedded wallets as linked wallets", async () => {
    const { service, users } = setup();
    expect(await service.getUserLinkedWallets(user.id)).toEqual(["0xExternal"]);
    expect(users._get).toHaveBeenCalledWith(user.id);
    expect(
      await service.getOrCreateUserEmbeddedWallet(
        await service.getUserById(user.id),
      ),
    ).toBe("0xEmbedded");
  });

  it("preserves email lookup, paginated user enumeration, and deletion", async () => {
    const { service, users } = setup();
    await service.getUserByEmail("test@example.com");
    expect(users.getByEmailAddress).toHaveBeenCalledWith({
      address: "test@example.com",
    });
    expect((await service.getUsers()).map(account => account.id)).toEqual([
      user.id,
      "did:privy:second-page",
    ]);
    await service.deletePrivyUser(user.id);
    expect(users.delete).toHaveBeenCalledWith(user.id);
  });
});
