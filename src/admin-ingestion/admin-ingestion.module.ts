import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { AdminIngestionController } from "./admin-ingestion.controller";
import { AdminIngestionService } from "./admin-ingestion.service";

@Module({
  imports: [AuthModule, Auth0Module],
  controllers: [AdminIngestionController],
  providers: [AdminIngestionService],
})
export class AdminIngestionModule {}
