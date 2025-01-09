import { Test, TestingModule } from "@nestjs/testing";
import { TagsController } from "./tags.controller";
import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { ModelModule } from "src/model/model.module";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { TagsService } from "./tags.service";
import { SessionObject, Tag, data } from "src/shared/interfaces";
import {
  createTestUser,
  slugify,
  resetTestDB,
  hasDuplicates,
} from "src/shared/helpers";
import { ADMIN_SESSION_OBJECT, REALLY_LONG_TIME } from "src/shared/constants";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Integer } from "neo4j-driver";
import { AuthModule } from "src/auth/auth.module";
import { UserService } from "src/user/user.service";
import { PrivyService } from "src/auth/privy/privy.service";
import { GithubModule } from "src/auth/github/github.module";
import { PrivyModule } from "src/auth/privy/privy.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { ScorerModule } from "src/scorer/scorer.module";
import { PermissionService } from "src/user/permission.service";
import { RpcService } from "src/user/rpc.service";
import { ProfileService } from "src/auth/profile/profile.service";

describe("TagsController", () => {
  let controller: TagsController;
  let models: ModelService;
  let httpService: HttpService;
  let tagsService: TagsService;

  let USER_SESSION_OBJECT: SessionObject;
  const logger = new CustomLogger(`${TagsController.name}TestSuite`);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        Auth0Module,
        forwardRef(() => AuthModule),
        forwardRef(() => ScorerModule),
        forwardRef(() => PrivyModule),
        forwardRef(() => GithubModule),
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envSchema,
          validationOptions: {
            abortEarly: true,
          },
        }),
        NeogmaModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) =>
            ({
              host: configService.get<string>("NEO4J_HOST_TEST"),
              password: configService.get<string>("NEO4J_PASSWORD_TEST"),
              port: configService.get<string>("NEO4J_PORT_TEST"),
              scheme: configService.get<string>("NEO4J_SCHEME_TEST"),
              username: configService.get<string>("NEO4J_USERNAME_TEST"),
              database: configService.get<string>("NEO4J_DATABASE_TEST"),
              retryAttempts: 5,
              retryDelay: 5000,
            }) as NeogmaModuleOptions,
        }),
        forwardRef(() => ModelModule),
        HttpModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            headers: {
              "X-Secret-Key": configService.get<string>(
                "TEST_DB_MANAGER_API_KEY",
              ),
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: REALLY_LONG_TIME,
            baseURL: configService.get<string>("TEST_DB_MANAGER_URL"),
          }),
        }),
      ],
      controllers: [TagsController],
      providers: [
        ProfileService,
        TagsService,
        JwtService,
        ModelService,
        RpcService,
        UserService,
        PermissionService,
      ],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<TagsController>(TagsController);
    tagsService = module.get<TagsService>(TagsService);
    httpService = module.get<HttpService>(HttpService);

    const adminWallet = await createTestUser(
      module.get<PrivyService>(PrivyService),
      module.get<UserService>(UserService),
    );

    USER_SESSION_OBJECT = {
      ...ADMIN_SESSION_OBJECT,
      address: adminWallet,
    };
  }, REALLY_LONG_TIME);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  afterAll(async () => {
    await resetTestDB(httpService, logger);
    jest.restoreAllMocks();
  }, REALLY_LONG_TIME);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it(
    "should access models",
    async () => {
      expect(models.Organizations.findMany).toBeDefined();
      expect(
        (await models.Organizations.findMany()).length,
      ).toBeGreaterThanOrEqual(1);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get tags list with no duplication",
    async () => {
      const result = await controller.getTags();

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      expect(
        hasDuplicates(
          data(result),
          "Tag with name",
          x => x.normalizedName,
          x =>
            `${x.name} with id ${x.id} and normalized name ${x.normalizedName}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get popular tags list with no duplication",
    async () => {
      const result = await controller.getPopularTags(
        Integer.MAX_SAFE_VALUE.toNumber(),
      );

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      expect(
        hasDuplicates(
          data(result),
          "Tag with name",
          x => x.normalizedName,
          x =>
            `${x.name} with id ${x.id} and normalized name ${x.normalizedName}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get blocked tags list with no duplication",
    async () => {
      const result = await controller.getBlockedTags();

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      expect(
        hasDuplicates(
          data(result),
          "Blocked tag with name",
          x => x.normalizedName,
          x =>
            `${x.name} with id ${x.id} and normalized name ${x.normalizedName}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get preferred tags list with no duplication",
    async () => {
      const result = await controller.getPreferredTags();

      const tags = data(result).map(preferredTag => preferredTag.tag);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      expect(
        hasDuplicates(
          tags,
          "Preferred tag with name",
          x => x.normalizedName,
          x =>
            `${x.name} with id ${x.id} and normalized name ${x.normalizedName}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get paired tags list with no duplication",
    async () => {
      const result = await controller.getPairedTags();

      const tags = data(result).map(pairedTag => pairedTag);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      expect(
        hasDuplicates(
          tags,
          "Paired tag with name",
          x => x.tag,
          x => `${x.tag} with pairings ${x.pairings.join(", ")}`,
        ),
      ).toBe(false);
    },
    REALLY_LONG_TIME,
  );

  it("should create a tag", async () => {
    const tagName = "DemoTag";

    const tag = {
      name: tagName,
      normalizedName: slugify(tagName),
    };

    const result = await controller.create(USER_SESSION_OBJECT, tag);

    expect(result).toStrictEqual({
      success: true,
      message: expect.stringMatching("success"),
      data: {
        id: expect.any(String),
        ...tag,
      },
    });
  });

  it(
    "should link tags as synonyms",
    async () => {
      const tagName = "DemoTag2";

      const tag = {
        name: tagName,
        normalizedName: slugify(tagName),
      };

      await controller.create(USER_SESSION_OBJECT, tag);

      const result = await controller.linkSynonym(USER_SESSION_OBJECT, {
        tagName: "DemoTag",
        synonymName: "DemoTag2",
      });

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.any(Array<Tag>),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should block a tag",
    async () => {
      const tagName = "DemoTag3";

      const tag = {
        name: tagName,
        normalizedName: slugify(tagName),
      };

      await controller.create(USER_SESSION_OBJECT, tag);

      const result = await controller.blockTags(USER_SESSION_OBJECT, {
        tagNameList: [tagName],
      });

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const blockedTags = await controller.getBlockedTags();

      expect(data(blockedTags)).toStrictEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            ...tag,
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should unblock a tag",
    async () => {
      const tagName = "DemoTag3";

      const tag = {
        name: tagName,
        normalizedName: slugify(tagName),
      };

      const result = await controller.unblockTags(USER_SESSION_OBJECT, {
        tagNameList: [tagName],
      });

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
      });

      const tags = await tagsService.findAll();

      expect(tags).toStrictEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            ...tag,
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should pair tags",
    async () => {
      const tagName = "DemoTag";

      const tagNames = ["Demo", "Tag"];

      for (const tag of tagNames) {
        await controller.create(USER_SESSION_OBJECT, {
          name: tag,
          normalizedName: slugify(tag),
        });
      }

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: slugify(tagName),
        }))
        .map(tag => ({ id: expect.any(String), ...tag }));

      const result = await controller.createPairedTags(USER_SESSION_OBJECT, {
        originTag: tagName,
        pairedTagList: tagNames,
      });

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining(tags),
      });
    },
    REALLY_LONG_TIME,
  );

  it(
    "should prefer tags",
    async () => {
      const tagName = "DemoTag100";

      const tagNames = ["DemoTag20", "DemoTag30"];

      for (const tag of [tagName, ...tagNames]) {
        await controller.create(USER_SESSION_OBJECT, {
          name: tag,
          normalizedName: slugify(tag),
        });
      }

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: slugify(tagName),
        }))
        .map(tag => ({ id: expect.any(String), ...tag }));

      const result = await controller.createPreferredTag(USER_SESSION_OBJECT, {
        preferredName: tagName,
        synonyms: tagNames,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          tag: tags[0],
          synonyms: expect.arrayContaining(
            tags.filter(tag => tag.name !== tagName),
          ),
        },
      });

      const preferredTags = await controller.getPreferredTags();

      expect(data(preferredTags)).toStrictEqual(
        expect.arrayContaining([
          {
            tag: tags.find(tag => tag.name === tagName),
            synonyms: tags.filter(tag => tag.name !== tagName),
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should unprefer tags",
    async () => {
      const tagName = "DemoTag100";

      const tagNames = ["DemoTag20", "DemoTag30"];

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: slugify(tagName),
        }))
        .map(tag => ({ id: expect.any(String), ...tag }));

      const result = await controller.deletePreferredTag({
        preferredName: tagName,
      });

      expect(result).toEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          tag: tags.find(tag => tag.name === tagName),
          synonyms: expect.arrayContaining(
            tags.filter(tag => tag.name !== tagName),
          ),
        },
      });

      const preferredTags = await controller.getPreferredTags();

      expect(data(preferredTags)).not.toStrictEqual(
        expect.arrayContaining([
          {
            tag: tags.find(tag => tag.name === tagName),
            synonyms: tags.filter(tag => tag.name !== tagName),
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );
});
