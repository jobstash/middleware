import { forwardRef, Module } from "@nestjs/common";
import { PrivyService } from "./privy.service";
import { PrivyController } from "./privy.controller";
import { AuthModule } from "../auth.module";
import { UserModule } from "src/user/user.module";
// import { ScorerModule } from "src/scorer/scorer.module";
// import { REALLY_LONG_TIME } from "src/shared/constants";
// import { ConfigModule, ConfigService } from "@nestjs/config";
// import * as https from "https";
// import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => UserModule)],
  // imports: [
  //   HttpModule.registerAsync({
  //     imports: [ConfigModule],
  //     inject: [ConfigService],
  //     useFactory: (configService: ConfigService) => ({
  //       headers: {
  //         Authorization: `Bearer ${configService.get<string>(
  //           "SCORER_API_KEY",
  //         )}`,
  //       },
  //       httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  //       timeout: REALLY_LONG_TIME,
  //       baseURL: configService.get<string>("SCORER_DOMAIN"),
  //     }),
  //   }),
  //   ScorerModule,
  //   ProfileModule,
  // ],
  controllers: [PrivyController],
  providers: [PrivyService],
  exports: [PrivyService],
})
export class PrivyModule {}
