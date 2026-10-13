import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { GraphRepository } from "src/postgres/graph.repository";
import { AgencyAlertsController } from "./agency-alerts.controller";
import { AgencyAlertsAdminController } from "./agency-alerts-admin.controller";
import { AgencyAlertsService } from "./agency-alerts.service";
import { AgencyAlertsAdminService } from "./agency-alerts-admin.service";

const workspaceId = "c91c41b7-8c1e-4015-8606-2d9f047017c1";

describe("Agency Alert HTTP identity and administrator boundary", () => {
  let app: INestApplication;
  let auth: AuthService;
  const graph = { findNode: jest.fn(), findRelatedNodes: jest.fn() };
  const alerts = {
    follow: jest.fn(),
    state: jest.fn(),
    search: jest.fn(),
    unfollow: jest.fn(),
  };
  const partners = {
    list: jest.fn(),
    provision: jest.fn(),
    approve: jest.fn(),
    putMember: jest.fn(),
    removeMember: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60_000, limit: 1000 },
        ]),
      ],
      controllers: [AgencyAlertsController, AgencyAlertsAdminController],
      providers: [
        AuthService,
        PBACGuard,
        { provide: JwtService, useValue: new JwtService() },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_SECRET: "agency-http-secret",
            JWT_EXPIRES_IN: "1h",
          }),
        },
        { provide: GraphRepository, useValue: graph },
        { provide: AgencyAlertsService, useValue: alerts },
        { provide: AgencyAlertsAdminService, useValue: partners },
      ],
    }).compile();
    auth = module.get(AuthService);
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    graph.findNode.mockResolvedValue({ properties: { cryptoNative: false } });
    graph.findRelatedNodes.mockResolvedValue([
      { properties: { name: "USER" } },
    ]);
    alerts.follow.mockResolvedValue({ enabled: true, follows: [] });
    partners.approve.mockResolvedValue({
      id: workspaceId,
      alertsEnabled: true,
    });
  });

  it("denies anonymous users and never accepts recipient or actor overrides", async () => {
    await request(app.getHttpServer())
      .post(`/access-workspaces/${workspaceId}/alerts/follows`)
      .send({ organizationId: "org" })
      .expect(403);
    const token = auth.createToken({
      address: "member",
      permissions: ["USER"],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .post(`/access-workspaces/${workspaceId}/alerts/follows`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId: "org",
        email: "outsider@example.com",
        userId: "other",
      })
      .expect(400);
    expect(alerts.follow).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`/access-workspaces/${workspaceId}/alerts/follows`)
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: "org" })
      .expect(201);
    expect(alerts.follow).toHaveBeenCalledWith(workspaceId, "member", "org");
  });

  it("requires actual POST for mutations", async () => {
    const token = auth.createToken({
      address: "member",
      permissions: ["USER"],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .get(`/access-workspaces/${workspaceId}/alerts/follows`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    expect(alerts.follow).not.toHaveBeenCalled();
  });

  it("denies member and forged token administrator claims when changing whitelist", async () => {
    const token = auth.createToken({
      address: "member",
      permissions: ["SUPER_ADMIN"],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .post(`/agency-alerts/admin/workspaces/${workspaceId}/approval`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .post("/agency-alerts/admin/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({
        primaryProfileId: "profile",
        ownerUserId: "member",
        domain: "example.com",
      })
      .expect(403);
    expect(partners.approve).not.toHaveBeenCalled();
    expect(partners.provision).not.toHaveBeenCalled();
  });

  it("uses authoritative superadmin identity and forbids paid grant fields", async () => {
    graph.findRelatedNodes.mockResolvedValue([
      { properties: { name: "SUPER_ADMIN" } },
    ]);
    const token = auth.createToken({
      address: "platform-admin",
      permissions: [],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .post(`/agency-alerts/admin/workspaces/${workspaceId}/approval`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, entitlementEnabled: true })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/agency-alerts/admin/workspaces/${workspaceId}/approval`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true })
      .expect(201);
    expect(partners.approve).toHaveBeenCalledWith(
      workspaceId,
      "platform-admin",
      true,
    );
  });
});
