import {
  BadGatewayException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosRequestConfig } from "axios";
import { Auth0Service } from "src/auth0/auth0.service";
import { PostgresService } from "src/postgres/postgres.service";
import {
  CollisionListQueryDto,
  CreateEntityEnrichmentRunDto,
  CreateImportRunDto,
  CreateStructuredRefreshDto,
  ExecuteInferenceBatchDto,
  PublishStructuredRefreshDto,
  ResolveCollisionDto,
} from "./admin-ingestion.dto";

type UpstreamMethod = "GET" | "POST";
type InferenceMetadataEnvelope = {
  inference?: {
    provider?: unknown;
    accessMode?: unknown;
    launcher?: unknown;
    model?: unknown;
  };
};

@Injectable()
export class AdminIngestionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly auth0Service: Auth0Service,
    private readonly postgres: PostgresService,
  ) {}

  listReviewCases(cursor?: string, limit = "50"): Promise<unknown> {
    return this.request("GET", "/entity-enrichment/review-cases", undefined, {
      cursor,
      limit,
    });
  }

  getReviewCase(caseId: string, targetNodeIds?: string): Promise<unknown> {
    return this.request(
      "GET",
      `/entity-enrichment/review-cases/${encodeURIComponent(caseId)}`,
      undefined,
      { targetNodeIds },
    );
  }

  resolveReviewCase(
    caseId: string,
    input: Record<string, unknown>,
    actor?: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/entity-enrichment/review-cases/${encodeURIComponent(caseId)}/resolve`,
      input,
      undefined,
      actor ? { "X-Jobstash-Review-Actor": actor } : undefined,
    );
  }

  getReviewDecision(requestId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/entity-enrichment/review-decisions/${requestId}`,
    );
  }

  installReviewSchema(): Promise<unknown> {
    return this.request("POST", "/entity-enrichment/review-schema/install");
  }

  createEntityEnrichmentRun(
    input: CreateEntityEnrichmentRunDto,
  ): Promise<unknown> {
    return this.request("POST", "/entity-enrichment/runs", input);
  }

  getEntityEnrichmentWorker(): Promise<unknown> {
    return this.request("GET", "/entity-enrichment/worker");
  }

  setEntityEnrichmentWorker(action: "pause" | "resume"): Promise<unknown> {
    return this.request("POST", `/entity-enrichment/worker/${action}`);
  }

  listEntityEnrichmentRuns(page: string, pageSize: string): Promise<unknown> {
    return this.request("GET", "/entity-enrichment/runs", undefined, {
      page,
      pageSize,
    });
  }

  getEntityEnrichmentRun(runId: string): Promise<unknown> {
    return this.request("GET", `/entity-enrichment/runs/${runId}`);
  }

  getEntityEnrichmentItems(
    runId: string,
    page: string,
    pageSize: string,
    status?: string,
    options: { sortBy?: string; sortDirection?: string; itemIds?: string } = {},
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/entity-enrichment/runs/${runId}/items`,
      undefined,
      {
        page,
        pageSize,
        ...(status ? { status } : {}),
        ...Object.fromEntries(
          Object.entries(options).filter(([, value]) => value !== undefined),
        ),
      },
    );
  }

  retryFailedEntityEnrichmentItems(runId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/entity-enrichment/runs/${runId}/retry-failed`,
    );
  }

  rerunEntityEnrichment(runId: string): Promise<unknown> {
    return this.request("POST", `/entity-enrichment/runs/${runId}/rerun`);
  }

  retryEntityEnrichmentItem(itemId: string): Promise<unknown> {
    return this.request("POST", `/entity-enrichment/items/${itemId}/retry`);
  }

  rerunEntityEnrichmentItem(itemId: string): Promise<unknown> {
    return this.request("POST", `/entity-enrichment/items/${itemId}/rerun`);
  }

  listImportRuns(cursor?: string): Promise<unknown> {
    return this.request(
      "GET",
      "/imports/runs",
      undefined,
      cursor ? { cursor } : {},
    );
  }

  listStructuredRefreshRuns(cursor?: string): Promise<unknown> {
    return this.request(
      "GET",
      "/jobposts/structured-refresh-runs",
      undefined,
      cursor ? { cursor } : {},
    );
  }

  createImportRun(input: CreateImportRunDto): Promise<unknown> {
    return this.request("POST", "/imports/runs", input);
  }

  publishJobpostsToTelegram(): Promise<unknown> {
    return this.request("POST", "/jobposts/publish", undefined, {
      channelName: "telegram",
    });
  }

  getImportRun(id: string): Promise<unknown> {
    return this.request("GET", `/imports/runs/${id}`);
  }

  getImportRunFailures(id: string): Promise<unknown> {
    return this.request("GET", `/imports/runs/${id}/failures`);
  }

  transitionImportRun(
    id: string,
    action: "pause" | "resume" | "cancel",
  ): Promise<unknown> {
    return this.request("POST", `/imports/runs/${id}/${action}`);
  }

  createStructuredRefresh(input: CreateStructuredRefreshDto): Promise<unknown> {
    return this.request("POST", "/jobposts/structured-refresh-runs", input);
  }

  async getStructuredRefresh(id: string): Promise<unknown> {
    return this.getStructuredRefreshProgress(id);
  }

  async getCurrentStructuredRefresh(): Promise<unknown> {
    return this.getStructuredRefreshProgress(null);
  }

  private async getStructuredRefreshProgress(
    id: string | null,
  ): Promise<unknown> {
    const rows = await this.postgres.query<Record<string, unknown>>(
      `SELECT
         refresh.id::text AS id,
         refresh.idempotency_key AS "idempotencyKey",
         refresh.request_fingerprint AS "requestFingerprint",
         refresh.source_fingerprint AS "sourceFingerprint",
         refresh.max_attempts AS "maxAttempts",
         refresh.source_count AS "sourceCount",
         refresh.online_count AS "onlineCount",
         refresh.offline_count AS "offlineCount",
         refresh.published_at AS "publishedAt",
         refresh.reviewed_diff_fingerprint AS "reviewedDiffFingerprint",
         refresh.reviewed_by AS "reviewedBy",
         refresh.reviewed_at AS "reviewedAt",
         refresh.last_error AS "lastError",
         refresh.status,
         refresh.scope,
         refresh.extractor_version AS "extractorVersion",
         refresh.concurrency,
         refresh.batch_size AS "batchSize",
         refresh.pacing_milliseconds AS "pacingMilliseconds",
         refresh.scheduled_count AS "scheduledCount",
         refresh.processed_count AS "processedCount",
         refresh.succeeded_count AS "succeededCount",
         refresh.failed_count AS "failedCount",
         refresh.created_at AS "createdAt",
         refresh.started_at AS "startedAt",
         refresh.heartbeat_at AS "heartbeatAt",
         refresh.completed_at AS "completedAt",
         inference.id::text AS "inferenceRunId",
         jsonb_build_object(
           'provider', 'openai',
           'accessMode', 'chatgpt_subscription',
           'launcher', 'codex_exec',
           'model', (
             SELECT min(item.model_version)
             FROM inference_items item
             WHERE item.run_id = inference.id
           )
         ) AS inference,
         inference.unique_inventory_count AS "uniqueInventoryCount",
         inference.already_completed_canary_count AS "alreadyCompletedCanaryCount",
         inference.maximum_remaining_calls AS "maximumRemainingCalls",
         inference.calls_started AS "callsStarted",
         inference.successful_results AS "successfulResults",
         inference.call_outcome_unknown AS "callOutcomeUnknown",
         inference.prelaunch_failures AS "prelaunchFailures",
         inference.paid_fallback_count AS "paidFallbackCount",
         (
           SELECT count(*)::integer
           FROM inference_invocations invocation
           WHERE invocation.run_id = inference.id
             AND invocation.status = 'started'
             AND invocation.finished_at IS NULL
         ) AS "activeCalls",
         (
           SELECT count(*)::integer
           FROM inference_launch_permits permit
           WHERE permit.expires_at > now()
         ) AS "activePermits"
       FROM structured_job_refresh_runs refresh
       LEFT JOIN inference_runs inference
         ON inference.workload = 'structured_jobpost'
        AND inference.source_run_key =
          'structured-job-refresh:' || refresh.id::text
       WHERE refresh.id = $1::uuid
          OR ($1::uuid IS NULL
            AND refresh.status = 'running'
            AND refresh.scope ->> 'kind' = 'all'
            AND refresh.completed_at IS NULL
            AND refresh.processed_count < refresh.scheduled_count)
       ORDER BY refresh.created_at DESC
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) {
      if (id === null) return null;
      throw new NotFoundException({
        success: false,
        message: "Structured refresh not found",
      });
    }
    if (id && !rows[0].inferenceRunId) {
      for (const field of [
        "inference",
        "uniqueInventoryCount",
        "alreadyCompletedCanaryCount",
        "maximumRemainingCalls",
        "callsStarted",
        "successfulResults",
        "callOutcomeUnknown",
        "prelaunchFailures",
        "paidFallbackCount",
      ]) {
        delete rows[0][field];
      }
    }
    return rows[0];
  }

  getStructuredRefreshDiff(id: string): Promise<unknown> {
    return this.request("GET", `/jobposts/structured-refresh-runs/${id}/diff`);
  }

  getStructuredRefreshFailures(id: string): Promise<unknown> {
    return this.request(
      "GET",
      `/jobposts/structured-refresh-runs/${id}/failures`,
    );
  }

  getStructuredRefreshItems(id: string): Promise<unknown> {
    return this.request("GET", `/jobposts/structured-refresh-runs/${id}/items`);
  }

  executeStructuredRefreshItem(id: string, itemId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/items/${itemId}/execute`,
    );
  }

  stageStoredStructuredRefreshItem(
    id: string,
    itemId: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/items/${itemId}/stage-stored`,
    );
  }

  executeNextStructuredRefreshItems(
    id: string,
    input: ExecuteInferenceBatchDto,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/execute-next`,
      input,
    );
  }

  synchronizeStructuredRefresh(id: string): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/synchronize`,
    );
  }

  transitionStructuredRefresh(
    id: string,
    action: "pause" | "resume" | "cancel",
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/${action}`,
    );
  }

  publishStructuredRefresh(
    id: string,
    input: PublishStructuredRefreshDto,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/jobposts/structured-refresh-runs/${id}/publish`,
      input,
    );
  }

  listEntityCollisions(query: CollisionListQueryDto): Promise<unknown> {
    return this.request("GET", "/entity-collisions", undefined, query);
  }

  getEntityCollision(
    id: string,
    _status?: "needs_review" | "resolved",
  ): Promise<unknown> {
    void _status; // Retain the legacy call signature; detail retrieval is status independent.
    return this.request("GET", `/entity-collisions/${id}`);
  }

  resolveEntityCollision(
    id: string,
    input: ResolveCollisionDto,
  ): Promise<unknown> {
    return this.request("POST", `/entity-collisions/${id}/resolve`, input);
  }

  inferenceCapabilityPreflight(): Promise<unknown> {
    return this.requestInferenceTelemetry(
      "POST",
      "/inference/capability-preflight",
    );
  }

  getInferenceRun(id: string): Promise<unknown> {
    return this.requestInferenceTelemetry("GET", `/inference/runs/${id}`);
  }

  getInferenceRunItems(id: string): Promise<unknown> {
    return this.request("GET", `/inference/runs/${id}/items`);
  }

  private async requestInferenceTelemetry(
    method: UpstreamMethod,
    path: string,
  ): Promise<unknown> {
    const response = (await this.request(
      method,
      path,
    )) as InferenceMetadataEnvelope | null;
    const inference = response?.inference;
    if (
      inference?.provider !== "openai" ||
      inference.accessMode !== "chatgpt_subscription" ||
      inference.launcher !== "codex_exec" ||
      typeof inference.model !== "string" ||
      inference.model.trim().length === 0
    ) {
      throw new BadGatewayException({
        success: false,
        message: "Ingestion service returned invalid inference metadata",
      });
    }
    return response;
  }

  private async request<T = unknown>(
    method: UpstreamMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown> | object,
    headers?: Record<string, string>,
  ): Promise<T> {
    const domain = this.configService
      .get<string>("ETL_DOMAIN")
      ?.replace(/\/$/, "");
    if (!domain) {
      throw new ServiceUnavailableException({
        success: false,
        message: "Ingestion service is not configured",
      });
    }
    const token = await this.auth0Service.getETLToken();
    if (!token) {
      throw new ServiceUnavailableException({
        success: false,
        message: "Ingestion service authentication is unavailable",
      });
    }

    const config: AxiosRequestConfig = {
      method,
      url: `${domain}${path}`,
      headers: { ...headers, Authorization: `Bearer ${token}` },
      timeout: 120_000,
      ...(data === undefined ? {} : { data }),
      ...(params === undefined
        ? {}
        : { params, paramsSerializer: { indexes: null } }),
    };
    const retryableImportRequest =
      method === "POST" && path === "/imports/runs";
    let error: unknown;
    for (
      let attempt = 0;
      attempt < (retryableImportRequest ? 2 : 1);
      attempt++
    ) {
      try {
        const response = await axios.request<T>(config);
        return response.data;
      } catch (caught) {
        error = caught;
        const status = axios.isAxiosError(caught)
          ? caught.response?.status
          : undefined;
        if (!retryableImportRequest || (status !== undefined && status < 500)) {
          break;
        }
      }
    }
    if (!axios.isAxiosError(error)) {
      throw new BadGatewayException({
        success: false,
        message: "Ingestion service request failed",
      });
    }
    const upstreamStatus = error.response?.status;
    const responseData = error.response?.data as
      { message?: unknown } | string | undefined;
    const rawMessage =
      typeof responseData === "string" ? responseData : responseData?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter(item => typeof item === "string").join("; ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "Ingestion service request failed";
    const status = [
      HttpStatus.BAD_REQUEST,
      HttpStatus.NOT_FOUND,
      HttpStatus.CONFLICT,
      HttpStatus.SERVICE_UNAVAILABLE,
    ].includes(upstreamStatus)
      ? upstreamStatus
      : HttpStatus.BAD_GATEWAY;
    const details: Record<string, unknown> = {};
    if (responseData && typeof responseData === "object") {
      for (const key of [
        "issueId",
        "issues",
        "supportedActions",
        "blockingRelationships",
        "blockingFields",
        "conflictingProjectNodeIds",
        "projectNodeIds",
        "fields",
        "relationships",
      ]) {
        if (Object.prototype.hasOwnProperty.call(responseData, key))
          details[key] = responseData[key];
      }
    }
    throw new HttpException({ success: false, message, ...details }, status);
  }
}
