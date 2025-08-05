import { nonZeroOrNull } from "../helpers";
import { DashboardTalentStats } from "../interfaces/dashboard-talent-stats.interface";

export class DashboardTalentStatsEntity {
  constructor(private readonly raw: DashboardTalentStats) {}

  getProperties(): DashboardTalentStats {
    return new DashboardTalentStats({
      topJobCategories: this.raw?.topJobCategories.map(x => ({
        label: x.label,
        count: nonZeroOrNull(x.count) ?? 0,
      })),
      totalAvailableTalent: nonZeroOrNull(this.raw?.totalAvailableTalent),
      newTalentThisWeek: nonZeroOrNull(this.raw?.newTalentThisWeek),
      recentApplication: nonZeroOrNull(this.raw?.recentApplication),
    });
  }
}
