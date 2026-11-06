import { GraphNode, Tag } from "../interfaces";

export class TagEntity {
  private readonly properties: Record<string, unknown>;

  constructor(node: GraphNode | Tag) {
    this.properties =
      "properties" in node
        ? (node.properties as Record<string, unknown>)
        : (node as unknown as Record<string, unknown>);
  }

  getId(): string {
    return this.properties.id as string;
  }

  getNormalizedName(): string {
    return this.properties.normalizedName as string;
  }

  getName(): string {
    return this.properties.name as string;
  }
  getProperties(): Tag {
    return new Tag(this.properties as unknown as Tag);
  }
}
