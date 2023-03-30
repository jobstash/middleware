import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { Project } from "src/shared/types";

@Injectable()
export class ProjectsService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async getProjectsByOrgId(id: string): Promise<Project[] | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        WHERE o.orgId = $id
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res => res.records.map(record => record.get("res") as Project));
  }

  async searchProjects(query: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        WHERE p.name CONTAINS $query
        RETURN PROPERTIES(p) as res
        `,
        { query },
      )
      .then(res => res.records.map(record => record.get("res") as Project));
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        WHERE p.id = $id
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res =>
        res.records[0] ? (res.records[0].get("res") as Project) : undefined,
      );
  }
}
