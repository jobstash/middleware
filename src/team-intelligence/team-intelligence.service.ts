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
      activeRangeBound(input.minActiveLeads) ||
      activeRangeBound(input.maxActiveLeads) ||
      typeof input.newActiveLeads === "boolean" ||
      typeof input.steppedDownLeads === "boolean" ||
      typeof input.movedLeads === "boolean" ||
      typeof input.earlyLeadDepartures === "boolean" ||
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
    if (!snapshot.available) return undefined;
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
      return {
        snapshotVersion: 2,
        available: false,
        asOf: null,
        organizations: [],
      };
    }
  }

  async getSummariesById(
    organizationIds: string[],
  ): Promise<Map<string, OrganizationTeamSummary>> {
    return (await this.getSummaryStateById(organizationIds)).summaries;
  }

  async getSummaryStateById(organizationIds: string[]): Promise<{
    available: boolean;
    summaries: Map<string, OrganizationTeamSummary>;
  }> {
    const uniqueIds = [...new Set(organizationIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return { available: false, summaries: new Map() };
    }

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
      if (!snapshot.available) {
        return { available: false, summaries: new Map() };
      }
      summaries.push(...snapshot.organizations);
    }
    return {
      available: true,
      summaries: new Map(
        summaries.map(summary => [summary.organizationId, summary]),
      ),
    };
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

  async getMaintainerRanges(organizationIds: string[]): Promise<{
    available: boolean;
    current: { minimum: number | null; maximum: number | null };
    active: { minimum: number | null; maximum: number | null };
  }> {
    const snapshot = await this.getSnapshot({
      organizationIds: [...new Set(organizationIds.filter(Boolean))],
    });
    const range = (values: Array<number | null>) => {
      const present = values.filter((value): value is number => value !== null);
      return {
        minimum: present.length ? Math.min(...present) : null,
        maximum: present.length ? Math.max(...present) : null,
      };
    };
    return {
      available: snapshot.available,
      current: range(
        snapshot.organizations.map(summary => summary.currentMaintainerCount),
      ),
      active: range(
        snapshot.organizations.map(summary => summary.activeLeadCount),
      ),
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
      return undefined;
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
      activeLeadCount: summary?.activeLeadCount ?? null,
      newActiveLeadCount: summary?.newActiveLeadCount ?? null,
      steppedDownLeadCount: summary?.steppedDownLeadCount ?? null,
      movedLeadCount: summary?.movedLeadCount ?? null,
      earlyLeadDepartureCount: summary?.earlyLeadDepartureCount ?? null,
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
      ...(activeRangeBound(input.minActiveLeads)
        ? { activeLeadsMin: input.minActiveLeads }
        : {}),
      ...(activeRangeBound(input.maxActiveLeads)
        ? { activeLeadsMax: input.maxActiveLeads }
        : {}),
      ...(typeof input.newActiveLeads === "boolean"
        ? { newActiveLeads: input.newActiveLeads }
        : typeof input.growingTeam === "boolean"
          ? { newActiveLeads: input.growingTeam }
          : {}),
      ...(typeof input.steppedDownLeads === "boolean"
        ? { steppedDownLeads: input.steppedDownLeads }
        : typeof input.shrinkingTeam === "boolean"
          ? { steppedDownLeads: input.shrinkingTeam }
          : {}),
      ...(typeof input.movedLeads === "boolean"
        ? { movedLeads: input.movedLeads }
        : {}),
      ...(typeof input.earlyLeadDepartures === "boolean"
        ? { earlyLeadDepartures: input.earlyLeadDepartures }
        : typeof input.earlyTeamShrinkage === "boolean"
          ? { earlyLeadDepartures: input.earlyTeamShrinkage }
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
