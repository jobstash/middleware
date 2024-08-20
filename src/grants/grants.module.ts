import { Module } from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { GrantsController } from "./grants.controller";
import { GoogleBigQueryModule } from "src/google-bigquery/google-bigquery.module";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [GoogleBigQueryModule, AuthModule],
  controllers: [GrantsController],
  providers: [GrantsService],
})
export class GrantsModule {}
