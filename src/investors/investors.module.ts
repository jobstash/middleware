import { Module } from "@nestjs/common";
import { InvestorsService } from "./investors.service";
import { InvestorsController } from "./investors.controller";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [InvestorsController],
  providers: [InvestorsService],
})
export class InvestorsModule {}
