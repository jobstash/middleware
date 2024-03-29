import { Node } from "neo4j-driver";
import { Tag } from "../interfaces";

export class TagEntity {
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
  getProperties(): Tag {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as Tag;
  }
}
