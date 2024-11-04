import { Module } from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { GrantsController } from "./grants.controller";
import { GoogleBigQueryModule } from "src/google-bigquery/google-bigquery.module";
import { AuthModule } from "src/auth/auth.module";
import { MailService } from "src/mail/mail.service";
import { ProjectsModule } from "src/projects/projects.module";

@Module({
  imports: [GoogleBigQueryModule, AuthModule, ProjectsModule],
  controllers: [GrantsController],
  providers: [GrantsService, MailService],
})
export class GrantsModule {}
