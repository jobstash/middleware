import { intConverter, nonZeroOrNull, notStringOrNull } from "../helpers";
import {
  GraphNode,
  ShortOrg,
  Organization,
  ShortOrgWithSummary,
} from "../interfaces";

export class ShortOrgEntity {
  constructor(private readonly raw: ShortOrg) {}

  getProperties(): ShortOrg {
    return {
      orgId: this.raw.orgId,
      url: this.raw.url,
      name: this.raw.name,
      normalizedName: this.raw.normalizedName,
      location: notStringOrNull(this.raw.location),
      aggregateRating: intConverter(this.raw.aggregateRating),
      reviewCount: intConverter(this.raw.reviewCount),
      ecosystems: this.raw.ecosystems,
      grants:
        this.raw?.grants?.map(grant => ({
          ...grant,
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      logoUrl: notStringOrNull(this.raw.logoUrl),
      projectCount: intConverter(this.raw.projectCount),
      headcountEstimate: intConverter(this.raw.headcountEstimate),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
    };
  }
}

export class ShortOrgWithSummaryEntity {
  constructor(private readonly raw: ShortOrgWithSummary) {}

  getProperties(): ShortOrgWithSummary {
    return {
      orgId: this.raw.orgId,
      url: this.raw.url,
      name: this.raw.name,
      normalizedName: this.raw.normalizedName,
      summary: notStringOrNull(this.raw.summary),
      location: notStringOrNull(this.raw.location),
      aggregateRating: intConverter(this.raw.aggregateRating),
      reviewCount: intConverter(this.raw.reviewCount),
      ecosystems: this.raw.ecosystems,
      grants:
        this.raw?.grants?.map(grant => ({
          ...grant,
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      logoUrl: notStringOrNull(this.raw.logoUrl),
      projectCount: intConverter(this.raw.projectCount),
      headcountEstimate: intConverter(this.raw.headcountEstimate),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
    };
  }
}

export class OrganizationEntity {
  private readonly properties: Record<string, unknown>;

  constructor(raw: GraphNode | Organization) {
    this.properties =
      "properties" in raw
        ? (raw.properties as Record<string, unknown>)
        : (raw as unknown as Record<string, unknown>);
  }

  getId(): string {
    return (<Record<string, string>>this.properties).id;
  }

  getOrgId(): string {
    return (<Record<string, string>>this.properties).orgId;
  }

  getLogoUrl(): string {
    return (<Record<string, string>>this.properties).logoUrl;
  }

  getName(): string {
    return (<Record<string, string>>this.properties).name;
  }

  getAltName(): string {
    return (<Record<string, string>>this.properties).altName;
  }

  getLocation(): string {
    return (<Record<string, string>>this.properties).location;
  }

  getSummary(): string {
    return (<Record<string, string>>this.properties).summary;
  }

  getDescription(): string {
    return (<Record<string, string>>this.properties).description;
  }

  getUrl(): string {
    return (<Record<string, string>>this.properties).url;
  }

  getGithubOrganization(): string | undefined {
    return (<Record<string, string>>this.properties).githubOrganization;
  }

  getHeadCount(): string | undefined {
    return (<Record<string, string>>this.properties).headcountEstimate;
  }

  getTwitter(): string | undefined {
    return (<Record<string, string>>this.properties).twitter;
  }

  getDiscord(): string | undefined {
    return (<Record<string, string>>this.properties).discord;
  }

  getDocs(): string | undefined {
    return (<Record<string, string>>this.properties).docs;
  }

  getTelegram(): string | undefined {
    return (<Record<string, string>>this.properties).telegram;
  }

  getCreatedTimestamp(): number {
    return (<Record<string, number>>this.properties).createdTimestamp;
  }

  getUpdatedTimestamp(): number | undefined {
    return (<Record<string, number>>this.properties).updatedTimestamp;
  }

  getProperties(): Organization {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = <Record<string, any>>this.properties;
    return {
      ...properties,
      logoUrl: notStringOrNull(properties?.logoUrl),
      headcountEstimate: nonZeroOrNull(properties?.headcountEstimate),
      createdTimestamp: nonZeroOrNull(properties?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(properties?.updatedTimestamp),
    } as Organization;
  }
}
