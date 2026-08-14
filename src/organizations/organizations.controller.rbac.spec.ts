import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrganizationsController } from "./organizations.controller";
import { CheckWalletPermissions } from "src/shared/constants";
import { data, SessionObject } from "src/shared/types";

type OrganizationsControllerFixture = {
  controller: OrganizationsController;
  organizationsService: {
    findByOrgId: jest.Mock;
    getOrgById: jest.Mock;
    getAdminDirectory: jest.Mock;
    getAllForAdminGrid: jest.Mock;
    updateVerticalClassification: jest.Mock;
    update: jest.Mock;
  };
  userService: {
    isOrgMember: jest.Mock;
    isOrgOwner: jest.Mock;
  };
};

describe("OrganizationsController RBAC", () => {
  const buildController = (): OrganizationsControllerFixture => {
    const userService = {
      isOrgMember: jest.fn(),
      isOrgOwner: jest.fn(),
    };
    const organizationsService = {
      findByOrgId: jest.fn(),
      getOrgById: jest.fn(),
      getAdminDirectory: jest.fn(),
      getAllForAdminGrid: jest.fn(),
      updateVerticalClassification: jest.fn(),
      update: jest.fn(),
    };
    const configService = {
      get: jest.fn(() => "test-token"),
    };

    const controller = new OrganizationsController(
      userService as never,
      configService as unknown as ConfigService,
      organizationsService as never,
    );

    return { controller, organizationsService, userService };
  };

  const buildSession = (
    permissions: SessionObject["permissions"],
  ): SessionObject => ({
    address: "0xsuperadmin",
    cryptoNative: false,
    permissions,
  });

  it("does not run org membership checks for super-admin org detail reads", async () => {
    const { controller, organizationsService, userService } = buildController();
    organizationsService.getOrgById.mockResolvedValue({
      orgId: "12256",
      name: "External org",
    });

    const result = await controller.getOrgDetails(
      buildSession([
        CheckWalletPermissions.SUPER_ADMIN,
        CheckWalletPermissions.USER,
        CheckWalletPermissions.ORG_MEMBER,
      ]),
      "12256",
    );

    expect(result.success).toBe(true);
    expect(data(result)).toEqual({ orgId: "12256", name: "External org" });
    expect(userService.isOrgMember).not.toHaveBeenCalled();
  });

  it("normalizes and caps the admin organization directory request", async () => {
    const { controller, organizationsService } = buildController();
    organizationsService.getAdminDirectory.mockResolvedValue({
      data: [{ orgId: "org-1", name: "Acme", projectCount: 2 }],
      total: 1,
    });

    await expect(
      controller.getOrganizationDirectory("  AcMe  ", "5000", "-7"),
    ).resolves.toEqual({
      success: true,
      message: "Retrieved the organization directory successfully",
      data: [{ orgId: "org-1", name: "Acme", projectCount: 2 }],
      total: 1,
    });
    expect(organizationsService.getAdminDirectory).toHaveBeenCalledWith({
      query: "AcMe",
      limit: 100,
      offset: 0,
    });
  });

  it("normalizes server-side organization grid paging and filters", async () => {
    const { controller, organizationsService } = buildController();
    organizationsService.getAllForAdminGrid.mockResolvedValue({
      data: [{ orgId: "org-1", name: "Acme" }],
      total: 1,
    });

    await expect(
      controller.getOrganizationsForAdminGrid(
        "5000",
        "-7",
        "  AcMe  ",
        "true",
        "false",
      ),
    ).resolves.toEqual({
      success: true,
      message: "Retrieved the organization grid successfully",
      data: [{ orgId: "org-1", name: "Acme" }],
      total: 1,
    });
    expect(organizationsService.getAllForAdminGrid).toHaveBeenCalledWith({
      limit: 1000,
      offset: 0,
      query: "AcMe",
      reviewOnly: true,
      bannedOnly: false,
    });
  });

  it("still enforces org membership checks for regular org members", async () => {
    const { controller, organizationsService, userService } = buildController();
    userService.isOrgMember.mockResolvedValue(false);

    await expect(
      controller.getOrgDetails(
        buildSession([
          CheckWalletPermissions.USER,
          CheckWalletPermissions.ORG_MEMBER,
        ]),
        "12256",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(userService.isOrgMember).toHaveBeenCalledWith(
      "0xsuperadmin",
      "12256",
    );
    expect(organizationsService.getOrgById).not.toHaveBeenCalled();
  });

  it("does not run org owner checks for super-admin org updates", async () => {
    const { controller, organizationsService, userService } = buildController();
    organizationsService.findByOrgId.mockResolvedValue({});
    organizationsService.update.mockResolvedValue({
      getProperties: () => ({ orgId: "12256", name: "Updated org" }),
    });

    const result = await controller.updateOrganization(
      buildSession([
        CheckWalletPermissions.SUPER_ADMIN,
        CheckWalletPermissions.USER,
        CheckWalletPermissions.ORG_OWNER,
      ]),
      "12256",
      { name: "Updated org" } as never,
    );

    expect(result).toEqual({
      success: true,
      message: "Organization updated successfully",
      data: { orgId: "12256", name: "Updated org" },
    });
    expect(userService.isOrgOwner).not.toHaveBeenCalled();
  });

  it("forwards guarded classification updates for admins", async () => {
    const { controller, organizationsService } = buildController();
    organizationsService.updateVerticalClassification.mockResolvedValue({
      success: true,
      message: "Organization classification updated successfully",
      data: { vertical: "fintech" },
    });
    const input = {
      expectedVertical: "crypto",
      vertical: "fintech" as const,
      reason: "The current core product is financial infrastructure.",
      evidence: [],
    };

    await expect(
      controller.updateOrganizationClassification("12256", input),
    ).resolves.toMatchObject({
      success: true,
      data: { vertical: "fintech" },
    });
    expect(
      organizationsService.updateVerticalClassification,
    ).toHaveBeenCalledWith("12256", input);
  });
});
