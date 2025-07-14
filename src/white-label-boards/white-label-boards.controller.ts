import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  Headers,
} from "@nestjs/common";
import { WhiteLabelBoardsService } from "./white-label-boards.service";
import {
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
  data,
} from "src/shared/interfaces";
import { WhiteLabelBoardWithSource } from "src/shared/interfaces/org";
import { CreateWhiteLabelBoardDto } from "./dto/create-white-label-board.dto";
import { UpdateWhiteLabelBoardDto } from "./dto/update-white-label-board.dto";
import { ApiOkResponse, ApiOperation, getSchemaPath } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CACHE_DURATION,
  CheckWalletPermissions,
  PUBLIC_WHITE_LABEL_BOARD_DOMAIN_HEADER,
  PUBLIC_WHITE_LABEL_BOARD_ROUTE_HEADER,
} from "src/shared/constants";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { Permissions, Session } from "src/shared/decorators";
import { notStringOrNull, responseSchemaWrapper } from "src/shared/helpers";

@Controller("white-label-boards")
export class WhiteLabelBoardsController {
  constructor(
    private readonly whiteLabelBoardsService: WhiteLabelBoardsService,
  ) {}

  @Get("public")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiOperation({ summary: "Get a white label board by route or domain" })
  @ApiOkResponse({
    description: "Returns a white label board by route or domain",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(WhiteLabelBoardWithSource),
    }),
  })
  async findOnePublic(
    @Headers(PUBLIC_WHITE_LABEL_BOARD_ROUTE_HEADER) route: string | null = null,
    @Headers(PUBLIC_WHITE_LABEL_BOARD_DOMAIN_HEADER)
    domain: string | null = null,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    if (!notStringOrNull(route) && !notStringOrNull(domain)) {
      throw new BadRequestException({
        success: false,
        message: "Route or domain is required",
      });
    }
    const wlb = await this.whiteLabelBoardsService.findOnePublic(
      route ? route : (domain ?? ""),
    );
    if (!wlb.success && !data(wlb)) {
      throw new NotFoundException({
        success: false,
        message: "Public board not found",
      });
    } else if (!wlb.success) {
      throw new BadRequestException({
        success: false,
        message: "Failed to retrieve public board",
      });
    } else {
      return wlb;
    }
  }

  @Get(":orgId")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
  )
  @ApiOperation({ summary: "Get all white label boards for an organization" })
  @ApiOkResponse({
    description: "Returns all white label boards for an organization",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(WhiteLabelBoardWithSource),
    }),
  })
  async findAll(
    @Param("orgId") orgId: string,
    @Session() { permissions }: SessionObject,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource[]>> {
    if (!notStringOrNull(orgId)) {
      throw new BadRequestException({
        success: false,
        message: "Organization ID is required",
      });
    }
    return this.whiteLabelBoardsService.findAll(
      orgId,
      permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER),
    );
  }

  @Get(":orgId/:routeOrDomain")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
  )
  @ApiOperation({ summary: "Get a white label board by route or domain" })
  @ApiOkResponse({
    description: "Returns a white label board by route or domain",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(WhiteLabelBoardWithSource),
    }),
  })
  async findOne(
    @Param("orgId") orgId: string,
    @Param("routeOrDomain") routeOrDomain: string,
    @Session() { permissions }: SessionObject,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    if (!notStringOrNull(orgId)) {
      throw new BadRequestException({
        success: false,
        message: "Organization ID is required",
      });
    }
    if (!notStringOrNull(routeOrDomain)) {
      throw new BadRequestException({
        success: false,
        message: "Route or domain is required",
      });
    }
    const wlb = await this.whiteLabelBoardsService.findOne(
      orgId,
      routeOrDomain,
    );
    const target = data(wlb);
    if (
      target &&
      target?.sourceType === "ecosystem" &&
      !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)
    ) {
      throw new ForbiddenException({
        success: false,
        message:
          "You are not authorized to get a white label board for an ecosystem",
      });
    }
    if (!wlb.success && !data(wlb)) {
      throw new NotFoundException({
        success: false,
        message: "White label board not found",
      });
    } else if (!wlb.success) {
      throw new BadRequestException({
        success: false,
        message: "Failed to retrieve white label board",
      });
    } else {
      return wlb;
    }
  }

  @Post(":orgId")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
  )
  @ApiOperation({ summary: "Create a white label board" })
  @ApiOkResponse({
    description: "Returns the created white label board",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(WhiteLabelBoardWithSource),
    }),
  })
  async create(
    @Param("orgId") orgId: string,
    @Body() createWhiteLabelBoardDto: CreateWhiteLabelBoardDto,
    @Session() { permissions }: SessionObject,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    if (!notStringOrNull(orgId)) {
      throw new BadRequestException({
        success: false,
        message: "Organization ID is required",
      });
    }
    if (
      createWhiteLabelBoardDto.sourceType === "ecosystem" &&
      !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)
    ) {
      throw new ForbiddenException({
        success: false,
        message:
          "You are not authorized to create a white label board for an ecosystem",
      });
    }
    return this.whiteLabelBoardsService.create(orgId, createWhiteLabelBoardDto);
  }

  @Put(":orgId/:routeOrDomain")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
  )
  @ApiOperation({ summary: "Update a white label board" })
  @ApiOkResponse({
    description: "Returns the updated white label board",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(WhiteLabelBoardWithSource),
    }),
  })
  async update(
    @Param("orgId") orgId: string,
    @Param("routeOrDomain") routeOrDomain: string,
    @Body() updateWhiteLabelBoardDto: UpdateWhiteLabelBoardDto,
    @Session() { permissions }: SessionObject,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    if (!notStringOrNull(orgId)) {
      throw new BadRequestException({
        success: false,
        message: "Organization ID is required",
      });
    }
    if (!notStringOrNull(routeOrDomain)) {
      throw new BadRequestException({
        success: false,
        message: "Route or domain is required",
      });
    }
    const wlb = await this.whiteLabelBoardsService.findOne(
      orgId,
      routeOrDomain,
    );
    const target = data(wlb);
    if (
      (target.sourceType === "ecosystem" ||
        updateWhiteLabelBoardDto.sourceType === "ecosystem") &&
      !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)
    ) {
      throw new ForbiddenException({
        success: false,
        message:
          "You are not authorized to update a white label board for an ecosystem",
      });
    }
    return this.whiteLabelBoardsService.update(
      orgId,
      routeOrDomain,
      updateWhiteLabelBoardDto,
    );
  }

  @Delete(":orgId/:routeOrDomain")
  @UseGuards(PBACGuard)
  @Permissions(
    [CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER],
    [CheckWalletPermissions.USER, CheckWalletPermissions.ECOSYSTEM_MANAGER],
  )
  @ApiOperation({ summary: "Delete a white label board" })
  @ApiOkResponse({
    description: "Returns the a status message",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async delete(
    @Param("orgId") orgId: string,
    @Param("routeOrDomain") routeOrDomain: string,
    @Session() { permissions }: SessionObject,
  ): Promise<ResponseWithNoData> {
    if (!notStringOrNull(orgId)) {
      throw new BadRequestException({
        success: false,
        message: "Organization ID is required",
      });
    }
    if (!notStringOrNull(routeOrDomain)) {
      throw new BadRequestException({
        success: false,
        message: "Route or domain is required",
      });
    }
    const wlb = await this.whiteLabelBoardsService.findOne(
      orgId,
      routeOrDomain,
    );
    if (!wlb.success) {
      throw new NotFoundException({
        success: false,
        message: "White label board not found",
      });
    }
    const target = data(wlb);
    if (
      target.sourceType === "ecosystem" &&
      !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)
    ) {
      throw new ForbiddenException({
        success: false,
        message:
          "You are not authorized to delete a white label board for an ecosystem",
      });
    }
    return this.whiteLabelBoardsService.remove(orgId, routeOrDomain);
  }
}
