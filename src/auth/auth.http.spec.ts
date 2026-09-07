import { Controller, Get, INestApplication, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { GraphRepository } from "src/postgres/graph.repository";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import { AuthService } from "./auth.service";
import { PBACGuard } from "./pbac.guard";

@Controller()
@UseGuards(PBACGuard)
class AuthTestController {
  @Get("public")
  public(@Session() session: SessionObject): SessionObject {
    return session;
  }

  @Get("private")
  @Permissions("USER")
  private(@Session() session: SessionObject): SessionObject {
    return session;
  }

  @Get("admin")
  @Permissions("SUPER_ADMIN")
  admin(): { success: boolean } {
    return { success: true };
  }
}

describe("HTTP authentication boundary", () => {
  let app: INestApplication;
  let auth: AuthService;
  const secret = "http-authentication-test-secret";
  const address = "synthetic-user";
  const jwt = new JwtService();
  const graph = {
    findNode: jest.fn(),
    findRelatedNodes: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthTestController],
      providers: [
        AuthService,
        PBACGuard,
        { provide: JwtService, useValue: jwt },
        { provide: GraphRepository, useValue: graph },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_SECRET: secret,
            JWT_EXPIRES_IN: "1h",
          }),
        },
      ],
    }).compile();
    auth = module.get(AuthService);
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    graph.findNode.mockReset().mockResolvedValue({
      properties: { cryptoNative: false },
    });
    graph.findRelatedNodes
      .mockReset()
      .mockResolvedValue([{ properties: { name: "USER" } }]);
  });

  afterAll(async () => app?.close());

  it("keeps public endpoints anonymous without credentials", async () => {
    await request(app.getHttpServer()).get("/public").expect(200).expect({
      address: null,
      cryptoNative: false,
      permissions: [],
    });
    expect(graph.findNode).not.toHaveBeenCalled();
  });

  it("denies unauthenticated access to protected endpoints", async () => {
    await request(app.getHttpServer()).get("/private").expect(403);
  });

  it.each<[string, () => string]>([
    ["forged", (): string => jwt.sign({ address }, { secret: "wrong-secret" })],
    ["expired", (): string => jwt.sign({ address }, { secret, expiresIn: -1 })],
    ["unsigned", (): string => jwt.sign({ address }, { algorithm: "none" })],
  ])(
    "rejects %s tokens without consulting account permissions",
    async (_name, token) => {
      const authorization = `Bearer ${token()}`;
      graph.findRelatedNodes.mockResolvedValue([
        { properties: { name: "SUPER_ADMIN" } },
      ]);
      await request(app.getHttpServer())
        .get("/private")
        .set("Authorization", authorization)
        .expect(403);
      await request(app.getHttpServer())
        .get("/admin")
        .set("Authorization", authorization)
        .expect(403);
      await request(app.getHttpServer())
        .get("/public")
        .set("Authorization", authorization)
        .expect(200)
        .expect({ address: null, cryptoNative: false, permissions: [] });
      expect(graph.findNode).not.toHaveBeenCalled();
      expect(graph.findRelatedNodes).not.toHaveBeenCalled();
    },
  );

  it("allows valid sessions but does not trust elevated token permissions", async () => {
    const token = auth.createToken({
      address,
      permissions: ["SUPER_ADMIN"],
      cryptoNative: true,
    });
    await request(app.getHttpServer())
      .get("/private")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect({ address, cryptoNative: false, permissions: ["USER"] });
    await request(app.getHttpServer())
      .get("/admin")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("permits current administrators with valid credentials", async () => {
    graph.findRelatedNodes.mockResolvedValue([
      { properties: { name: "SUPER_ADMIN" } },
    ]);
    const token = auth.createToken({
      address,
      permissions: [],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .get("/admin")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("denies deleted users even if permission records remain", async () => {
    graph.findNode.mockResolvedValue(null);
    const token = auth.createToken({
      address,
      permissions: [],
      cryptoNative: false,
    });
    await request(app.getHttpServer())
      .get("/private")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
