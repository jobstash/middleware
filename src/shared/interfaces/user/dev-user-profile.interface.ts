import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { UserProfile } from "./user-profile.interface";
import { UserShowCase } from "./user-showcase.interface";
import { UserSkill } from "./user-skill.interface";

export class DevUserProfile extends UserProfile {
  public static readonly DevUserProfileType = t.intersection([
    UserProfile.UserProfileType,
    t.strict({
      skills: t.array(UserSkill.UserSkillType),
      showcases: t.array(UserShowCase.UserShowCaseType),
    }),
  ]);

  @ApiProperty()
  skills: UserSkill[];

  @ApiProperty()
  showcases: UserShowCase[];

  constructor(raw: DevUserProfile) {
    const { skills, showcases, ...profile } = raw;
    super(profile);

    this.skills = skills;
    this.showcases = showcases;

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
