import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { subDays, subMonths } from "date-fns";
import { TelemetryRepository } from "src/postgres/telemetry.repository";
import {
  DashboardJobStatsEntity,
  DashboardTalentStatsEntity,
} from "src/shared/entities";
import {
  DashboardJobStats,
  DashboardTalentStats,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GetDashboardJobStatsInput } from "./dto/get-dashboard-job-stats.input";
import { GetJobStatsInput } from "./dto/get-job-stats.input";

@Injectable()
export class TelemetryService {
  private readonly logger = new CustomLogger(TelemetryService.name);

  constructor(private readonly telemetry: TelemetryRepository) {}

  async logUserLoginEvent(
    walletOrPrivyId: string,
    context: { method?: string } = {},
  ): Promise<void> {
    await this.telemetry.logUserLoginEvent(walletOrPrivyId, context);
  }

  async getJobViewCount(
    data: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    return this.getJobEventCount(data, "VIEWED_DETAILS", "views");
  }

  async getJobApplyCount(
    data: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    return this.getJobEventCount(data, "APPLIED_TO", "applies");
  }

  async getDashboardJobStats(
    data: GetDashboardJobStatsInput,
  ): Promise<ResponseWithOptionalData<DashboardJobStats>> {
    try {
      const stats = await this.telemetry.getDashboardJobStats({
        type: data.type,
        id: data.id,
        applicationEpochStart: subMonths(new Date(), 1).getTime(),
      });
      return {
        success: true,
        message: "Retrieved dashboard job stats successfully",
        data: new DashboardJobStatsEntity(stats).getProperties(),
      };
    } catch (error) {
      this.capture("getDashboardJobStats", error);
      return {
        success: false,
        message: "Error retrieving dashboard job stats",
        data: null,
      };
    }
  }

  async getDashboardJobStatsSeries(data: GetDashboardJobStatsInput): Promise<
    ResponseWithOptionalData<
      {
        organization: string;
        stats: { month: string; count: number }[];
      }[]
    >
  > {
    try {
      const series = await this.telemetry.getDashboardJobStatsSeries({
        type: data.type,
        id: data.id,
      });
      return {
        success: true,
        message: "Retrieved dashboard job stats series successfully",
        data: series,
      };
    } catch (error) {
      this.capture("getDashboardJobStatsSeries", error);
      return {
        success: false,
        message: "Error retrieving dashboard job stats series",
        data: [],
      };
    }
  }

  async getDashboardTalentStats(): Promise<
    ResponseWithOptionalData<DashboardTalentStats>
  > {
    try {
      const stats = await this.telemetry.getDashboardTalentStats(
        subDays(new Date(), 7).getTime(),
        10,
      );
      return {
        success: true,
        message: "Retrieved dashboard talent stats successfully",
        data: new DashboardTalentStatsEntity(stats).getProperties(),
      };
    } catch (error) {
      this.capture("getDashboardTalentStats", error);
      return {
        success: false,
        message: "Error retrieving dashboard talent stats",
        data: null,
      };
    }
  }

  private async getJobEventCount(
    data: GetJobStatsInput,
    relationshipType: "VIEWED_DETAILS" | "APPLIED_TO",
    eventName: "views" | "applies",
  ): Promise<ResponseWithOptionalData<number>> {
    const { shortUUID, orgId, epochStart, epochEnd } = data;
    if (!orgId || (!epochStart && epochEnd)) {
      return { success: false, message: "Missing required parameters" };
    }
    try {
      const count = await this.telemetry.getJobEventCount({
        organizationId: orgId,
        shortUuid: shortUUID,
        relationshipType,
        epochStart,
        epochEnd: epochStart ? (epochEnd ?? Date.now()) : null,
      });
      return {
        success: true,
        message: `Retrieved job ${eventName} successfully`,
        data: count,
      };
    } catch (error) {
      this.capture(
        `getJob${eventName === "views" ? "View" : "Apply"}Count`,
        error,
      );
      return {
        success: false,
        message: `Error retrieving job ${eventName}`,
        data: 0,
      };
    }
  }

  private capture(action: string, error: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "telemetry.service" });
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`TelemetryService::${action} ${message}`);
  }
}
