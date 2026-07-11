import { GraphNode, Repository as RepositoryProperties } from "../interfaces";

export class RepositoryEntity {
  private readonly properties: Record<string, unknown>;

  constructor(raw: GraphNode | RepositoryProperties) {
    this.properties =
      "properties" in raw
        ? (raw.properties as Record<string, unknown>)
        : (raw as unknown as Record<string, unknown>);
  }

  getId(): number {
    return (<Record<string, number>>this.properties).id;
  }

  getNodeId(): string {
    return (<Record<string, string>>this.properties).nodeId;
  }

  getFork(): boolean {
    return (<Record<string, boolean>>this.properties).fork;
  }

  getLanguage(): string {
    return (<Record<string, string>>this.properties).language;
  }

  getCreatedAt(): string {
    return (<Record<string, string>>this.properties).createdAt;
  }

  getUpdatedAt(): string {
    return (<Record<string, string>>this.properties).updatedAt;
  }

  getPushedAt(): string {
    return (<Record<string, string>>this.properties).pushedAt;
  }

  getFullName(): string {
    return (<Record<string, string>>this.properties).fullName;
  }

  getHtmlUrl(): string {
    return (<Record<string, string>>this.properties).htmlUrl;
  }

  getUrl(): string {
    return (<Record<string, string>>this.properties).url;
  }

  getName(): string {
    return (<Record<string, string>>this.properties).name;
  }

  getWeeklyHistogram(): string {
    return (<Record<string, string>>this.properties).weeklyHistogram;
  }

  getDailyHistogram(): string {
    return (<Record<string, string>>this.properties).dailyHistogram;
  }

  getProperties(): RepositoryProperties {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.properties;

    return properties as RepositoryProperties;
  }
}
