import { Module, forwardRef } from "@nestjs/common";
import { TagsService } from "./tags.service";
import { TagsController } from "./tags.controller";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/auth/user/user.module";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [TagsController],
  providers: [TagsService, AuthService, JwtService, ModelService],
})
export class TagsModule {}
