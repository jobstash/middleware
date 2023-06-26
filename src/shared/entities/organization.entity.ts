import { OmitType } from "@nestjs/swagger";
import { intConverter, nonZeroOrNull, notStringOrNull } from "../helpers";
import {
  ShortOrg,
  Technology,
  FundingRound,
  OrganizationProperties,
} from "../interfaces";

class RawShortOrg extends OmitType(ShortOrg, ["technologies"] as const) {
  technologies: [object & { properties: Technology }] | null;
  fundingRounds: [object & { properties: FundingRound }] | null;
}
export class ShortOrgEntity {
  constructor(private readonly raw: RawShortOrg) {}

  getProperties(): ShortOrg {
    return {
      ...this.raw,
      logo: this.raw.logo,
      jobCount: intConverter(this.raw.jobCount),
      projectCount: intConverter(this.raw.projectCount),
      headCount: intConverter(this.raw.headCount),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
      technologies: this.raw.technologies?.map(tech => tech.properties),
    };
  }
}

export class OrganizationEntity {
  constructor(private readonly raw: OrganizationProperties) {}

  getProperties(): OrganizationProperties {
    const organization = this.raw;
    return {
      ...this.raw,
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
