import { GraphNode, StructuredJobpost } from "../interfaces";

// This legacy wrapper exposes graph properties without runtime validation.
// Preserve that public unchecked projection contract at this boundary.
export class StructuredJobpostEntity {
  constructor(private readonly node: GraphNode) {}

  getId(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (<Record<string, any>>this.node.properties).id;
  }

  getProperties(): StructuredJobpost {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = <Record<string, any>>this.node.properties;
    return properties as StructuredJobpost;
  }
}
