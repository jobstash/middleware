import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  PreferredTerm,
  Response,
  ResponseWithNoData,
  Technology,
} from "src/shared/types";
import { TechnologiesService } from "./technologies.service";
import { CheckWalletRoles } from "src/shared/types";
import { SetBlockedTermInput } from "./dto/set-blocked-term.input";
import { BackendService } from "src/backend/backend.service";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import { CreatePreferredTermInput } from "./dto/create-preferred-term.input";
import { DeletePreferredTermInput } from "./dto/delete-preferred-term.input";
@Controller("technologies")
@ApiExtraModels(TechnologyPreferredTerm, PreferredTerm)
export class TechnologiesController {
  constructor(
    private readonly technologiesService: TechnologiesService,
    private readonly backendService: BackendService,
  ) {}

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

  @Get("/blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all blocked terms",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Technology) }),
  })
  async getBlockedTerms(): Promise<Response<Technology[]>> {
    return this.technologiesService.getBlockedTerms().then(res => ({
      success: true,
      message: "Retrieved all blocked terms",
      data: res,
    }));
  }

  @Post("/set-blocked-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Flag a technology as a blocked term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async setBlockedTerm(
    @Body() input: SetBlockedTermInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    return this.backendService.setBlockedTerm(input);
  }

  @Get("preferred-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Retrieve a list of preferred terms and their synonym chains",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(TechnologyPreferredTerm),
    }),
  })
  async getPreferredTerms(): Promise<Response<TechnologyPreferredTerm[]>> {
    return this.technologiesService.getPreferredTerms().then(res => ({
      success: true,
      message: "Retrieved all preferred terms",
      data: res,
    }));
  }

  @Post("/create-preferred-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Create a new preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async createPreferredTerm(
    @Body() input: CreatePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    return this.backendService.createPreferredTerm(input);
  }

  @Post("/delete-preferred-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Create a new preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async deletePreferredTerm(
    @Body() input: DeletePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    return this.backendService.deletePreferredTerm(input);
  }
}
