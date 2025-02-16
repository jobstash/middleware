import { Node } from "neo4j-driver";
import { intConverter, nonZeroOrNull, notStringOrNull } from "../helpers";
import { ShortOrg, Organization, ShortOrgWithSummary } from "../interfaces";

export class ShortOrgEntity {
  constructor(private readonly raw: ShortOrg) {}

  getProperties(): ShortOrg {
    return {
      ...this.raw,
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
      ...this.raw,
      summary: notStringOrNull(this.raw.summary),
      logoUrl: notStringOrNull(this.raw.logoUrl),
      projectCount: intConverter(this.raw.projectCount),
      headcountEstimate: intConverter(this.raw.headcountEstimate),
      lastFundingAmount: intConverter(this.raw.lastFundingAmount),
      lastFundingDate: intConverter(this.raw.lastFundingDate),
    };
  }
}

export class OrganizationEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getOrgId(): string {
    return (<Record<string, string>>this.node.properties).orgId;
  }

  getLogoUrl(): string {
    return (<Record<string, string>>this.node.properties).logoUrl;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getAltName(): string {
    return (<Record<string, string>>this.node.properties).altName;
  }

  getLocation(): string {
    return (<Record<string, string>>this.node.properties).location;
  }

  getSummary(): string {
    return (<Record<string, string>>this.node.properties).summary;
  }

  getDescription(): string {
    return (<Record<string, string>>this.node.properties).description;
  }

  getUrl(): string {
    return (<Record<string, string>>this.node.properties).url;
  }

  getGithubOrganization(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubOrganization;
  }

  getHeadCount(): string | undefined {
    return (<Record<string, string>>this.node.properties).headcountEstimate;
  }

  getTwitter(): string | undefined {
    return (<Record<string, string>>this.node.properties).twitter;
  }

  getDiscord(): string | undefined {
    return (<Record<string, string>>this.node.properties).discord;
  }

  getDocs(): string | undefined {
    return (<Record<string, string>>this.node.properties).docs;
  }

  getTelegram(): string | undefined {
    return (<Record<string, string>>this.node.properties).telegram;
  }

  getCreatedTimestamp(): number {
    return (<Record<string, number>>this.node.properties).createdTimestamp;
  }

  getUpdatedTimestamp(): number | undefined {
    return (<Record<string, number>>this.node.properties).updatedTimestamp;
  }

  getProperties(): Organization {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = <Record<string, any>>this.node.properties;
    return {
      ...properties,
      logoUrl: notStringOrNull(properties?.logoUrl),
      headcountEstimate: nonZeroOrNull(properties?.headcountEstimate),
      createdTimestamp: nonZeroOrNull(properties?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(properties?.updatedTimestamp),
    } as Organization;
  }
}
