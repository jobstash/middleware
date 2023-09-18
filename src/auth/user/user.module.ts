import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../user/user.service";
import { UserFlowService } from "./user-flow.service";
import { UserRoleService } from "./user-role.service";
import { GithubModule } from "../github/github.module";
import { UserController } from "./user.controller";

@Module({
  imports: [forwardRef(() => GithubModule), ConfigModule],
  controllers: [UserController],
  providers: [UserService, UserFlowService, UserRoleService],
  exports: [UserService, UserFlowService, UserRoleService],
})
export class UserModule {}
