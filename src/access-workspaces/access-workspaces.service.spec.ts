import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

const repository = () =>
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

  it("requires an entitled workspace membership without legacy fallbacks", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.authorize.mockResolvedValueOnce(null).mockResolvedValueOnce({
      workspaceId: "workspace",
      role: "viewer",
      entitled: true,
    });

    await expect(
      service.requireAgencyEntitlement("workspace", "outsider"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.requireAgencyEntitlement("workspace", "viewer"),
    ).resolves.toMatchObject({ role: "viewer", entitled: true });
  });

  it("checks Agency entitlement before loading bounty opportunities and caps the limit", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.authorize.mockResolvedValue({
      workspaceId: "workspace",
      role: "viewer",
      entitled: true,
    });
    repo.listBountyOpportunities.mockResolvedValue({
      summary: { openJobCount: 0, companyCount: 0, disclosedAmountCount: 0 },
      companies: [],
      jobs: [],
    });

    await service.listBountyOpportunities("workspace", "viewer", 500);

    expect(repo.authorize).toHaveBeenCalledWith("workspace", "viewer");
    expect(repo.listBountyOpportunities).toHaveBeenCalledWith(100);
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

  it("requires an active Agency entitlement and strips email-like data", async () => {
    const repo = repository();
    const service = new AccessWorkspacesService(repo);
    repo.inspectProfile.mockResolvedValueOnce({
      authorization: {
        workspaceId: "workspace",
        role: "viewer",
        entitled: false,
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
      },
      payload: { info: { email: "private@example.com" } },
      recentRevealCount: 0,
    });
    await expect(
      service.reveal("workspace", "analyst", "acme", ["info.email"]),
    ).resolves.toEqual({ "info.email": "private@example.com" });
  });
});
