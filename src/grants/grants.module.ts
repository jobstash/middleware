import { Module } from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { GrantsController } from "./grants.controller";
import { GoogleBigQueryModule } from "src/google-bigquery/google-bigquery.module";

@Module({
  imports: [GoogleBigQueryModule],
  controllers: [GrantsController],
  providers: [GrantsService],
})
export class GrantsModule {}
