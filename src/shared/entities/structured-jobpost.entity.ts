import { Node } from "neo4j-driver";
import { StructuredJobpost } from "src/shared/types";

export class StructuredJobpostEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).id;
  }

  getProperties(): StructuredJobpost {
    // eslint-disable-next-line
    const properties = <Record<string, any>>this.node.properties;

    return properties as StructuredJobpost;
  }
}
