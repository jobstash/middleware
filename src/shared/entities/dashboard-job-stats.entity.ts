import { nonZeroOrNull } from "../helpers";
import { DashboardJobStats } from "../interfaces/dashboard-job-stats.interface";

export class DashboardJobStatsEntity {
  constructor(private readonly raw: DashboardJobStats) {}

  getProperties(): DashboardJobStats {
    return new DashboardJobStats({
      jobCounts: {
        active: nonZeroOrNull(this.raw?.jobCounts?.active),
        inactive: nonZeroOrNull(this.raw?.jobCounts?.inactive),
        expert: nonZeroOrNull(this.raw?.jobCounts?.expert),
        promoted: nonZeroOrNull(this.raw?.jobCounts?.promoted),
      },
      applicationsThisMonth: nonZeroOrNull(this.raw?.applicationsThisMonth),
      totalJobCount: nonZeroOrNull(this.raw?.totalJobCount),
    });
  }
}
