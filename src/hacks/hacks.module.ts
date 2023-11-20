import { Module, forwardRef } from "@nestjs/common";
import { HacksService } from "./hacks.service";
import { HacksController } from "./hacks.controller";
import { UserModule } from "src/user/user.module";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [HacksController],
  providers: [HacksService, AuthService, JwtService, ModelService],
})
export class HacksModule {}
