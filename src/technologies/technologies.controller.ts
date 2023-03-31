import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import { Response, Technology } from "src/shared/types";
import { TechnologiesService } from "./technologies.service";
import { CheckWalletRoles } from "src/shared/types";
@Controller("technologies")
export class TechnologiesController {
  constructor(private readonly technologiesService: TechnologiesService) {}

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all technologies",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Technology) }),
  })
  async getTechnologies(): Promise<Response<Technology[]>> {
    return this.technologiesService.getAll().then(res => ({
      success: true,
      message: "Retrieved all technologies",
      data: res,
    }));
  }
}
