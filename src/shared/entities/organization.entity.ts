import { OmitType } from "@nestjs/swagger";
import { intConverter } from "../helpers";
import { ShortOrg, Technology } from "../interfaces";
import { OldFundingRound } from "../interfaces/funding-round.interface";

class RawShortOrg extends OmitType(ShortOrg, [
  "technologies",
  "fundingRounds",
] as const) {
  technologies: [object & { properties: Technology }] | null;
  fundingRounds: [object & { properties: OldFundingRound }] | null;
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
      fundingRounds: this.raw.fundingRounds?.map(round => round.properties),
      technologies: this.raw.technologies?.map(tech => tech.properties),
    };
  }
}
