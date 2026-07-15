import { BadRequestException, Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { EcosystemsService } from "src/ecosystems/ecosystems.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import {
  WhiteLabelBoardRecord,
  WhiteLabelBoardRepository,
} from "src/postgres/white-label-board.repository";
import {
  nonZeroOrNull,
  notStringOrNull,
  toShortOrgWithSummary,
} from "src/shared/helpers";
import {
  data,
  OrgListResult,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import {
  OrganizationEcosystemWithOrgs,
  WhiteLabelBoard,
  WhiteLabelBoardWithSource,
} from "src/shared/interfaces/org";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateWhiteLabelBoardDto } from "./dto/create-white-label-board.dto";
import { UpdateWhiteLabelBoardDto } from "./dto/update-white-label-board.dto";

type BoardSource = OrgListResult | OrganizationEcosystemWithOrgs;

@Injectable()
export class WhiteLabelBoardsService {
  private readonly logger = new CustomLogger(WhiteLabelBoardsService.name);

  constructor(
    private readonly boards: WhiteLabelBoardRepository,
    private readonly ecosystemsService: EcosystemsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async create(
    orgId: string,
    dto: CreateWhiteLabelBoardDto,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoard>> {
    try {
      const source = await this.resolveSource(orgId, dto);
      if (!source) {
        throw new BadRequestException({
          success: false,
          message: "Source not found",
        });
      }
      const result = await this.boards.create(orgId, dto);
      if (result.status === "conflict") {
        throw new BadRequestException({
          success: false,
          message: "This white label board route is already taken",
        });
      }
      if (result.status === "not_found") {
        throw new BadRequestException({
          success: false,
          message: "Failed to create white label board for org",
        });
      }
      return {
        success: true,
        message: "Created white label board successfully",
        data: this.toBoardWithSource(result.record, source),
      };
    } catch (error) {
      this.capture("create", error, dto);
      if (error instanceof BadRequestException) throw error;
      return {
        success: false,
        message:
          "Failed to create white label board for org for unexpected reason",
      };
    }
  }

  async findAll(
    orgId: string,
    isEcosystemManager: boolean,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource[]>> {
    try {
      const records = await this.boards.find({
        organizationId: orgId,
        organizationSourcesOnly: !isEcosystemManager,
      });
      return {
        success: true,
        message: "Retrieved all white label boards successfully",
        data: await Promise.all(
          records.map(record => this.enrichRecord(record)),
        ),
      };
    } catch (error) {
      this.capture("findAll", error, orgId);
      return {
        success: false,
        message: "Failed to retrieve white label boards",
      };
    }
  }

  async findOrgIdByWhiteLabelBoard(
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const [record] = await this.boards.find({ routeOrDomain });
      return record
        ? {
            success: true,
            message: "Retrieved white label board owner orgId successfully",
            data: record.ownerOrganizationId,
          }
        : {
            success: false,
            message: "Failed to retrieve white label board owner orgId",
          };
    } catch (error) {
      this.capture("findOrgIdByWhiteLabelBoard", error, routeOrDomain);
      return {
        success: false,
        message: "Failed to retrieve white label board owner orgId",
      };
    }
  }

  async findOne(
    orgId: string,
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const [record] = await this.boards.find({
        organizationId: orgId,
        routeOrDomain,
      });
      return record
        ? {
            success: true,
            message: "Retrieved white label board successfully",
            data: await this.enrichRecord(record),
          }
        : { success: false, message: "White label board not found" };
    } catch (error) {
      this.capture("findOne", error, routeOrDomain);
      return {
        success: false,
        message: "Failed to retrieve white label board",
      };
    }
  }

  async findOnePublic(
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const [record] = await this.boards.find({
        routeOrDomain,
        publicOnly: true,
      });
      return record
        ? {
            success: true,
            message: "Retrieved public board successfully",
            data: await this.enrichRecord(record),
          }
        : { success: false, message: "Public board not found" };
    } catch (error) {
      this.capture("findOnePublic", error, routeOrDomain);
      return { success: false, message: "Failed to retrieve public board" };
    }
  }

  async update(
    orgId: string,
    routeOrDomain: string,
    dto: UpdateWhiteLabelBoardDto,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const source = await this.resolveSource(orgId, dto);
      if (!source) {
        throw new BadRequestException({
          success: false,
          message: "Source not found",
        });
      }
      const result = await this.boards.update(orgId, routeOrDomain, dto);
      if (result.status === "conflict") {
        throw new BadRequestException({
          success: false,
          message: "This route is already taken",
        });
      }
      if (result.status === "not_found") {
        return {
          success: false,
          message: "White label board not found or source not found",
        };
      }
      return {
        success: true,
        message: "Updated white label board successfully",
        data: this.toBoardWithSource(result.record, source),
      };
    } catch (error) {
      this.capture("update", error, dto);
      return {
        success: false,
        message:
          error instanceof BadRequestException
            ? error.message
            : "Failed to update white label board",
      };
    }
  }

  async remove(
    orgId: string,
    routeOrDomain: string,
  ): Promise<ResponseWithNoData> {
    try {
      const deleted = await this.boards.delete(orgId, routeOrDomain);
      return deleted
        ? {
            success: true,
            message: "Deleted white label board successfully",
          }
        : { success: false, message: "White label board not found" };
    } catch (error) {
      this.capture("remove", error, routeOrDomain);
      return {
        success: false,
        message: "Failed to delete white label board",
      };
    }
  }

  private async resolveSource(
    orgId: string,
    dto: CreateWhiteLabelBoardDto,
  ): Promise<BoardSource | null> {
    if (dto.sourceType === "organization") {
      return (
        (await this.organizationsService.getOrgDetailsBySlug(
          dto.sourceSlug,
          undefined,
        )) ?? null
      );
    }
    return data(await this.ecosystemsService.findOne(orgId, dto.sourceSlug));
  }

  private async enrichRecord(
    record: WhiteLabelBoardRecord,
  ): Promise<WhiteLabelBoardWithSource> {
    const source = await this.resolveSource(record.ownerOrganizationId, {
      name: record.properties.name,
      route: record.properties.route,
      domain: record.properties.domain,
      visibility: record.properties.visibility as "public" | "private",
      sourceType: record.sourceType,
      sourceSlug: record.sourceId,
    });
    if (!source) {
      throw new BadRequestException({
        success: false,
        message: `Source ${record.sourceId} not found`,
      });
    }
    return this.toBoardWithSource(record, source);
  }

  private toBoardWithSource(
    record: WhiteLabelBoardRecord,
    source: BoardSource,
  ): WhiteLabelBoardWithSource {
    return new WhiteLabelBoardWithSource({
      ...record.properties,
      domain: notStringOrNull(record.properties.domain),
      createdTimestamp: nonZeroOrNull(record.properties.createdTimestamp) ?? 0,
      updatedTimestamp: nonZeroOrNull(record.properties.updatedTimestamp) ?? 0,
      sourceType: record.sourceType,
      org:
        record.sourceType === "organization"
          ? toShortOrgWithSummary(source as OrgListResult)
          : null,
      ecosystem:
        record.sourceType === "ecosystem"
          ? (source as OrganizationEcosystemWithOrgs)
          : null,
    });
  }

  private capture(action: string, error: unknown, input?: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({
        action: "db-call",
        source: "white-label-boards.service",
      });
      if (input !== undefined) scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`WhiteLabelBoardsService::${action} ${message}`);
  }
}
