import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { GraphRepository } from "src/postgres/graph.repository";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import { HackEntity } from "src/shared/entities";
import { Hack, Response, ResponseWithNoData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateHackDto } from "./dto/create-hack.dto";
import { UpdateHackDto } from "./dto/update-hack.dto";

@Injectable()
export class HacksService {
  private readonly logger = new CustomLogger(HacksService.name);

  constructor(
    private readonly graph: GraphRepository,
    private readonly searchDocuments: SearchDocumentRepository,
  ) {}

  async create(
    wallet: string,
    dto: CreateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    const { projectId, ...input } = dto;
    try {
      const created = await this.graph.transaction(async manager => {
        const project = await this.graph.findNode<Record<string, unknown>>(
          "Project",
          { id: projectId },
          manager,
        );
        if (!project) throw new Error(`Project ${projectId} was not found`);
        const id = randomUUID();
        const properties = { id, ...input };
        const hack = await this.graph.createNode(
          "Hack",
          properties,
          `runtime:${id}`,
          manager,
        );
        await this.graph.upsertRelationship({
          sourceNodeId: project.nodeId,
          targetNodeId: hack.nodeId,
          type: "HAS_HACK",
          properties: { creator: wallet },
          executor: manager,
        });
        return { properties, projectNodeId: project.nodeId };
      });
      await this.searchDocuments.refreshProjectDocuments([
        created.projectNodeId,
      ]);
      return {
        success: true,
        data: new HackEntity(created.properties).getProperties(),
        message: "Hack created successfully",
      };
    } catch (error) {
      this.capture("create", error, { wallet, ...dto });
      return { success: false, message: "Error creating hack" };
    }
  }

  async findAll(): Promise<Response<Hack[]> | ResponseWithNoData> {
    try {
      const hacks = await this.graph.findNodes<Record<string, unknown>>("Hack");
      return {
        success: true,
        message: "Retrieved all hacks successfully",
        data: hacks.map(hack =>
          new HackEntity(hack.properties as unknown as Hack).getProperties(),
        ),
      };
    } catch (error) {
      this.capture("findAll", error);
      return { success: false, message: "Error fetching hacks" };
    }
  }

  async findOne(id: string): Promise<Response<Hack> | ResponseWithNoData> {
    try {
      const hack = await this.graph.findNode<Record<string, unknown>>("Hack", {
        id,
      });
      return hack
        ? {
            success: true,
            message: "Retrieved hack successfully",
            data: new HackEntity(
              hack.properties as unknown as Hack,
            ).getProperties(),
          }
        : { success: false, message: "Hack not found" };
    } catch (error) {
      this.capture("findOne", error, id);
      return { success: false, message: "Error fetching hack" };
    }
  }

  async update(
    id: string,
    props: UpdateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    try {
      const projects = await this.relatedProjects(id);
      const [hack] = await this.graph.updateNodes<Record<string, unknown>>(
        "Hack",
        { id },
        props as unknown as Record<string, unknown>,
      );
      if (!hack) return { success: false, message: "Hack not found" };
      await this.searchDocuments.refreshProjectDocuments(
        projects.map(project => project.nodeId),
      );
      return {
        success: true,
        message: "Updated hack successfully",
        data: new HackEntity(
          hack.properties as unknown as Hack,
        ).getProperties(),
      };
    } catch (error) {
      this.capture("update", error, { id, ...props });
      return { success: false, message: "Error updating hack" };
    }
  }

  async remove(id: string): Promise<ResponseWithNoData> {
    try {
      const projects = await this.relatedProjects(id);
      const deleted = await this.graph.deleteNodes("Hack", { id });
      if (!deleted) return { success: false, message: "Hack not found" };
      await this.searchDocuments.refreshProjectDocuments(
        projects.map(project => project.nodeId),
      );
      return { success: true, message: "Deleted hack successfully" };
    } catch (error) {
      this.capture("delete", error, id);
      return { success: false, message: "Error deleting hack" };
    }
  }

  private relatedProjects(id: string) {
    return this.graph.findRelatedNodes<Record<string, unknown>>({
      sourceLabel: "Hack",
      sourceWhere: { id },
      relationshipType: "HAS_HACK",
      targetLabel: "Project",
      direction: "incoming",
    });
  }

  private capture(action: string, error: unknown, input?: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "hacks.service" });
      if (input !== undefined) scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`HacksService::${action} ${message}`);
  }
}
