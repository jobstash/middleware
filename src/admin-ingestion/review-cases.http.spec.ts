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
    createReviewRun: jest.fn().mockResolvedValue({ state: "paused" }),
    getReviewRun: jest.fn().mockResolvedValue({}),
    getReviewRunItems: jest.fn().mockResolvedValue({ items: [] }),
    getReviewRunLedger: jest.fn().mockResolvedValue({ entries: [] }),
    updateReviewRun: jest.fn().mockResolvedValue({}),
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

  const runId = "8c1493f2-4cd6-4c42-9599-387795ce5c90";
  const runsPath = "/admin/ingestion/entity-enrichment/review-runs";
  const operations = ["import", "pause", "resume", "concurrency", "resources"];

  it("protects every durable review run read and control with super-admin authorization", async () => {
    for (const account of [
      { permissions: [] },
      { address: "ordinary-wallet", permissions: [] },
    ]) {
      session = account;
      await request(app.getHttpServer()).post(runsPath).send({}).expect(403);
      for (const suffix of ["", "/items", "/ledger"])
        await request(app.getHttpServer())
          .get(`${runsPath}/${runId}${suffix}`)
          .expect(403);
      for (const operation of operations)
        await request(app.getHttpServer())
          .post(`${runsPath}/${runId}/${operation}`)
          .send({})
          .expect(403);
    }
    expect(ingestion.createReviewRun).not.toHaveBeenCalled();
    expect(ingestion.updateReviewRun).not.toHaveBeenCalled();
  });

  it("preserves run idempotency, exact imports, query cursors and the authenticated operator", async () => {
    session = {
      address: "authenticated-wallet",
      permissions: [CheckWalletPermissions.SUPER_ADMIN],
    };
    const creation = {
      idempotencyKey: "review-all-open",
      scope: "all_open",
      concurrency: 20,
    };
    await request(app.getHttpServer())
      .post(runsPath)
      .set("X-Jobstash-Review-Actor", "forged-wallet")
      .send(creation)
      .expect(201);
    expect(ingestion.createReviewRun).toHaveBeenCalledWith(
      creation,
      "authenticated-wallet",
    );
    const body = {
      entries: [
        {
          caseId: "entity:123",
          kind: "prepared",
          sourceKey: "prepared/request.json",
          request: { requestId: runId, expectedVersion: "immutable-version" },
          dependencies: ["entity:122"],
        },
      ],
    };
    for (const operation of operations) {
      await request(app.getHttpServer())
        .post(`${runsPath}/${runId}/${operation}`)
        .set("X-Jobstash-Review-Actor", "forged-wallet")
        .send(body)
        .expect(200);
      expect(ingestion.updateReviewRun).toHaveBeenLastCalledWith(
        runId,
        operation,
        ["pause", "resume"].includes(operation) ? undefined : body,
        "authenticated-wallet",
      );
    }
    await request(app.getHttpServer()).get(`${runsPath}/${runId}`).expect(200);
    expect(ingestion.getReviewRun).toHaveBeenCalledWith(runId);
    await request(app.getHttpServer())
      .get(`${runsPath}/${runId}/items?cursor=last-id&limit=20&stage=research`)
      .expect(200);
    expect(ingestion.getReviewRunItems).toHaveBeenCalledWith(
      runId,
      "last-id",
      "20",
      "research",
    );
    await request(app.getHttpServer())
      .get(`${runsPath}/${runId}/ledger?cursor=last-receipt&limit=25`)
      .expect(200);
    expect(ingestion.getReviewRunLedger).toHaveBeenCalledWith(
      runId,
      "last-receipt",
      "25",
    );
    await request(app.getHttpServer())
      .post(`${runsPath}/invalid-uuid/resume`)
      .expect(400);
  });
});
