import { CheckWalletPermissions } from "src/shared/constants";
import { TelemetryController } from "./telemetry.controller";

describe("TelemetryController dashboard authorization", () => {
  const dashboardStats = jest.fn().mockResolvedValue({ success: true });
  const dashboardSeries = jest.fn().mockResolvedValue({ success: true });
  const dashboardPerformance = jest.fn().mockResolvedValue({ success: true });
  const findOrganizationId = jest.fn().mockResolvedValue("org-1");

  const controller = new TelemetryController(
    {
      findOrgIdByMemberUserWallet: findOrganizationId,
    } as never,
    {
      getDashboardJobStats: dashboardStats,
      getDashboardJobStatsSeries: dashboardSeries,
      getDashboardJobPerformance: dashboardPerformance,
    } as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("allows only superusers to request the universe scope", async () => {
    await expect(
      controller.getDashboardStats(
        {
          address: "superuser",
          permissions: [CheckWalletPermissions.SUPER_ADMIN],
        } as never,
        { type: "ecosystem", id: "universe" },
      ),
    ).resolves.toEqual({ success: true });
    expect(findOrganizationId).not.toHaveBeenCalled();
    expect(dashboardStats).toHaveBeenCalledWith({
      type: "ecosystem",
      id: "universe",
    });

    await expect(
      controller.getDashboardStats(
        {
          address: "member",
          permissions: [
            CheckWalletPermissions.USER,
            CheckWalletPermissions.ORG_MEMBER,
          ],
        } as never,
        { type: "ecosystem", id: "universe" },
      ),
    ).resolves.toMatchObject({ success: false });
  });

  it("allows an organization member to request only their organization", async () => {
    const session = {
      address: "member",
      permissions: [
        CheckWalletPermissions.USER,
        CheckWalletPermissions.ORG_MEMBER,
      ],
    } as never;

    await expect(
      controller.getDashboardStats(session, {
        type: "organization",
        id: "org-1",
      }),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.getDashboardStats(session, {
        type: "organization",
        id: "org-2",
      }),
    ).resolves.toMatchObject({ success: false });
  });
});
