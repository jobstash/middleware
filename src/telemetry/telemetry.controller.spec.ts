import { CheckWalletPermissions } from "src/shared/constants";
import { TelemetryController } from "./telemetry.controller";
import { ExecutionContext, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PBACGuard } from "src/auth/pbac.guard";
import { RecommendationMetricsInput } from "./dto/recommendation-metrics.input";

describe("TelemetryController dashboard authorization", () => {
  it("restricts recommendation metrics to authenticated super admins", async () => {
    const getSession = jest.fn();
    const guard = new PBACGuard(new Reflector(), { getSession } as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
      getHandler: () => TelemetryController.prototype.getRecommendationMetrics,
      getClass: () => TelemetryController,
    } as unknown as ExecutionContext;
    for (const session of [
      null,
      {
        address: "member",
        permissions: [
          CheckWalletPermissions.USER,
          CheckWalletPermissions.ORG_MEMBER,
        ],
      },
    ]) {
      getSession.mockResolvedValue(session);
      await expect(guard.canActivate(context)).rejects.toThrow("Forbidden");
    }
    getSession.mockResolvedValue({
      address: "admin",
      permissions: [CheckWalletPermissions.SUPER_ADMIN],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("bounds metric queries and rejects unexpected inputs", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = {
      type: "query" as const,
      metatype: RecommendationMetricsInput,
    };
    await expect(pipe.transform({}, metadata)).resolves.toMatchObject({
      days: 30,
      k: 3,
    });
    await expect(
      pipe.transform({ days: "90", k: "50" }, metadata),
    ).resolves.toMatchObject({ days: 90, k: 50 });
    for (const input of [
      { days: 91 },
      { days: 0 },
      { k: 51 },
      { k: 1.5 },
      { wallet: "someone" },
    ]) {
      await expect(pipe.transform(input, metadata)).rejects.toThrow();
    }
  });
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
