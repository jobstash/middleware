import { Module } from "@nestjs/common";
import { ChainsService } from "./chains.service";
import { ChainsController } from "./chains.controller";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ChainsController],
  providers: [ChainsService],
})
export class ChainsModule {}
