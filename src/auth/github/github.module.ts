import { forwardRef, Module } from "@nestjs/common";
import { GithubUserService } from "./github-user.service";
import { ModelService } from "src/model/model.service";
import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [forwardRef(() => ProfileModule)],
  providers: [GithubUserService, ModelService],
  exports: [GithubUserService],
})
export class GithubModule {}
