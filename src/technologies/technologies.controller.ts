import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  PairedTerm,
  PreferredTerm,
  Response,
  ResponseWithNoData,
  Technology,
} from "src/shared/types";
import { TechnologiesService } from "./technologies.service";
import { CheckWalletRoles } from "src/shared/types";
import { BlockedTermsInput } from "./dto/set-blocked-term.input";
import { BackendService } from "src/backend/backend.service";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import { CreatePreferredTermInput } from "./dto/create-preferred-term.input";
import { DeletePreferredTermInput } from "./dto/delete-preferred-term.input";
import { CreatePairedTermsInput } from "./dto/create-paired-terms.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
@Controller("technologies")
@ApiExtraModels(TechnologyPreferredTerm, PreferredTerm)
export class TechnologiesController {
  private readonly logger = new CustomLogger(TechnologiesController.name);
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
  async getTechnologies(): Promise<
    Response<Technology[]> | ResponseWithNoData
  > {
    this.logger.log(`/technologies`);
    return this.technologiesService
      .getAll()
      .then(res => ({
        success: true,
        message: "Retrieved all technologies",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/technologies ${err.message}`);
        return {
          success: false,
          message: `Error retrieving technologies!`,
        };
      });
  }

  @Get("/blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all blocked terms",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Technology) }),
  })
  async getBlockedTerms(): Promise<
    Response<Technology[]> | ResponseWithNoData
  > {
    this.logger.log(`/technologies/blocked-terms`);
    return this.technologiesService
      .getBlockedTerms()
      .then(res => ({
        success: true,
        message: "Retrieved all blocked terms",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/technologies/blocked-terms ${err.message}`);
        return {
          success: false,
          message: `Error retrieving blocked technology terms!`,
        };
      });
  }

  @Post("/set-blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Flag a technology as a blocked term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async setBlockedTerms(
    @Body() input: BlockedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    this.logger.log(`/technologies/set-blocked-term ${JSON.stringify(input)}`);
    return this.backendService.setBlockedTerms(input);
  }

  @Post("/unset-blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Unflag a technology as a blocked term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async unsetBlockedTerms(
    @Body() input: BlockedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/unset-blocked-term ${JSON.stringify(input)}`,
    );
    return this.backendService.unsetBlockedTerms(input);
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
  async getPreferredTerms(): Promise<
    Response<TechnologyPreferredTerm[]> | ResponseWithNoData
  > {
    this.logger.log(`/technologies/preferred-terms`);
    return this.technologiesService
      .getPreferredTerms()
      .then(res => ({
        success: true,
        message: "Retrieved all preferred terms",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/technologies/preferred-terms ${err.message}`);
        return {
          success: false,
          message: `Error retrieving preferred technology terms!`,
        };
      });
  }

  @Get("paired-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Retrieve a list of paired terms and their pairings",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(PairedTerm),
    }),
  })
  async getPairedTerms(): Promise<Response<PairedTerm[]> | ResponseWithNoData> {
    this.logger.log(`/technologies/paired-terms`);
    return this.technologiesService
      .getPairedTerms()
      .then(res => ({
        success: true,
        message: "Retrieved all paired terms",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/technologies/paired-terms ${err.message}`);
        return {
          success: false,
          message: `Error retrieving paired technology terms!`,
        };
      });
  }

  @Post("/create-paired-terms")
  // @UseGuards(RBACGuard)
  // @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Create a new preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async createPairedTerms(
    @Body() input: CreatePairedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/create-paired-terms ${JSON.stringify(input)}`,
    );
    return this.backendService.createPairedTerms(input);
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
    this.logger.log(
      `/technologies/create-preferred-term ${JSON.stringify(input)}`,
    );
    return this.backendService.createPreferredTerm(input);
  }

  @Post("/delete-preferred-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Delete a preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async deletePreferredTerm(
    @Body() input: DeletePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/delete-preferred-term ${JSON.stringify(input)}`,
    );
    return this.backendService.deletePreferredTerm(input);
  }
}
