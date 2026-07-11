import { Module, forwardRef } from "@nestjs/common";
import { HacksService } from "./hacks.service";
import { HacksController } from "./hacks.controller";
import { UserModule } from "src/user/user.module";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [HacksController],
  providers: [HacksService, AuthService, JwtService],
})
export class HacksModule {}
