import { Injectable } from "@nestjs/common";
import { CreateHackDto } from "./dto/create-hack.dto";
import { UpdateHackDto } from "./dto/update-hack.dto";
import { Hack, Response, ResponseWithNoData } from "src/shared/interfaces";
import { ModelService } from "src/model/model.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";

@Injectable()
export class HacksService {
  private readonly logger = new CustomLogger(HacksService.name);

  constructor(private models: ModelService) {}
  async create(
    wallet: string,
    dto: CreateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    const { projectId, ...props } = dto;
    try {
      const hackId = randomUUID();
      const hackNode = await this.models.Hacks.createOne({
        id: hackId,
        defiId: props.defiId,
        category: props.category,
        description: props.description,
        issueType: props.issueType,
        date: props.date,
        fundsLost: props.fundsLost,
        fundsReturned: props.fundsReturned,
      });
      const projectNode = await this.models.Projects.findOne({
        where: {
          id: projectId,
        },
      });

      await projectNode.relateTo({
        alias: "hacks",
        where: {
          id: hackId,
        },
        properties: {
          creator: wallet,
        },
        assertCreatedRelationships: 1,
      });
      return {
        success: true,
        data: hackNode.getDataValues(),
        message: "Hack created successfully",
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
      this.logger.error(`HacksService::create ${err.message}`);
      return { success: false, message: "Error creating hack" };
    }
  }

  async findAll(): Promise<Response<Hack[]> | ResponseWithNoData> {
    try {
      const hacks = await this.models.Hacks.findMany({
        plain: true,
      });
      return {
        success: true,
        message: "Retrieved all hacks successfully",
        data: hacks.map(hack => new Hack(hack)),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`HacksService::findAll ${err.message}`);
      return { success: false, message: "Error fetching hacks" };
    }
  }

  async findOne(id: string): Promise<Response<Hack> | ResponseWithNoData> {
    try {
      const hack = await this.models.Hacks.findOne({
        where: {
          id: id,
        },
        plain: true,
      });
      return {
        success: true,
        message: "Retrieved hack successfully",
        data: new Hack(hack),
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
      this.logger.error(`HacksService::findOne ${err.message}`);
      return { success: false, message: "Error fetching hack" };
    }
  }

  async update(
    id: string,
    props: UpdateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    try {
      const hack = await this.models.Hacks.update(
        {
          defiId: props.defiId,
          category: props.category,
          description: props.description,
          issueType: props.issueType,
          date: props.date,
          fundsLost: props.fundsLost,
          fundsReturned: props.fundsReturned,
        },
        { where: { id }, return: true },
      );
      return {
        success: true,
        message: "Updated hack successfully",
        data: new Hack(hack[0][0]),
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
      this.logger.error(`HacksService::update ${err.message}`);
      return { success: false, message: "Error updating hack" };
    }
  }

  async remove(id: string): Promise<ResponseWithNoData> {
    try {
      await this.models.Hacks.delete({
        where: { id },
        detach: true,
      });
      return {
        success: true,
        message: "Deleted hack successfully",
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
      this.logger.error(`HacksService::delete ${err.message}`);
      return { success: false, message: "Error deleting hack" };
    }
  }
}
