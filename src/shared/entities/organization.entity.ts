import { OmitType } from "@nestjs/swagger";
import { intConverter } from "../helpers";
import { ShortOrg, Technology } from "../interfaces";

class RawShortOrg extends OmitType(ShortOrg, ["technologies"] as const) {
  technologies: [object & { properties: Technology }] | null;
}
export class ShortOrgEntity {
  constructor(private readonly raw: RawShortOrg) {}

  getProperties(): ShortOrg {
    return {
      ...this.raw,
      logo: null,
      jobCount: intConverter(this.raw.jobCount),
      projectCount: intConverter(this.raw.projectCount),
      headCount: intConverter(this.raw.headCount),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
      technologies: this.raw.technologies.map(tech => tech.properties),
    };
  }
}
