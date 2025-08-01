import { Injectable } from "@nestjs/common";
import { now } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import {
  ResponseWithOptionalData,
  DashboardJobStats,
} from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { intConverter } from "src/shared/helpers";
import { GetDashboardJobStatsInput } from "./dto/get-dashboard-job-stats.input";
import { subMonths } from "date-fns";
import { DashboardJobStatsEntity } from "src/shared/entities";

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
        SET history.createdTimestamp = timestamp()
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
          WHERE ($epochStart IS NULL OR r.createdTimestamp >= $epochStart)
          AND ($epochEnd IS NULL OR r.createdTimestamp <= $epochEnd)
          RETURN count(DISTINCT r) as views
        `,
        {
          shortUUID,
          orgId,
          epochStart,
          epochEnd: !!epochStart ? (epochEnd ?? now()) : null,
        },
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
          WHERE ($epochStart IS NULL OR r.createdTimestamp >= $epochStart)
          AND ($epochEnd IS NULL OR r.createdTimestamp <= $epochEnd)
          RETURN count(DISTINCT r) as applies
        `,
        {
          shortUUID,
          orgId,
          epochStart,
          epochEnd: !!epochStart ? (epochEnd ?? now()) : null,
        },
      );
      return {
        success: true,
        message: "Retrieved job applies successfully",
        data: intConverter((result.records[0]?.get("applies") as number) ?? 0),
      };
    }
  }

  async getDashboardJobStats(
    data: GetDashboardJobStatsInput,
  ): Promise<ResponseWithOptionalData<DashboardJobStats>> {
    const { type, id } = data;
    const epochStart = subMonths(new Date(), 1).getTime();
    const query =
      type === "ecosystem"
        ? `
          MATCH (ecosystem:OrganizationEcosystem {normalizedName: $id})
          RETURN {
            jobCounts: {
              active: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | 1
              ]),
              inactive: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOfflineStatus) | 1
              ]),
              expert: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE job.access = "protected" | 1
              ]),
              promoted: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE job.featured = true | 1
              ])
            },
            applicationsThisMonth: apoc.coll.sum([
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(:StructuredJobpost)<-[r:APPLIED_TO]-(user:User)
              WHERE r.createdTimestamp >= $epochStart | 1
            ]),
            totalJobCount: apoc.coll.sum([
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus|JobpostOfflineStatus) | 1
            ])
          } AS stats
        `
        : `
          MATCH (org:Organization {orgId: $id})
          RETURN {
            jobCounts: {
              active: apoc.coll.sum([
                (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | 1
              ]),
              inactive: apoc.coll.sum([
                (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOfflineStatus) | 1
              ]),
              expert: apoc.coll.sum([
                (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE job.access = "protected" | 1
              ]),
              promoted: apoc.coll.sum([
                (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE job.featured = true | 1
              ])
            },
            applicationsThisMonth: apoc.coll.sum([
              (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(:StructuredJobpost)<-[r:APPLIED_TO]-(user:User)
              WHERE r.createdTimestamp >= $epochStart | 1
            ]),
            totalJobCount: apoc.coll.sum([
              (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus|JobpostOfflineStatus) | 1
            ])
          } AS stats
        `;
    const result = await this.neogma.queryRunner.run(query, { id, epochStart });
    return {
      success: true,
      message: "Retrieved dashboard job stats successfully",
      data: new DashboardJobStatsEntity(
        result.records[0]?.get("stats"),
      ).getProperties(),
    };
  }
}
