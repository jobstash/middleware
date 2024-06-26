import { Module, forwardRef } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "../../user/user.service";
import { JwtAuthStrategy } from "./jwt-auth.strategy";
import { UserFlowService } from "../../user/user-flow.service";
import { UserRoleService } from "../../user/user-role.service";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/user/user.module";
import { ProfileService } from "../profile/profile.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
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
    ConfigModule,
    forwardRef(() => UserModule),
  ],
  providers: [
    JwtAuthStrategy,
    UserService,
    UserFlowService,
    UserRoleService,
    ModelService,
    ProfileService,
  ],
})
export class JwtAuthModule {}
