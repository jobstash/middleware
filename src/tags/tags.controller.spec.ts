import { Test, TestingModule } from "@nestjs/testing";
import { TagsController } from "./tags.controller";
import { forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import { ModelModule } from "src/model/model.module";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { TagsService } from "./tags.service";
import { Tag, data } from "src/shared/interfaces";
import {
  normalizeString,
  printDuplicateItems,
  resetTestDB,
} from "src/shared/helpers";
import { EPHEMERAL_TEST_WALLET, REALLY_LONG_TIME } from "src/shared/constants";
import { HttpModule, HttpService } from "@nestjs/axios";
import * as https from "https";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Request, Response } from "express";

describe("TagsController", () => {
  let controller: TagsController;
  let models: ModelService;
  let httpService: HttpService;
  let authService: AuthService;
  let tagsService: TagsService;

  const logger = new CustomLogger(`${TagsController.name}TestSuite`);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        forwardRef(() => UserModule),
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
              retryDelay: 1000,
            } as NeogmaModuleOptions),
        }),
        ModelModule,
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
      providers: [TagsService, AuthService, JwtService, ModelService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    controller = module.get<TagsController>(TagsController);
    authService = module.get<AuthService>(AuthService);
    tagsService = module.get<TagsService>(TagsService);
    httpService = module.get<HttpService>(HttpService);
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

      const uuids = data(result).map(tag => tag.id);
      const setOfUuids = new Set([...uuids]);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      printDuplicateItems(setOfUuids, uuids, "Tag with name");

      expect(uuids.length).toBe(setOfUuids.size);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get blocked tags list with no duplication",
    async () => {
      const result = await controller.getBlockedTags();

      const uuids = data(result).map(tag => tag.id);
      const setOfUuids = new Set([...uuids]);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      printDuplicateItems(setOfUuids, uuids, "Blocked tag with name");

      expect(uuids.length).toBe(setOfUuids.size);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get preferred tags list with no duplication",
    async () => {
      const result = await controller.getPreferredTags();

      const uuids = data(result).map(preferredTag => preferredTag.tag.id);
      const setOfUuids = new Set([...uuids]);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      printDuplicateItems(setOfUuids, uuids, "Preferred tag with name");

      expect(uuids.length).toBe(setOfUuids.size);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should get paired tags list with no duplication",
    async () => {
      const result = await controller.getPairedTags();

      const uuids = data(result).map(pairedTag => pairedTag.tag);
      const setOfUuids = new Set([...uuids]);

      expect(result).toEqual({
        success: true,
        message: expect.any(String),
        data: expect.any(Array<Tag>),
      });

      printDuplicateItems(setOfUuids, uuids, "Paired tag with name");

      expect(uuids.length).toBe(setOfUuids.size);
    },
    REALLY_LONG_TIME,
  );

  it(
    "should create a tag",
    async () => {
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag";

      const tag = {
        name: tagName,
        normalizedName: normalizeString(tagName),
      };

      const result = await controller.create(
        req as Request,
        res as Response,
        tag,
      );

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: {
          id: expect.any(String),
          ...tag,
        },
      });

      const allTags = await tagsService.findAll();

      expect(allTags).toStrictEqual(
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
    "should link tags as synonyms",
    async () => {
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag2";

      const tag = {
        name: tagName,
        normalizedName: normalizeString(tagName),
      };

      await controller.create(req as Request, res as Response, tag);

      const result = await controller.linkSynonym(
        req as Request,
        res as Response,
        { tagName: "DemoTag", synonymName: "DemoTag2" },
      );

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
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag3";

      const tag = {
        name: tagName,
        normalizedName: normalizeString(tagName),
      };

      await controller.create(req as Request, res as Response, tag);

      const result = await controller.blockTags(
        req as Request,
        res as Response,
        { tagNameList: [tagName] },
      );

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
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag3";

      const tag = {
        name: tagName,
        normalizedName: normalizeString(tagName),
      };

      const result = await controller.unblockTags(
        req as Request,
        res as Response,
        { tagNameList: [tagName] },
      );

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
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag";

      const tagNames = ["Demo", "Tag"];

      for (const tag of tagNames) {
        await controller.create(req as Request, res as Response, {
          name: tag,
          normalizedName: normalizeString(tag),
        });
      }

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: normalizeString(tagName),
        }))
        .map(tag => ({ id: expect.any(String), ...tag }));

      const result = await controller.createPairedTags(
        req as Request,
        res as Response,
        { originTag: tagName, pairedTagList: tagNames },
      );

      expect(result).toStrictEqual({
        success: true,
        message: expect.stringMatching("success"),
        data: expect.arrayContaining(tags),
      });

      const pairedTags = await controller.getPairedTags();

      expect(data(pairedTags)).toStrictEqual(
        expect.arrayContaining([
          {
            tag: tags.find(tag => tag.name === tagName),
            pairings: tags.filter(tag => tag.name !== tagName),
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should prefer tags",
    async () => {
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));
      const req: Partial<Request> = {};
      const res: Partial<Response> = {};

      const tagName = "DemoTag100";

      const tagNames = ["DemoTag20", "DemoTag30"];

      for (const tag of [tagName, ...tagNames]) {
        await controller.create(req as Request, res as Response, {
          name: tag,
          normalizedName: normalizeString(tag),
        });
      }

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: normalizeString(tagName),
        }))
        .map(tag => ({ id: expect.any(String), ...tag }));

      const result = await controller.createPreferredTag(
        req as Request,
        res as Response,
        { preferredName: tagName, synonyms: tagNames },
      );

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

      expect(data(preferredTags)).toEqual(
        expect.arrayContaining([
          {
            tag: tags.find(tag => tag.name === tagName),
            synonyms: tags.filter(tag => tag.name !== tagName).reverse(),
          },
        ]),
      );
    },
    REALLY_LONG_TIME,
  );

  it(
    "should unprefer tags",
    async () => {
      jest.spyOn(authService, "getSession").mockImplementation(async () => ({
        address: EPHEMERAL_TEST_WALLET,
        destroy: async (): Promise<void> => {
          logger.log("session destroyed");
        },
        save: async (): Promise<void> => {
          logger.log("session saved");
        },
      }));

      const tagName = "DemoTag100";

      const tagNames = ["DemoTag20", "DemoTag30"];

      const tags = [tagName, ...tagNames]
        .map(tagName => ({
          name: tagName,
          normalizedName: normalizeString(tagName),
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
