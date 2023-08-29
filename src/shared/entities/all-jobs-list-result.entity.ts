import { OrganizationProperties, Technology } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { StructuredJobpostWithCategory } from "../interfaces/structured-jobpost-with-category.interface";
import { AllJobsListResult } from "../interfaces/all-jobs-list-result.interface";

type RawJobPost = StructuredJobpostWithCategory & {
  organization?: OrganizationProperties | null;
  technologies?: Technology[] | null;
};

export class AllJobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): AllJobsListResult {
    const jobpost = this.raw;
    const { organization, technologies, category } = jobpost;

    return new AllJobsListResult({
      ...jobpost,
      minSalaryRange: nonZeroOrNull(jobpost?.minSalaryRange),
      maxSalaryRange: nonZeroOrNull(jobpost?.maxSalaryRange),
      medianSalary: nonZeroOrNull(jobpost?.medianSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      jobLocation: notStringOrNull(jobpost?.jobLocation, [
        "",
        "undefined",
        "unspecified",
      ]),
      jobCommitment: notStringOrNull(jobpost?.jobCommitment, ["", "undefined"]),
      role: notStringOrNull(jobpost?.role, ["", "undefined"]),
      team: notStringOrNull(jobpost?.team, ["", "undefined"]),
      benefits: notStringOrNull(jobpost?.benefits, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      jobPageUrl: notStringOrNull(jobpost?.jobPageUrl),
      jobTitle: notStringOrNull(jobpost?.jobTitle),
      aiDetectedTechnologies: notStringOrNull(jobpost?.aiDetectedTechnologies),
      category: {
        id: category.id,
        name: category.name,
      },
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        altName: notStringOrNull(organization?.altName),
        headCount: nonZeroOrNull(organization?.headCount),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      },
      technologies: technologies ?? [],
    });
  }
}
