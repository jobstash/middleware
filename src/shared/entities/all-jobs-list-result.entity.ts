import { isAfter, isBefore } from "date-fns";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { AllJobsListResult } from "../interfaces/all-jobs-list-result.interface";

export class AllJobListResultEntity {
  constructor(private readonly raw: AllJobsListResult) {}

  getProperties(): AllJobsListResult {
    const jobpost = this.raw;
    const { organization, tags, project } = jobpost;

    const now = new Date().getTime();

    const isStillFeatured =
      jobpost?.featured === true &&
      isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
      isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

    return new AllJobsListResult({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      commitment: notStringOrNull(jobpost?.commitment),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      timestamp: nonZeroOrNull(jobpost?.timestamp),
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      organization: {
        ...organization,
        projects: organization?.projects ?? [],
      },
      featureStartDate: nonZeroOrNull(jobpost?.featureStartDate),
      featureEndDate: nonZeroOrNull(jobpost?.featureEndDate),
      featured: isStillFeatured,
      project: project ?? null,
      tags: tags ?? [],
    });
  }
}
