import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { CheckWalletPermissions } from "src/shared/constants";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces.controller";
import { AccessWorkspacesService } from "./access-workspaces.service";

describe("AccessWorkspace and Inspect route contracts", () => {
  it("exposes explicit workspace/member routes without domain autojoin", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccessWorkspacesController)).toBe(
      "access-workspaces",
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AccessWorkspacesController.prototype.putMember,
      ),
    ).toBe(":workspaceId/members");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AccessWorkspacesController.prototype.removeMember,
      ),
    ).toBe(":workspaceId/members/:userId");
    for (const method of Object.getOwnPropertyNames(
      AccessWorkspacesController.prototype,
    )) {
      expect(method.toLowerCase()).not.toContain("autojoin");
    }
  });

  it("lists only the signed-in user's workspaces", async () => {
    const workspaces = {
      list: jest.fn().mockResolvedValue([{ id: "workspace" }]),
    } as unknown as AccessWorkspacesService;
    const controller = new AccessWorkspacesController(workspaces);

    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AccessWorkspacesController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AccessWorkspacesController.prototype.list,
      ),
    ).toBe("/");
    expect(
      Reflect.getMetadata(
        HEADERS_METADATA,
        AccessWorkspacesController.prototype.list,
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          name: "Cache-Control",
          value: "no-cache, private, no-store, must-revalidate",
        },
      ]),
    );
    await expect(
      controller.list({ address: "signed-in-user" } as never),
    ).resolves.toEqual({
      success: true,
      message: "Workspaces retrieved successfully",
      data: [{ id: "workspace" }],
    });
    expect(workspaces.list).toHaveBeenCalledWith("signed-in-user");
  });

  it("returns bounty opportunities only through the workspace service and disables caching", async () => {
    const data = {
      summary: { openJobCount: 1, companyCount: 1, disclosedAmountCount: 1 },
      companies: [],
      jobs: [],
    };
    const workspaces = {
      listBountyOpportunities: jest.fn().mockResolvedValue(data),
    } as unknown as AccessWorkspacesService;
    const controller = new AccessWorkspacesController(workspaces);
    const method = AccessWorkspacesController.prototype.listBountyOpportunities;

    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ":workspaceId/bounty-opportunities",
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toEqual(
      expect.arrayContaining([
        {
          name: "Cache-Control",
          value: "no-cache, private, no-store, must-revalidate",
        },
      ]),
    );
    await expect(
      controller.listBountyOpportunities(
        { address: "viewer" } as never,
        "workspace",
        "25",
      ),
    ).resolves.toEqual({
      success: true,
      message: "Bounty opportunities retrieved successfully",
      data,
    });
    expect(workspaces.listBountyOpportunities).toHaveBeenCalledWith(
      "workspace",
      "viewer",
      25,
    );
  });

  it("keeps both Inspect operations POST-only and no-store", () => {
    expect(Reflect.getMetadata(PATH_METADATA, InspectController)).toBe(
      "inspect",
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, InspectController)).toContain(
      ThrottlerGuard,
    );
    for (const method of [
      InspectController.prototype.inspect,
      InspectController.prototype.reveal,
    ]) {
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toEqual(
        expect.arrayContaining([
          {
            name: "Cache-Control",
            value: "no-cache, private, no-store, must-revalidate",
          },
          { name: "Pragma", value: "no-cache" },
          { name: "Expires", value: "0" },
        ]),
      );
      expect(String(Reflect.getMetadata(PATH_METADATA, method))).not.toContain(
        "email",
      );
      expect(String(Reflect.getMetadata(PATH_METADATA, method))).not.toContain(
        "fields",
      );
    }
  });

  it("returns the stable generic response without logging reveal values", async () => {
    const workspaces = {
      reveal: jest
        .fn()
        .mockResolvedValue({ "info.email": "private@example.com" }),
    } as unknown as AccessWorkspacesService;
    const controller = new InspectController(workspaces);

    await expect(
      controller.reveal({ address: "analyst" } as never, "acme", {
        workspaceId: "f9500341-2ccd-4a1b-909a-853f66c41285",
        fields: ["info.email"],
      }),
    ).resolves.toEqual({
      success: true,
      message: "Profile fields revealed successfully",
      data: { "info.email": "private@example.com" },
    });
    expect(workspaces.reveal).toHaveBeenCalledWith(
      "f9500341-2ccd-4a1b-909a-853f66c41285",
      "analyst",
      "acme",
      ["info.email"],
    );
    expect(controller).not.toHaveProperty("logger");
    expect(controller).not.toHaveProperty("cache");
  });

  it("exposes domain transfer only as an explicit superadmin operation", async () => {
    const workspaces = {
      transferDomain: jest.fn().mockResolvedValue({ id: "audit" }),
    } as unknown as AccessWorkspacesService;
    const controller = new AccessWorkspacesController(workspaces);
    expect(
      Reflect.getMetadata(
        "permissions",
        AccessWorkspacesController.prototype.transferDomain,
      ),
    ).toEqual([CheckWalletPermissions.SUPER_ADMIN]);

    await expect(
      controller.transferDomain(
        { address: "superadmin" } as never,
        "workspace",
        {
          domain: "example.com",
          reason: "Reviewed domain ownership transfer",
          superadminBypass: true,
        },
      ),
    ).resolves.toEqual({
      success: true,
      message: "Workspace domain transferred successfully",
      data: { id: "audit" },
    });
  });
});
