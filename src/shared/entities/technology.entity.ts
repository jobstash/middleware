import { Node } from "neo4j-driver";
import { Technology } from "../interfaces";

export class TechnologyEntity {
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
  getProperties(): Technology {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as Technology;
  }
}
