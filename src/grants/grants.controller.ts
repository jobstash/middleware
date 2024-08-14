import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletRoles } from "src/shared/constants";
import { Roles } from "src/shared/decorators";
import {
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  Grant,
  Grantee,
  GrantListResult,
  ResponseWithOptionalData,
} from "src/shared/interfaces";

@Controller("grants")
export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get("list")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns a list of all grants",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Grant),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grants from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAll(): Promise<GrantListResult[]> {
    return this.grantsService.getGrantsList();
  }

  @Get("details/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the details of the grant with the passed id",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findOne(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<Grant>> {
    return this.grantsService.getGrantByProgramId(id).then(res => {
      return res
        ? {
            success: true,
            message: "Grant retrieved successfully",
            data: res,
          }
        : {
            success: false,
            message: "Grant not found",
          };
    });
  }

  @Get("grantees/:id")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the grantees of the grant with the passed id",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findGrantees(
    @Param("id") id: string,
  ): Promise<ResponseWithOptionalData<Grantee[]>> {
    return this.grantsService.getGranteesByProgramId(id).then(res => {
      return res
        ? {
            success: true,
            message: "Grantees retrieved successfully",
            data: res,
          }
        : {
            success: false,
            message: "Grantees not found",
          };
    });
  }
}
