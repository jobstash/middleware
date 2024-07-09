import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { UserProfile } from "./user-profile.interface";
import { UserShowCase } from "./user-showcase.interface";
import { UserSkill } from "./user-skill.interface";
import { UserWorkHistory } from "./user-work-history.interface";

export class DevUserProfile extends UserProfile {
  public static readonly DevUserProfileType = t.intersection([
    UserProfile.UserProfileType,
    t.strict({
      cryptoAjacent: t.boolean,
      cryptoNative: t.boolean,
      attestations: t.strict({
        upvotes: t.union([t.number, t.null]),
        downvotes: t.union([t.number, t.null]),
      }),
      note: t.union([t.string, t.null]),
      ecosystemActivations: t.array(t.string),
      skills: t.array(UserSkill.UserSkillType),
      showcases: t.array(UserShowCase.UserShowCaseType),
      workHistory: t.array(UserWorkHistory.UserWorkHistoryType),
    }),
  ]);

  @ApiProperty()
  skills: UserSkill[];

  @ApiProperty()
  showcases: UserShowCase[];

  @ApiProperty()
  workHistory: UserWorkHistory[];

  @ApiProperty()
  cryptoAjacent: boolean;

  @ApiProperty()
  cryptoNative: boolean;

  @ApiProperty()
  attestations: {
    upvotes: number | null;
    downvotes: number | null;
  };

  @ApiProperty()
  ecosystemActivations: string[];

  @ApiProperty()
  note: string | null;

  constructor(raw: DevUserProfile) {
    const {
      skills,
      showcases,
      workHistory,
      cryptoNative,
      cryptoAjacent,
      attestations,
      note,
      ecosystemActivations,
      ...profile
    } = raw;
    super(profile);

    this.skills = skills;
    this.showcases = showcases;
    this.workHistory = workHistory;
    this.cryptoAjacent = cryptoAjacent;
    this.cryptoNative = cryptoNative;
    this.attestations = attestations;
    this.note = note;
    this.ecosystemActivations = ecosystemActivations;

    const result = DevUserProfile.DevUserProfileType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `dev user profile instance for user ${this.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}
