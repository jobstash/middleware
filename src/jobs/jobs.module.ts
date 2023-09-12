import { Module } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ModelService } from "src/model/model.service";

@Module({
  controllers: [JobsController],
  providers: [JobsService, ModelService],
})
export class JobsModule {}
