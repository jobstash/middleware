import { HttpException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Auth0Service } from "src/auth0/auth0.service";
import { PostgresService } from "src/postgres/postgres.service";
import { AdminIngestionService } from "./admin-ingestion.service";

describe("AdminIngestionService", () => {
  const config = {
    get: jest.fn((key: string) =>
      key === "ETL_DOMAIN" ? "https://etl.internal/" : undefined,
    ),
  } as unknown as ConfigService;
  const auth0 = {
    getETLToken: jest.fn().mockResolvedValue("server-token"),
  } as unknown as Auth0Service;
  const postgres = {
    query: jest.fn(),
  } as unknown as PostgresService;
  let service: AdminIngestionService;
  let request: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminIngestionService(config, auth0, postgres);
    request = jest.spyOn(axios, "request").mockResolvedValue({ data: {} });
  });

  it("reads StructuredJobpost refresh progress directly from PostgreSQL", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    (postgres.query as jest.Mock).mockResolvedValueOnce([
      {
        id: runId,
        status: "running",
        scheduledCount: 33732,
        processedCount: 28,
        succeededCount: 28,
        failedCount: 0,
        callsStarted: 28,
        successfulResults: 28,
      },
    ]);

    await expect(service.getStructuredRefresh(runId)).resolves.toMatchObject({
      id: runId,
      status: "running",
      processedCount: 28,
    });
    expect(postgres.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM structured_job_refresh_runs refresh"),
      [runId],
    );
    expect(request).not.toHaveBeenCalled();
    const [sql] = (postgres.query as jest.Mock).mock.calls[0];
    for (const field of [
      "requestFingerprint",
      "sourceFingerprint",
      "maxAttempts",
      "sourceCount",
      "onlineCount",
      "offlineCount",
      "alreadyCompletedCanaryCount",
    ]) {
      expect(sql).toContain(`AS "${field}"`);
    }
  });

  it("selects the current active StructuredJobpost refresh without a fixed run id", async () => {
    (postgres.query as jest.Mock).mockResolvedValueOnce([
      { id: "f9500341-2ccd-4a1b-909a-853f66c41285", status: "running" },
    ]);

    await expect(service.getCurrentStructuredRefresh()).resolves.toMatchObject({
      status: "running",
    });
    expect(postgres.query).toHaveBeenCalledWith(
      expect.stringContaining("refresh.created_at DESC"),
      [null],
    );
    const [query] = (postgres.query as jest.Mock).mock.calls[0];
    expect(query).toContain("refresh.status = 'running'");
    expect(query).toContain("refresh.scope ->> 'kind' = 'all'");
    expect(query).toContain("refresh.completed_at IS NULL");
    expect(query).toContain(
      "refresh.processed_count < refresh.scheduled_count",
    );
  });

  it("returns no current refresh without an active full run, while retaining missing-run errors", async () => {
    (postgres.query as jest.Mock).mockResolvedValue([]);
    await expect(service.getCurrentStructuredRefresh()).resolves.toBeNull();
    await expect(
      service.getStructuredRefresh("f9500341-2ccd-4a1b-909a-853f66c41285"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("loads import and refresh history using the existing ETL service session", async () => {
    const cursor = "8e9e05b1-aadb-4a61-bfe1-4d9b331fdd00";
    request.mockResolvedValue({ data: { items: [], nextCursor: null } });
    await expect(service.listImportRuns(cursor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://etl.internal/imports/runs",
        params: { cursor },
        headers: expect.objectContaining({
          Authorization: "Bearer server-token",
        }),
      }),
    );
    await service.listStructuredRefreshRuns();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://etl.internal/jobposts/structured-refresh-runs",
        params: {},
      }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps the ETL credential server-side on the canonical import route", async () => {
    const input = {
      source: "jobposts" as const,
      idempotencyKey: "operator-jobs-2026-08-22",
      scope: "all" as const,
    };

    await service.createImportRun(input);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/imports/runs",
        data: input,
        headers: { Authorization: "Bearer server-token" },
      }),
    );
  });

  it("retries a transient ETL failure for an idempotent import request", async () => {
    const transient = Object.assign(new Error("upstream unavailable"), {
      isAxiosError: true,
      response: { status: 502, data: { message: "Bad Gateway" } },
    });
    request.mockRejectedValueOnce(transient).mockResolvedValueOnce({
      data: { runId: "retry-safe" },
    });

    await expect(
      service.createImportRun({
        source: "jobposts",
        idempotencyKey: "operator-jobs-retry-safe",
        scope: "all",
      }),
    ).resolves.toEqual({ runId: "retry-safe" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("forwards entity enrichment runs, pagination, and item retries through the BFF", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const itemId = "e9500341-2ccd-4a1b-909a-853f66c41285";
    await service.createEntityEnrichmentRun({
      operation: "sparse",
    });
    await service.getEntityEnrichmentItems(runId, "2", "50", "failed");
    await service.retryEntityEnrichmentItem(itemId);

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-enrichment/runs",
        data: { operation: "sparse" },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "GET",
        url: `https://etl.internal/entity-enrichment/runs/${runId}/items`,
        params: { page: "2", pageSize: "50", status: "failed" },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "POST",
        url: `https://etl.internal/entity-enrichment/items/${itemId}/retry`,
      }),
    );
  });

  it("forwards durable review controls and evidence using the server token and session actor", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const input = {
      idempotencyKey: "review-all-open",
      scope: "all_open",
      concurrency: 20,
    };
    await service.createReviewRun(input, "reviewer");
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-enrichment/review-runs",
        data: input,
        headers: {
          Authorization: "Bearer server-token",
          "X-Jobstash-Review-Actor": "reviewer",
        },
      }),
    );
    const imported = {
      entries: [{ caseId: "entity:123", sourceKey: "prepared.json" }],
    };
    for (const operation of [
      "import",
      "pause",
      "resume",
      "concurrency",
      "resources",
    ] as const) {
      await service.updateReviewRun(runId, operation, imported, "reviewer");
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: "POST",
          url: `https://etl.internal/entity-enrichment/review-runs/${runId}/${operation}`,
          data: imported,
          headers: {
            Authorization: "Bearer server-token",
            "X-Jobstash-Review-Actor": "reviewer",
          },
        }),
      );
    }
    await service.getReviewRunItems(runId, "last-item", "20", "research");
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://etl.internal/entity-enrichment/review-runs/${runId}/items`,
        params: { cursor: "last-item", limit: "20", stage: "research" },
      }),
    );
    await service.getReviewRunLedger(runId, "last-receipt", "50");
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://etl.internal/entity-enrichment/review-runs/${runId}/ledger`,
        params: { cursor: "last-receipt", limit: "50" },
      }),
    );
  });

  it("forwards full-run sorting and followed item IDs without changing their scope", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const itemIds =
      "e9500341-2ccd-4a1b-909a-853f66c41285,e9500341-2ccd-4a1b-909a-853f66c41286";
    await service.getEntityEnrichmentItems(runId, "3", "50", undefined, {
      sortBy: "attemptCount",
      sortDirection: "desc",
      itemIds,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://etl.internal/entity-enrichment/runs/${runId}/items`,
        params: {
          page: "3",
          pageSize: "50",
          sortBy: "attemptCount",
          sortDirection: "desc",
          itemIds,
        },
      }),
    );
  });

  it("forwards worker pause and resume independently of ingestion runs", async () => {
    await service.getEntityEnrichmentWorker();
    await service.setEntityEnrichmentWorker("pause");
    await service.setEntityEnrichmentWorker("resume");
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "GET",
        url: "https://etl.internal/entity-enrichment/worker",
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-enrichment/worker/pause",
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-enrichment/worker/resume",
      }),
    );
  });

  it("forwards Telegram publishing to ETL", async () => {
    await service.publishJobpostsToTelegram();

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/jobposts/publish",
        params: { channelName: "telegram" },
      }),
    );
  });

  it("fetches collision details directly without a collection limit", async () => {
    const id = "f9500341-2ccd-4a1b-909a-853f66c41285";
    request.mockResolvedValue({ data: { id, evidence: { quote: "x" } } });
    await expect(
      service.getEntityCollision(id, "resolved"),
    ).resolves.toMatchObject({ id, evidence: { quote: "x" } });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://etl.internal/entity-collisions/${id}`,
      }),
    );
    expect(request.mock.calls[0][0].params).toBeUndefined();
  });

  it("preserves upstream not-found responses for exact collision reads", async () => {
    request.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { message: "Entity collision not found" },
      },
    });
    await expect(
      service.getEntityCollision("f9500341-2ccd-4a1b-909a-853f66c41285"),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it("forwards target search through the authenticated ETL read API", async () => {
    await service.searchReviewTargets("CryptoCannoneer", "Project");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://etl.internal/entity-enrichment/review-targets",
        params: { query: "CryptoCannoneer", label: "Project" },
        headers: { Authorization: "Bearer server-token" },
      }),
    );
  });

  it("forwards case requests once with existing ETL token exchange and actor context", async () => {
    const input = {
      requestId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      expectedVersion: "version",
    };
    await service.resolveReviewCase("entity:123", input, "wallet");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-enrichment/review-cases/entity%3A123/resolve",
        data: input,
        headers: {
          Authorization: "Bearer server-token",
          "X-Jobstash-Review-Actor": "wallet",
        },
      }),
    );
    expect(auth0.getETLToken).toHaveBeenCalledTimes(1);
  });

  it("does not forward an upstream ETL action href", async () => {
    request.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: "A refresh is already active",
          action: {
            href: "/jobposts/structured-refresh-runs/f9500341-2ccd-4a1b-909a-853f66c41285",
          },
        },
      },
    });
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);

    await expect(
      service.createStructuredRefresh({ idempotencyKey: "operator-refresh" }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        success: false,
        message: "A refresh is already active",
      },
    });
  });

  it("forwards stored-result staging and the exact reviewed publish manifest", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const itemId = "e9500341-2ccd-4a1b-909a-853f66c41285";
    const publish = {
      expectedDiffFingerprint: "a".repeat(64),
      approvedItems: [
        {
          rawJobNodeId: "123",
          stagedFingerprint: "b".repeat(64),
          approvedReviewRequirements: ["adjacent_title_fde" as const],
        },
      ],
    };

    await service.stageStoredStructuredRefreshItem(runId, itemId);
    await service.publishStructuredRefresh(runId, publish);

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "POST",
        url: `https://etl.internal/jobposts/structured-refresh-runs/${runId}/items/${itemId}/stage-stored`,
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        url: `https://etl.internal/jobposts/structured-refresh-runs/${runId}/publish`,
        data: publish,
      }),
    );
  });

  it("preserves canonical Codex subscription run telemetry without rewriting counts", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const telemetry = {
      inference: {
        provider: "openai",
        accessMode: "chatgpt_subscription",
        launcher: "codex_exec",
        model: "gpt-5.6-luna",
      },
      uniqueInventoryCount: 12,
      alreadyCompletedCanaryCount: 3,
      maximumRemainingCalls: 9,
      callsStarted: 4,
      successfulResults: 3,
      callOutcomeUnknown: 1,
      prelaunchFailures: 0,
      paidFallbackCount: 0,
    };
    request.mockResolvedValueOnce({ data: telemetry });

    await expect(service.getInferenceRun(runId)).resolves.toEqual(telemetry);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://etl.internal/inference/runs/${runId}`,
      }),
    );
  });

  it("keeps job extraction bounded", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";

    await service.executeNextStructuredRefreshItems(runId, { limit: 2 });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: `https://etl.internal/jobposts/structured-refresh-runs/${runId}/execute-next`,
        data: { limit: 2 },
      }),
    );
  });

  it("does not retry a failed subscription inference proxy request", async () => {
    request.mockRejectedValueOnce(new Error("upstream timeout"));
    jest.spyOn(axios, "isAxiosError").mockReturnValue(false);

    await expect(service.inferenceCapabilityPreflight()).rejects.toMatchObject({
      response: {
        success: false,
        message: "Ingestion service request failed",
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/inference/capability-preflight",
      }),
    );
  });

  it("fails closed rather than exposing stale provider metadata", async () => {
    request.mockResolvedValueOnce({
      data: {
        inference: {
          provider: "unsupported-provider",
          accessMode: "subscription",
          launcher: "unsupported-launcher",
          model: "unsupported-model",
        },
      },
    });

    await expect(service.inferenceCapabilityPreflight()).rejects.toMatchObject({
      response: {
        success: false,
        message: "Ingestion service returned invalid inference metadata",
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
