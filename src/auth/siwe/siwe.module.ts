import { CacheModule, Module } from "@nestjs/common";
import { SiweService } from "./siwe.service";
import { SiweController } from "./siwe.controller";
import { BackendModule } from "src/backend/backend.module";
import { BackendService } from "src/backend/backend.service";
import { AuthModule } from "../auth.module";
import { AuthService } from "../auth.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    BackendModule,
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN"),
        },
      }),
    }),
    CacheModule.register(),
  ],
  controllers: [SiweController],
  providers: [SiweService, BackendService, AuthService, JwtService],
})
export class SiweModule {}
