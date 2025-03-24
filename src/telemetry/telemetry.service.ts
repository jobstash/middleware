import { Injectable } from "@nestjs/common";
import { now } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { ResponseWithOptionalData } from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { intConverter } from "src/shared/helpers";

@Injectable()
export class TelemetryService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async logUserLoginEvent(walletOrPrivyId: string): Promise<void> {
    await this.neogma.queryRunner.run(
      `
        MATCH (user:User WHERE user.wallet = $walletOrPrivyId OR user.privyId = $walletOrPrivyId)
        MERGE (user)-[:LOGGED_IN]->(history:LoginHistory)
        SET history.id = randomUUID()
        SET history.timestamp = timestamp()
      `,
      { walletOrPrivyId },
    );
  }

  async getJobViewCount(
    data: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    const { shortUUID, orgId, epochStart, epochEnd } = data;
    if (!orgId || (!epochStart && epochEnd)) {
      return {
        success: false,
        message: "Missing required parameters",
      };
    } else {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)
          WHERE $shortUUID IS NULL OR job.shortUUID = $shortUUID
          MATCH (:User)-[r:VIEWED_DETAILS]->(job)
          WHERE ($epochStart IS NULL OR r.timestamp >= $epochStart)
          AND ($epochEnd IS NULL OR r.timestamp <= $epochEnd)
          RETURN count(DISTINCT r) as views
        `,
        { shortUUID, orgId, epochStart, epochEnd: epochEnd ?? now() },
      );
      return {
        success: true,
        message: "Retrieved job views successfully",
        data: intConverter((result.records[0]?.get("views") as number) ?? 0),
      };
    }
  }

  async getJobApplyCount(
    data: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    const { shortUUID, orgId, epochStart, epochEnd } = data;
    if (!orgId || (!epochStart && epochEnd)) {
      return {
        success: false,
        message: "Missing required parameters",
      };
    } else {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)
          WHERE $shortUUID IS NULL OR job.shortUUID = $shortUUID
          MATCH (:User)-[r:APPLIED_TO]->(job)
          WHERE ($epochStart IS NULL OR r.timestamp >= $epochStart)
          AND ($epochEnd IS NULL OR r.timestamp <= $epochEnd)
          RETURN count(DISTINCT r) as applies
        `,
        { shortUUID, orgId, epochStart, epochEnd: epochEnd ?? now() },
      );
      return {
        success: true,
        message: "Retrieved job applies successfully",
        data: intConverter((result.records[0]?.get("applies") as number) ?? 0),
      };
    }
  }
}
