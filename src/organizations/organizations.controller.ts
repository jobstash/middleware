import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiExtraModels, ApiOkResponse } from "@nestjs/swagger";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { ShortOrg } from "src/shared/types";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@ApiExtraModels(ShortOrg)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({ description: "Returns a list of all organizations" })
  async getOrganizations(): Promise<ShortOrg[]> {
    return this.organizationsService.getAll();
  }

  @Get("/search")
  @UseGuards(RBACGuard)
  @Roles("admin")
  @ApiOkResponse({
    description:
      "Returns a list of all organizations with names matching the query",
  })
  async searchOrganizations(
    @Query("query") query: string,
  ): Promise<ShortOrg[]> {
    return this.organizationsService.searchOrganizations(query);
  }
}
