import { CheckWalletPermissions } from "src/shared/constants";
import { Subscription } from "src/shared/interfaces/org";
import { UserService } from "./user.service";

function setup(): {
  service: UserService;
  count: jest.Mock;
  owner: jest.Mock;
  verifications: jest.Mock;
  addSeat: jest.Mock;
  permissions: jest.Mock;
  sync: jest.Mock;
  plan: { isActive: jest.Mock; totalSeats: number };
} {
  const count = jest.fn().mockResolvedValue(0);
  const owner = jest.fn().mockResolvedValue(false);
  const verifications = jest.fn().mockResolvedValue({
    success: true,
    data: [{ id: "org", credential: "email" }],
  });
  const addSeat = jest.fn().mockResolvedValue(undefined);
  const permissions = jest
    .fn()
    .mockResolvedValue([{ name: CheckWalletPermissions.USER }]);
  const sync = jest.fn().mockResolvedValue(undefined);
  const service = Object.assign(Object.create(UserService.prototype), {
    logger: { log: jest.fn(), error: jest.fn() },
    getOrgUserCount: count,
    orgHasOwner: owner,
    profileService: { getUserVerifications: verifications },
    users: { addOrganizationSeat: addSeat },
    permissionService: { getPermissionsForWallet: permissions },
    syncUserPermissions: sync,
  }) as UserService;
  const plan = { isActive: jest.fn().mockReturnValue(true), totalSeats: 2 };
  return {
    service,
    count,
    owner,
    verifications,
    addSeat,
    permissions,
    sync,
    plan,
  };
}

describe("organization seat authorization", () => {
  it("does not read seat or identity evidence for an inactive plan", async () => {
    const h = setup();
    h.plan.isActive.mockReturnValue(false);
    await expect(
      h.service.addOrgUser("org", "wallet", h.plan as unknown as Subscription),
    ).resolves.toMatchObject({ success: false });
    expect(h.count).not.toHaveBeenCalled();
    expect(h.verifications).not.toHaveBeenCalled();
    expect(h.addSeat).not.toHaveBeenCalled();
  });
  it.each([2, 3, Number.NaN])(
    "fails closed when count %s is not below capacity",
    async count => {
      const h = setup();
      h.count.mockResolvedValue(count);
      await expect(
        h.service.addOrgUser(
          "org",
          "wallet",
          h.plan as unknown as Subscription,
        ),
      ).resolves.toMatchObject({
        success: false,
        message: "Organization has reached its maximum number of members",
      });
      expect(h.owner).not.toHaveBeenCalled();
      expect(h.verifications).not.toHaveBeenCalled();
      expect(h.addSeat).not.toHaveBeenCalled();
    },
  );
  it.each([
    { organizations: [] },
    { organizations: [{ id: "org", credential: "github" }] },
  ])("requires organization email evidence", async ({ organizations }) => {
    const h = setup();
    h.verifications.mockResolvedValue({ success: true, data: organizations });
    await expect(
      h.service.addOrgUser("org", "wallet", h.plan as unknown as Subscription),
    ).resolves.toMatchObject({ success: false });
    expect(h.addSeat).not.toHaveBeenCalled();
    expect(h.permissions).not.toHaveBeenCalled();
  });
  it("writes the owner seat before syncing its existing and new permissions", async () => {
    const h = setup();
    await expect(
      h.service.addOrgUser("org", "wallet", h.plan as unknown as Subscription),
    ).resolves.toMatchObject({ success: true });
    expect(h.addSeat).toHaveBeenCalledWith(
      "org",
      "wallet",
      "owner",
      expect.any(String),
    );
    expect(h.sync).toHaveBeenCalledWith("wallet", [
      CheckWalletPermissions.USER,
      CheckWalletPermissions.ORG_MEMBER,
      CheckWalletPermissions.ORG_OWNER,
    ]);
    expect(h.addSeat.mock.invocationCallOrder[0]).toBeLessThan(
      h.permissions.mock.invocationCallOrder[0],
    );
    expect(h.permissions.mock.invocationCallOrder[0]).toBeLessThan(
      h.sync.mock.invocationCallOrder[0],
    );
  });
});
