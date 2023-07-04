import { intConverter, nonZeroOrNull, notStringOrNull } from "../helpers";
import { ShortOrg, OrganizationProperties } from "../interfaces";

export class ShortOrgEntity {
  constructor(private readonly raw: ShortOrg) {}

  getProperties(): ShortOrg {
    return {
      ...this.raw,
      logo: notStringOrNull(this.raw.logo),
      jobCount: intConverter(this.raw.jobCount),
      projectCount: intConverter(this.raw.projectCount),
      headCount: intConverter(this.raw.headCount),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
    };
  }
}

export class OrganizationEntity {
  constructor(private readonly raw: OrganizationProperties) {}

  getProperties(): OrganizationProperties {
    const organization = this.raw;
    return {
      ...this.raw,
      logo: notStringOrNull(organization?.logo),
      docs: notStringOrNull(organization?.docs),
      altName: notStringOrNull(organization?.altName),
      headCount: nonZeroOrNull(organization?.headCount),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
    };
  }
}
