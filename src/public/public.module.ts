import { Module } from "@nestjs/common";
import { PublicService } from "./public.service";
import { PublicController } from "./public.controller";
import { ModelService } from "src/model/model.service";

@Module({
  controllers: [PublicController],
  providers: [PublicService, ModelService],
})
export class PublicModule {}
