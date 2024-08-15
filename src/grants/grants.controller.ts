import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
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
  PaginatedData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";

@Controller("grants")
export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get("")
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
  async findAll(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ): Promise<PaginatedData<GrantListResult>> {
    return this.grantsService.getGrantsList(page, limit);
  }

  @Get(":id")
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
  ): Promise<ResponseWithOptionalData<GrantListResult>> {
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

  @Get(":id/grantees")
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
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ): Promise<PaginatedData<Grantee>> {
    return this.grantsService.getGranteesByProgramId(id, page, limit);
  }

  @Get(":id/grantees/:granteeId")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the details of the grantee with the passed id",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findGranteesDetails(
    @Param("id") id: string,
    @Param("granteeId") granteeId: string,
  ): Promise<ResponseWithOptionalData<Grantee>> {
    return this.grantsService.getGranteeDetailsByProgramId(id, granteeId);
  }

  @Get(":id/grantees/:granteeId/project/:projectId")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the details of the grantee with the passed id",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findGranteeProjectDetails(
    @Param("id") id: string,
    @Param("granteeId") granteeId: string,
    @Param("projectId") projectId: string,
  ): Promise<ResponseWithOptionalData<Grantee>> {
    return this.grantsService.getGranteeProjectDetailsByProgramId(
      id,
      granteeId,
      projectId,
    );
  }
}
