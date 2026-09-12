import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { Request } from "express";
import { isUUID } from "class-validator";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions } from "src/shared/decorators";
import {
  RunHistoryQueryDto,
  CollisionDetailQueryDto,
  CollisionListQueryDto,
  CreateEntityEnrichmentRunDto,
  CreateImportRunDto,
  CreateStructuredRefreshDto,
  ExecuteInferenceBatchDto,
  InferenceCapabilityPreflightDto,
  InferenceRunTelemetryDto,
  PublishStructuredRefreshDto,
  ResolveCollisionDto,
} from "./admin-ingestion.dto";
import { AdminIngestionService } from "./admin-ingestion.service";

const strictBody = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const strictQuery = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const hasEvidence = (value: Record<string, unknown> | undefined): boolean =>
  !!value && Object.keys(value).length > 0;

const hasQuotedEvidence = (value: unknown, key = ""): boolean => {
  if (typeof value === "string") {
    return /quote|evidence/i.test(key) && value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some(item => hasQuotedEvidence(item, key));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([nestedKey, nestedValue]) => hasQuotedEvidence(nestedValue, nestedKey),
    );
  }
  return false;
};

@Controller("admin/ingestion")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.SUPER_ADMIN)
export class AdminIngestionController {
  constructor(private readonly ingestion: AdminIngestionService) {}

  @Get("entity-enrichment/worker")
  getEntityEnrichmentWorker(): Promise<unknown> {
    return this.ingestion.getEntityEnrichmentWorker();
  }

  @Post("entity-enrichment/worker/pause")
  @HttpCode(HttpStatus.OK)
  pauseEntityEnrichmentWorker(): Promise<unknown> {
    return this.ingestion.setEntityEnrichmentWorker("pause");
  }

  @Post("entity-enrichment/worker/resume")
  @HttpCode(HttpStatus.OK)
  resumeEntityEnrichmentWorker(): Promise<unknown> {
    return this.ingestion.setEntityEnrichmentWorker("resume");
  }

  @Get("entity-enrichment/review-targets")
  searchReviewTargets(
    @Query("query") query: string,
    @Query("label") label?: string,
  ): Promise<unknown> {
    return this.ingestion.searchReviewTargets(query, label);
  }

  @Get("entity-enrichment/review-cases")
  listReviewCases(
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
  ): Promise<unknown> {
    return this.ingestion.listReviewCases(cursor, limit);
  }

  @Get("entity-enrichment/review-cases/:caseId")
  getReviewCase(
    @Param("caseId") caseId: string,
    @Query("targetNodeIds") targetNodeIds?: string,
  ): Promise<unknown> {
    return this.ingestion.getReviewCase(caseId, targetNodeIds);
  }

