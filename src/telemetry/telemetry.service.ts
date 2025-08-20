import { Injectable } from "@nestjs/common";
import { now } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import {
  ResponseWithOptionalData,
  DashboardJobStats,
  DashboardTalentStats,
} from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { intConverter } from "src/shared/helpers";
import { GetDashboardJobStatsInput } from "./dto/get-dashboard-job-stats.input";
import { subDays, subMonths } from "date-fns";
import {
  DashboardJobStatsEntity,
  DashboardTalentStatsEntity,
} from "src/shared/entities";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class TelemetryService {
  private readonly logger = new CustomLogger(TelemetryService.name);
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
      try {
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
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "telemetry.service",
          });
          Sentry.captureException(error);
        });
        this.logger.error(`TelemetryService::getJobViewCount ${error.message}`);
        return {
          success: false,
          message: "Error retrieving job views",
          data: 0,
        };
      }
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
      try {
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
          data: intConverter(
            (result.records[0]?.get("applies") as number) ?? 0,
          ),
        };
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "telemetry.service",
          });
          Sentry.captureException(error);
        });
        this.logger.error(
          `TelemetryService::getJobApplyCount ${error.message}`,
        );
        return {
          success: false,
          message: "Error retrieving job applies",
          data: 0,
        };
      }
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
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)
                WHERE (job)-[:HAS_STATUS]->(:JobpostOnlineStatus) | 1
              ]),
              inactive: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)
                WHERE (job)-[:HAS_STATUS]->(:JobpostOfflineStatus) | 1
              ]),
              expert: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)
                WHERE (job)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND job.access = "protected" | 1
              ]),
              promoted: apoc.coll.sum([
                (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)
                WHERE (job)-[:HAS_STATUS]->(:JobpostOnlineStatus) AND job.featured = true | 1
              ])
            },
            applicationsThisMonth: apoc.coll.sum([
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(:StructuredJobpost)<-[r:APPLIED_TO]-(user:User)
              WHERE r.createdTimestamp >= $epochStart | 1
            ]),
            totalApplications: apoc.coll.sum([
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(:StructuredJobpost)<-[r:APPLIED_TO]-(user:User) | 1
            ]),
            totalJobCount: apoc.coll.sum([
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost) | 1
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
            totalApplications: apoc.coll.sum([
              (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(:StructuredJobpost)<-[r:APPLIED_TO]-(user:User) | 1
            ]),
            totalJobCount: apoc.coll.sum([
              (org)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus|JobpostOfflineStatus) | 1
            ])
          } AS stats
        `;
    try {
      const result = await this.neogma.queryRunner.run(query, {
        id,
        epochStart,
      });
      return {
        success: true,
        message: "Retrieved dashboard job stats successfully",
        data: new DashboardJobStatsEntity(
          result.records[0]?.get("stats"),
        ).getProperties(),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "telemetry.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `TelemetryService::getDashboardJobStats ${error.message}`,
      );
      return {
        success: false,
        message: "Error retrieving dashboard job stats",
        data: null,
      };
    }
  }

  async getDashboardJobStatsSeries(
    data: GetDashboardJobStatsInput,
  ): Promise<ResponseWithOptionalData<{ month: string; count: number }[]>> {
    const { type, id } = data;
    const query =
      type === "ecosystem"
        ? `
          /* Build month buckets anchored to first of month using APOC (13 points) */
          WITH apoc.date.currentTimestamp() AS nowMs
          WITH apoc.date.parse(apoc.date.format(nowMs, 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS startMs, range(0, 12) AS idx
          UNWIND idx AS i
          WITH startMs, i
          WITH apoc.date.parse(apoc.date.format(apoc.date.add(startMs, 'ms', -(i*30), "d"), 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS mEndMs,
            apoc.date.parse(apoc.date.format(apoc.date.add(startMs, 'ms', -((i + 1)*30), 'd'), 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS mStartMs
          CALL {
            WITH mStartMs, mEndMs
            MATCH (ecosystem:OrganizationEcosystem {normalizedName: $id})
            OPTIONAL MATCH (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*4]->(job:StructuredJobpost)
            WITH job.shortUUID as uuid, mStartMs, mEndMs, CASE WHEN job.publishedTimestamp IS NULL THEN job.firstSeenTimestamp ELSE job.publishedTimestamp END AS timestamp
            WHERE timestamp >= mStartMs
              AND timestamp < mEndMs
            RETURN COUNT(DISTINCT uuid) AS cnt
          }
          RETURN { month: apoc.date.format(mEndMs, 'ms', 'MMMM'), count: cnt } AS monthCount
        `
        : `
          /* Build month buckets anchored to first of month using APOC (13 points) */
          WITH apoc.date.currentTimestamp() AS nowMs
          WITH apoc.date.parse(apoc.date.format(nowMs, 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS startMs, range(0, 12) AS idx
          UNWIND idx AS i
          WITH startMs, i
          WITH apoc.date.parse(apoc.date.format(apoc.date.add(startMs, 'ms', -(i*30), "d"), 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS mEndMs,
            apoc.date.parse(apoc.date.format(apoc.date.add(startMs, 'ms', -((i + 1)*30), 'd'), 'ms', 'yyyy-MM-01'), 'ms', 'yyyy-MM-dd') AS mStartMs
          CALL {
            WITH mStartMs, mEndMs
            MATCH (org:Organization {orgId: $id})
            OPTIONAL MATCH (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)
            WITH job.shortUUID as uuid, mStartMs, mEndMs, CASE WHEN job.publishedTimestamp IS NULL THEN job.firstSeenTimestamp ELSE job.publishedTimestamp END AS timestamp
            WHERE timestamp >= mStartMs
              AND timestamp < mEndMs
            RETURN COUNT(DISTINCT uuid) as cnt
          }
          RETURN { month: apoc.date.format(mEndMs, 'ms', 'MMMM'), count: cnt } AS monthCount
        `;

    try {
      const result = await this.neogma.queryRunner.run(query, { id });
      const seriesValue = result.records.map(record =>
        record.get("monthCount"),
      );
      const rawSeries = Array.isArray(seriesValue)
        ? (seriesValue as {
            month: string;
            count: number | { low: number; high: number };
          }[])
        : [];

      const dataSeries = rawSeries.map(x => ({
        month: x.month,
        count: intConverter(x.count) ?? 0,
      }));

      return {
        success: true,
        message: "Retrieved dashboard job stats series successfully",
        data: dataSeries,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "telemetry.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `TelemetryService::getDashboardJobStatsSeries ${error.message}`,
      );
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
      const result = await this.neogma.queryRunner.run(
        `
        /* -------- totals (global available users) -------- */
        CALL {
          MATCH (u:User {available: true})
          RETURN
            count(DISTINCT u) AS totalAvailableTalent,
            count(DISTINCT CASE WHEN u.createdTimestamp >= $epochStart THEN u END) AS newTalentThisWeek
        }

        /* -------- category ranking + recency (org-scoped) -------- */
        CALL {
          MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(job:StructuredJobpost)
          WITH DISTINCT job
          MATCH (:User {available: true})-[a:APPLIED_TO]->(job)-[:HAS_CLASSIFICATION]->(c:JobpostClassification)
          WITH coalesce(c.name, 'Unclassified') AS label, a
          WITH label, count(a) AS cnt, max(a.createdTimestamp) AS recentApplication
          ORDER BY cnt DESC, label ASC
          WITH collect({label: label, count: cnt}) AS ranked, max(recentApplication) AS recentApplication
          RETURN ranked, recentApplication
        }

        RETURN {
          topJobCategories: ranked[0..coalesce($topN, 5)],
          totalAvailableTalent: totalAvailableTalent,
          newTalentThisWeek: newTalentThisWeek,
          recentApplication: recentApplication
        } AS stats;
      `,
        { epochStart: subDays(new Date(), 7).getTime(), topN: 10 },
      );
      return {
        success: true,
        message: "Retrieved dashboard talent stats successfully",
        data: new DashboardTalentStatsEntity(
          result.records[0]?.get("stats"),
        ).getProperties(),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "telemetry.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `TelemetryService::getDashboardTalentStats ${error.message}`,
      );
      return {
        success: false,
        message: "Error retrieving dashboard talent stats",
        data: null,
      };
    }
  }
}
