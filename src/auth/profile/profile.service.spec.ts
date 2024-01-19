import { forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
import envSchema from "src/env-schema";
import { ModelModule } from "src/model/model.module";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "./profile.service";
import { ModelService } from "src/model/model.service";

describe("ProfileService", () => {
  let models: ModelService;
  let profileService: ProfileService;
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
              database: configService.get<string>("NEO4J_DATABASE"),
            } as NeogmaModuleOptions),
        }),
        ModelModule,
      ],
      providers: [ModelService, ProfileService],
    }).compile();

    await module.init();
    models = module.get<ModelService>(ModelService);
    await models.onModuleInit();
    profileService = module.get<ProfileService>(ProfileService);
  }, 1000000);

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("should be defined", () => {
    expect(profileService).toBeDefined();
  });

  it("should be able to access models", async () => {
    expect(models.UserProfiles.findMany).toBeDefined();
    expect(
      (await models.UserProfiles.findMany()).length,
    ).toBeGreaterThanOrEqual(1);
  }, 10000);
});
