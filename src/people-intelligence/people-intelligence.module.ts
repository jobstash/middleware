import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as https from "https";
import { PeopleIntelligenceController } from "./people-intelligence.controller";
import { PeopleIntelligenceService } from "./people-intelligence.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        headers: {
          Authorization: `Bearer ${config.get<string>("SCORER_API_KEY")}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 30_000,
        baseURL: config.get<string>("SCORER_DOMAIN"),
      }),
    }),
  ],
  controllers: [PeopleIntelligenceController],
  providers: [PeopleIntelligenceService],
})
export class PeopleIntelligenceModule {}
