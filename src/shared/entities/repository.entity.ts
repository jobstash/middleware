import { Node } from "neo4j-driver";
import { Repository as RepositoryProperties } from "src/shared/types";

export class Repository {
  constructor(private readonly node: Node) {}

  getId(): number {
    return (<Record<string, number>>this.node.properties).id;
  }

  getNodeId(): string {
    return (<Record<string, string>>this.node.properties).nodeId;
  }

  getFork(): boolean {
    return (<Record<string, boolean>>this.node.properties).fork;
  }

  getLanguage(): string {
    return (<Record<string, string>>this.node.properties).language;
  }

  getCreatedAt(): string {
    return (<Record<string, string>>this.node.properties).createdAt;
  }

  getUpdatedAt(): string {
    return (<Record<string, string>>this.node.properties).updatedAt;
  }

  getPushedAt(): string {
    return (<Record<string, string>>this.node.properties).pushedAt;
  }

  getFullName(): string {
    return (<Record<string, string>>this.node.properties).fullName;
  }

  getHtmlUrl(): string {
    return (<Record<string, string>>this.node.properties).htmlUrl;
  }

  getUrl(): string {
    return (<Record<string, string>>this.node.properties).url;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getWeeklyHistogram(): string {
    return (<Record<string, string>>this.node.properties).weeklyHistogram;
  }

  getDailyHistogram(): string {
    return (<Record<string, string>>this.node.properties).dailyHistogram;
  }

  getProperties(): RepositoryProperties {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as RepositoryProperties;
  }
}
