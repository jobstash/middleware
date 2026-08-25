import { BadRequestException, GoneException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CheckWalletPermissions } from "src/shared/constants";
import { AdminIngestionController } from "./admin-ingestion.controller";
import {
  CreateInferenceCanaryCampaignDto,
  CreateStructuredRefreshDto,
  ExecuteInferenceBatchDto,
  PublishStructuredRefreshDto,
  ResolveCollisionDto,
} from "./admin-ingestion.dto";
import { AdminIngestionService } from "./admin-ingestion.service";

describe("admin ingestion contracts", () => {
  it("exposes one canonical super-admin route tree", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminIngestionController)).toBe(
      "admin/ingestion",
    );
    expect(
      Reflect.getMetadata("permissions", AdminIngestionController),
    ).toEqual([CheckWalletPermissions.SUPER_ADMIN]);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.createImportRun,
      ),
    ).toBe("import-runs");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.triggerJobpostSources,
      ),
    ).toBe("jobposts/sources");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.publishJobpostsToTelegram,
      ),
    ).toBe("jobposts/publish/telegram");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.publishStructuredRefresh,
      ),
    ).toBe("structured-refresh-runs/:id/publish");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.resolveEntityCollision,
      ),
    ).toBe("entity-collisions/:id/resolve");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.executeNextStructuredRefreshItems,
      ),
    ).toBe("structured-refresh-runs/:id/execute-next");
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminIngestionController.prototype.reconcileEntityCorpus,
      ),
    ).toBe("entity-reconciliation/runs");
  });

  it.each([
    "resumeInferenceRun",
    "createInferenceCanaryCampaign",
    "reviewInferenceCanaryCampaign",
  ] as const)("denies retired auxiliary operation %s with 410", handler => {
    const controller = new AdminIngestionController({} as never);
    expect(() => controller[handler]()).toThrow(GoneException);
  });

  it("requires an exact diff and per-item approval manifest for publishing", async () => {
    const invalid = plainToInstance(PublishStructuredRefreshDto, {
      expectedDiffFingerprint: "not-reviewed",
      approvedItems: [],
    });
    const valid = plainToInstance(PublishStructuredRefreshDto, {
      expectedDiffFingerprint: "a".repeat(64),
      approvedItems: [
        {
          rawJobNodeId: "123",
          stagedFingerprint: "b".repeat(64),
          approvedReviewRequirements: ["adjacent_title_fde"],
        },
      ],
    });
    expect(await validate(invalid)).not.toHaveLength(0);
    expect(await validate(valid)).toHaveLength(0);
  });

  it("enforces the shared live canary's 20 + 30 item ceiling", async () => {
    const runId = "f9500341-2ccd-4a1b-909a-853f66c41285";
    const itemId = (index: number): string =>
      `f9500341-2ccd-4a1b-909a-${String(index).padStart(12, "0")}`;
    const valid = plainToInstance(CreateInferenceCanaryCampaignDto, {
      entityReconciliationRunId: runId,
      structuredJobpostRunId: runId,
      entityReconciliationItemIds: Array.from({ length: 20 }, (_, index) =>
        itemId(index),
      ),
      structuredJobpostItemIds: Array.from({ length: 30 }, (_, index) =>
        itemId(index + 20),
      ),
    });
    const invalid = plainToInstance(CreateInferenceCanaryCampaignDto, {
      ...valid,
      structuredJobpostItemIds: Array.from({ length: 31 }, (_, index) =>
        itemId(index + 20),
      ),
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts a positive configured batch without claiming a provider-specific maximum", async () => {
    const defaultBatch = plainToInstance(ExecuteInferenceBatchDto, {});
    const configuredBatch = plainToInstance(ExecuteInferenceBatchDto, {
      limit: 64,
    });
    const invalidBatch = plainToInstance(ExecuteInferenceBatchDto, {
      limit: 0,
    });
    const unsafeBatch = plainToInstance(ExecuteInferenceBatchDto, {
      limit: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(defaultBatch.limit).toBeUndefined();
    expect(await validate(defaultBatch)).toHaveLength(0);
    expect(await validate(configuredBatch)).toHaveLength(0);
    expect(await validate(invalidBatch)).not.toHaveLength(0);
    expect(await validate(unsafeBatch)).not.toHaveLength(0);
  });

  it.each([31, 50])(
    "rejects a %i-item Jobpost canary because this workload is capped at 30",
    async canarySize => {
      const input = plainToInstance(CreateStructuredRefreshDto, {
        idempotencyKey: "shared-canary-campaign",
        scope: { kind: "canary", canarySize },
      });
      expect(await validate(input)).not.toHaveLength(0);
    },
  );

  it("accepts a retained Jobpost canary of 1..30 and rejects a canary size on all", async () => {
    const canary = plainToInstance(CreateStructuredRefreshDto, {
      idempotencyKey: "shared-canary-campaign",
      scope: { kind: "canary", canarySize: 30 },
    });
    const invalidAll = plainToInstance(CreateStructuredRefreshDto, {
      idempotencyKey: "full-campaign",
      scope: { kind: "all", canarySize: 30 },
    });
    expect(await validate(canary)).toHaveLength(0);
    expect(await validate(invalidAll)).not.toHaveLength(0);
  });

  it("validates nested same-item evidence", async () => {
    const input = plainToInstance(ResolveCollisionDto, {
      expectedFingerprint: "b".repeat(64),
      resolution: "same_item",
      sameItem: {
        targetLabel: "Organization",
        canonicalTargetNodeId: "123",
        duplicateTargetNodeIds: ["456"],
        evidence: { quotedEvidence: "reviewed quote" },
        confidence: 0.98,
      },
    });
    expect(await validate(input)).toHaveLength(0);
  });

  it("rejects a reassignment decision without exact reassignment details", () => {
    const ingestion = {
      resolveEntityCollision: jest.fn(),
    } as unknown as AdminIngestionService;
    const controller = new AdminIngestionController(ingestion);
    expect(() =>
      controller.resolveEntityCollision(
        "f9500341-2ccd-4a1b-909a-853f66c41285",
        {
          expectedFingerprint: "c".repeat(64),
          resolution: "reassigned",
        },
      ),
    ).toThrow(BadRequestException);
    expect(ingestion.resolveEntityCollision).not.toHaveBeenCalled();
  });
});
