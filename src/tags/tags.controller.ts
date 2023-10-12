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
import * as Sentry from "@sentry/node";
import { Response as ExpressResponse, Request } from "express";
import { AuthService } from "src/auth/auth.service";
import { RBACGuard } from "src/auth/rbac.guard";
import { Roles } from "src/shared/decorators/role.decorator";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  CheckWalletRoles,
  TagPair,
  TagPreference,
  Response,
  ResponseWithNoData,
  Tag,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateBlockedTagsInput } from "./dto/create-blocked-tags.input";
import { CreatePairedTagsInput } from "./dto/create-paired-tags.input";
import { CreatePreferredTagInput } from "./dto/create-preferred-tag.input";
import { CreateTagDto } from "./dto/create-tag.dto";
import { DeletePreferredTagInput } from "./dto/delete-preferred-tag.input";
import { LinkTagSynonymDto } from "./dto/link-tag-synonym.dto";
import { TagsService } from "./tags.service";
@Controller("tags")
@ApiExtraModels(TagPreference, TagPreference)
export class TagsController {
  private readonly logger = new CustomLogger(TagsController.name);
  constructor(
    private readonly tagsService: TagsService,
    private readonly authService: AuthService,
  ) {}

  @Get("/")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all tags",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Tag) }),
  })
  async getTags(): Promise<Response<Tag[]> | ResponseWithNoData> {
    this.logger.log(`/tags`);
    return this.tagsService
      .getAllUnblockedTags()
      .then(res => ({
        success: true,
        message: "Retrieved all tags",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/tags ${err.message}`);
        return {
          success: false,
          message: `Error retrieving tags!`,
        };
      });
  }

  @Get("blocked")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all blocked tags",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Tag) }),
  })
  async getBlockedTags(): Promise<Response<Tag[]> | ResponseWithNoData> {
    this.logger.log(`/tags/blocked`);
    return this.tagsService
      .getBlockedTags()
      .then(res => ({
        success: true,
        message: "Retrieved all blocked tags",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/tags/blocked ${err.message}`);
        return {
          success: false,
          message: `Error retrieving blocked tags!`,
        };
      });
  }

  @Get("preferred")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Retrieve a list of preferred tags and their synonym chains",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(TagPreference),
    }),
  })
  async getPreferredTags(): Promise<
    Response<TagPreference[]> | ResponseWithNoData
  > {
    this.logger.log(`/tags/preferred`);
    return this.tagsService
      .getPreferredTags()
      .then(res => ({
        success: true,
        message: "Retrieved all preferred tags",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/tags/preferred ${err.message}`);
        return {
          success: false,
          message: `Error retrieving preferred tags!`,
        };
      });
  }

  @Get("paired")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Retrieve a list of paired tags and their pairings",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(TagPair),
    }),
  })
  async getPairedTags(): Promise<Response<TagPair[]> | ResponseWithNoData> {
    this.logger.log(`/tags/paired`);
    return this.tagsService
      .getPairedTags()
      .then(res => ({
        success: true,
        message: "Retrieved all paired tags",
        data: res,
      }))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`/tags/paired ${err.message}`);
        return {
          success: false,
          message: `Error retrieving paired tags!`,
        };
      });
  }

  @Post("/create")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new tag",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Tag) }),
  })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() createTagDto: CreateTagDto,
  ): Promise<Response<Tag> | ResponseWithNoData> {
    try {
      const { address: creatorWallet } = await this.authService.getSession(
        req,
        res,
      );
      const { name } = createTagDto;

      const normalizedName = this.tagsService.normalizeTagName(name);

      const existingTagNode = await this.tagsService.findByNormalizedName(
        normalizedName,
      );

      if (existingTagNode) {
        return {
          success: true,
          data: existingTagNode.getProperties(),
          message: "Tag already exists, returning existing tag",
        };
      }

      const createdTag = await this.tagsService.create({
        name,
        normalizedName,
      });

      await this.tagsService.relateTagToCreator(
        createdTag.getId(),
        creatorWallet as string,
      );

      return {
        success: true,
        data: createdTag.getProperties(),
        message: "Tag created successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "tags.controller",
        });
        scope.setExtra("input", createTagDto);
        Sentry.captureException(err);
      });
      this.logger.error(`TagsController::create ${err.message}`);
      return {
        success: false,
        message: `Failed to create tag`,
      };
    }
  }

  @Post("link-synonym")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Link one tag as a synonym of another",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Array<Tag>) }),
  })
  async linkSynonym(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() linkTagSynonymDto: LinkTagSynonymDto,
  ): Promise<Response<Tag[]> | ResponseWithNoData> {
    try {
      const { address: creatorWallet } = await this.authService.getSession(
        req,
        res,
      );

      const { tagName, synonymName } = linkTagSynonymDto;

      const normalizedTagName = this.tagsService.normalizeTagName(tagName);
      const normalizedSynonymName =
        this.tagsService.normalizeTagName(synonymName);

      const firstTagNode = await this.tagsService.findByNormalizedName(
        normalizedTagName,
      );
      const secondTagNode = await this.tagsService.findByNormalizedName(
        normalizedSynonymName,
      );

      const firstTagNodeId = firstTagNode.getId();
      const secondTagNodeId = secondTagNode.getId();

      if (!firstTagNodeId || !secondTagNodeId) {
        return {
          success: false,
          message: `${normalizedTagName} has id: ${firstTagNodeId}\n${normalizedSynonymName} has id: ${secondTagNodeId}`,
        };
      }

      await this.tagsService.linkSynonyms(
        firstTagNodeId,
        secondTagNodeId,
        creatorWallet as string,
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "tags.controller",
        });
        scope.setExtra("input", linkTagSynonymDto);
        Sentry.captureException(err);
      });
      this.logger.error(`TagsController::linkSynonym ${err.message}`);
      return {
        success: false,
        message: `Failed to link synonym`,
      };
    }
  }

  @Post("/block")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Flag a list of tags as a blocked",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async blockTags(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreateBlockedTagsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/tags/block ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    for (const tagName of input.tagNameList) {
      this.logger.debug(`Attempting to block tag: ${tagName}`);
      this.logger.debug(`Authenticating with wallet: ${creatorWallet}`);
      try {
        let existingBlockedTagNameNode =
          await this.tagsService.findBlockedTagNodeByName(
            this.tagsService.normalizeTagName(tagName),
          );

        if (!existingBlockedTagNameNode) {
          this.logger.log(`Creating initial blocked tag node`);
          existingBlockedTagNameNode =
            await this.tagsService.createBlockedTagNode(
              this.tagsService.normalizeTagName(tagName),
            );
        }

        const storedTagNode = await this.tagsService.findByNormalizedName(
          this.tagsService.normalizeTagName(tagName),
        );

        if (!storedTagNode) {
          this.logger.error(`Could not find stored tag node`);
          return {
            success: false,
            message: `Could not find Tag ${tagName} to block`,
          };
        }

        const hasBlockedNoRelationship =
          await this.tagsService.hasBlockedNoRelationship(
            existingBlockedTagNameNode.getId(),
            storedTagNode.getId(),
          );

        if (hasBlockedNoRelationship) {
          this.logger.error(`Already has a blocked tag relation`);
          return {
            success: false,
            message: `${storedTagNode.getName()} already has blocked tag relation`,
          };
        }

        await this.tagsService.relateBlockedTagToTag(
          existingBlockedTagNameNode.getId(),
          storedTagNode.getId(),
        );

        this.logger.debug(`Related blocked tag to tag`);

        const hasBlockedTagCreatorRelationship =
          await this.tagsService.hasBlockedTagCreatorRelationship(
            existingBlockedTagNameNode.getId(),
            creatorWallet as string,
          );

        if (hasBlockedTagCreatorRelationship) {
          this.logger.error(`Already has a blocked tag relation`);

          return {
            success: false,
            message: `Already has existing blocked tag relation`,
          };
        }

        await this.tagsService.relateBlockedTagToCreator(
          existingBlockedTagNameNode.getId(),
          creatorWallet as string,
        );

        this.logger.log(`Related blocked tag to creator`);
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`TagsController::setBlockedTags ${err.message}`);
        return {
          success: false,
          message: `Error blocking tag '${tagName}'`,
        };
      }
    }
    return {
      success: true,
      message: "Tags blocked successfully",
    };
  }

  @Post("/unblock")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Unblock a list of blocked tags",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(Boolean) }),
  })
  async unblockTags(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreateBlockedTagsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/tags/unblock ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    for (const tagName of input.tagNameList) {
      this.logger.debug(`Attempting to unblock tag: ${tagName}`);
      this.logger.debug(`Authenticating with wallet: ${creatorWallet}`);
      try {
        const existingBlockedTagNameNode =
          await this.tagsService.findBlockedTagNodeByName(
            this.tagsService.normalizeTagName(tagName),
          );

        if (!existingBlockedTagNameNode) {
          this.logger.debug(`Could not find blocked tag node`);
          return {
            success: false,
            message: `Could not find blocked tag node`,
          };
        }

        const storedTagNode = await this.tagsService.findByNormalizedName(
          this.tagsService.normalizeTagName(tagName),
        );

        if (!storedTagNode) {
          this.logger.error(`Could not find stored tag node`);
          return {
            success: false,
            message: `Could not find Tag ${tagName} to block`,
          };
        }

        const hasBlockedNoRelationship =
          await this.tagsService.hasBlockedNoRelationship(
            existingBlockedTagNameNode.getId(),
            storedTagNode.getId(),
          );

        if (!hasBlockedNoRelationship) {
          this.logger.error(`No blocked tag relation`);
          return {
            success: false,
            message: `${storedTagNode.getName()} has no blocked tag relation`,
          };
        }

        await this.tagsService.unrelateBlockedTagFromTag(
          existingBlockedTagNameNode.getId(),
          storedTagNode.getId(),
        );

        this.logger.debug(`Unrelated blocked tag from tag`);

        const hasBlockedTagCreatorRelationship =
          await this.tagsService.hasBlockedTagCreatorRelationship(
            existingBlockedTagNameNode.getId(),
            creatorWallet as string,
          );

        if (!hasBlockedTagCreatorRelationship) {
          this.logger.error(`No existing blocked tag relation`);
          return {
            success: false,
            message: `Missing existing blocked tag relation`,
          };
        }

        await this.tagsService.unrelateBlockedTagFromCreator(
          existingBlockedTagNameNode.getId(),
          creatorWallet as string,
        );

        this.logger.log(`Unrelated blocked tag from creator`);
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`TagsController::unsetBlockedTags ${err.message}`);
        return {
          success: false,
          message: `Failed to unblock tag ${tagName}`,
        };
      }
    }
    return {
      success: true,
      message: "Tags unblocked successfully",
    };
  }

  @Post("/pair")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new tag pairing or sync an old one",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TagPreference) }),
  })
  async createPairedTags(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreatePairedTagsInput,
  ): Promise<Response<Tag[]> | ResponseWithNoData> {
    this.logger.log(`/tags/pair ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { originTag: originTag, pairedTagList: pairedTagList } = input;

      const normalizedOriginTagName =
        this.tagsService.normalizeTagName(originTag);

      const normalizedPairTagList = pairedTagList.map(
        this.tagsService.normalizeTagName,
      );

      const normalizedOriginTagNameNode =
        await this.tagsService.findByNormalizedName(normalizedOriginTagName);
      const normalizedPairTagListNodes = await Promise.all(
        normalizedPairTagList.map(tag =>
          this.tagsService.findByNormalizedName(tag),
        ),
      );

      if (!normalizedOriginTagNameNode) {
        return {
          success: false,
          message: `Could not find origin tag node for ${originTag}`,
        };
      }

      if (normalizedPairTagListNodes.some(node => !node)) {
        return {
          success: false,
          message: "One or more destination tag nodes could not be found",
        };
      }

      const normalizedOriginTagNameNodeId = normalizedOriginTagNameNode.getId();
      const normalizedPairTagListNodesIds = normalizedPairTagListNodes.map(
        node => {
          return node.getId();
        },
      );

      await this.tagsService.relatePairedTags(
        normalizedOriginTagNameNodeId,
        normalizedPairTagListNodesIds,
        (creatorWallet as string) ??
          "0x921f80499A00aC6E95AAE0DAa411D338f41D5Da2",
      );

      return {
        success: true,
        message: "Tags paired successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "tags.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`TagsController::createPairedTags ${err.message}`);
      return {
        success: false,
        message: `Failed to create paired tags`,
      };
    }
  }

  @Post("/create-preference")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Create a new preferred tag",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TagPreference) }),
  })
  async createPreferredTag(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: CreatePreferredTagInput,
  ): Promise<
    | Response<{ preferredName: string; synonyms: TagPreference[] }>
    | ResponseWithNoData
  > {
    this.logger.log(`/tags/create-preference ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { preferredName, synonyms } = input;

      const results = [];

      const normalizedPreferredName =
        this.tagsService.normalizeTagName(preferredName);

      const existingPreferredTagNameNode =
        await this.tagsService.findPreferredTagByNormalizedName(
          normalizedPreferredName,
        );

      const createdPreferredTag = await this.tagsService.createPreferredTag({
        name: preferredName,
        normalizedName: normalizedPreferredName,
      });

      if (existingPreferredTagNameNode) {
        return {
          success: false,
          message: "Preferred Tag Name already exists",
        };
      }

      for (const tagName of synonyms) {
        const storedTagNode = await this.tagsService.findByNormalizedName(
          this.tagsService.normalizeTagName(tagName),
        );

        if (!storedTagNode) {
          return {
            success: false,
            message: `Could not find Tag ${tagName} to set as preferred`,
          };
        }

        const hasPreferredNoRelationship =
          await this.tagsService.hasPreferredNoRelationship(
            createdPreferredTag.getId(),
            storedTagNode.getId(),
          );

        if (hasPreferredNoRelationship) {
          return {
            success: false,
            message: `Already has existing preferred tag relation`,
          };
        }

        await this.tagsService.relatePreferredTagToTag(
          createdPreferredTag.getId(),
          storedTagNode.getId(),
        );

        const hasPreferredTagCreatorRelationship =
          await this.tagsService.hasPreferredTagCreatorRelationship(
            createdPreferredTag.getId(),
            creatorWallet as string,
          );

        if (hasPreferredTagCreatorRelationship) {
          return {
            success: false,
            message: `Already has existing preferred tag creator relation`,
          };
        }

        await this.tagsService.relatePreferredTagToCreator(
          createdPreferredTag.getId(),
          creatorWallet as string,
        );
        results.push(createdPreferredTag.getProperties());
      }

      return {
        success: true,
        data: { preferredName: preferredName, synonyms: results },
        message: "Tag preference created successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "tags.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`TagsController::createPreferredTag ${err.message}`);
      return {
        success: false,
        message: `Failed to create preferred tag`,
      };
    }
  }

  @Post("/delete-preference")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Delete a preferred tag",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TagPreference) }),
  })
  async deletePreferredTag(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() input: DeletePreferredTagInput,
  ): Promise<Response<TagPreference> | ResponseWithNoData> {
    this.logger.log(`/tags/delete-preference ${JSON.stringify(input)}`);
    const { address: creatorWallet } = await this.authService.getSession(
      req,
      res,
    );
    try {
      const { preferredName, synonyms } = input;

      const normalizedPreferredName =
        this.tagsService.normalizeTagName(preferredName);

      const existingPreferredTagNameNode =
        await this.tagsService.findPreferredTagByNormalizedName(
          normalizedPreferredName,
        );

      for (const tagName of synonyms) {
        const storedTagNode = await this.tagsService.findByNormalizedName(
          this.tagsService.normalizeTagName(tagName),
        );

        if (!storedTagNode) {
          return {
            success: false,
            message: `Could not find Tag ${tagName} to delete preference for`,
          };
        }

        if (!existingPreferredTagNameNode) {
          return {
            success: false,
            message: "Preferred Tag Name does not exist",
          };
        }

        const hasPreferredNoRelationship =
          await this.tagsService.hasPreferredNoRelationship(
            existingPreferredTagNameNode.getId(),
            storedTagNode.getId(),
          );

        if (!hasPreferredNoRelationship) {
          return {
            success: false,
            message: `Preferred tag relation not found`,
          };
        }

        const hasPreferredTagCreatorRelationship =
          await this.tagsService.hasPreferredTagCreatorRelationship(
            existingPreferredTagNameNode.getId(),
            creatorWallet as string,
          );

        if (!hasPreferredTagCreatorRelationship) {
          return {
            success: false,
            message: `Missing existing preferred tag relation to creator`,
          };
        }

        await this.tagsService.unrelatePreferredTagToTag(
          existingPreferredTagNameNode.getId(),
          storedTagNode.getId(),
        );

        await this.tagsService.unrelatePreferredTagFromCreator(
          existingPreferredTagNameNode.getId(),
          creatorWallet as string,
        );
      }

      return {
        success: true,
        data: existingPreferredTagNameNode.getProperties(),
        message: "Tag preference deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "tags.controller",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`TagsController::deletePreferredTag ${err.message}`);
      return {
        success: false,
        message: `Failed to delete preferred tag`,
      };
    }
  }
}