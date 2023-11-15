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
import { DeletePreferredTagSynonymsInput } from "./dto/delete-preferred-tag-synonym.input";
@Controller("tags")
@ApiExtraModels(TagPreference, TagPreference)
export class TagsController {
  private readonly logger = new CustomLogger(TagsController.name);
  constructor(
    private readonly tagsService: TagsService,
    private readonly authService: AuthService,
  ) {}

  @Get("/")
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
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
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
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
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
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
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

      const createdTag = await this.tagsService.create(
        {
          name,
          normalizedName,
        },
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
        firstTagNode.getNormalizedName(),
        secondTagNode.getNormalizedName(),
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
      try {
        const blockedNormalizedName =
          this.tagsService.normalizeTagName(tagName);
        const tag = await this.tagsService.findByNormalizedName(
          blockedNormalizedName,
        );
        if (!tag) {
          return {
            success: false,
            message: `Could not block tag ${tagName} because it does not exist.`,
          };
        }
        const existingBlockedTag =
          await this.tagsService.findBlockedTagByNormalizedName(
            blockedNormalizedName,
          );
        if (existingBlockedTag) {
          return {
            success: false,
            message: `Tag ${tagName} is already blocked`,
          };
        }

        await this.tagsService.blockTag(
          blockedNormalizedName,
          creatorWallet as string,
        );
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
      try {
        const blockedNormalizedName =
          this.tagsService.normalizeTagName(tagName);
        const tag = await this.tagsService.findByNormalizedName(
          blockedNormalizedName,
        );
        if (!tag) {
          return {
            success: false,
            message: `Could not unblock tag ${tagName} because it does not exist.`,
          };
        }
        const existingBlockedTag =
          await this.tagsService.findBlockedTagByNormalizedName(
            blockedNormalizedName,
          );
        if (!existingBlockedTag) {
          return {
            success: false,
            message: `Tag ${tagName} is already unblocked`,
          };
        }

        await this.tagsService.unblockTag(
          existingBlockedTag.getNormalizedName(),
          creatorWallet as string,
        );
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "tags.controller",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`TagsController::unblockTags ${err.message}`);
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

      const normalizedPairTagNameList = normalizedPairTagListNodes.map(node => {
        return node.getNormalizedName();
      });

      await this.tagsService.relatePairedTags(
        normalizedOriginTagName,
        normalizedPairTagNameList,
        creatorWallet as string,
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

      const preferredTag = await this.tagsService.findByNormalizedName(
        normalizedPreferredName,
      );

      if (!preferredTag) {
        return {
          success: false,
          message: `Could not set tag ${preferredName} as preferred because it does not exist`,
        };
      }

      const isPreferred = await this.tagsService.hasPreferredRelation(
        preferredTag.getNormalizedName(),
      );

      let oldSynonymList = [];

      if (!isPreferred) {
        await this.tagsService.preferTag(
          normalizedPreferredName,
          creatorWallet as string,
        );
      } else {
        const preferredTag =
          await this.tagsService.findPreferredTagByNormalizedName(
            normalizedPreferredName,
          );
        oldSynonymList = preferredTag.synonyms;
      }

      for (const tagName of synonyms) {
        oldSynonymList = (
          await this.tagsService.findPreferredTagByNormalizedName(
            normalizedPreferredName,
          )
        ).synonyms;
        const normalizedTagName = this.tagsService.normalizeTagName(tagName);
        const storedTagNode = await this.tagsService.findByNormalizedName(
          normalizedTagName,
        );

        if (!storedTagNode) {
          return {
            success: false,
            message: `Could not find Tag ${tagName} to set as a synonym`,
          };
        }

        // TODO: Confirm that this check is needed @duckdegen
        // const hasPreferredNoRelationship =
        //   await this.tagsService.hasPreferredRelation(
        //     createdPreferredTag.getId(),
        //   );

        // if (hasPreferredNoRelationship) {
        //   return {
        //     success: false,
        //     message: `Already has existing relation to a preferred tag`,
        //   };
        // }

        if (
          oldSynonymList.find(
            tag => tag.normalizedName === normalizedTagName,
          ) === undefined
        ) {
          await this.tagsService.relatePreferredTagToTag(
            preferredTag.getNormalizedName(),
            storedTagNode.getNormalizedName(),
          );

          results.push(storedTagNode.getProperties());
        }
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
    @Body() input: DeletePreferredTagInput,
  ): Promise<Response<TagPreference> | ResponseWithNoData> {
    this.logger.log(`/tags/delete-preference ${JSON.stringify(input)}`);
    try {
      const { preferredName } = input;

      const normalizedPreferredName =
        this.tagsService.normalizeTagName(preferredName);

      const existingPreferredTagNameNode =
        await this.tagsService.findPreferredTagByNormalizedName(
          normalizedPreferredName,
        );

      await this.deletePreferredTagSynonym({
        preferredName: preferredName,
        synonyms: existingPreferredTagNameNode.synonyms.map(tag => tag.name),
      });

      await this.tagsService.unpreferTag(normalizedPreferredName);

      return {
        success: true,
        data: existingPreferredTagNameNode,
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

  @Post("/delete-synonyms")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Deletes synonyms for a preferred tag",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(TagPreference) }),
  })
  async deletePreferredTagSynonym(
    @Body() input: DeletePreferredTagSynonymsInput,
  ): Promise<Response<TagPreference> | ResponseWithNoData> {
    this.logger.log(`/tags/delete-synonyms ${JSON.stringify(input)}`);
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
            message: `Could not find Tag ${tagName} to delete synonym for`,
          };
        }

        if (!existingPreferredTagNameNode) {
          return {
            success: false,
            message: "Preferred Tag Name does not exist",
          };
        }

        // const hasPreferredRelationship =
        //   await this.tagsService.hasRelationToPreferredTag(
        //     normalizedPreferredName,
        //     storedTagNode.getNormalizedName(),
        //   );

        // if (!hasPreferredRelationship) {
        //   return {
        //     success: false,
        //     message: `Preferred tag relation not found`,
        //   };
        // }

        // TODO: Confirm that check is needed @duckdegen
        // const hasPreferredTagCreatorRelationship =
        //   await this.tagsService.hasPreferredTagCreatorRelationship(
        //     existingPreferredTagNameNode.tag.id,
        //     creatorWallet as string,
        //   );

        // if (!hasPreferredTagCreatorRelationship) {
        //   return {
        //     success: false,
        //     message: `Missing existing preferred tag relation to creator`,
        //   };
        // }

        await this.tagsService.unrelatePreferredTagToTag(
          normalizedPreferredName,
          storedTagNode.getNormalizedName(),
        );
      }

      return {
        success: true,
        data: existingPreferredTagNameNode,
        message: "Preferred tag synonym deleted successfully",
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
      this.logger.error(
        `TagsController::deletePreferredTagSynonym ${err.message}`,
      );
      return {
        success: false,
        message: `Failed to delete preferred tag synonym`,
      };
    }
  }
}
