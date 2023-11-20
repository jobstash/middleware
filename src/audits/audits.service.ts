import { Injectable } from "@nestjs/common";
import { CreateAuditDto } from "./dto/create-audit.dto";
import { UpdateAuditDto } from "./dto/update-audit.dto";
import { Audit, Response, ResponseWithNoData } from "src/shared/interfaces";
import { ModelService } from "src/model/model.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";

@Injectable()
export class AuditsService {
  private readonly logger = new CustomLogger(AuditsService.name);

  constructor(private models: ModelService) {}
  async create(
    wallet: string,
    dto: CreateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    const { projectId, ...props } = dto;
    try {
      const auditId = randomUUID();
      const auditNode = await this.models.Audits.createOne({
        id: auditId,
        link: props.link,
        name: props.name,
        defiId: props.defiId,
        date: props.date,
        techIssues: props.techIssues,
      });
      const projectNode = await this.models.Projects.findOne({
        where: {
          id: projectId,
        },
      });

      await projectNode.relateTo({
        alias: "audits",
        where: {
          id: auditId,
        },
        properties: {
          creator: wallet,
        },
        assertCreatedRelationships: 1,
      });
      return {
        success: true,
        data: auditNode.getDataValues(),
        message: "Audit created successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`AuditsService::create ${err.message}`);
      return { success: false, message: "Error creating audit" };
    }
  }

  async findAll(): Promise<Response<Audit[]> | ResponseWithNoData> {
    try {
      const audits = await this.models.Audits.findMany({
        plain: true,
      });
      return {
        success: true,
        message: "Retrieved all audits successfully",
        data: audits.map(audit => new Audit(audit)),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`AuditsService::findAll ${err.message}`);
      return { success: false, message: "Error fetching audits" };
    }
  }

  async findOne(id: string): Promise<Response<Audit> | ResponseWithNoData> {
    try {
      const audit = await this.models.Audits.findOne({
        where: {
          id: id,
        },
        plain: true,
      });
      return {
        success: true,
        message: "Retrieved audit successfully",
        data: new Audit(audit),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`AuditsService::findOne ${err.message}`);
      return { success: false, message: "Error fetching audit" };
    }
  }

  async update(
    id: string,
    props: UpdateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    try {
      const audit = await this.models.Audits.update(
        {
          link: props.link,
          name: props.name,
          defiId: props.defiId,
          date: props.date,
          techIssues: props.techIssues,
        },
        { where: { id }, return: true },
      );
      return {
        success: true,
        message: "Updated audit successfully",
        data: new Audit(audit[0][0]),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", { id, ...props });
        Sentry.captureException(err);
      });
      this.logger.error(`AuditsService::update ${err.message}`);
      return { success: false, message: "Error updating audit" };
    }
  }

  async remove(id: string): Promise<ResponseWithNoData> {
    try {
      await this.models.Audits.delete({
        where: { id },
        detach: true,
      });
      return {
        success: true,
        message: "Deleted audit successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`AuditsService::delete ${err.message}`);
      return { success: false, message: "Error deleting audit" };
    }
  }
}
