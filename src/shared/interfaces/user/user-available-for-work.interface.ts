import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { UserProfile } from "./user-profile.interface";
import { UserShowCase } from "./user-showcase.interface";
import { UserSkill } from "./user-skill.interface";
import { UserWorkHistory } from "./user-work-history.interface";

export class UserAvailableForWork extends UserProfile {
  public static readonly UserAvailableForWorkType = t.intersection([
    UserProfile.UserProfileType,
    t.strict({
      attestations: t.strict({
        upvotes: t.union([t.number, t.null]),
        downvotes: t.union([t.number, t.null]),
      }),
      note: t.union([t.string, t.null]),
      ecosystemActivations: t.array(t.string),
      skills: t.array(UserSkill.UserSkillType),
      showcases: t.array(UserShowCase.UserShowCaseType),
      workHistory: t.array(UserWorkHistory.UserWorkHistoryType),
      jobCategoryInterests: t.array(
        t.strict({ classification: t.string, frequency: t.number }),
      ),
      tags: t.array(t.strict({ tag: t.string, frequency: t.number })),
      lastAppliedTimestamp: t.union([t.number, t.null]),
    }),
  ]);

  @ApiProperty()
  skills: UserSkill[];

  @ApiProperty()
  showcases: UserShowCase[];

  @ApiProperty()
  workHistory: UserWorkHistory[];

  @ApiProperty()
  attestations: {
    upvotes: number | null;
    downvotes: number | null;
  };

  @ApiProperty()
  ecosystemActivations: string[];

  @ApiProperty()
  note: string | null;

  @ApiProperty()
  jobCategoryInterests: { classification: string; frequency: number }[];

  @ApiProperty()
  tags: { tag: string; frequency: number }[];

  @ApiProperty()
  lastAppliedTimestamp: number | null;

  constructor(raw: UserAvailableForWork) {
    const {
      skills,
      showcases,
      workHistory,
      attestations,
      note,
      ecosystemActivations,
      jobCategoryInterests,
      tags,
      lastAppliedTimestamp,
      ...profile
    } = raw;
    super(profile);

    this.skills = skills;
    this.showcases = showcases;
    this.workHistory = workHistory;
    this.attestations = attestations;
    this.note = note;
    this.ecosystemActivations = ecosystemActivations;
    this.jobCategoryInterests = jobCategoryInterests;
    this.tags = tags;
    this.lastAppliedTimestamp = lastAppliedTimestamp;

    const result = UserAvailableForWork.UserAvailableForWorkType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `dev user profile instance for user ${this.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}
