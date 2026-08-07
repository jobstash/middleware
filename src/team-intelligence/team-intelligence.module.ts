import { HttpModule } from "@nestjs/axios";
import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as https from "https";
import { TeamIntelligenceService } from "./team-intelligence.service";

const TEAM_INTELLIGENCE_TIMEOUT_MS = 15_000;

@Global()
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
        timeout: TEAM_INTELLIGENCE_TIMEOUT_MS,
        baseURL: configService.get<string>("SCORER_DOMAIN"),
      }),
    }),
  ],
  providers: [TeamIntelligenceService],
  exports: [TeamIntelligenceService],
})
export class TeamIntelligenceModule {}
