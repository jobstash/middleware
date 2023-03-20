import { Module } from "@nestjs/common";
import { TechnologiesService } from "./technologies.service";
import { TechnologiesController } from "./technologies.controller";

@Module({
  controllers: [TechnologiesController],
  providers: [TechnologiesService],
})
export class TechnologiesModule {}
