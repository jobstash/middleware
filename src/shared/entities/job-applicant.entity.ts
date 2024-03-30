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

    const { skills, showcases, matchingSkills, workHistory, ...user } =
      applicant.user;

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
        workHistory: workHistory?.map(workHistory => ({
          ...workHistory,
          id: notStringOrNull(workHistory.id),
          name: notStringOrNull(workHistory.name),
          login: notStringOrNull(workHistory.login),
          repositories:
            workHistory?.repositories?.map(repository => ({
              ...repository,
              id: notStringOrNull(repository.id),
              name: notStringOrNull(repository.name),
              commits: {
                authored: {
                  count: nonZeroOrNull(repository?.commits?.authored?.count),
                  first: notStringOrNull(repository?.commits?.authored?.first),
                  last: notStringOrNull(repository?.commits?.authored?.last),
                },
                committed: {
                  count: nonZeroOrNull(repository?.commits?.committed?.count),
                  first: notStringOrNull(repository?.commits?.committed?.first),
                  last: notStringOrNull(repository?.commits?.committed?.last),
                },
              },
              issues: {
                authored: {
                  count: nonZeroOrNull(repository?.issues?.authored?.count),
                  first: notStringOrNull(repository?.issues?.authored?.first),
                  last: notStringOrNull(repository?.issues?.authored?.last),
                },
              },
              pull_requests: {
                authored: {
                  count: nonZeroOrNull(
                    repository?.pull_requests?.authored?.count,
                  ),
                  first: notStringOrNull(
                    repository?.pull_requests?.authored?.first,
                  ),
                  last: notStringOrNull(
                    repository?.pull_requests?.authored?.last,
                  ),
                },
                merged: {
                  count: nonZeroOrNull(
                    repository?.pull_requests?.merged?.count,
                  ),
                  first: notStringOrNull(
                    repository?.pull_requests?.merged?.first,
                  ),
                  last: notStringOrNull(
                    repository?.pull_requests?.merged?.last,
                  ),
                },
              },
            })) ?? [],
        })),
      },
      job: new JobListResultEntity(applicant?.job).getProperties(),
      calendly: notStringOrNull(applicant?.calendly),
    });
  }
}
