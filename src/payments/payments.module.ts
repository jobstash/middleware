import { forwardRef, Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JobsModule } from "src/jobs/jobs.module";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": configService.get<string>("LLAMA_PAY_API_KEY"),
        },
        baseURL: "https://api.llamapay.io/",
      }),
    }),
    forwardRef(() => JobsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
