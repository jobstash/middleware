import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

const repository = (): jest.Mocked<AccessWorkspacesRepository> =>
  ({
    create: jest.fn(),
    getForMember: jest.fn(),
    putMember: jest.fn(),
    removeMember: jest.fn(),
    authorize: jest.fn(),
    transferDomain: jest.fn(),
    inspectProfile: jest.fn(),
    listForMember: jest.fn(),
    listBountyOpportunities: jest.fn(),
  }) as unknown as jest.Mocked<AccessWorkspacesRepository>;

describe("AccessWorkspacesService", () => {
  it("lists workspaces through signed-in membership only", async () => {
    const repo = repository();
    repo.listForMember.mockResolvedValue([
      { id: "workspace", currentRole: "analyst" },
    ]);
    const service = new AccessWorkspacesService(repo);

    await expect(service.list("signed-in-user")).resolves.toEqual([
      { id: "workspace", currentRole: "analyst" },
    ]);
    expect(repo.listForMember).toHaveBeenCalledWith("signed-in-user");
  });

  it("normalizes a registrable domain and creates with entitlements off", async () => {
    const repo = repository();
    repo.create.mockResolvedValue({
      id: "workspace",
      unlimitedSeats: true,
      entitlementEnabled: false,
    });
    const service = new AccessWorkspacesService(repo);

    await expect(
      service.create("owner", "profile", " HTTPS://EXAMPLE.COM/path "),
    ).resolves.toMatchObject({
      unlimitedSeats: true,
      entitlementEnabled: false,
    });
    expect(repo.create).toHaveBeenCalledWith({
      ownerUserId: "owner",
      primaryProfileId: "profile",
      normalizedDomain: "example.com",
    });
  });

  it("rejects subdomains and exposes uniqueness as a conflict", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);

    await expect(
      service.create("owner", "profile", "jobs.example.com"),
    ).rejects.toBeInstanceOf(BadRequestException);

    repo.create.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        code: "23505",
      }),
    );
    await expect(
      service.create("owner", "profile", "example.com"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("fails member mutations closed when the repository denies the role", async () => {
    const repo = repository();
    repo.putMember.mockResolvedValue(false);
    repo.removeMember.mockResolvedValue(false);
    const service = new AccessWorkspacesService(repo);

    await expect(
      service.putMember("workspace", "viewer", "next", "analyst"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.removeMember("workspace", "analyst", "next"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    { entitled: false, alertsEnabled: true },
    { entitled: true, alertsEnabled: false },
    { entitled: true, alertsEnabled: true },
  ])(
    "allows Agency product access with %o without changing paid state",
    async state => {
      const repo = repository();
      const service = new AccessWorkspacesService(repo);
      const authorization = {
        workspaceId: "workspace",
        role: "viewer" as const,
        ...state,
      };
      repo.authorize.mockResolvedValue(authorization);

      await expect(
        service.requireAgencyAccess("workspace", "viewer"),
      ).resolves.toBe(authorization);
    },
  );

  it.each([
    null,
    {
      workspaceId: "workspace",
      role: "viewer" as const,
      entitled: false,
      alertsEnabled: false,
    },
  ])(
    "denies Agency products without membership or either grant: %o",
    async authorization => {
      const repo = repository();
      repo.authorize.mockResolvedValue(authorization);
      const service = new AccessWorkspacesService(repo);

      await expect(
        service.requireAgencyAccess("workspace", "outsider"),
      ).rejects.toThrow(
        "Agency partner approval or an active Agency subscription is required",
      );
      await expect(
        service.listBountyOpportunities("workspace", "outsider", 50),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.listBountyOpportunities).not.toHaveBeenCalled();
    },
  );

  it("checks Agency access before loading bounty opportunities and caps the limit", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.authorize.mockResolvedValue({
      workspaceId: "workspace",
      role: "viewer",
      entitled: true,
      alertsEnabled: false,
    });
    repo.listBountyOpportunities.mockResolvedValue({
      summary: {
        openJobCount: 0,
        bountyJobCount: 0,
        publishedJobCount: 0,
        companyCount: 0,
        disclosedAmountCount: 0,
        knownTotals: [],
      },
      companies: [],
      jobs: [],
    });

    await service.listBountyOpportunities("workspace", "viewer", 500);

    expect(repo.authorize).toHaveBeenCalledWith("workspace", "viewer");
    expect(repo.listBountyOpportunities).toHaveBeenCalledWith(100, false);
  });

  it("lets a superuser load bounty opportunities without workspace authorization", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.listBountyOpportunities.mockResolvedValue({
      summary: {
        openJobCount: 0,
        bountyJobCount: 0,
        publishedJobCount: 0,
        companyCount: 0,
        disclosedAmountCount: 0,
        knownTotals: [],
      },
      companies: [],
      jobs: [],
    });

    await service.listBountyOpportunitiesForSuperadmin(25, true);

    expect(repo.authorize).not.toHaveBeenCalled();
    expect(repo.listBountyOpportunities).toHaveBeenCalledWith(25, true);
  });

  it("normalizes explicit audited domain transfers and requires bypass", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.transferDomain.mockResolvedValueOnce({
      status: "active_source_requires_bypass",
    });
    await expect(
      service.transferDomain(
        "workspace",
        "superadmin",
        "EXAMPLE.COM",
        "Approved ownership transfer",
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    repo.transferDomain.mockResolvedValueOnce({
      status: "transferred",
      value: { id: "audit", domain: "example.com" },
    });
    await expect(
      service.transferDomain(
        "workspace",
        "superadmin",
        "EXAMPLE.COM",
        "Approved ownership transfer",
        true,
      ),
    ).resolves.toEqual({ id: "audit", domain: "example.com" });
    expect(repo.transferDomain).toHaveBeenLastCalledWith({
      targetWorkspaceId: "workspace",
      actorUserId: "superadmin",
      normalizedDomain: "example.com",
      reason: "Approved ownership transfer",
      superadminBypass: true,
    });
  });

  it("keeps private inspection paid-only even for approved partners and strips email-like data", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "viewer",
        entitled: false,
        alertsEnabled: true,
      },
    });
    await expect(
      service.inspect("workspace", "viewer", "acme"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "viewer",
        entitled: true,
        alertsEnabled: false,
      },
      payload: {
        slug: "acme",
        info: {
          email: "secret@example.com",
          contactEmail: "other@example.com",
          description: "public",
        },
        children: [{ name: "Safe", contact: "private@example.com" }],
      },
    });
    await expect(
      service.inspect("workspace", "viewer", "acme"),
    ).resolves.toEqual({
      slug: "acme",
      info: { description: "public" },
      children: [{ name: "Safe" }],
    });
  });

  it("allows only audited reveal fields for non-viewers and enforces throttle", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);

    await expect(
      service.reveal("workspace", "analyst", "acme", ["info.phone"]),
    ).rejects.toBeInstanceOf(BadRequestException);

    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "viewer",
        entitled: true,
        alertsEnabled: false,
      },
    });
    await expect(
      service.reveal("workspace", "viewer", "acme", ["info.email"]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "analyst",
        entitled: true,
        alertsEnabled: false,
      },
      payload: { info: { email: "private@example.com" } },
      recentRevealCount: 10,
    });
    await expect(
      service.reveal("workspace", "analyst", "acme", ["info.email"]),
    ).rejects.toBeInstanceOf(HttpException);

    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "analyst",
        entitled: true,
        alertsEnabled: false,
      },
      payload: { info: { email: "private@example.com" } },
      recentRevealCount: 0,
    });
    await expect(
      service.reveal("workspace", "analyst", "acme", ["info.email"]),
    ).resolves.toEqual({ "info.email": "private@example.com" });
  });
});
