import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuditsService } from "./audits.service";
import { CreateAuditDto } from "./dto/create-audit.dto";
import { UpdateAuditDto } from "./dto/update-audit.dto";
import { Request, Response as ExpressResponse } from "express";
import { AuthService } from "src/auth/auth.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Audit, Response, ResponseWithNoData } from "src/shared/interfaces";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { CheckWalletRoles } from "src/shared/constants";
import {
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";

@Controller("audits")
export class AuditsController {
  private logger = new CustomLogger(AuditsController.name);
  constructor(
    private readonly auditsService: AuditsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Creates an audit and relates it to a project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Audit),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the audit on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() createAuditDto: CreateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    return this.auditsService.create(address as string, createAuditDto);
  }

  @Get()
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Creates an audit and relates it to a project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Audit),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the audit on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAll(): Promise<Response<Audit[]> | ResponseWithNoData> {
    return this.auditsService.findAll();
  }

  @Get(":id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Fetches an existing audit",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Audit),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the audit on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findOne(
    @Param("id") id: string,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    return this.auditsService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates an existing audit",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Audit),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the audit on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async update(
    @Param("id") id: string,
    @Body() updateAuditDto: UpdateAuditDto,
  ): Promise<Response<Audit> | ResponseWithNoData> {
    return this.auditsService.update(id, updateAuditDto);
  }

  @Delete(":id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Deletes an audit and detaches it from its project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Audit),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong deleting the audit on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async remove(@Param("id") id: string): Promise<ResponseWithNoData> {
    return this.auditsService.remove(id);
  }
}
