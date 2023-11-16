import { Module, forwardRef } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { UserModule } from "../../user/user.module";
import { AuthService } from "../auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [ProfileController],
  providers: [ProfileService, AuthService, JwtService, ModelService],
})
export class ProfileModule {}
