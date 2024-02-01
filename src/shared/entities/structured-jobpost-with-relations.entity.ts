import {
  StructuredJobpostWithRelations,
  OrganizationWithRelations,
} from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";

type RawJobPost = StructuredJobpostWithRelations & {
  organization?: OrganizationWithRelations | null;
};

export class StructuredJobpostWithRelationsEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): StructuredJobpostWithRelations {
    const jobpost = this.raw;

    return new StructuredJobpostWithRelations({
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
      featureStartDate: nonZeroOrNull(jobpost?.featureStartDate),
      featureEndDate: nonZeroOrNull(jobpost?.featureEndDate),
      featured: jobpost?.featured ?? false,
      tags: jobpost.tags ?? [],
    });
  }
}
