import { Test, TestingModule } from "@nestjs/testing";
import { TagsController } from "./tags.controller";
import { forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import {
  NeogmaModule,
  NeogmaModuleOptions,
  getConnectionToken,
} from "nest-neogma";
import { ModelModule } from "src/model/model.module";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import Neo4jTempDB from "@neo4j-labs/temp-dbs";
import {
  Neogma,
  // Runnable,
  // getRunnable,
  // getSession,
  // getTransaction,
  neo4jDriver,
} from "neogma";
import { TagsService } from "./tags.service";
import { nonZeroOrNull } from "src/shared/helpers";

describe("TagsController", () => {
  let controller: TagsController;
  // let authService: AuthService;
  let neogma: Neogma;
  let tempDb;
  // let tempDbName: string;
  // let req: Partial<Request>;
  // let res: Partial<Response>;

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
              host: configService.get<string>("NEO4J_HOST"),
              password: configService.get<string>("NEO4J_PASSWORD"),
              port: configService.get<string>("NEO4J_PORT"),
              scheme: configService.get<string>("NEO4J_SCHEME"),
              username: configService.get<string>("NEO4J_USERNAME"),
              // database: tempDbName,
            } as NeogmaModuleOptions),
        }),
        ModelModule,
      ],
      controllers: [TagsController],
      providers: [
        {
          provide: "TEMP_DB",
          inject: [ConfigService],
          useFactory: (configService: ConfigService) =>
            new Neo4jTempDB(
              `${configService.get<string>(
                "NEO4J_SCHEME",
              )}://${configService.get<string>(
                "NEO4J_HOST",
              )}:${configService.get<string>("NEO4J_PORT")}`,
              neo4jDriver.auth.basic(
                configService.get<string>("NEO4J_USERNAME"),
                configService.get<string>("NEO4J_PASSWORD"),
              ),
            ),
        },
        TagsService,
        AuthService,
        JwtService,
        ConfigService,
        ModelService,
      ],
    }).compile();

    // authService = module.get<AuthService>(AuthService);
    // tempDb = module.get("TEMP_DB");
    // tempDbName = await tempDb.createDatabase();
    neogma = module.get<Neogma>(getConnectionToken());

    await module.init();
    controller = module.get<TagsController>(TagsController);
  }, 1000000);

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should hit dev db", async () => {
    const res = await neogma.queryRunner.run(
      "MATCH (n:Tag) RETURN count(n) as res",
    );
    const count = res.records[0]?.get("res");
    expect(nonZeroOrNull(count)).toBe(0);
  }, 300000);

  afterAll(async () => {
    await tempDb.cleanAllDatabases();
    jest.restoreAllMocks();
  }, 300000);
});
