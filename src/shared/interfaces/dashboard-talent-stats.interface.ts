import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class DashboardTalentStats {
  public static readonly DashboardTalentStatsType = t.type({
    topJobCategories: t.array(
      t.strict({
        label: t.string,
        count: t.number,
      }),
    ),
    totalAvailableTalent: t.union([t.number, t.null]),
    newTalentThisWeek: t.union([t.number, t.null]),
    recentApplication: t.union([t.number, t.null]),
  });

  @ApiProperty({
    description: "The top job categories",
    example: 100,
  })
  topJobCategories: {
    label: string;
    count: number;
  }[];

  @ApiProperty({
    description: "The number of available talent",
    example: 100,
  })
  totalAvailableTalent: number | null;

  @ApiProperty({
    description: "The number of new talent this week",
    example: 100,
  })
  newTalentThisWeek: number | null;

  @ApiProperty({
    description: "The timestamp of the most recent application",
    example: 100,
  })
  recentApplication: number | null;

  constructor(data: DashboardTalentStats) {
    this.topJobCategories = data.topJobCategories;
    this.totalAvailableTalent = data.totalAvailableTalent;
    this.newTalentThisWeek = data.newTalentThisWeek;
    this.recentApplication = data.recentApplication;

    const result = DashboardTalentStats.DashboardTalentStatsType.decode(data);
    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `dashboard talent stats instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
