import { StructuredJobpostWithApplicants } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { isAfter, isBefore } from "date-fns";
import { UserProfileEntity } from "./user-profile.entity";

export class StructuredJobpostWithApplicantsEntity {
  constructor(private readonly raw: StructuredJobpostWithApplicants) {}

  getProperties(): StructuredJobpostWithApplicants {
    const jobpost = this.raw;

    const now = new Date().getTime();

    const isStillFeatured =
      jobpost?.featured === true &&
      isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
      isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

    return new StructuredJobpostWithApplicants({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url: notStringOrNull(jobpost?.url),
      title: notStringOrNull(jobpost?.title),
      summary: notStringOrNull(jobpost?.summary),
      description: notStringOrNull(jobpost?.description),
      commitment: notStringOrNull(jobpost?.commitment),
      timestamp: nonZeroOrNull(jobpost?.timestamp),
      featureStartDate: isStillFeatured
        ? nonZeroOrNull(jobpost?.featureStartDate)
        : null,
      featureEndDate: isStillFeatured
        ? nonZeroOrNull(jobpost?.featureEndDate)
        : null,
      featured: isStillFeatured,
      tags: jobpost.tags ?? [],
      applicants: jobpost.applicants.map(applicant =>
        new UserProfileEntity(applicant).getProperties(),
      ),
    });
  }
}
