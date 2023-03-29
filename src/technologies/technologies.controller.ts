import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { Technology } from "src/shared/types";
import { TechnologiesService } from "./technologies.service";

@Controller("technologies")
export class TechnologiesController {
  constructor(private readonly technologiesService: TechnologiesService) {}

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({ description: "Returns a list of all technologies" })
  async getTechnologies(): Promise<Technology[]> {
    return this.technologiesService.getAll();
  }
}
