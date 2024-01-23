import { Test, TestingModule } from "@nestjs/testing";
import { ModelService } from "./model.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import envSchema from "src/env-schema";
import {
  NeogmaModule,
  NeogmaModuleOptions,
  getConnectionToken,
} from "nest-neogma";
import { ModelModule } from "./model.module";
import { Neogma } from "neogma";

describe("ModelsService", () => {
  let models: ModelService;
  let neogma: Neogma;
  let configService: ConfigService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
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
              database: configService.get<string>("NEO4J_DATABASE"),
            } as NeogmaModuleOptions),
        }),
        ModelModule,
      ],
      providers: [ModelService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    neogma = module.get<Neogma>(getConnectionToken());
    configService = module.get<ConfigService>(ConfigService);
    await models.onModuleInit();
  }, 1000000);

  it("should be defined", () => {
    expect(models).toBeDefined();
  }, 6000000);

  it("should access models", async () => {
    expect(models.Organizations.findMany).toBeDefined();
    expect(
      (await models.Organizations.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
  }, 6000000);

  it("should load the right db", async () => {
    const db = (
      await neogma.queryRunner.run(`
        CALL db.info()
        YIELD name
      `)
    ).records[0]?.get("name");
    expect(db).toBeDefined();
    expect(db).toBe(configService.get<string>("NEO4J_DATABASE"));
  }, 6000000);
});
