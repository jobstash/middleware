import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosRequestConfig } from "axios";
import { Auth0Service } from "src/auth0/auth0.service";
import {
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

type UpstreamMethod = "GET" | "POST";

@Injectable()
export class AdminIngestionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly auth0Service: Auth0Service,
  ) {}

  createImportRun(input: CreateImportRunDto): Promise<unknown> {
    return this.request("POST", "/imports/runs", input);
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

  getStructuredRefresh(id: string): Promise<unknown> {
    return this.request("GET", `/jobposts/structured-refresh-runs/${id}`);
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
    input: ExecuteKimiBatchDto,
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

  async getEntityCollision(
    id: string,
    status: "needs_review" | "resolved",
  ): Promise<unknown> {
    const collisions = await this.request<unknown[]>(
      "GET",
      "/entity-collisions",
      undefined,
      { status, limit: 500 },
    );
    const collision = Array.isArray(collisions)
      ? collisions.find(
          (item: unknown) =>
            !!item &&
            typeof item === "object" &&
            (item as { id?: unknown }).id === id,
        )
      : undefined;
    if (!collision) {
      throw new NotFoundException({
        success: false,
        message: "Entity collision not found in the requested review state",
      });
    }
    return collision;
  }

  resolveEntityCollision(
    id: string,
    input: ResolveCollisionDto,
  ): Promise<unknown> {
    return this.request("POST", `/entity-collisions/${id}/resolve`, input);
  }

  reconcileEntityCorpus(
    input: CreateEntityReconciliationRunDto,
  ): Promise<unknown> {
    return this.request("POST", "/entity-reconciliation/runs", input);
  }

  getEntityReconciliationRun(id: string): Promise<unknown> {
    return this.request("GET", `/entity-reconciliation/runs/${id}`);
  }

  getEntityReconciliationDecision(
    id: string,
    itemId: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/entity-reconciliation/runs/${id}/items/${itemId}/decision`,
    );
  }

  kimiCapabilityPreflight(): Promise<unknown> {
    return this.request("POST", "/kimi/capability-preflight");
  }

  getKimiRun(id: string): Promise<unknown> {
    return this.request("GET", `/kimi/runs/${id}`);
  }

  getKimiRunItems(id: string): Promise<unknown> {
    return this.request("GET", `/kimi/runs/${id}/items`);
  }

  resumeKimiRun(id: string): Promise<unknown> {
    return this.request("POST", `/kimi/runs/${id}/resume`);
  }

  createKimiCanaryCampaign(
    input: CreateKimiCanaryCampaignDto,
  ): Promise<unknown> {
    return this.request("POST", "/kimi/canary-campaigns", input);
  }

  reviewKimiCanaryCampaign(
    id: string,
    input: ReviewKimiCanaryCampaignDto,
  ): Promise<unknown> {
    return this.request("POST", `/kimi/canary-campaigns/${id}/review`, input);
  }

  private async request<T = unknown>(
    method: UpstreamMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown> | object,
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
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120_000,
      ...(data === undefined ? {} : { data }),
      ...(params === undefined ? {} : { params }),
    };
    try {
      const response = await axios.request<T>(config);
      return response.data;
    } catch (error) {
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
      ].includes(upstreamStatus)
        ? upstreamStatus
        : HttpStatus.BAD_GATEWAY;
      throw new HttpException({ success: false, message }, status);
    }
  }
}
