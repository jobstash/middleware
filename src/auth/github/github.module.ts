import { forwardRef, Module } from "@nestjs/common";
import { GithubUserService } from "./github-user.service";
import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [forwardRef(() => ProfileModule)],
  providers: [GithubUserService],
  exports: [GithubUserService],
})
export class GithubModule {}
