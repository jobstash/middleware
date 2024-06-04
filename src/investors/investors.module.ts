import { Module } from "@nestjs/common";
import { InvestorsService } from "./investors.service";
import { InvestorsController } from "./investors.controller";

@Module({
  controllers: [InvestorsController],
  providers: [InvestorsService],
})
export class InvestorsModule {}
