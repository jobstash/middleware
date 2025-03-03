import { Module } from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { GrantsController } from "./grants.controller";
import { GoogleBigQueryModule } from "src/google-bigquery/google-bigquery.module";
import { AuthModule } from "src/auth/auth.module";
import { MailService } from "src/mail/mail.service";
import { ProjectsModule } from "src/projects/projects.module";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    GoogleBigQueryModule,
    AuthModule,
    ProjectsModule,
    BullModule.registerQueue({
      name: "mail",
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
        },
        removeOnComplete: true,
        timeout: 60000,
      },
    }),
  ],
  controllers: [GrantsController],
  providers: [GrantsService, MailService],
})
export class GrantsModule {}
