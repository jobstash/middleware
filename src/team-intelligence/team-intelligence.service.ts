import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  OrganizationTeamDetail,
  OrganizationTeamSummary,
  TeamFilterInput,
  TeamOrganizationFields,
  TeamSnapshot,
  TeamSnapshotInput,
} from "./team-intelligence.types";

const MAX_ORGANIZATIONS_PER_REQUEST = 10_000;

const activeRangeBound = (value?: number | null): value is number =>
  value !== null && value !== undefined && value !== 0;

@Injectable()
export class TeamIntelligenceService {
  private readonly logger = new CustomLogger(TeamIntelligenceService.name);

  constructor(private readonly http: HttpService) {}

  hasFilters(input: TeamFilterInput): boolean {
    return (
      activeRangeBound(input.minCurrentMaintainers) ||
      activeRangeBound(input.maxCurrentMaintainers) ||
      typeof input.growingTeam === "boolean" ||
      typeof input.shrinkingTeam === "boolean" ||
      typeof input.earlyTeamShrinkage === "boolean"
    );
  }

  async matchingOrganizationIds(
    input: TeamFilterInput,
  ): Promise<string[] | undefined> {
    if (!this.hasFilters(input)) return undefined;
    const snapshot = await this.getSnapshot(this.toSnapshotInput(input));
    return snapshot.organizations.map(summary => summary.organizationId);
  }

  async getSnapshot(input: TeamSnapshotInput = {}): Promise<TeamSnapshot> {
    try {
      const response = await firstValueFrom(
        this.http.post<TeamSnapshot>(
          "/scorer/organizations/team-signals/snapshot",
          input,
        ),
      );
      return response.data;
    } catch (error) {
      this.captureProxyError("getSnapshot", error, input);
      throw error;
    }
  }

  async getSummariesById(
    organizationIds: string[],
  ): Promise<Map<string, OrganizationTeamSummary>> {
    const uniqueIds = [...new Set(organizationIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const summaries: OrganizationTeamSummary[] = [];
    for (
      let offset = 0;
      offset < uniqueIds.length;
      offset += MAX_ORGANIZATIONS_PER_REQUEST
    ) {
      const snapshot = await this.getSnapshot({
        organizationIds: uniqueIds.slice(
          offset,
          offset + MAX_ORGANIZATIONS_PER_REQUEST,
        ),
      });
      summaries.push(...snapshot.organizations);
    }
    return new Map(summaries.map(summary => [summary.organizationId, summary]));
  }

  async getCurrentMaintainerRange(
    organizationIds: string[],
  ): Promise<{ minimum: number | null; maximum: number | null }> {
    const summaries = await this.getSummariesById(organizationIds);
    const counts = [...summaries.values()].flatMap(summary =>
      summary.currentMaintainerCount === null
        ? []
        : [summary.currentMaintainerCount],
    );
    return {
      minimum: counts.length ? Math.min(...counts) : null,
      maximum: counts.length ? Math.max(...counts) : null,
    };
  }

  async getDetails(
    organizationId: string,
    page = 1,
    limit = 20,
  ): Promise<OrganizationTeamDetail | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.get<OrganizationTeamDetail>(
          `/scorer/organizations/team-signals/${encodeURIComponent(
            organizationId,
          )}`,
          { params: { page, limit } },
        ),
      );
      return response.data;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) return undefined;
      this.captureProxyError("getDetails", error, {
        organizationId,
        page,
        limit,
      });
      throw error;
    }
  }

  applySummary<T extends TeamOrganizationFields>(
    organization: T,
    summary?: OrganizationTeamSummary,
  ): T {
    return {
      ...organization,
      teamCoverageStatus: summary?.coverageStatus ?? null,
      teamSignalsAsOf: summary?.asOf ?? null,
      currentMaintainerCount: summary?.currentMaintainerCount ?? null,
      growingTeam: summary?.growingTeam ?? null,
      shrinkingTeam: summary?.shrinkingTeam ?? null,
      earlyTeamShrinkage: summary?.earlyTeamShrinkage ?? null,
    };
  }

  private toSnapshotInput(input: TeamFilterInput): TeamSnapshotInput {
    return {
      ...(activeRangeBound(input.minCurrentMaintainers)
        ? { currentMaintainersMin: input.minCurrentMaintainers }
        : {}),
      ...(activeRangeBound(input.maxCurrentMaintainers)
        ? { currentMaintainersMax: input.maxCurrentMaintainers }
        : {}),
      ...(typeof input.growingTeam === "boolean"
        ? { growingTeam: input.growingTeam }
        : {}),
      ...(typeof input.shrinkingTeam === "boolean"
        ? { shrinkingTeam: input.shrinkingTeam }
        : {}),
      ...(typeof input.earlyTeamShrinkage === "boolean"
        ? { earlyTeamShrinkage: input.earlyTeamShrinkage }
        : {}),
    };
  }

  private captureProxyError(
    action: string,
    error: unknown,
    input: unknown,
  ): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "proxy-call", source: "team-intelligence" });
      scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    this.logger.error(
      `TeamIntelligenceService::${action} ${(error as Error).message}`,
    );
  }
}
