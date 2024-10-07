import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { JobApplicant, UserProfile } from "../interfaces";
import { JobListResultEntity } from "./job-list-result.entity";
import { UserProfileEntity } from "./user-profile.entity";
import { UserShowCaseEntity } from "./user-showcase.entity";
import { UserSkillEntity } from "./user-skill.entity";

export class JobApplicantEntity {
  constructor(private readonly raw: JobApplicant) {}

  getProperties(): JobApplicant {
    const applicant = this.raw;

    const { skills, showcases, matchingSkills, workHistory, ...user } =
      applicant.user;

    return new JobApplicant({
      oss: applicant?.oss ?? false,
      interviewed: applicant?.interviewed ?? false,
      cryptoNative: applicant?.cryptoNative ?? false,
      cryptoAdjacent: applicant?.cryptoAdjacent ?? false,
      upcomingTalent: applicant?.upcomingTalent ?? false,
      attestations: {
        upvotes: nonZeroOrNull(applicant?.attestations?.upvotes),
        downvotes: nonZeroOrNull(applicant?.attestations?.downvotes),
      },
      ecosystemActivations: applicant?.ecosystemActivations ?? [],
      note: notStringOrNull(applicant?.note),
      appliedTimestamp: nonZeroOrNull(applicant?.appliedTimestamp),
      user: {
        ...new UserProfileEntity(
          user as unknown as UserProfile,
        ).getProperties(),
        skills:
          skills?.map(skill => new UserSkillEntity(skill).getProperties()) ??
          [],
        showcases:
          showcases?.map(showcase =>
            new UserShowCaseEntity(showcase).getProperties(),
          ) ?? [],
        matchingSkills: nonZeroOrNull(matchingSkills),
        workHistory: workHistory?.map(workHistory => ({
          ...workHistory,
          name: notStringOrNull(workHistory.name),
          login: notStringOrNull(workHistory.login),
          logoUrl: notStringOrNull(workHistory.logoUrl),
          url: notStringOrNull(workHistory.url),
          firstContributedAt: nonZeroOrNull(workHistory.firstContributedAt),
          lastContributedAt: nonZeroOrNull(workHistory.lastContributedAt),
          createdAt: nonZeroOrNull(workHistory.createdAt),
          repositories:
            workHistory?.repositories?.map(repository => ({
              ...repository,
              cryptoNative: repository?.cryptoNative ?? false,
              name: notStringOrNull(repository.name),
              firstContributedAt: nonZeroOrNull(repository.firstContributedAt),
              lastContributedAt: nonZeroOrNull(repository.lastContributedAt),
              commitsCount: nonZeroOrNull(repository.commitsCount),
              createdAt: nonZeroOrNull(repository.createdAt),
            })) ?? [],
        })),
      },
      job: new JobListResultEntity(applicant?.job).getProperties(),
      calendly: notStringOrNull(applicant?.calendly),
    });
  }
}
