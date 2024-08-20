import { Module } from "@nestjs/common";
import { GoogleBigQueryService } from "./google-bigquery.service";

@Module({
  providers: [GoogleBigQueryService],
  exports: [GoogleBigQueryService],
})
export class GoogleBigQueryModule {}
