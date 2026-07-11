import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { GraphRepository } from "src/postgres/graph.repository";
import { ProjectCategoryEntity } from "src/shared/entities";
import { CreateProjectCategoryDto } from "./dto/create-project-category.dto";
import { UpdateProjectCategoryDto } from "./dto/update-project-category.dto";

@Injectable()
export class ProjectCategoryService {
  constructor(private readonly graph: GraphRepository) {}

  async find(name: string): Promise<ProjectCategoryEntity | undefined> {
    const category = await this.graph.findNode<Record<string, unknown>>(
      "ProjectCategory",
      { name },
    );
    return category
      ? new ProjectCategoryEntity(category.properties)
      : undefined;
  }

  async create(
    projectCategory: CreateProjectCategoryDto,
  ): Promise<ProjectCategoryEntity> {
    const id = randomUUID();
    const category = await this.graph.createNode(
      "ProjectCategory",
      { id, ...projectCategory },
      id,
    );
    return new ProjectCategoryEntity(category.properties);
  }

  async update(
    id: string,
    properties: UpdateProjectCategoryDto,
  ): Promise<ProjectCategoryEntity> {
    const [category] = await this.graph.updateNodes<{
      id: string;
      name?: string;
    }>("ProjectCategory", { id }, properties);
    if (!category) throw new Error(`Project category ${id} not found`);
    return new ProjectCategoryEntity(category.properties);
  }
}
