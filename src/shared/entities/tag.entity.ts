import { GraphNode, Tag } from "../interfaces";
import { nonZeroOrNull } from "../helpers";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = this.properties;

    return {
      id: properties.id as string,
      name: properties.name as string,
      normalizedName: properties.normalizedName as string,
      createdTimestamp: nonZeroOrNull(
        properties.createdTimestamp as number | string,
      ),
    };
  }
}
