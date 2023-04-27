import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { Project } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

@Injectable()
export class ProjectsService {
  logger = new CustomLogger(ProjectsService.name);
  constructor(private readonly neo4jService: Neo4jService) {}

  async getProjectsByOrgId(id: string): Promise<Project[] | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (:Organization {orgId: $id})-[:HAS_PROJECT]->(p:Project)
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjectByOrgId ${err.message}`);
        return undefined;
      });
  }

  async getProjects(): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        RETURN PROPERTIES(p) as res
        `,
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjects ${err.message}`);
        return undefined;
      });
  }

  async getProjectsByCategory(category: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)-[:HAS_CATEGORY]->(:ProjectCategory { name: $category })
        RETURN PROPERTIES(p) as res
        `,
        { category },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", category);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectsByCategory ${err.message}`,
        );
        return undefined;
      });
  }

  async getProjectCompetitors(id: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (c:ProjectCategory)<-[:HAS_CATEGORY]-(:Project {id: $id})
        MATCH (c)<-[:HAS_CATEGORY]-(p:Project)
        WHERE p.id <> $id
        RETURN PROPERTIES(p) as res
        `,
        { id },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProjectsService::getProjectCompetitors ${err.message}`,
        );
        return undefined;
      });
  }

  async searchProjects(query: string): Promise<Project[]> {
    return this.neo4jService
      .read(
        `
        MATCH (p:Project)
        WHERE p.name =~ $query
        RETURN PROPERTIES(p) as res
        `,
        { query: `(?i).*${query}.*` },
      )
      .then(res => res.records.map(record => record.get("res") as Project))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", query);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::searchProjects ${err.message}`);
        return undefined;
      });
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
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "projects.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(`ProjectsService::getProjectById ${err.message}`);
        return undefined;
      });
  }
}
