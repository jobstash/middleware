import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
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
import { CreateBlockedTermsInput } from "./dto/create-blocked-term.input";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import { CreatePreferredTermInput } from "./dto/create-preferred-term.input";
import { DeletePreferredTermInput } from "./dto/delete-preferred-term.input";
import { CreatePairedTermsInput } from "./dto/create-paired-terms.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { CreateTechnologyDto } from "./dto/create-technology.dto";
import { AuthService } from "src/auth/auth.service";
import { LinkTechnologySynonymDto } from "./dto/link-technology-synonym.dto";
import { Request, Response as ExpressResponse } from "express";
@Controller("technologies")
@ApiExtraModels(TechnologyPreferredTerm, PreferredTerm)
export class TechnologiesController {
  private readonly logger = new CustomLogger(TechnologiesController.name);
  constructor(
    private readonly technologiesService: TechnologiesService,
    private readonly authService: AuthService,
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
      .getAllUnblockedTerms()
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

  @Post("/create")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new technology",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Technology) }),
  })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() createTechnologyDto: CreateTechnologyDto,
  ): Promise<Response<Technology> | ResponseWithNoData> {
    try {
      const { address: creatorWallet } = await this.authService.getSession(
        req,
        res,
      );
      const { name } = createTechnologyDto;

      const normalizedName =
        this.technologiesService.normalizeTechnologyName(name);

      const existingTechnologyNode =
        await this.technologiesService.findByNormalizedName(normalizedName);

      if (existingTechnologyNode) {
        return {
          success: true,
          data: existingTechnologyNode.getProperties(),
          message: "Technology already exists, returning existing technology",
        };
      }

      const createdTechnology = await this.technologiesService.create({
        name,
        normalizedName,
      });

      await this.technologiesService.relateTechnologyToCreator(
        createdTechnology.getId(),
        creatorWallet as string,
      );

      return {
        success: true,
        data: createdTechnology.getProperties(),
        message: "Technology created successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "technologies.controller",
        });
        scope.setExtra("input", createTechnologyDto);
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesController::create ${err.message}`);
      return {
        success: false,
        message: `Failed to create technology`,
      };
    }
  }

  @Post("link-synonym")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Link one technology as a synonym of another",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Array<Technology>) }),
  })
  async linkSynonym(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() linkTechnologySynonymDto: LinkTechnologySynonymDto,
  ): Promise<Response<Technology[]> | ResponseWithNoData> {
    try {
      const { address: creatorWallet } = await this.authService.getSession(
        req,
        res,
      );

      const { technologyName, synonymName } = linkTechnologySynonymDto;

      const normalizedTechnologyName =
        this.technologiesService.normalizeTechnologyName(technologyName);
      const normalizedSynonymName =
        this.technologiesService.normalizeTechnologyName(synonymName);

      const firstTermNode = await this.technologiesService.findByNormalizedName(
        normalizedTechnologyName,
      );
      const secondTermNode =
        await this.technologiesService.findByNormalizedName(
          normalizedSynonymName,
        );

      const firstTermNodeId = firstTermNode.getId();
      const secondTermNodeId = secondTermNode.getId();

      if (!firstTermNodeId || !secondTermNodeId) {
        return {
          success: false,
          message: `${normalizedTechnologyName} has id: ${firstTermNodeId}\n${normalizedSynonymName} has id: ${secondTermNodeId}`,
        };
      }

      await this.technologiesService.linkSynonyms(
        firstTermNodeId,
        secondTermNodeId,
        creatorWallet as string,
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "technologies.controller",
        });
        scope.setExtra("input", linkTechnologySynonymDto);
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesController::linkSynonym ${err.message}`);
      return {
        success: false,
        message: `Failed to link synonym`,
      };
    }
  }

  @Post("/set-blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Flag a list of technologies as a blocked terms",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async setBlockedTerms(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreateBlockedTermsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/technologies/set-blocked-term ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    for (const technologyName in input.technologyNameList) {
      this.logger.debug(`Attempting to block term: ${technologyName}`);
      this.logger.debug(`Authenticating with wallet: ${creatorWallet}`);
      try {
        let existingBlockedTechnologyNameNode =
          await this.technologiesService.findBlockedTermNodeByName(
            this.technologiesService.normalizeTechnologyName(technologyName),
          );

        if (!existingBlockedTechnologyNameNode) {
          this.logger.log(`Creating initial blocked term node`);
          existingBlockedTechnologyNameNode =
            await this.technologiesService.createBlockedTermNode(
              this.technologiesService.normalizeTechnologyName(technologyName),
            );
        }

        const storedTechnologyNode =
          await this.technologiesService.findByNormalizedName(
            this.technologiesService.normalizeTechnologyName(technologyName),
          );

        if (!storedTechnologyNode) {
          this.logger.error(`Could not find stored technology node`);
          return {
            success: false,
            message: `Could not find Technology ${technologyName} to block`,
          };
        }

        const hasBlockedTermRelationship =
          await this.technologiesService.hasBlockedTermRelationship(
            existingBlockedTechnologyNameNode.getId(),
            storedTechnologyNode.getId(),
          );

        if (hasBlockedTermRelationship) {
          this.logger.error(`Already has a blocked term relation`);
          return {
            success: false,
            message: `${storedTechnologyNode.getName()} already has blocked term relation`,
          };
        }

        await this.technologiesService.relateBlockedTermToTechnologyTerm(
          existingBlockedTechnologyNameNode.getId(),
          storedTechnologyNode.getId(),
        );

        this.logger.debug(`Related blocked term to technology`);

        const hasBlockedTermCreatorRelationship =
          await this.technologiesService.hasBlockedTermCreatorRelationship(
            existingBlockedTechnologyNameNode.getId(),
            creatorWallet as string,
          );

        if (hasBlockedTermCreatorRelationship) {
          this.logger.error(`Already has a blocked term relation`);

          return {
            success: false,
            message: `Already has existing blocked term relation`,
          };
        }

        await this.technologiesService.relateTechnologyBlockedTermToCreator(
          existingBlockedTechnologyNameNode.getId(),
          creatorWallet as string,
        );

        this.logger.log(`Related blocked term to creator`);
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(
          `TechnologiesController::setBlockedTerms ${err.message}`,
        );
        return {
          success: false,
          message: `Error blocking technology '${technologyName}'`,
        };
      }
    }
    return {
      success: true,
      message: "Technology blocked terms created successfully",
    };
  }

  @Post("/unset-blocked-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Unflag a list of technologies as blocked terms",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async unsetBlockedTerms(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreateBlockedTermsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(
      `/technologies/unset-blocked-term ${JSON.stringify(input)}`,
    );
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    for (const technologyName in input.technologyNameList) {
      this.logger.debug(`Attempting to unblock term: ${technologyName}`);
      this.logger.debug(`Authenticating with wallet: ${creatorWallet}`);
      try {
        const existingBlockedTechnologyNameNode =
          await this.technologiesService.findBlockedTermNodeByName(
            this.technologiesService.normalizeTechnologyName(technologyName),
          );

        if (!existingBlockedTechnologyNameNode) {
          this.logger.debug(`Could not find blocked term node`);
          return {
            success: false,
            message: `Could not find blocked term node`,
          };
        }

        const storedTechnologyNode =
          await this.technologiesService.findByNormalizedName(
            this.technologiesService.normalizeTechnologyName(technologyName),
          );

        if (!storedTechnologyNode) {
          this.logger.error(`Could not find stored technology node`);
          return {
            success: false,
            message: `Could not find Technology ${technologyName} to block`,
          };
        }

        const hasBlockedTermRelationship =
          await this.technologiesService.hasBlockedTermRelationship(
            existingBlockedTechnologyNameNode.getId(),
            storedTechnologyNode.getId(),
          );

        if (!hasBlockedTermRelationship) {
          this.logger.error(`No blocked term relation`);
          return {
            success: false,
            message: `${storedTechnologyNode.getName()} has no blocked term relation`,
          };
        }

        await this.technologiesService.unrelateBlockedTermFromTechnologyTerm(
          existingBlockedTechnologyNameNode.getId(),
          storedTechnologyNode.getId(),
        );

        this.logger.debug(`Unrelated blocked term from technology`);

        const hasBlockedTermCreatorRelationship =
          await this.technologiesService.hasBlockedTermCreatorRelationship(
            existingBlockedTechnologyNameNode.getId(),
            creatorWallet as string,
          );

        if (!hasBlockedTermCreatorRelationship) {
          this.logger.error(`No existing blocked term relation`);
          return {
            success: false,
            message: `Missing existing blocked term relation`,
          };
        }

        await this.technologiesService.unrelateTechnologyBlockedTermFromCreator(
          existingBlockedTechnologyNameNode.getId(),
          creatorWallet as string,
        );

        this.logger.log(`Unrelated blocked term from creator`);
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "technologies.controller",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(
          `TechnologiesController::unsetBlockedTerms ${err.message}`,
        );
        return {
          success: false,
          message: `Failed to unblock technology ${technologyName}`,
        };
      }
    }
    return {
      success: true,
      message: "Technologies unblocked successfully",
    };
  }

  @Post("/create-paired-terms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async createPairedTerms(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreatePairedTermsInput,
  ): Promise<Response<Technology[]> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/create-paired-terms ${JSON.stringify(input)}`,
    );
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { originTerm, pairedTermList } = input;

      const normalizedOriginTermName =
        this.technologiesService.normalizeTechnologyName(originTerm);

      const normalizedPairTermList = pairedTermList.map(
        this.technologiesService.normalizeTechnologyName,
      );

      const normalizedOriginTermNameNode =
        await this.technologiesService.findByNormalizedName(
          normalizedOriginTermName,
        );
      const normalizedPairTermListNodes = await Promise.all(
        normalizedPairTermList.map(term =>
          this.technologiesService.findByNormalizedName(term),
        ),
      );

      if (!normalizedOriginTermNameNode) {
        return {
          success: false,
          message: `Could not find origin term node for ${originTerm}`,
        };
      }

      if (normalizedPairTermListNodes.some(node => !node)) {
        return {
          success: false,
          message: "One or more destination term nodes could not be found",
        };
      }

      const normalizedOriginTermNameNodeId =
        normalizedOriginTermNameNode.getId();
      const normalizedPairTermListNodesIds = normalizedPairTermListNodes.map(
        node => {
          return node.getId();
        },
      );

      await this.technologiesService.relatePairedTerms(
        normalizedOriginTermNameNodeId,
        normalizedPairTermListNodesIds,
        creatorWallet as string,
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "technologies.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(
        `TechnologiesController::createPairedTerms ${err.message}`,
      );
      return {
        success: false,
        message: `Failed to create paired terms`,
      };
    }
  }

  @Post("/create-preferred-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async createPreferredTerm(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreatePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/create-preferred-term ${JSON.stringify(input)}`,
    );
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { preferredName, technologyName } = input;

      const normalizedPreferredName =
        this.technologiesService.normalizeTechnologyName(preferredName);

      const existingPreferredTechnologyNameNode =
        await this.technologiesService.findPreferredTermByNormalizedName(
          normalizedPreferredName,
        );

      const storedTechnologyNode =
        await this.technologiesService.findByNormalizedName(
          this.technologiesService.normalizeTechnologyName(technologyName),
        );

      if (!storedTechnologyNode) {
        return {
          success: false,
          message: `Could not find Technology ${technologyName} to set a preferred term for`,
        };
      }

      if (existingPreferredTechnologyNameNode) {
        return {
          success: false,
          message: "Preferred Technology Name already exists",
        };
      }

      const createdTechnologyPreferredTerm =
        await this.technologiesService.createTechnologyPreferredTerm({
          name: preferredName,
          normalizedName: normalizedPreferredName,
        });

      const hasPreferredTermRelationship =
        await this.technologiesService.hasPreferredTermRelationship(
          createdTechnologyPreferredTerm.getId(),
          storedTechnologyNode.getId(),
        );

      if (hasPreferredTermRelationship) {
        return {
          success: false,
          message: `Already has existing preferred term relation`,
        };
      }

      await this.technologiesService.relatePreferredTermToTechnologyTerm(
        createdTechnologyPreferredTerm.getId(),
        storedTechnologyNode.getId(),
      );

      const hasPreferredTermCreatorRelationship =
        await this.technologiesService.hasPreferredTermCreatorRelationship(
          createdTechnologyPreferredTerm.getId(),
          creatorWallet as string,
        );

      if (hasPreferredTermCreatorRelationship) {
        return {
          success: false,
          message: `Already has existing preferred term creator relation`,
        };
      }

      await this.technologiesService.relateTechnologyPreferredTermToCreator(
        createdTechnologyPreferredTerm.getId(),
        creatorWallet as string,
      );

      return {
        success: true,
        data: createdTechnologyPreferredTerm.getProperties(),
        message: "Technology preferred term created successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "technologies.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(
        `TechnologiesController::createPreferredTerm ${err.message}`,
      );
      return {
        success: false,
        message: `Failed to create preferred term`,
      };
    }
  }

  @Post("/delete-preferred-term")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Delete a preferred term",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(PreferredTerm) }),
  })
  async deletePreferredTerm(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: DeletePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    this.logger.log(
      `/technologies/delete-preferred-term ${JSON.stringify(input)}`,
    );
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { preferredName, technologyName } = input;

      const normalizedPreferredName =
        this.technologiesService.normalizeTechnologyName(preferredName);

      const existingPreferredTechnologyNameNode =
        await this.technologiesService.findPreferredTermByNormalizedName(
          normalizedPreferredName,
        );

      const storedTechnologyNode =
        await this.technologiesService.findByNormalizedName(
          this.technologiesService.normalizeTechnologyName(technologyName),
        );

      if (!storedTechnologyNode) {
        return {
          success: false,
          message: `Could not find Technology ${technologyName} to set a preferred term for`,
        };
      }

      if (!existingPreferredTechnologyNameNode) {
        return {
          success: false,
          message: "Preferred Technology Name does not exist",
        };
      }

      const hasPreferredTermRelationship =
        await this.technologiesService.hasPreferredTermRelationship(
          existingPreferredTechnologyNameNode.getId(),
          storedTechnologyNode.getId(),
        );

      if (!hasPreferredTermRelationship) {
        return {
          success: false,
          message: `Preferred term relation not found`,
        };
      }

      const hasPreferredTermCreatorRelationship =
        await this.technologiesService.hasPreferredTermCreatorRelationship(
          existingPreferredTechnologyNameNode.getId(),
          creatorWallet as string,
        );

      if (!hasPreferredTermCreatorRelationship) {
        return {
          success: false,
          message: `Missing existing preferred term relation to creator`,
        };
      }

      await this.technologiesService.unrelatePreferredTermToTechnologyTerm(
        existingPreferredTechnologyNameNode.getId(),
        storedTechnologyNode.getId(),
      );

      await this.technologiesService.unrelateTechnologyPreferredTermFromCreator(
        existingPreferredTechnologyNameNode.getId(),
        creatorWallet as string,
      );

      return {
        success: true,
        data: existingPreferredTechnologyNameNode.getProperties(),
        message: "Technology preferred term deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "technologies.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(
        `TechnologiesController::deletePreferredTerm ${err.message}`,
      );
      return {
        success: false,
        message: `Failed to delete preferred term`,
      };
    }
  }
}
