import { Node } from "neo4j-driver";
import { PreferredTag } from "../interfaces";

export class PreferredTagEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getNormalizedName(): string {
    return (<Record<string, string>>this.node.properties).normalizedName;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getProperties(): PreferredTag {
    return {
      ...this.node.properties,
    } as PreferredTag;
  }
}
