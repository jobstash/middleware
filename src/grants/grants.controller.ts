import { Controller, Get, UseGuards } from "@nestjs/common";
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
import { Grant } from "src/shared/interfaces";

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
  async findAll(): Promise<Grant[]> {
    return this.grantsService.getGrantsList();
  }
}
