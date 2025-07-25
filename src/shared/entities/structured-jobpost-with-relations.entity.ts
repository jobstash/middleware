import { OrgJob, StructuredJobpostWithRelations } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { isAfter, isBefore } from "date-fns";

export class StructuredJobpostWithRelationsEntity {
  constructor(private readonly raw: StructuredJobpostWithRelations) {}

  getProperties(): StructuredJobpostWithRelations {
    const jobpost = this.raw;

    const now = new Date().getTime();

    const isStillFeatured =
      jobpost?.featured === true &&
      isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
      isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

    return new StructuredJobpostWithRelations({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      onboardIntoWeb3: jobpost?.onboardIntoWeb3 ?? false,
      ethSeasonOfInternships: jobpost?.ethSeasonOfInternships ?? false,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      url:
        jobpost?.access === "protected" ? null : notStringOrNull(jobpost?.url),
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
    });
  }
}

export class OrgJobEntity {
  constructor(private readonly raw: OrgJob) {}

  getProperties(): OrgJob {
    const jobpost = this.raw;

    const now = new Date().getTime();

    const isStillFeatured =
      jobpost?.featured === true &&
      isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
      isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);

    return new OrgJob({
      ...jobpost,
      salary: nonZeroOrNull(jobpost?.salary),
      minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
      maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
      seniority: notStringOrNull(jobpost?.seniority, ["", "undefined"]),
      salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
      paysInCrypto: jobpost?.paysInCrypto ?? null,
      offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
      title: notStringOrNull(jobpost?.title),
      summary: notStringOrNull(jobpost?.summary),
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
    });
  }
}
