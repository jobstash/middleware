import { NotFoundException } from "@nestjs/common";
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

  it("forwards selected job sources and Telegram publishing to ETL", async () => {
    await service.triggerJobpostSources(["greenhouse", "lever"]);
    await service.publishJobpostsToTelegram();

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/jobposts/sources",
        params: { sources: ["greenhouse", "lever"] },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/jobposts/publish",
        params: { channelName: "telegram" },
      }),
    );
  });

  it("finds exact collision evidence through the bounded upstream collection", async () => {
    request.mockResolvedValue({
      data: [
        {
          id: "f9500341-2ccd-4a1b-909a-853f66c41285",
          evidence: { quote: "x" },
        },
      ],
    });

    await expect(
      service.getEntityCollision(
        "f9500341-2ccd-4a1b-909a-853f66c41285",
        "needs_review",
      ),
    ).resolves.toMatchObject({ evidence: { quote: "x" } });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://etl.internal/entity-collisions",
        params: { status: "needs_review", limit: 500 },
      }),
    );
  });

  it("fails closed when the collision is absent from the requested review state", async () => {
    request.mockResolvedValue({ data: [] });
    await expect(
      service.getEntityCollision(
        "f9500341-2ccd-4a1b-909a-853f66c41285",
        "needs_review",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it("forwards shared canary selection without expanding it", async () => {
    const input = {
      entityReconciliationRunId: "f9500341-2ccd-4a1b-909a-853f66c41285",
      structuredJobpostRunId: "e9500341-2ccd-4a1b-909a-853f66c41285",
      entityReconciliationItemIds: ["d9500341-2ccd-4a1b-909a-853f66c41285"],
      structuredJobpostItemIds: ["c9500341-2ccd-4a1b-909a-853f66c41285"],
    };

    await service.createInferenceCanaryCampaign(input);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/inference/canary-campaigns",
        data: input,
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

  it("keeps job extraction bounded and exposes one full-corpus reconciliation action", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const reconciliationInput = { idempotencyKey: "full-corpus-2026-08-22" };

    await service.executeNextStructuredRefreshItems(runId, { limit: 2 });
    await service.reconcileEntityCorpus(reconciliationInput);

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "POST",
        url: `https://etl.internal/jobposts/structured-refresh-runs/${runId}/execute-next`,
        data: { limit: 2 },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        url: "https://etl.internal/entity-reconciliation/runs",
        data: reconciliationInput,
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
