import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { ProjectCategoryEntity } from "src/shared/entities";
import { CreateProjectCategoryDto } from "./dto/create-project-category.dto";
import { UpdateProjectCategoryDto } from "./dto/update-project-category.dto";

@Injectable()
export class ProjectCategoryService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async find(name: string): Promise<ProjectCategoryEntity | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (c:ProjectCategory {name: $name})
            RETURN c
        `,
      { name },
    );
    return res.records.length
      ? new ProjectCategoryEntity(res.records[0].get("c"))
      : undefined;
  }

  async create(
    projectCategory: CreateProjectCategoryDto,
  ): Promise<ProjectCategoryEntity> {
    return this.neogma.queryRunner
      .run(
        `
            CREATE (c:ProjectCategory { id: randomUUID() })
            SET c += $properties
            RETURN c
        `,
        {
          properties: {
            ...projectCategory,
          },
        },
      )
      .then(res => new ProjectCategoryEntity(res.records[0].get("c")));
  }

  async update(
    id: string,
    properties: UpdateProjectCategoryDto,
  ): Promise<ProjectCategoryEntity> {
    return this.neogma.queryRunner
      .run(
        `
            MATCH (c:ProjectCategory { id: $id })
            SET c += $properties
            RETURN c
        `,
        { id, properties },
      )
      .then(res => new ProjectCategoryEntity(res.records[0].get("p")));
  }
}
