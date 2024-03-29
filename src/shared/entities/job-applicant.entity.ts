import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { JobApplicant } from "../interfaces";
import { JobListResultEntity } from "./job-list-result.entity";
import { UserProfileEntity } from "./user-profile.entity";
import { UserShowCaseEntity } from "./user-showcase.entity";
import { UserSkillEntity } from "./user-skill.entity";

export class JobApplicantEntity {
  constructor(private readonly raw: JobApplicant) {}

  getProperties(): JobApplicant {
    const applicant = this.raw;

    const { skills, showcases, matchingSkills, ...user } = applicant.user;

    return new JobApplicant({
      oss: applicant?.oss ?? false,
      interviewed: applicant?.interviewed ?? false,
      cryptoNative: applicant?.cryptoNative ?? false,
      upcomingTalent: applicant?.upcomingTalent ?? false,
      attestations: {
        upvotes: nonZeroOrNull(applicant?.attestations?.upvotes),
        downvotes: nonZeroOrNull(applicant?.attestations?.downvotes),
      },
      appliedTimestamp: nonZeroOrNull(applicant?.appliedTimestamp),
      user: {
        ...new UserProfileEntity(user).getProperties(),
        skills:
          skills?.map(skill => new UserSkillEntity(skill).getProperties()) ??
          [],
        showcases:
          showcases?.map(showcase =>
            new UserShowCaseEntity(showcase).getProperties(),
          ) ?? [],
        matchingSkills: nonZeroOrNull(matchingSkills),
      },
      job: new JobListResultEntity(applicant?.job).getProperties(),
      calendly: notStringOrNull(applicant?.calendly),
    });
  }
}
