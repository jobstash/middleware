import { Node } from "neo4j-driver";
import { ProjectCategory } from "../interfaces/project-category.interface";

export class ProjectCategoryEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  toJson(): ProjectCategory {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as ProjectCategory;
  }
}
