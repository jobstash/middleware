import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { UserProfile, UserShowCase, UserSkill } from "./user";
import { JobListResult } from "./job-list-result.interface";

export class JobApplicant {
  public static readonly JobApplicantType = t.strict({
    oss: t.boolean,
    interviewed: t.boolean,
    cryptoNative: t.boolean,
    upcomingTalent: t.boolean,
    calendly: t.union([t.string, t.null]),
    attestations: t.strict({
      upvotes: t.union([t.number, t.null]),
      downvotes: t.union([t.number, t.null]),
    }),
    appliedTimestamp: t.number,
    user: t.intersection([
      UserProfile.UserProfileType,
      t.strict({
        skills: t.array(UserSkill.UserSkillType),
        showcases: t.array(UserShowCase.UserShowCaseType),
        matchingSkills: t.union([t.number, t.null]),
      }),
    ]),
    job: JobListResult.JobListResultType,
  });

  @ApiProperty()
  oss: boolean;

  @ApiProperty()
  interviewed: boolean;

  @ApiProperty()
  cryptoNative: boolean;

  @ApiProperty()
  upcomingTalent: boolean;

  @ApiProperty()
  attestations: {
    upvotes: number | null;
    downvotes: number | null;
  };

  @ApiProperty()
  appliedTimestamp: number;

  @ApiProperty()
  user: UserProfile & {
    skills: UserSkill[];
    showcases: UserShowCase[];
    matchingSkills: number | null;
  };

  @ApiProperty()
  job: JobListResult;

  @ApiPropertyOptional()
  calendly: string | null;

  constructor(raw: JobApplicant) {
    const {
      oss,
      interviewed,
      cryptoNative,
      upcomingTalent,
      attestations,
      appliedTimestamp,
      user,
      job,
      calendly,
    } = raw;

    this.oss = oss;
    this.interviewed = interviewed;
    this.cryptoNative = cryptoNative;
    this.upcomingTalent = upcomingTalent;
    this.attestations = attestations;
    this.appliedTimestamp = appliedTimestamp;
    this.user = user;
    this.job = job;
    this.calendly = calendly;

    const result = JobApplicant.JobApplicantType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `job applicant instance for user ${this.user.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}
