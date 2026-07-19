import { Module } from "@nestjs/common";
import { InvestorsService } from "./investors.service";
import { InvestorsController } from "./investors.controller";
import { AuthModule } from "src/auth/auth.module";
import { FundsController } from "./funds.controller";

@Module({
  imports: [AuthModule],
  controllers: [InvestorsController, FundsController],
  providers: [InvestorsService],
})
export class InvestorsModule {}
