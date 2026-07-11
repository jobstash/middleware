import { GraphNode } from "../interfaces";
import { ProjectCategory } from "../interfaces/project-category.interface";

export class ProjectCategoryEntity {
  private readonly properties: Record<string, unknown>;

  constructor(node: GraphNode | Record<string, unknown>) {
    this.properties =
      "properties" in node
        ? (node.properties as Record<string, unknown>)
        : node;
  }

  getId(): string {
    return this.properties.id as string;
  }

  getName(): string {
    return this.properties.name as string;
  }

  toJson(): ProjectCategory {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = this.properties;

    return properties as unknown as ProjectCategory;
  }
}
