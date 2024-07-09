import { Module } from "@nestjs/common";
import { ScorerService } from "./scorer.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { REALLY_LONG_TIME } from "src/shared/constants";
import { ScorerController } from "./scorer.controller";
import * as https from "https";
import { UserService } from "src/user/user.service";
import { ModelService } from "src/model/model.service";
import { UserFlowService } from "src/user/user-flow.service";
import { UserRoleService } from "src/user/user-role.service";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ProfileService } from "src/auth/profile/profile.service";
import { RpcService } from "src/user/rpc.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          Authorization: `Bearer ${configService.get<string>(
            "SCORER_API_KEY",
          )}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: REALLY_LONG_TIME,
        baseURL: configService.get<string>("SCORER_DOMAIN"),
      }),
    }),
  ],
  providers: [
    ScorerService,
    UserService,
    ModelService,
    UserFlowService,
    UserRoleService,
    AuthService,
    JwtService,
    ProfileService,
    RpcService,
  ],
  controllers: [ScorerController],
})
export class ScorerModule {}
