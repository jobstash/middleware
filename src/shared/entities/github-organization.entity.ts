import { Node } from "neo4j-driver";
import { GithubOrganizationProperties } from "../interfaces/github-organization-properties.interface";

export class GithubOrganizationEntity {
  constructor(private readonly node: Node) {}

  getId(): number {
    return (<Record<string, number>>this.node.properties).id;
  }

  getLogin(): string {
    return (<Record<string, string>>this.node.properties).login;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getDescription(): string {
    return (<Record<string, string>>this.node.properties).description;
  }

  getAvatarUrl(): string {
    return (<Record<string, string>>this.node.properties).avatarUrl;
  }

  getCompany(): string {
    return (<Record<string, string>>this.node.properties).company;
  }

  getLocation(): string {
    return (<Record<string, string>>this.node.properties).location;
  }

  getEmail(): string {
    return (<Record<string, string>>this.node.properties).email;
  }

  getBlog(): string {
    return (<Record<string, string>>this.node.properties).blog;
  }

  getTwitterUsername(): string {
    return (<Record<string, string>>this.node.properties).twitterUsername;
  }

  getIsVerified(): boolean {
    return (<Record<string, boolean>>this.node.properties).isVerified;
  }

  getCreatedAt(): string {
    return (<Record<string, string>>this.node.properties).createdAt;
  }

  toJson(): GithubOrganizationProperties {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as GithubOrganizationProperties;
  }
}
