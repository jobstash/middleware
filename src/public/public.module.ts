import { Module } from "@nestjs/common";
import { PublicService } from "./public.service";
import { PublicController } from "./public.controller";
import { TagsModule } from "src/tags/tags.module";

@Module({
  imports: [TagsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
