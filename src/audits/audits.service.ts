import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { GraphRepository } from "src/postgres/graph.repository";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import { AuditEntity } from "src/shared/entities";
import { Audit, Response, ResponseWithNoData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateAuditDto } from "./dto/create-audit.dto";
import { UpdateAuditDto } from "./dto/update-audit.dto";

@Injectable()
export class AuditsService {
  private readonly logger = new CustomLogger(AuditsService.name);

  constructor(
    private readonly graph: GraphRepository,
    private readonly searchDocuments: SearchDocumentRepository,
  ) {}

  async create(
    wallet: string,
    dto: CreateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
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
        const audit = await this.graph.createNode(
          "Audit",
          properties,
          `runtime:${id}`,
          manager,
        );
        await this.graph.upsertRelationship({
          sourceNodeId: project.nodeId,
          targetNodeId: audit.nodeId,
          type: "HAS_AUDIT",
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
        data: new AuditEntity(created.properties).getProperties(),
        message: "Audit created successfully",
      };
    } catch (error) {
      this.capture("create", error, { wallet, ...dto });
      return { success: false, message: "Error creating audit" };
    }
  }

  async findAll(): Promise<Response<Audit[]> | ResponseWithNoData> {
    try {
      const audits =
        await this.graph.findNodes<Record<string, unknown>>("Audit");
      return {
        success: true,
        message: "Retrieved all audits successfully",
        data: audits.map(audit =>
          new AuditEntity(audit.properties as unknown as Audit).getProperties(),
        ),
      };
    } catch (error) {
      this.capture("findAll", error);
      return { success: false, message: "Error fetching audits" };
    }
  }

  async findOne(id: string): Promise<Response<Audit> | ResponseWithNoData> {
    try {
      const audit = await this.graph.findNode<Record<string, unknown>>(
        "Audit",
        { id },
      );
      return audit
        ? {
            success: true,
            message: "Retrieved audit successfully",
            data: new AuditEntity(
              audit.properties as unknown as Audit,
            ).getProperties(),
          }
        : { success: false, message: "Audit not found" };
    } catch (error) {
      this.capture("findOne", error, id);
      return { success: false, message: "Error fetching audit" };
    }
  }

  async update(
    id: string,
    props: UpdateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    try {
      const projects = await this.relatedProjects(id);
      const [audit] = await this.graph.updateNodes<Record<string, unknown>>(
        "Audit",
        { id },
        props as unknown as Record<string, unknown>,
      );
      if (!audit) return { success: false, message: "Audit not found" };
      await this.searchDocuments.refreshProjectDocuments(
        projects.map(project => project.nodeId),
      );
      return {
        success: true,
        message: "Updated audit successfully",
        data: new AuditEntity(
          audit.properties as unknown as Audit,
        ).getProperties(),
      };
    } catch (error) {
      this.capture("update", error, { id, ...props });
      return { success: false, message: "Error updating audit" };
    }
  }

  async remove(id: string): Promise<ResponseWithNoData> {
    try {
      const projects = await this.relatedProjects(id);
      const deleted = await this.graph.deleteNodes("Audit", { id });
      if (!deleted) return { success: false, message: "Audit not found" };
      await this.searchDocuments.refreshProjectDocuments(
        projects.map(project => project.nodeId),
      );
      return { success: true, message: "Deleted audit successfully" };
    } catch (error) {
      this.capture("delete", error, id);
      return { success: false, message: "Error deleting audit" };
    }
  }

  private relatedProjects(id: string) {
    return this.graph.findRelatedNodes<Record<string, unknown>>({
      sourceLabel: "Audit",
      sourceWhere: { id },
      relationshipType: "HAS_AUDIT",
      targetLabel: "Project",
      direction: "incoming",
    });
  }

  private capture(action: string, error: unknown, input?: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "audits.service" });
      if (input !== undefined) scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`AuditsService::${action} ${message}`);
  }
}
