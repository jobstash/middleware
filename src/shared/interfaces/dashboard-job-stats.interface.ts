import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class DashboardJobStats {
  public static readonly DashboardJobStatsType = t.type({
    jobCounts: t.type({
      active: t.union([t.number, t.null]),
      inactive: t.union([t.number, t.null]),
      expert: t.union([t.number, t.null]),
      promoted: t.union([t.number, t.null]),
    }),
    applicationsThisMonth: t.union([t.number, t.null]),
    totalJobCount: t.union([t.number, t.null]),
  });

  @ApiProperty({
    description: "The number of active jobs",
    example: 100,
  })
  jobCounts: {
    active: number | null;
    inactive: number | null;
    expert: number | null;
    promoted: number | null;
  };

  @ApiProperty({
    description: "The number of applications this month",
    example: 100,
  })
  applicationsThisMonth: number | null;

  @ApiProperty({
    description: "The total number of jobs",
    example: 100,
  })
  totalJobCount: number | null;

  constructor(data: DashboardJobStats) {
    this.jobCounts = data.jobCounts;
    this.applicationsThisMonth = data.applicationsThisMonth;
    this.totalJobCount = data.totalJobCount;

    const result = DashboardJobStats.DashboardJobStatsType.decode(data);
    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `dashboard job stats instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
