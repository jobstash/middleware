import { GraphNode, StructuredJobpost } from "../interfaces";

export class StructuredJobpostEntity {
  constructor(private readonly node: GraphNode) {}

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
