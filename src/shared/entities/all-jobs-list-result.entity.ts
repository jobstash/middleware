import {
  OrganizationProperties,
  StructuredJobpostWithRelations,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { AllJobsListResult } from "../interfaces/all-jobs-list-result.interface";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?: OrganizationProperties | null;
};

export class AllJobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): AllJobsListResult {
    const jobpost = this.raw;
    const { organization, tags } = jobpost;

    return new AllJobsListResult({
      ...jobpost,
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      salary: nonZeroOrNull(jobpost?.salary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      organization: {
        ...organization,
        docs: notStringOrNull(organization?.docs),
        logoUrl: notStringOrNull(organization?.logoUrl),
        altName: notStringOrNull(organization?.altName),
        headCount: nonZeroOrNull(organization?.headCount),
        github: notStringOrNull(organization?.github),
        twitter: notStringOrNull(organization?.twitter),
        discord: notStringOrNull(organization?.discord),
        telegram: notStringOrNull(organization?.telegram),
        jobsiteLink: notStringOrNull(organization?.jobsiteLink),
        createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
        updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      },
      tags: tags ?? [],
    });
  }
}
