import { Node } from "neo4j-driver";
import { TechnologyBlockedTerm } from "../interfaces";

export class TechnologyBlockedTermEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getStatus(): boolean {
    return (<Record<string, boolean>>this.node.properties).status;
  }

  getProperties(): TechnologyBlockedTerm {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as TechnologyBlockedTerm;
  }
}
