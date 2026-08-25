import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions } from "src/shared/decorators";
import {
  CollisionDetailQueryDto,
  CollisionListQueryDto,
  CreateEntityReconciliationRunDto,
  CreateImportRunDto,
  CreateStructuredRefreshDto,
  ExecuteInferenceBatchDto,
  InferenceCapabilityPreflightDto,
  InferenceRunTelemetryDto,
  PublishStructuredRefreshDto,
  ResolveCollisionDto,
  TriggerJobpostSourcesDto,
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

  @Post("import-runs")
  @HttpCode(HttpStatus.ACCEPTED)
  createImportRun(
    @Body(strictBody) input: CreateImportRunDto,
  ): Promise<unknown> {
    return this.ingestion.createImportRun(input);
  }

  @Post("jobposts/sources")
  @HttpCode(HttpStatus.ACCEPTED)
  triggerJobpostSources(
    @Body(strictBody) input: TriggerJobpostSourcesDto,
  ): Promise<unknown> {
    return this.ingestion.triggerJobpostSources(input.sources);
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

  @Post("entity-reconciliation/runs")
  reconcileEntityCorpus(
    @Body(strictBody) input: CreateEntityReconciliationRunDto,
  ): Promise<unknown> {
    return this.ingestion.reconcileEntityCorpus(input);
  }

  @Get("entity-reconciliation/runs/:id")
  getEntityReconciliationRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getEntityReconciliationRun(id);
  }

  @Get("entity-reconciliation/runs/:id/items/:itemId/decision")
  getEntityReconciliationDecision(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<unknown> {
    return this.ingestion.getEntityReconciliationDecision(id, itemId);
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

  @Post("inference/runs/:id/resume")
  resumeInferenceRun(): never {
    return this.retiredInferenceAuxiliaryRoute();
  }

  @Post("inference/canary-campaigns")
  createInferenceCanaryCampaign(): never {
    return this.retiredInferenceAuxiliaryRoute();
  }

  @Post("inference/canary-campaigns/:id/review")
  reviewInferenceCanaryCampaign(): never {
    return this.retiredInferenceAuxiliaryRoute();
  }

  private retiredInferenceAuxiliaryRoute(): never {
    throw new GoneException({
      statusCode: 410,
      message:
        "Inference canary review and rate-limit resume are internal to the autonomous durable run",
      error: "Gone",
    });
  }
}
