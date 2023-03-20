import { Controller, Get, UseGuards } from "@nestjs/common";
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
  async getTechnologies(): Promise<Technology[]> {
    return this.technologiesService.getAll();
  }
}
