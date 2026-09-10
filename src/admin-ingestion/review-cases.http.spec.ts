import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { AdminIngestionController } from "./admin-ingestion.controller";
import { AdminIngestionService } from "./admin-ingestion.service";

describe("review case HTTP authorization", () => {
  let app: INestApplication;
  let session: { address?: string; permissions: string[] };
  const ingestion = {
    listReviewCases: jest.fn().mockResolvedValue({ cases: [] }),
    getReviewCase: jest.fn().mockResolvedValue({}),
    resolveReviewCase: jest.fn().mockResolvedValue({ outcome: "resolved" }),
    getReviewDecision: jest.fn().mockResolvedValue({}),
    installReviewSchema: jest.fn().mockResolvedValue({ installed: true }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminIngestionController],
      providers: [
        PBACGuard,
        {
          provide: AuthService,
          useValue: { getSession: jest.fn(async () => session) },
        },
        { provide: AdminIngestionService, useValue: ingestion },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    session = { permissions: [] };
    jest.clearAllMocks();
  });
  it("denies every case API to anonymous and ordinary signed-in accounts", async () => {
    for (const s of [
      { permissions: [] },
      { address: "wallet", permissions: [] },
    ]) {
      session = s;
      await request(app.getHttpServer())
        .get("/admin/ingestion/entity-enrichment/review-cases")
        .expect(403);
      await request(app.getHttpServer())
        .get("/admin/ingestion/entity-enrichment/review-cases/entity:1")
        .expect(403);
      await request(app.getHttpServer())
        .post(
          "/admin/ingestion/entity-enrichment/review-cases/entity:1/resolve",
        )
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post("/admin/ingestion/entity-enrichment/review-schema/install")
        .expect(403);
    }
    expect(ingestion.resolveReviewCase).not.toHaveBeenCalled();
  });
  it("admits super admins and attaches the authenticated session actor", async () => {
    session = {
      address: "authenticated-wallet",
      permissions: [CheckWalletPermissions.SUPER_ADMIN],
    };
    await request(app.getHttpServer())
      .get("/admin/ingestion/entity-enrichment/review-cases?limit=20")
      .expect(200);
    await request(app.getHttpServer())
      .post("/admin/ingestion/entity-enrichment/review-cases/entity:1/resolve")
      .send({ reason: "Verified" })
      .expect(201);
    expect(ingestion.resolveReviewCase).toHaveBeenCalledWith(
      "entity:1",
      expect.objectContaining({
        reason: "Verified",
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
      "authenticated-wallet",
    );
  });
});
