import { Module, forwardRef } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ModelService } from "src/model/model.service";
import { UserModule } from "src/user/user.module";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "src/auth/auth.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { TagsService } from "src/tags/tags.service";
import { GoogleBigQueryService } from "../auth/github/google-bigquery.service";

@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [JobsController],
  providers: [
    JobsService,
    TagsService,
    AuthService,
    JwtService,
    ModelService,
    ProfileService,
    GoogleBigQueryService,
  ],
})
export class JobsModule {}
