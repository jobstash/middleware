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
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions } from "src/shared/decorators";
import {
  CollisionDetailQueryDto,
  CollisionListQueryDto,
  CreateEntityReconciliationRunDto,
  CreateImportRunDto,
  CreateKimiCanaryCampaignDto,
  CreateStructuredRefreshDto,
  ExecuteKimiBatchDto,
  PublishStructuredRefreshDto,
  ReviewKimiCanaryCampaignDto,
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

  @Post("import-runs")
  @HttpCode(HttpStatus.ACCEPTED)
  createImportRun(
    @Body(strictBody) input: CreateImportRunDto,
  ): Promise<unknown> {
    return this.ingestion.createImportRun(input);
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
  executeNextStructuredRefreshItems(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(strictBody) input: ExecuteKimiBatchDto,
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

  @Post("kimi/capability-preflight")
  kimiCapabilityPreflight(): Promise<unknown> {
    return this.ingestion.kimiCapabilityPreflight();
  }

  @Get("kimi/runs/:id")
  getKimiRun(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.ingestion.getKimiRun(id);
  }

  @Get("kimi/runs/:id/items")
  getKimiRunItems(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.getKimiRunItems(id);
  }

  @Post("kimi/runs/:id/resume")
  resumeKimiRun(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.ingestion.resumeKimiRun(id);
  }

  @Post("kimi/canary-campaigns")
  createKimiCanaryCampaign(
    @Body(strictBody) input: CreateKimiCanaryCampaignDto,
  ): Promise<unknown> {
    if (
      input.entityReconciliationItemIds.length +
        input.structuredJobpostItemIds.length ===
      0
    ) {
      throw new BadRequestException({
        success: false,
        message: "The shared Kimi canary inventory cannot be empty",
      });
    }
    return this.ingestion.createKimiCanaryCampaign(input);
  }

  @Post("kimi/canary-campaigns/:id/review")
  reviewKimiCanaryCampaign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(strictBody) input: ReviewKimiCanaryCampaignDto,
  ): Promise<unknown> {
    return this.ingestion.reviewKimiCanaryCampaign(id, input);
  }
}
