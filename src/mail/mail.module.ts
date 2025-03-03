import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: "mail",
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
        },
        removeOnComplete: true,
        timeout: 60000,
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
