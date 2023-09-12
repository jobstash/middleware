import { Module } from "@nestjs/common";
import { ModelService } from "./model.service";

@Module({
  providers: [ModelService],
})
export class ModelModule {}