  @Post("entity-enrichment/review-cases/:caseId/resolve")
  resolveReviewCase(
    @Param("caseId") caseId: string,
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Resolution body is required");
    if (typeof input.requestId !== "string" || !isUUID(input.requestId))
      throw new BadRequestException(
        "requestId must be a caller-generated UUID; reuse it when retrying the same resolution",
      );
    return this.ingestion.resolveReviewCase(
      caseId,
      input,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/review-cases/:caseId/prepare")
  @HttpCode(HttpStatus.OK)
  prepareReviewCase(
    @Param("caseId") caseId: string,
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Preparation body is required");
    return this.ingestion.prepareReviewCase(
      caseId,
      input,
      request.user?.address,
    );
  }

  @Get("entity-enrichment/review-decisions/:requestId")
  getReviewDecision(
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
  ): Promise<unknown> {
    return this.ingestion.getReviewDecision(requestId);
  }

  @Post("entity-enrichment/review-schema/install")
  installReviewSchema(): Promise<unknown> {
    return this.ingestion.installReviewSchema();
  }

  @Post("entity-enrichment/review-runs")
  createReviewRun(
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.createReviewRun(input, request.user?.address);
  }

  @Get("entity-enrichment/review-runs/:runId")
  getReviewRun(
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<unknown> {
    return this.ingestion.getReviewRun(runId);
  }

  @Get("entity-enrichment/review-runs/:runId/items")
  getReviewRunItems(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
    @Query("stage") stage?: string,
  ): Promise<unknown> {
    return this.ingestion.getReviewRunItems(runId, cursor, limit, stage);
  }

  @Get("entity-enrichment/review-runs/:runId/ledger")
  getReviewRunLedger(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
  ): Promise<unknown> {
    return this.ingestion.getReviewRunLedger(runId, cursor, limit);
  }

  @Post("entity-enrichment/review-runs/:runId/import")
  @HttpCode(HttpStatus.OK)
  importReviewRun(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.updateReviewRun(
      runId,
      "import",
      input,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/review-runs/:runId/pause")
  @HttpCode(HttpStatus.OK)
  pauseReviewRun(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.updateReviewRun(
      runId,
      "pause",
      undefined,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/review-runs/:runId/resume")
  @HttpCode(HttpStatus.OK)
  resumeReviewRun(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.updateReviewRun(
      runId,
      "resume",
      undefined,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/review-runs/:runId/concurrency")
  @HttpCode(HttpStatus.OK)
  setReviewRunConcurrency(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.updateReviewRun(
      runId,
      "concurrency",
      input,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/review-runs/:runId/resources")
  @HttpCode(HttpStatus.OK)
  setReviewRunResources(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() input: Record<string, unknown>,
    @Req() request: Request & { user?: { address?: string } },
  ): Promise<unknown> {
    return this.ingestion.updateReviewRun(
      runId,
      "resources",
      input,
      request.user?.address,
    );
  }

  @Post("entity-enrichment/runs")
  @HttpCode(HttpStatus.ACCEPTED)
  createEntityEnrichmentRun(
    @Body(strictBody) input: CreateEntityEnrichmentRunDto,
  ): Promise<unknown> {
    return this.ingestion.createEntityEnrichmentRun(input);
  }

  @Get("entity-enrichment/runs")
  listEntityEnrichmentRuns(
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ): Promise<unknown> {
    return this.ingestion.listEntityEnrichmentRuns(page, pageSize);
  }

  @Get("entity-enrichment/runs/:runId")
  getEntityEnrichmentRun(
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<unknown> {
    return this.ingestion.getEntityEnrichmentRun(runId);
  }

  @Get("entity-enrichment/runs/:runId/items")
  getEntityEnrichmentItems(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "50",
    @Query("status") status?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
    @Query("itemIds") itemIds?: string,
  ): Promise<unknown> {
    return this.ingestion.getEntityEnrichmentItems(
      runId,
      page,
      pageSize,
      status,
      { sortBy, sortDirection, itemIds },
    );
  }

  @Post("entity-enrichment/runs/:runId/retry-failed")
  retryFailedEntityEnrichmentItems(
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<unknown> {
    return this.ingestion.retryFailedEntityEnrichmentItems(runId);
  }

  @Post("entity-enrichment/runs/:runId/rerun")
  rerunEntityEnrichment(
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<unknown> {
    return this.ingestion.rerunEntityEnrichment(runId);
  }

  @Post("entity-enrichment/items/:itemId/retry")
  retryEntityEnrichmentItem(
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<unknown> {
    return this.ingestion.retryEntityEnrichmentItem(itemId);
  }

  @Post("entity-enrichment/items/:itemId/rerun")
  rerunEntityEnrichmentItem(
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<unknown> {
    return this.ingestion.rerunEntityEnrichmentItem(itemId);
  }

  @Get("import-runs")
  listImportRuns(
    @Query(strictQuery) query: RunHistoryQueryDto,
  ): Promise<unknown> {
    return this.ingestion.listImportRuns(query.cursor);
  }

  @Post("import-runs")
  @HttpCode(HttpStatus.ACCEPTED)
  createImportRun(
    @Body(strictBody) input: CreateImportRunDto,
  ): Promise<unknown> {
    return this.ingestion.createImportRun(input);
  }

  @Post("jobposts/publish/telegram")
  @HttpCode(HttpStatus.ACCEPTED)
  publishJobpostsToTelegram(): Promise<unknown> {
    return this.ingestion.publishJobpostsToTelegram();
  }

  @Get("import-runs/:id")
  getImportRun(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.ingestion.getImportRun(id);
  }

  @Get("import-runs/:id/failures")
  getImportRunFailures(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getImportRunFailures(id);
  }

  @Post("import-runs/:id/pause")
  pauseImportRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionImportRun(id, "pause");
  }

  @Post("import-runs/:id/resume")
  resumeImportRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionImportRun(id, "resume");
  }

  @Post("import-runs/:id/cancel")
  cancelImportRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionImportRun(id, "cancel");
  }

  @Get("structured-refresh-runs")
  listStructuredRefreshRuns(
    @Query(strictQuery) query: RunHistoryQueryDto,
  ): Promise<unknown> {
    return this.ingestion.listStructuredRefreshRuns(query.cursor);
  }

  @Post("structured-refresh-runs")
  createStructuredRefresh(
    @Body(strictBody) input: CreateStructuredRefreshDto,
  ): Promise<unknown> {
    return this.ingestion.createStructuredRefresh(input);
  }

  @Get("structured-refresh-runs/current")
  getCurrentStructuredRefresh(): Promise<unknown> {
    return this.ingestion.getCurrentStructuredRefresh();
  }

  @Get("structured-refresh-runs/:id")
  getStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getStructuredRefresh(id);
  }

  @Get("structured-refresh-runs/:id/diff")
  getStructuredRefreshDiff(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getStructuredRefreshDiff(id);
  }

  @Get("structured-refresh-runs/:id/failures")
  getStructuredRefreshFailures(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getStructuredRefreshFailures(id);
  }

  @Get("structured-refresh-runs/:id/items")
  getStructuredRefreshItems(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getStructuredRefreshItems(id);
  }

  @Post("structured-refresh-runs/:id/items/:itemId/execute")
  executeStructuredRefreshItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<unknown> {
    return this.ingestion.executeStructuredRefreshItem(id, itemId);
  }

  @Post("structured-refresh-runs/:id/execute-next")
  @ApiOperation({
    summary:
      "Launch the next durable inference batch once, without middleware retries",
  })
  executeNextStructuredRefreshItems(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(strictBody) input: ExecuteInferenceBatchDto,
  ): Promise<unknown> {
    return this.ingestion.executeNextStructuredRefreshItems(id, input);
  }

  @Post("structured-refresh-runs/:id/items/:itemId/stage-stored")
  stageStoredStructuredRefreshItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<unknown> {
    return this.ingestion.stageStoredStructuredRefreshItem(id, itemId);
  }

  @Post("structured-refresh-runs/:id/synchronize")
  synchronizeStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.synchronizeStructuredRefresh(id);
  }

  @Post("structured-refresh-runs/:id/pause")
  pauseStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionStructuredRefresh(id, "pause");
  }

  @Post("structured-refresh-runs/:id/resume")
  resumeStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionStructuredRefresh(id, "resume");
  }

  @Post("structured-refresh-runs/:id/cancel")
  cancelStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.transitionStructuredRefresh(id, "cancel");
  }

  @Post("structured-refresh-runs/:id/publish")
  publishStructuredRefresh(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(strictBody) input: PublishStructuredRefreshDto,
  ): Promise<unknown> {
    return this.ingestion.publishStructuredRefresh(id, input);
  }

  @Get("entity-collisions")
  listEntityCollisions(
    @Query(strictQuery) query: CollisionListQueryDto,
  ): Promise<unknown> {
    return this.ingestion.listEntityCollisions(query);
  }

  @Get("entity-collisions/:id")
  getEntityCollision(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(strictQuery) query: CollisionDetailQueryDto,
  ): Promise<unknown> {
    return this.ingestion.getEntityCollision(id, query.status);
  }

  @Post("entity-collisions/:id/resolve")
  resolveEntityCollision(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(strictBody) input: ResolveCollisionDto,
  ): Promise<unknown> {
    const hasReassignment = !!input.reassignment;
    const hasSameItem = !!input.sameItem;
    if (
      (input.resolution === "reassigned") !== hasReassignment ||
      (input.resolution === "same_item") !== hasSameItem ||
      (hasReassignment && (!!input.urlResolution || hasSameItem)) ||
      (hasSameItem && hasReassignment) ||
      (input.reassignment && !hasEvidence(input.reassignment.evidence)) ||
      (input.urlResolution && !hasEvidence(input.urlResolution.evidence)) ||
      (input.sameItem && !hasQuotedEvidence(input.sameItem.evidence))
    ) {
      throw new BadRequestException({
        success: false,
        message: "Resolution details do not match the selected decision",
      });
    }
    return this.ingestion.resolveEntityCollision(id, input);
  }

  @Post("inference/capability-preflight")
  @ApiOkResponse({ type: InferenceCapabilityPreflightDto })
  inferenceCapabilityPreflight(): Promise<unknown> {
    return this.ingestion.inferenceCapabilityPreflight();
  }

  @Get("inference/runs/:id")
  @ApiOkResponse({ type: InferenceRunTelemetryDto })
  getInferenceRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getInferenceRun(id);
  }

  @Get("inference/runs/:id/items")
  getInferenceRunItems(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getInferenceRunItems(id);
  }
}
